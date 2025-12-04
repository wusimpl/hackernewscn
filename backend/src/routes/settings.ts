import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SettingsRepository } from '../db/repositories';
import { hashPrompt, invalidateOldTitleTranslations } from '../services/cache';
import { DEFAULT_PROMPT } from '../services/llm';
import { ApiResponse } from '../types';
import { config } from '../config';
import { AppError, ErrorCode } from '../middleware/errorHandler';

const router = Router();

// 验证请求体
const updatePromptSchema = z.object({
  prompt: z.string().min(10).max(10000)
});

/**
 * 鉴权中间件
 */
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // 必须设置 ADMIN_TOKEN 才能进行写操作
  if (!config.adminToken) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '管理功能未启用，请设置 ADMIN_TOKEN', 401);
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (token !== config.adminToken) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '需要管理员权限', 401);
  }

  next();
};

/**
 * GET /api/settings/prompt
 * 获取全局提示词
 */
router.get('/prompt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settingsRepo = new SettingsRepository();
    const customPromptSetting = await settingsRepo.getSetting('custom_prompt');
    const customPrompt = customPromptSetting?.value || DEFAULT_PROMPT;

    res.json({
      success: true,
      data: {
        prompt: customPrompt,
        isDefault: !customPromptSetting
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Settings API] 获取提示词错误:', error);
    next(error);
  }
});

/**
 * PUT /api/settings/prompt
 * 更新提示词并触发缓存失效
 * 需要管理员权限(如果设置了 ADMIN_TOKEN)
 */
router.put('/prompt', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 验证请求体
    const body = updatePromptSchema.parse(req.body);
    const { prompt } = body;

    const settingsRepo = new SettingsRepository();

    // 计算新旧提示词哈希
    const oldPromptSetting = await settingsRepo.getSetting('custom_prompt');
    const oldPrompt = oldPromptSetting?.value || DEFAULT_PROMPT;
    const oldHash = hashPrompt(oldPrompt);
    const newHash = hashPrompt(prompt);

    // 保存新提示词
    await settingsRepo.upsertSetting('custom_prompt', prompt);

    console.log(`[Settings API] 提示词已更新`);

    // 如果哈希值变化,清除旧的标题缓存
    let invalidatedCount = 0;
    if (oldHash !== newHash) {
      invalidatedCount = await invalidateOldTitleTranslations(newHash);
      console.log(`[Settings API] 清除了 ${invalidatedCount} 条旧标题缓存`);
    }

    res.json({
      success: true,
      data: {
        message: '提示词已更新',
        invalidatedTitles: invalidatedCount,
        promptHash: newHash
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Settings API] 更新提示词错误:', error);
    next(error);
  }
});

/**
 * POST /api/settings/prompt/reset
 * 重置提示词为默认值
 * 需要管理员权限(如果设置了 ADMIN_TOKEN)
 */
router.post('/prompt/reset', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settingsRepo = new SettingsRepository();

    // 删除自定义提示词
    await settingsRepo.deleteSetting('custom_prompt');

    // 计算新哈希并清除旧缓存
    const newHash = hashPrompt(DEFAULT_PROMPT);
    const invalidatedCount = await invalidateOldTitleTranslations(newHash);

    console.log(`[Settings API] 提示词已重置为默认值,清除了 ${invalidatedCount} 条旧缓存`);

    res.json({
      success: true,
      data: {
        message: '提示词已重置为默认值',
        invalidatedTitles: invalidatedCount,
        prompt: DEFAULT_PROMPT
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Settings API] 重置提示词错误:', error);
    next(error);
  }
});

export default router;
