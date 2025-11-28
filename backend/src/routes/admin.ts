import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSchedulerService, getCommentRefreshService } from '../services/scheduler';
import { config, reloadSchedulerConfig, reloadCommentRefreshConfig } from '../config';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { updateEnvVar, deleteEnvVar, getEnvVar } from '../utils/envManager';
import { StoryRepository, TitleTranslationRepository, ArticleTranslationRepository, CommentRepository, CommentTranslationRepository } from '../db/repositories';

const router = Router();

// 调度参数验证
const schedulerConfigSchema = z.object({
  interval: z.number().min(60000).max(86400000).optional(), // 1分钟到24小时
  storyLimit: z.number().min(10).max(100).optional(), // 10到100条
  maxCommentTranslations: z.number().min(10).max(200).optional(), // 10到200条评论
});

// 评论刷新配置验证
const commentRefreshConfigSchema = z.object({
  enabled: z.boolean().optional(),
  interval: z.number().min(60000).max(86400000).optional(), // 1分钟到24小时
  storyLimit: z.number().min(10).max(100).optional(), // 10到100篇
  batchSize: z.number().min(1).max(20).optional(), // 1到20篇每批
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
    const statusBefore = await scheduler.getStatus();

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
    const status = await scheduler.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/stats
 * 获取详细统计数据
 */
router.get('/stats', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storyRepo = new StoryRepository();
    const titleRepo = new TitleTranslationRepository();
    const articleRepo = new ArticleTranslationRepository();
    const commentRepo = new CommentRepository();
    const commentTranslationRepo = new CommentTranslationRepository();

    const [
      storiesTotal,
      titlesTranslated,
      articleStatusCounts,
      commentsTotal,
      commentsTranslated,
    ] = await Promise.all([
      storyRepo.count(),
      titleRepo.count(),
      articleRepo.countByStatus(),
      commentRepo.count(),
      commentTranslationRepo.count(),
    ]);

    res.json({
      success: true,
      data: {
        stories: {
          total: storiesTotal,
        },
        titles: {
          translated: titlesTranslated,
        },
        articles: {
          done: articleStatusCounts.done,
          blocked: articleStatusCounts.blocked,
          error: articleStatusCounts.error,
          running: articleStatusCounts.running,
          queued: articleStatusCounts.queued,
        },
        comments: {
          total: commentsTotal,
          translated: commentsTranslated,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/scheduler-config
 * 获取调度器配置参数（从 .env 读取）
 */
router.get('/scheduler-config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 从 .env 读取当前配置
    const intervalEnv = getEnvVar('SCHEDULER_INTERVAL');
    const storyLimitEnv = getEnvVar('SCHEDULER_STORY_LIMIT');
    const maxCommentTranslationsEnv = getEnvVar('MAX_COMMENT_TRANSLATIONS');

    // 默认值
    const DEFAULT_INTERVAL = 300000; // 5分钟
    const DEFAULT_STORY_LIMIT = 30;
    const DEFAULT_MAX_COMMENT_TRANSLATIONS = 50;

    res.json({
      success: true,
      data: {
        interval: intervalEnv ? parseInt(intervalEnv, 10) : DEFAULT_INTERVAL,
        storyLimit: storyLimitEnv ? parseInt(storyLimitEnv, 10) : DEFAULT_STORY_LIMIT,
        maxCommentTranslations: maxCommentTranslationsEnv ? parseInt(maxCommentTranslationsEnv, 10) : DEFAULT_MAX_COMMENT_TRANSLATIONS,
        defaults: {
          interval: DEFAULT_INTERVAL,
          storyLimit: DEFAULT_STORY_LIMIT,
          maxCommentTranslations: DEFAULT_MAX_COMMENT_TRANSLATIONS,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/scheduler-config
 * 更新调度器配置参数（写入 .env 文件）
 */
router.put('/scheduler-config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = schedulerConfigSchema.parse(req.body);
    const scheduler = getSchedulerService();

    if (body.interval !== undefined) {
      updateEnvVar('SCHEDULER_INTERVAL', body.interval.toString());
      console.log(`[Admin] 调度间隔已更新为 ${body.interval}ms`);
    }

    if (body.storyLimit !== undefined) {
      updateEnvVar('SCHEDULER_STORY_LIMIT', body.storyLimit.toString());
      console.log(`[Admin] 抓取数量已更新为 ${body.storyLimit}`);
    }

    if (body.maxCommentTranslations !== undefined) {
      updateEnvVar('MAX_COMMENT_TRANSLATIONS', body.maxCommentTranslations.toString());
      console.log(`[Admin] 评论翻译数量已更新为 ${body.maxCommentTranslations}`);
    }

    // 重新加载配置并重启调度器
    reloadSchedulerConfig();
    scheduler.restart();

    res.json({
      success: true,
      data: {
        message: '调度配置已更新',
        interval: body.interval,
        storyLimit: body.storyLimit,
        maxCommentTranslations: body.maxCommentTranslations,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/scheduler-config/reset
 * 重置调度器配置为默认值（从 .env 删除自定义配置）
 */
router.post('/scheduler-config/reset', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scheduler = getSchedulerService();

    // 默认值
    const DEFAULT_INTERVAL = 300000; // 5分钟
    const DEFAULT_STORY_LIMIT = 30;
    const DEFAULT_MAX_COMMENT_TRANSLATIONS = 50;

    // 从 .env 删除自定义配置
    deleteEnvVar('SCHEDULER_INTERVAL');
    deleteEnvVar('SCHEDULER_STORY_LIMIT');
    deleteEnvVar('MAX_COMMENT_TRANSLATIONS');

    console.log('[Admin] 调度配置已重置为默认值');

    // 重新加载配置并重启调度器
    reloadSchedulerConfig();
    scheduler.restart();

    res.json({
      success: true,
      data: {
        message: '调度配置已重置为默认值',
        interval: DEFAULT_INTERVAL,
        storyLimit: DEFAULT_STORY_LIMIT,
        maxCommentTranslations: DEFAULT_MAX_COMMENT_TRANSLATIONS,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// 评论刷新配置接口
// ============================================

/**
 * GET /api/admin/comment-refresh/status
 * 获取评论刷新服务状态
 */
router.get('/comment-refresh/status', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const commentRefresh = getCommentRefreshService();
    const status = await commentRefresh.getStatusWithConfig();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/comment-refresh/config
 * 获取评论刷新配置参数
 */
router.get('/comment-refresh/config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const enabledEnv = getEnvVar('COMMENT_REFRESH_ENABLED');
    const intervalEnv = getEnvVar('COMMENT_REFRESH_INTERVAL');
    const storyLimitEnv = getEnvVar('COMMENT_REFRESH_STORY_LIMIT');
    const batchSizeEnv = getEnvVar('COMMENT_REFRESH_BATCH_SIZE');

    // 默认值
    const DEFAULT_ENABLED = true;
    const DEFAULT_INTERVAL = 600000; // 10分钟
    const DEFAULT_STORY_LIMIT = 30;
    const DEFAULT_BATCH_SIZE = 5;

    res.json({
      success: true,
      data: {
        enabled: enabledEnv !== undefined ? enabledEnv !== 'false' : DEFAULT_ENABLED,
        interval: intervalEnv ? parseInt(intervalEnv, 10) : DEFAULT_INTERVAL,
        storyLimit: storyLimitEnv ? parseInt(storyLimitEnv, 10) : DEFAULT_STORY_LIMIT,
        batchSize: batchSizeEnv ? parseInt(batchSizeEnv, 10) : DEFAULT_BATCH_SIZE,
        defaults: {
          enabled: DEFAULT_ENABLED,
          interval: DEFAULT_INTERVAL,
          storyLimit: DEFAULT_STORY_LIMIT,
          batchSize: DEFAULT_BATCH_SIZE,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/admin/comment-refresh/config
 * 更新评论刷新配置参数
 */
router.put('/comment-refresh/config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = commentRefreshConfigSchema.parse(req.body);
    const commentRefresh = getCommentRefreshService();

    if (body.enabled !== undefined) {
      updateEnvVar('COMMENT_REFRESH_ENABLED', body.enabled.toString());
      console.log(`[Admin] 评论刷新已${body.enabled ? '启用' : '禁用'}`);
    }

    if (body.interval !== undefined) {
      updateEnvVar('COMMENT_REFRESH_INTERVAL', body.interval.toString());
      console.log(`[Admin] 评论刷新间隔已更新为 ${body.interval}ms`);
    }

    if (body.storyLimit !== undefined) {
      updateEnvVar('COMMENT_REFRESH_STORY_LIMIT', body.storyLimit.toString());
      console.log(`[Admin] 评论刷新文章数已更新为 ${body.storyLimit}`);
    }

    if (body.batchSize !== undefined) {
      updateEnvVar('COMMENT_REFRESH_BATCH_SIZE', body.batchSize.toString());
      console.log(`[Admin] 评论刷新批次大小已更新为 ${body.batchSize}`);
    }

    // 重新加载配置并重启服务
    reloadCommentRefreshConfig();
    commentRefresh.restart();

    res.json({
      success: true,
      data: {
        message: '评论刷新配置已更新',
        enabled: body.enabled,
        interval: body.interval,
        storyLimit: body.storyLimit,
        batchSize: body.batchSize,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/comment-refresh/config/reset
 * 重置评论刷新配置为默认值
 */
router.post('/comment-refresh/config/reset', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const commentRefresh = getCommentRefreshService();

    // 默认值
    const DEFAULT_ENABLED = true;
    const DEFAULT_INTERVAL = 600000;
    const DEFAULT_STORY_LIMIT = 30;
    const DEFAULT_BATCH_SIZE = 5;

    // 从 .env 删除自定义配置
    deleteEnvVar('COMMENT_REFRESH_ENABLED');
    deleteEnvVar('COMMENT_REFRESH_INTERVAL');
    deleteEnvVar('COMMENT_REFRESH_STORY_LIMIT');
    deleteEnvVar('COMMENT_REFRESH_BATCH_SIZE');

    console.log('[Admin] 评论刷新配置已重置为默认值');

    // 重新加载配置并重启服务
    reloadCommentRefreshConfig();
    commentRefresh.restart();

    res.json({
      success: true,
      data: {
        message: '评论刷新配置已重置为默认值',
        enabled: DEFAULT_ENABLED,
        interval: DEFAULT_INTERVAL,
        storyLimit: DEFAULT_STORY_LIMIT,
        batchSize: DEFAULT_BATCH_SIZE,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/comment-refresh/trigger
 * 手动触发评论刷新
 */
router.post('/comment-refresh/trigger', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const commentRefresh = getCommentRefreshService();
    const statusBefore = await commentRefresh.getStatus();

    console.log('[Admin] 手动触发评论刷新');

    // 异步执行，不阻塞响应
    commentRefresh.runOnce().catch(err => {
      console.error('[Admin] 手动触发评论刷新失败:', err);
    });

    res.json({
      success: true,
      data: {
        message: '评论刷新已触发',
        status: statusBefore,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
