import { Router, Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';
import {
  getArticleTranslation,
  setArticleTranslation,
  updateArticleStatus,
  getAllCompletedArticles,
  deleteArticleTranslation,
  clearAllArticleTranslations
} from '../services/cache';
import { translateArticle, DEFAULT_PROMPT } from '../services/llm';
import { getQueueService } from '../services/queue';
import { StoryRepository, SettingsRepository, TitleTranslationRepository } from '../db/repositories';
import { ApiResponse, ArticleStatus } from '../types';
import { translationRateLimit } from '../middleware/rateLimit';
import { AppError, ErrorCode } from '../middleware/errorHandler';

const router = Router();

/**
 * Article response interface matching design spec
 */
interface ArticleResponse {
  storyId: number;
  status: 'not_found' | ArticleStatus;
  content?: string;
  originalUrl?: string;
  translatedAt?: number;
}

/**
 * GET /api/articles/:id
 * 获取文章翻译（如果存在）
 * Returns cached translation or status indicating article is not yet translated
 * Requirements: 2.3, 2.4
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storyId = parseInt(req.params.id, 10);

    if (isNaN(storyId)) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '无效的故事ID', 400);
    }

    const article = await getArticleTranslation(storyId);

    // Return status-based response per design spec
    if (!article) {
      const response: ArticleResponse = {
        storyId,
        status: 'not_found'
      };
      return res.json({
        success: true,
        data: response
      } as ApiResponse<ArticleResponse>);
    }

    // Return article with status
    const response: ArticleResponse = {
      storyId,
      status: article.status,
      content: article.status === 'done' ? article.content_markdown : undefined,
      originalUrl: article.original_url,
      translatedAt: article.status === 'done' ? article.updated_at : undefined
    };

    res.json({
      success: true,
      data: response
    } as ApiResponse<ArticleResponse>);

  } catch (error) {
    console.error('[Articles API] 获取文章错误:', error);
    next(error);
  }
});

/**
 * Translate article response interface matching design spec
 */
interface TranslateArticleResponse {
  message: string;
  status: 'queued' | 'already_done';
  jobId?: string;
}

/**
 * POST /api/articles/:id/translate
 * 请求翻译文章（加入队列）
 * Only queues task, doesn't wait for completion
 * Requirements: 3.2
 */
router.post('/:id/translate', translationRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storyId = parseInt(req.params.id, 10);

    if (isNaN(storyId)) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '无效的故事ID', 400);
    }

    // Check if translation already exists
    const existing = await getArticleTranslation(storyId);
    if (existing && existing.status === 'done') {
      const response: TranslateArticleResponse = {
        message: '文章已翻译',
        status: 'already_done'
      };
      return res.json({
        success: true,
        data: response
      } as ApiResponse<TranslateArticleResponse>);
    }

    // Check if already queued or running - return current status
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      const response: TranslateArticleResponse = {
        message: existing.status === 'queued' ? '文章已在队列中' : '文章正在翻译中',
        status: 'queued'
      };
      return res.json({
        success: true,
        data: response
      } as ApiResponse<TranslateArticleResponse>);
    }

    // Get story info
    const storyRepo = new StoryRepository();
    const stories = await storyRepo.getStoriesByIds([storyId]);
    if (stories.length === 0 || !stories[0].url) {
      throw new AppError(ErrorCode.STORIES_NOT_FOUND, '故事不存在或没有URL', 404);
    }

    const story = stories[0];

    // Get title translation for snapshot
    const settingsRepo = new SettingsRepository();
    const customPromptSetting = await settingsRepo.getSetting('custom_prompt');
    const customPrompt = customPromptSetting?.value || DEFAULT_PROMPT;

    const titleRepo = new TitleTranslationRepository();
    const titleTranslation = await titleRepo.getTitleTranslation(storyId);
    const titleSnapshot = titleTranslation?.title_zh || story.title_en;

    // Create initial record with queued status
    await setArticleTranslation({
      story_id: storyId,
      title_snapshot: titleSnapshot,
      content_markdown: '',
      original_url: story.url!,
      status: 'queued'
    });

    // Add to task queue - doesn't wait for completion
    const queueService = getQueueService();
    const jobId = await queueService.addArticleTranslationTask(storyId, async () => {
      const startTime = Date.now();
      console.log(`[文章翻译任务] 开始: storyId=${storyId}, url=${story.url}`);

      try {
        // Update status to running
        await updateArticleStatus(storyId, 'running');

        // Fetch article content using Jina AI Reader
        const fetchStartTime = Date.now();
        const jinaUrl = `https://r.jina.ai/${story.url}`;
        console.log(`  [步骤1] 获取文章内容...`);

        const response = await fetch(jinaUrl, {
          headers: {
            'X-With-Images-Summary': 'true'  // 请求返回图片URL列表
          }
        });

        // Handle 451 error (legal restriction)
        if (!response.ok) {
          if (response.status === 451) {
            throw new Error('451:该内容在当前地区受到法律限制,Jina无法访问');
          }
          throw new Error(`${response.status}:获取内容失败`);
        }

        const markdown = await response.text();
        const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(2);
        console.log(`  [步骤1完成] 耗时: ${fetchDuration}秒, 内容长度: ${markdown.length}字符`);

        if (!markdown || markdown.length < 50) {
          throw new Error('Content empty');
        }

        // Translate article
        console.log(`  [步骤2] 开始翻译...`);
        const translateStartTime = Date.now();
        const translatedMarkdown = await translateArticle(markdown, customPrompt);
        const translateDuration = ((Date.now() - translateStartTime) / 1000).toFixed(2);
        console.log(`  [步骤2完成] 耗时: ${translateDuration}秒`);

        // Save result
        await setArticleTranslation({
          story_id: storyId,
          title_snapshot: titleSnapshot,
          content_markdown: translatedMarkdown,
          original_url: story.url!,
          status: 'done'
        });

        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`[文章翻译任务] 完成: storyId=${storyId}, 总耗时: ${totalDuration}秒`);

        // Emit SSE event for completion
        queueService.emitSSEEvent({
          type: 'article.done',
          storyId,
          title: titleSnapshot,
          content: translatedMarkdown,
          originalUrl: story.url
        });

      } catch (error) {
        const errorDuration = ((Date.now() - startTime) / 1000).toFixed(2);
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        console.error(`[文章翻译任务] 失败: storyId=${storyId}, 耗时: ${errorDuration}秒, 错误:`, error);

        await updateArticleStatus(storyId, 'error', errorMessage);

        // Emit SSE error event
        queueService.emitSSEEvent({
          type: 'article.error',
          storyId,
          title: titleSnapshot,
          error: errorMessage
        });

        throw error; // Re-throw to trigger queue retry
      }
    });

    // Return immediately with queued status - doesn't wait for completion
    const response: TranslateArticleResponse = {
      message: '翻译任务已添加到队列',
      status: 'queued',
      jobId
    };

    res.json({
      success: true,
      data: response
    } as ApiResponse<TranslateArticleResponse>);

  } catch (error) {
    console.error('[Articles API] 创建翻译任务错误:', error);
    next(error);
  }
});

/**
 * GET /api/articles/cache
 * 获取所有已翻译文章列表
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const articles = await getAllCompletedArticles();

    res.json({
      success: true,
      data: articles
    } as ApiResponse);

  } catch (error) {
    console.error('[Articles API] 获取文章列表错误:', error);
    next(error);
  }
});

/**
 * DELETE /api/articles/cache/:id
 * 删除单篇文章缓存
 */
router.delete('/cache/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storyId = parseInt(req.params.id, 10);

    if (isNaN(storyId)) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '无效的故事ID', 400);
    }

    await deleteArticleTranslation(storyId);

    res.json({
      success: true,
      data: {
        message: '文章缓存已删除'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Articles API] 删除文章错误:', error);
    next(error);
  }
});

/**
 * DELETE /api/articles/cache
 * 清空所有文章缓存
 */
router.delete('/cache', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await clearAllArticleTranslations();

    res.json({
      success: true,
      data: {
        message: '所有文章缓存已清空'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Articles API] 清空缓存错误:', error);
    next(error);
  }
});

export default router;
