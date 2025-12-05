import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { hashPrompt } from '../services/cache';
import {
  getPromptsConfig,
  updatePromptsConfig,
  getPrompt,
  getDefaultPrompt,
  PromptType,
  PromptsConfig
} from '../services/promptsConfig';
import { ApiResponse } from '../types';
import { config } from '../config';
import { AppError, ErrorCode } from '../middleware/errorHandler';

const router = Router();

// 验证请求体 - 单个提示词
const updatePromptSchema = z.object({
  prompt: z.string().min(10).max(10000)
});

// 验证请求体 - 多个提示词
const updatePromptsSchema = z.object({
  article: z.object({ prompt: z.string().min(10).max(10000) }).optional(),
  tldr: z.object({ prompt: z.string().min(10).max(10000) }).optional(),
  comment: z.object({ prompt: z.string().min(10).max(10000) }).optional()
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
 * GET /api/settings/prompts
 * 获取所有提示词配置
 */
router.get('/prompts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promptsConfig = getPromptsConfig();

    res.json({
      success: true,
      data: {
        prompts: promptsConfig,
        defaults: {
          article: getDefaultPrompt('article'),
          tldr: getDefaultPrompt('tldr'),
          comment: getDefaultPrompt('comment')
        }
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Settings API] 获取提示词配置错误:', error);
    next(error);
  }
});

/**
 * PUT /api/settings/prompts
 * 更新多个提示词
 * 需要管理员权限
 */
router.put('/prompts', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updatePromptsSchema.parse(req.body);

    // 获取旧配置用于计算哈希变化
    const oldConfig = getPromptsConfig();
    const oldArticleHash = hashPrompt(oldConfig.article.prompt);

    // 构建更新对象
    const updates: Partial<PromptsConfig> = {};
    if (body.article) {
      updates.article = { ...oldConfig.article, prompt: body.article.prompt };
    }
    if (body.tldr) {
      updates.tldr = { ...oldConfig.tldr, prompt: body.tldr.prompt };
    }
    if (body.comment) {
      updates.comment = { ...oldConfig.comment, prompt: body.comment.prompt };
    }

    // 保存新配置
    const newConfig = updatePromptsConfig(updates);

    console.log(`[Settings API] 提示词配置已更新`);

    // 提示词变化不会删除旧缓存，旧翻译保留但不再使用（哈希不匹配）
    // 新翻译会使用新的提示词和哈希

    res.json({
      success: true,
      data: {
        message: '提示词配置已更新',
        prompts: newConfig
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Settings API] 更新提示词配置错误:', error);
    next(error);
  }
});

/**
 * GET /api/settings/prompt
 * 获取文章翻译提示词（向后兼容）
 */
router.get('/prompt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promptsConfig = getPromptsConfig();
    const defaultPrompt = getDefaultPrompt('article');

    res.json({
      success: true,
      data: {
        prompt: promptsConfig.article.prompt,
        isDefault: promptsConfig.article.prompt === defaultPrompt
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Settings API] 获取提示词错误:', error);
    next(error);
  }
});

/**
 * PUT /api/settings/prompt
 * 更新文章翻译提示词（向后兼容）
 * 需要管理员权限
 */
router.put('/prompt', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updatePromptSchema.parse(req.body);
    const { prompt } = body;

    // 获取旧配置
    const oldConfig = getPromptsConfig();

    // 更新文章翻译提示词
    updatePromptsConfig({
      article: { ...oldConfig.article, prompt }
    });

    console.log(`[Settings API] 文章翻译提示词已更新`);

    // 提示词变化不会删除旧缓存，旧翻译保留但不再使用（哈希不匹配）
    // 新翻译会使用新的提示词和哈希

    res.json({
      success: true,
      data: {
        message: '提示词已更新'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Settings API] 更新提示词错误:', error);
    next(error);
  }
});

/**
 * POST /api/settings/prompt/reset
 * 重置文章翻译提示词为默认值（向后兼容）
 * 需要管理员权限
 */
router.post('/prompt/reset', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const defaultPrompt = getDefaultPrompt('article');
    const oldConfig = getPromptsConfig();

    // 重置为默认提示词
    updatePromptsConfig({
      article: { ...oldConfig.article, prompt: defaultPrompt }
    });

    console.log(`[Settings API] 文章翻译提示词已重置为默认值`);

    // 提示词变化不会删除旧缓存，旧翻译保留但不再使用（哈希不匹配）

    res.json({
      success: true,
      data: {
        message: '提示词已重置为默认值',
        prompt: defaultPrompt
      }
    } as ApiResponse);

  } catch (error) {
    console.error('[Settings API] 重置提示词错误:', error);
    next(error);
  }
});

export default router;
