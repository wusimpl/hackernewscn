import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getTitleTranslationsBatch, setTitleTranslationsBatch, hashPrompt } from '../services/cache';
import { translateTitlesBatch, DEFAULT_PROMPT } from '../services/llm';
import { StoryRepository, SettingsRepository } from '../db/repositories';
import { ApiResponse, StoryRecord } from '../types';
import { translationRateLimit } from '../middleware/rateLimit';
import { AppError, ErrorCode } from '../middleware/errorHandler';

const router = Router();

// 验证请求体
const translateTitlesSchema = z.object({
  ids: z.array(z.number()).min(1).max(100), // 最多一次翻译100个标题
  promptOverride: z.string().optional()
});

/**
 * POST /api/translations/titles
 * 批量翻译标题
 *
 * 请求体:
 * {
 *   "ids": [123, 456, 789],
 *   "promptOverride": "可选的自定义提示词"
 * }
 *
 * 响应:
 * {
 *   "success": true,
 *   "data": {
 *     "translations": [
 *       { "id": 123, "titleZh": "中文标题" }
 *     ]
 *   }
 * }
 */
router.post('/titles', translationRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 验证请求体
    const body = translateTitlesSchema.parse(req.body);
    const { ids, promptOverride } = body;

    console.log(`[Translations API] 请求翻译 ${ids.length} 个标题`);

    // 获取故事数据
    const storyRepo = new StoryRepository();
    const stories = await storyRepo.getStoriesByIds(ids);

    if (stories.length === 0) {
      throw new AppError(
        ErrorCode.STORIES_NOT_FOUND,
        '未找到任何故事',
        404
      );
    }

    // 获取提示词
    const settingsRepo = new SettingsRepository();
    const customPromptSetting = await settingsRepo.getSetting('custom_prompt');
    const customPrompt = promptOverride ||
      customPromptSetting?.value ||
      DEFAULT_PROMPT;
    const promptHash = hashPrompt(customPrompt);

    // 检查缓存
    const cachedTranslations = await getTitleTranslationsBatch(ids, promptHash);

    // 找出未命中缓存的标题
    const untranslatedStories = stories.filter((s: StoryRecord) => !cachedTranslations.has(s.story_id));

    // 批量翻译
    if (untranslatedStories.length > 0) {
      console.log(`[Translations API] 需要翻译 ${untranslatedStories.length} 个新标题`);

      const itemsToTranslate = untranslatedStories.map((s: StoryRecord) => ({
        id: s.story_id,
        title: s.title_en
      }));

      const translations = await translateTitlesBatch(itemsToTranslate, customPrompt);

      // 保存到缓存
      const translationRecords = translations.map(t => ({
        id: t.id,
        titleEn: untranslatedStories.find((s: StoryRecord) => s.story_id === t.id)!.title_en,
        titleZh: t.translatedTitle
      }));

      await setTitleTranslationsBatch(translationRecords, promptHash);

      // 更新缓存映射
      translations.forEach(t => {
        cachedTranslations.set(t.id, t.translatedTitle);
      });
    }

    // 构建返回结果
    const result = Array.from(cachedTranslations.entries()).map(([id, titleZh]) => ({
      id,
      titleZh
    }));

    res.json({
      success: true,
      data: {
        translations: result
      }
    } as ApiResponse);

  } catch (error) {
    // 统一使用 next(error) 传递到全局错误处理器
    console.error('[Translations API] 错误:', error);
    next(error);
  }
});

export default router;
