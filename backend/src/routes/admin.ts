import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSchedulerService } from '../services/scheduler';
import { config } from '../config';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { SettingsRepository } from '../db/repositories';

const router = Router();

// 调度参数验证
const schedulerConfigSchema = z.object({
  interval: z.number().min(60000).max(86400000).optional(), // 1分钟到24小时
  storyLimit: z.number().min(10).max(100).optional(), // 10到100条
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
 * POST /api/admin/trigger
 * 手动触发调度器抓取和翻译
 */
router.post('/trigger', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scheduler = getSchedulerService();
    const statusBefore = scheduler.getStatus();

    console.log('[Admin] 手动触发调度器');

    // 异步执行，不阻塞响应
    scheduler.runOnce().catch(err => {
      console.error('[Admin] 手动触发执行失败:', err);
    });

    res.json({
      success: true,
      data: {
        message: '调度器已触发',
        status: statusBefore,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/status
 * 获取调度器状态
 */
router.get('/status', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scheduler = getSchedulerService();
    const status = scheduler.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/scheduler-config
 * 获取调度器配置参数
 */
router.get('/scheduler-config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settingsRepo = new SettingsRepository();
    
    const intervalSetting = await settingsRepo.get('scheduler_interval');
    const storyLimitSetting = await settingsRepo.get('scheduler_story_limit');

    res.json({
      success: true,
      data: {
        interval: intervalSetting ? parseInt(intervalSetting, 10) : config.scheduler.interval,
        storyLimit: storyLimitSetting ? parseInt(storyLimitSetting, 10) : config.scheduler.storyLimit,
        defaults: {
          interval: config.scheduler.interval,
          storyLimit: config.scheduler.storyLimit,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/scheduler-config
 * 更新调度器配置参数
 */
router.put('/scheduler-config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schedulerConfigSchema.parse(req.body);
    const settingsRepo = new SettingsRepository();
    const scheduler = getSchedulerService();

    if (body.interval !== undefined) {
      await settingsRepo.set('scheduler_interval', body.interval.toString());
      console.log(`[Admin] 调度间隔已更新为 ${body.interval}ms`);
    }

    if (body.storyLimit !== undefined) {
      await settingsRepo.set('scheduler_story_limit', body.storyLimit.toString());
      console.log(`[Admin] 抓取数量已更新为 ${body.storyLimit}`);
    }

    // 重启调度器以应用新配置
    scheduler.restart();

    res.json({
      success: true,
      data: {
        message: '调度配置已更新',
        interval: body.interval,
        storyLimit: body.storyLimit,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/scheduler-config/reset
 * 重置调度器配置为默认值
 */
router.post('/scheduler-config/reset', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settingsRepo = new SettingsRepository();
    const scheduler = getSchedulerService();

    await settingsRepo.delete('scheduler_interval');
    await settingsRepo.delete('scheduler_story_limit');

    console.log('[Admin] 调度配置已重置为默认值');

    // 重启调度器以应用默认配置
    scheduler.restart();

    res.json({
      success: true,
      data: {
        message: '调度配置已重置为默认值',
        interval: config.scheduler.interval,
        storyLimit: config.scheduler.storyLimit,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
