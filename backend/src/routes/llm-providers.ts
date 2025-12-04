import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fetch from 'node-fetch';
import { config } from '../config';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import {
  getLLMConfig,
  getProvidersForDisplay,
  getCurrentProvider,
  setDefaultProvider,
  addProvider,
  updateProvider,
  deleteProvider
} from '../services/llmConfig';

const router = Router();

// Provider 验证 schema
const providerSchema = z.object({
  name: z.string().min(1).max(50),
  api_base: z.string().url(),
  model: z.string().min(1).max(100),
  api_key: z.string().min(1),
  description: z.string().max(200).optional()
});

const updateProviderSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  api_base: z.string().url().optional(),
  model: z.string().min(1).max(100).optional(),
  api_key: z.string().min(1).optional(),
  description: z.string().max(200).optional()
});

/**
 * 管理员鉴权中间件
 */
const requireAdminAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!config.adminToken) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '管理功能未启用', 401);
  }

  if (token !== config.adminToken) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '密码错误', 401);
  }

  next();
};

/**
 * GET /api/llm-providers
 * 获取所有 LLM Providers（API Key 已遮蔽）
 */
router.get('/', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const llmConfig = getLLMConfig();
    const providers = getProvidersForDisplay();

    res.json({
      success: true,
      data: {
        default_provider: llmConfig.default_provider,
        providers
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/llm-providers/current
 * 获取当前使用的 Provider
 */
router.get('/current', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = getCurrentProvider();

    res.json({
      success: true,
      data: provider ? {
        name: provider.name,
        api_base: provider.api_base,
        model: provider.model,
        description: provider.description
      } : null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm-providers
 * 添加新的 Provider
 */
router.post('/', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = providerSchema.parse(req.body);

    addProvider(body);
    console.log(`[LLM Providers] 添加 Provider: ${body.name}`);

    res.json({
      success: true,
      data: { message: `Provider "${body.name}" 已添加` }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '参数验证失败: ' + error.errors.map(e => e.message).join(', '), 400);
    }
    if (error instanceof Error && error.message.includes('已存在')) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, error.message, 400);
    }
    next(error);
  }
});

/**
 * PUT /api/llm-providers/:name
 * 更新 Provider
 */
router.put('/:name', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const body = updateProviderSchema.parse(req.body);

    const success = updateProvider(name, body);
    if (!success) {
      throw new AppError(ErrorCode.NOT_FOUND, `Provider "${name}" 不存在`, 404);
    }

    console.log(`[LLM Providers] 更新 Provider: ${name}`);

    res.json({
      success: true,
      data: { message: `Provider "${name}" 已更新` }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '参数验证失败: ' + error.errors.map(e => e.message).join(', '), 400);
    }
    next(error);
  }
});

/**
 * DELETE /api/llm-providers/:name
 * 删除 Provider
 */
router.delete('/:name', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;

    const success = deleteProvider(name);
    if (!success) {
      throw new AppError(ErrorCode.NOT_FOUND, `Provider "${name}" 不存在`, 404);
    }

    console.log(`[LLM Providers] 删除 Provider: ${name}`);

    res.json({
      success: true,
      data: { message: `Provider "${name}" 已删除` }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm-providers/default
 * 设置默认 Provider
 */
router.post('/default', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '请提供 Provider 名称', 400);
    }

    const success = setDefaultProvider(name);
    if (!success) {
      throw new AppError(ErrorCode.NOT_FOUND, `Provider "${name}" 不存在`, 404);
    }

    console.log(`[LLM Providers] 设置默认 Provider: ${name}`);

    res.json({
      success: true,
      data: { message: `已将 "${name}" 设为默认 Provider` }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/llm-providers/test
 * 测试 Provider 连通性
 */
router.post('/test', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { api_base, model, api_key } = req.body;

    if (!api_base || !model || !api_key) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '请提供 api_base, model 和 api_key', 400);
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${api_base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api_key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[LLM Providers] 测试失败 (${response.status}): ${errorText}`);
        
        res.json({
          success: true,
          data: {
            connected: false,
            latency,
            error: `API 返回 ${response.status}: ${errorText.slice(0, 200)}`
          }
        });
        return;
      }

      const data = await response.json() as any;
      const hasContent = !!data.choices?.[0]?.message?.content;

      console.log(`[LLM Providers] 测试成功, 延迟: ${latency}ms`);

      res.json({
        success: true,
        data: {
          connected: true,
          latency,
          model: data.model || model,
          hasContent
        }
      });
    } catch (fetchError: any) {
      const latency = Date.now() - startTime;
      console.log(`[LLM Providers] 测试连接失败:`, fetchError.message);
      
      res.json({
        success: true,
        data: {
          connected: false,
          latency,
          error: fetchError.message || '连接失败'
        }
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
