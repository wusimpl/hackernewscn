import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { refreshTopStories, loadMoreStories, StoryWithRank } from '../services/hn';
import { hashPrompt, getArticleTranslation } from '../services/cache';
import { DEFAULT_PROMPT } from '../services/llm';
import { 
  SettingsRepository, 
  TitleTranslationRepository, 
  SchedulerStatusRepository,
  ArticleTranslationRepository,
  StoryRepository
} from '../db/repositories';
import { StoryWithTranslation, ApiResponse, Story } from '../types';
import { getSchedulerService } from '../services/scheduler';
import { config } from '../config';

const router = Router();

// 验证查询参数
const getStoriesSchema = z.object({
  cursor: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 30)
});

/**
 * GET /api/stories
 * 获取故事列表(带翻译)
 *
 * 查询参数:
 * - cursor: 起始位置,默认 0
 * - limit: 数量限制,默认 30
 *
 * 功能:
 * 1. 从 HN API 获取故事
 * 2. 从数据库获取已有的标题翻译
 * 3. 返回带翻译状态的故事列表(不触发翻译)
 * 4. 返回 lastUpdatedAt 时间戳
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 验证参数
    const params = getStoriesSchema.parse(req.query);
    const { cursor, limit } = params;

    console.log(`[Stories API] 请求故事列表: cursor=${cursor}, limit=${limit}`);

    // 获取故事数据
    let stories;
    if (cursor === 0) {
      // 刷新数据
      stories = await refreshTopStories(limit);
    } else {
      // 加载更多
      stories = await loadMoreStories(cursor, limit);
    }

    if (stories.length === 0) {
      // 获取 lastUpdatedAt
      const schedulerStatusRepo = new SchedulerStatusRepository();
      const schedulerStatus = await schedulerStatusRepo.getStatus();
      
      return res.json({
        success: true,
        data: {
          stories: [],
          lastUpdatedAt: schedulerStatus?.last_run_at || null
        }
      } as ApiResponse);
    }

    // 获取当前提示词哈希
    const settingsRepo = new SettingsRepository();
    const customPromptSetting = await settingsRepo.getSetting('custom_prompt');
    const customPrompt = customPromptSetting?.value || DEFAULT_PROMPT;
    const promptHash = hashPrompt(customPrompt);

    // 从数据库批量获取已有的标题翻译
    const titleTranslationRepo = new TitleTranslationRepository();
    const storyIds = stories.map(s => s.id);
    const translations = await titleTranslationRepo.findByIds(storyIds);
    
    // 创建翻译映射 (只包含匹配当前 promptHash 的翻译)
    const translationMap = new Map<number, string>();
    for (const t of translations) {
      if (t.prompt_hash === promptHash) {
        translationMap.set(t.story_id, t.title_zh);
      }
    }

    // 获取 lastUpdatedAt 从调度器状态
    const schedulerStatusRepo = new SchedulerStatusRepository();
    const schedulerStatus = await schedulerStatusRepo.getStatus();

    // 从数据库获取存储的故事快照（score, descendants 等）
    const storyRepo = new StoryRepository();
    const storedStories = await storyRepo.findByIds(storyIds);
    const storySnapshotMap = new Map(storedStories.map(s => [s.story_id, s]));

    // 构建返回结果 - 只返回标题和文章都翻译完成的故事
    const storiesWithTranslation: StoryWithTranslation[] = [];
    let blockedCount = 0;
    for (const story of stories) {
      // 获取已有的翻译
      const translatedTitle = translationMap.get(story.id);
      const articleCache = await getArticleTranslation(story.id);
      
      // 统计被屏蔽的文章数量
      if (articleCache?.status === 'blocked') {
        blockedCount++;
      }
      
      // 只返回标题和文章内容都翻译完成的故事
      const hasTranslatedTitle = !!translatedTitle;
      const hasTranslatedArticle = articleCache?.status === 'done';
      
      // 如果有URL但文章未翻译完成，跳过这个故事
      if (story.url && (!hasTranslatedTitle || !hasTranslatedArticle)) {
        continue;
      }
      
      // 如果没有URL（如Ask HN），只需要标题翻译完成
      if (!story.url && !hasTranslatedTitle) {
        continue;
      }

      // 优先使用数据库快照的 score 和 descendants
      const snapshot = storySnapshotMap.get(story.id);
      storiesWithTranslation.push({
        id: story.id,
        title: story.title,
        by: story.by,
        score: snapshot?.score ?? story.score,
        time: story.time,
        url: story.url,
        descendants: snapshot?.descendants ?? story.descendants,
        translatedTitle,
        isTranslating: false,
        hasTranslatedArticle: hasTranslatedArticle,
        articleStatus: articleCache?.status,
        hnRank: story.hnRank // 保留 HN 排名位置
      });
    }

    // 计算未翻译的文章数量（排除已被屏蔽的文章）
    const untranslatedCount = stories.length - storiesWithTranslation.length - blockedCount;
    console.log(`[Stories API] 统计: 总数=${stories.length}, 已翻译=${storiesWithTranslation.length}, blocked=${blockedCount}, 未翻译=${untranslatedCount}`);

    // 如果是 Load More 请求且有未翻译的文章，触发后台翻译
    if (cursor > 0 && untranslatedCount > 0) {
      console.log(`[Stories API] Load More: ${untranslatedCount} 篇文章需要翻译，触发后台翻译`);
      // 异步触发翻译，不阻塞响应
      triggerTranslationForStories(stories, promptHash).catch(err => {
        console.error('[Stories API] 触发翻译失败:', err);
      });
    }

    res.json({
      success: true,
      data: {
        stories: storiesWithTranslation,
        lastUpdatedAt: schedulerStatus?.last_run_at || null,
        untranslatedCount: cursor > 0 ? untranslatedCount : 0 // 只在 Load More 时返回
      }
    } as ApiResponse<{ stories: StoryWithTranslation[]; lastUpdatedAt: number | null; untranslatedCount: number }>);

  } catch (error) {
    // 统一使用 next(error) 传递到全局错误处理器
    console.error('[Stories API] 错误:', error);
    next(error);
  }
});

/**
 * 为未翻译的故事触发后台翻译
 * 使用交错模式：每5条标题 → 对应文章 → 下5条标题 → 对应文章...
 */
async function triggerTranslationForStories(stories: StoryWithRank[], promptHash: string): Promise<void> {
  const titleTranslationRepo = new TitleTranslationRepository();
  const articleTranslationRepo = new ArticleTranslationRepository();
  const settingsRepo = new SettingsRepository();
  
  // 获取当前提示词
  const customPromptSetting = await settingsRepo.getSetting('custom_prompt');
  const customPrompt = customPromptSetting?.value || DEFAULT_PROMPT;

  // 筛选需要翻译的故事，分为两类
  const storiesNeedingTitle: Story[] = [];  // 需要翻译标题的
  const storiesOnlyNeedingArticle: Story[] = [];  // 标题已翻译，只需翻译文章的
  
  const existingTitleTranslations = await titleTranslationRepo.findByIds(stories.map(s => s.id));
  const titleMap = new Map(
    existingTitleTranslations
      .filter(t => t.prompt_hash === promptHash)
      .map(t => [t.story_id, t])
  );

  for (const story of stories) {
    const hasTitle = titleMap.has(story.id);
    
    if (!hasTitle) {
      storiesNeedingTitle.push(story);
      continue;
    }

    // 标题已翻译，检查文章是否需要翻译
    if (story.url) {
      const articleTranslation = await articleTranslationRepo.findById(story.id);
      if (!articleTranslation || (articleTranslation.status !== 'done' && articleTranslation.status !== 'blocked')) {
        storiesOnlyNeedingArticle.push(story);
      }
    }
  }

  const totalToTranslate = storiesNeedingTitle.length + storiesOnlyNeedingArticle.length;
  if (totalToTranslate === 0) {
    console.log('[Stories API] 所有故事已翻译完成');
    return;
  }

  console.log(`[Stories API] 开始翻译: ${storiesNeedingTitle.length} 篇需要标题, ${storiesOnlyNeedingArticle.length} 篇只需文章`);

  const { translateTitlesBatch, translateArticle } = await import('../services/llm');
  const { setArticleTranslation } = await import('../services/cache');
  const { saveStoryToDatabase } = await import('../services/hn');
  const { getQueueService } = await import('../services/queue');
  const fetch = (await import('node-fetch')).default;
  const queueService = getQueueService();

  // 辅助函数：翻译单篇文章
  const translateSingleArticle = async (story: Story): Promise<boolean> => {
    try {
      const existing = await articleTranslationRepo.findById(story.id);
      if (existing && (existing.status === 'done' || existing.status === 'blocked')) {
        return true;
      }

      const titleTranslation = await titleTranslationRepo.getTitleTranslation(story.id);
      if (!titleTranslation?.title_zh) {
        return false;
      }

      const titleSnapshot = titleTranslation.title_zh;
      const jinaUrl = `https://r.jina.ai/${story.url}`;
      const response = await fetch(jinaUrl);

      if (!response.ok) {
        if (response.status === 451) {
          await setArticleTranslation({
            story_id: story.id,
            title_snapshot: titleSnapshot,
            content_markdown: '',
            original_url: story.url!,
            status: 'blocked',
            error_message: 'HTTP 451: Unavailable For Legal Reasons'
          });
        }
        return false;
      }

      const markdown = await response.text();
      if (!markdown || markdown.length < 50) {
        return false;
      }

      const translatedMarkdown = await translateArticle(markdown, customPrompt, story.id);
      if (!translatedMarkdown) {
        return false;
      }

      await setArticleTranslation({
        story_id: story.id,
        title_snapshot: titleSnapshot,
        content_markdown: translatedMarkdown,
        original_url: story.url!,
        status: 'done'
      });

      await saveStoryToDatabase(story);

      // 获取并存储评论
      await fetchAndStoreCommentsForStory(story, customPrompt);

      // 发送SSE事件，包含完整的story信息以便前端合并到列表
      queueService.emitSSEEvent({
        type: 'article.done',
        storyId: story.id,
        title: titleSnapshot,
        content: translatedMarkdown,
        originalUrl: story.url,
        story: {
          id: story.id,
          title: story.title,
          by: story.by,
          score: story.score,
          time: story.time,
          url: story.url,
          descendants: story.descendants,
          translatedTitle: titleSnapshot,
          isTranslating: false,
          hasTranslatedArticle: true,
          articleStatus: 'done' as const,
          hnRank: (story as StoryWithRank).hnRank,
        }
      });

      console.log(`[Stories API] 文章 ${story.id} 翻译完成`);
      return true;
    } catch (error) {
      console.error(`[Stories API] 翻译文章 ${story.id} 失败:`, error);
      return false;
    }
  };

  // 1. 先处理只需要翻译文章的故事
  if (storiesOnlyNeedingArticle.length > 0) {
    console.log(`[Stories API] 先处理 ${storiesOnlyNeedingArticle.length} 篇只需翻译文章的故事`);
    for (const story of storiesOnlyNeedingArticle) {
      await translateSingleArticle(story);
    }
  }

  // 2. 交错处理需要翻译标题的故事：每5条标题 → 对应文章
  const BATCH_SIZE = 5;
  for (let i = 0; i < storiesNeedingTitle.length; i += BATCH_SIZE) {
    const batch = storiesNeedingTitle.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(storiesNeedingTitle.length / BATCH_SIZE);

    console.log(`[Stories API] === 第 ${batchNum}/${totalBatches} 批：翻译 ${batch.length} 条标题 ===`);

    // 翻译这批标题
    const items = batch.map(s => ({ id: s.id, title: s.title }));
    const results = await translateTitlesBatch(items, customPrompt);

    const translations = results.map(r => {
      const story = batch.find(s => s.id === r.id)!;
      return {
        story_id: r.id,
        title_en: story.title,
        title_zh: r.translatedTitle,
        prompt_hash: promptHash,
      };
    });

    if (translations.length > 0) {
      await titleTranslationRepo.upsertMany(translations);
      console.log(`[Stories API] 保存了 ${translations.length} 个标题翻译`);
    }

    // 保存没有 URL 的故事
    for (const story of batch.filter(s => !s.url)) {
      const translated = results.find(r => r.id === story.id);
      if (translated) {
        await saveStoryToDatabase(story);
      }
    }

    // 立即翻译这批故事的文章
    const storiesWithUrl = batch.filter(s => s.url && results.some(r => r.id === s.id));
    if (storiesWithUrl.length > 0) {
      console.log(`[Stories API] === 第 ${batchNum}/${totalBatches} 批：翻译 ${storiesWithUrl.length} 篇文章 ===`);
      for (const story of storiesWithUrl) {
        await translateSingleArticle(story);
      }
    }

    console.log(`[Stories API] === 第 ${batchNum}/${totalBatches} 批完成 ===`);
  }
}

/**
 * 获取并存储故事的评论
 * 复用 scheduler 中的逻辑
 */
async function fetchAndStoreCommentsForStory(story: Story, customPrompt: string): Promise<void> {
  try {
    // 检查故事是否有评论
    if (!story.descendants || story.descendants === 0) {
      return;
    }

    const { CommentRepository, CommentTranslationRepository } = await import('../db/repositories');
    const commentRepo = new CommentRepository();
    const commentTranslationRepo = new CommentTranslationRepository();

    // 检查是否已有评论
    const hasExistingComments = await commentRepo.hasComments(story.id);
    if (hasExistingComments) {
      return;
    }

    // 获取故事的 kids（顶级评论 ID）
    const { fetchStoryDetails, fetchStoryComments } = await import('../services/hn');
    const storyDetails = await fetchStoryDetails(story.id);
    
    if (!storyDetails) {
      return;
    }

    const kids = (storyDetails as any).kids as number[] | undefined;
    if (!kids || kids.length === 0) {
      return;
    }

    console.log(`[Stories API] 获取 ${kids.length} 条顶级评论: story ${story.id}`);
    
    // 获取所有评论
    const comments = await fetchStoryComments(story.id, kids);
    
    if (comments.length > 0) {
      // 翻译前N条评论（数量由配置决定）
      const { translateCommentsBatch } = await import('../services/llm');
      const maxComments = config.commentTranslation.maxComments;
      const commentsToTranslate = comments
        .filter(c => c.text && c.text.trim().length > 0 && !c.deleted && !c.dead)
        .slice(0, maxComments);

      let translations: { comment_id: number; text_en: string; text_zh: string }[] = [];
      
      if (commentsToTranslate.length > 0) {
        const items = commentsToTranslate.map(c => ({ id: c.comment_id, text: c.text! }));
        const results = await translateCommentsBatch(items, customPrompt);
        
        translations = commentsToTranslate
          .filter(c => results.some(r => r.id === c.comment_id))
          .map(c => ({
            comment_id: c.comment_id,
            text_en: c.text!,
            text_zh: results.find(r => r.id === c.comment_id)!.translatedText,
          }));
      }

      // 存储评论和翻译
      await commentRepo.upsertMany(comments);
      console.log(`[Stories API] 存储了 ${comments.length} 条评论: story ${story.id}`);
      
      if (translations.length > 0) {
        await commentTranslationRepo.upsertMany(translations);
        console.log(`[Stories API] 存储了 ${translations.length} 条评论翻译: story ${story.id}`);
      }
    }
  } catch (error) {
    console.error(`[Stories API] 获取评论失败 story ${story.id}:`, error);
  }
}

export default router;
