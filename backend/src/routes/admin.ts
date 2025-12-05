import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'fs';
import { getSchedulerService, getCommentRefreshService } from '../services/scheduler';
import { getCleanupService } from '../services/cleanup';
import { config } from '../config';
import { AppError, ErrorCode } from '../middleware/errorHandler';
import { StoryRepository, TitleTranslationRepository, ArticleTranslationRepository, CommentRepository, CommentTranslationRepository, SettingsRepository } from '../db/repositories';
import { getDatabase, saveDatabase } from '../db/connection';

const router = Router();

// 调度参数验证
const schedulerConfigSchema = z.object({
  interval: z.number().min(60000).max(86400000).optional(), // 1分钟到24小时
  storyLimit: z.number().min(1).max(100).optional(), // 1到100条
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
 * 获取调度器配置参数（从数据库读取）
 */
router.get('/scheduler-config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settingsRepo = new SettingsRepository();

    // 默认值
    const DEFAULT_INTERVAL = 1800000; // 30分钟
    const DEFAULT_STORY_LIMIT = 20;
    const DEFAULT_MAX_COMMENT_TRANSLATIONS = 50;

    // 从数据库读取当前配置
    const [intervalStr, storyLimitStr, maxCommentTranslationsStr] = await Promise.all([
      settingsRepo.get('scheduler_interval'),
      settingsRepo.get('scheduler_story_limit'),
      settingsRepo.get('max_comment_translations'),
    ]);

    res.json({
      success: true,
      data: {
        interval: intervalStr ? parseInt(intervalStr, 10) : DEFAULT_INTERVAL,
        storyLimit: storyLimitStr ? parseInt(storyLimitStr, 10) : DEFAULT_STORY_LIMIT,
        maxCommentTranslations: maxCommentTranslationsStr ? parseInt(maxCommentTranslationsStr, 10) : DEFAULT_MAX_COMMENT_TRANSLATIONS,
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
 * 更新调度器配置参数（写入数据库）
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

    if (body.maxCommentTranslations !== undefined) {
      await settingsRepo.set('max_comment_translations', body.maxCommentTranslations.toString());
      console.log(`[Admin] 评论翻译数量已更新为 ${body.maxCommentTranslations}`);
    }

    // 重启调度器以应用新配置
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
 * 重置调度器配置为默认值（重置数据库配置）
 */
router.post('/scheduler-config/reset', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settingsRepo = new SettingsRepository();
    const scheduler = getSchedulerService();

    // 默认值
    const DEFAULT_INTERVAL = 1800000; // 30分钟
    const DEFAULT_STORY_LIMIT = 20;
    const DEFAULT_MAX_COMMENT_TRANSLATIONS = 50;

    // 重置数据库配置为默认值
    await Promise.all([
      settingsRepo.set('scheduler_interval', DEFAULT_INTERVAL.toString()),
      settingsRepo.set('scheduler_story_limit', DEFAULT_STORY_LIMIT.toString()),
      settingsRepo.set('max_comment_translations', DEFAULT_MAX_COMMENT_TRANSLATIONS.toString()),
    ]);

    console.log('[Admin] 调度配置已重置为默认值');

    // 重启调度器以应用新配置
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
 * 获取评论刷新配置参数（从数据库读取）
 */
router.get('/comment-refresh/config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settingsRepo = new SettingsRepository();

    // 默认值
    const DEFAULT_ENABLED = true;
    const DEFAULT_INTERVAL = 600000; // 10分钟
    const DEFAULT_STORY_LIMIT = 30;
    const DEFAULT_BATCH_SIZE = 5;

    // 从数据库读取当前配置
    const [enabledStr, intervalStr, storyLimitStr, batchSizeStr] = await Promise.all([
      settingsRepo.get('comment_refresh_enabled'),
      settingsRepo.get('comment_refresh_interval'),
      settingsRepo.get('comment_refresh_story_limit'),
      settingsRepo.get('comment_refresh_batch_size'),
    ]);

    res.json({
      success: true,
      data: {
        enabled: enabledStr ? enabledStr === 'true' : DEFAULT_ENABLED,
        interval: intervalStr ? parseInt(intervalStr, 10) : DEFAULT_INTERVAL,
        storyLimit: storyLimitStr ? parseInt(storyLimitStr, 10) : DEFAULT_STORY_LIMIT,
        batchSize: batchSizeStr ? parseInt(batchSizeStr, 10) : DEFAULT_BATCH_SIZE,
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
 * 更新评论刷新配置参数（写入数据库）
 */
router.put('/comment-refresh/config', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = commentRefreshConfigSchema.parse(req.body);
    const settingsRepo = new SettingsRepository();
    const commentRefresh = getCommentRefreshService();

    if (body.enabled !== undefined) {
      await settingsRepo.set('comment_refresh_enabled', body.enabled.toString());
      console.log(`[Admin] 评论刷新已${body.enabled ? '启用' : '禁用'}`);
    }

    if (body.interval !== undefined) {
      await settingsRepo.set('comment_refresh_interval', body.interval.toString());
      console.log(`[Admin] 评论刷新间隔已更新为 ${body.interval}ms`);
    }

    if (body.storyLimit !== undefined) {
      await settingsRepo.set('comment_refresh_story_limit', body.storyLimit.toString());
      console.log(`[Admin] 评论刷新文章数已更新为 ${body.storyLimit}`);
    }

    if (body.batchSize !== undefined) {
      await settingsRepo.set('comment_refresh_batch_size', body.batchSize.toString());
      console.log(`[Admin] 评论刷新批次大小已更新为 ${body.batchSize}`);
    }

    // 重启服务以应用新配置
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
 * 重置评论刷新配置为默认值（重置数据库配置）
 */
router.post('/comment-refresh/config/reset', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settingsRepo = new SettingsRepository();
    const commentRefresh = getCommentRefreshService();

    // 默认值
    const DEFAULT_ENABLED = true;
    const DEFAULT_INTERVAL = 600000;
    const DEFAULT_STORY_LIMIT = 30;
    const DEFAULT_BATCH_SIZE = 5;

    // 重置数据库配置为默认值
    await Promise.all([
      settingsRepo.set('comment_refresh_enabled', DEFAULT_ENABLED.toString()),
      settingsRepo.set('comment_refresh_interval', DEFAULT_INTERVAL.toString()),
      settingsRepo.set('comment_refresh_story_limit', DEFAULT_STORY_LIMIT.toString()),
      settingsRepo.set('comment_refresh_batch_size', DEFAULT_BATCH_SIZE.toString()),
    ]);

    console.log('[Admin] 评论刷新配置已重置为默认值');

    // 重启服务以应用新配置
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

// ============================================
// 数据库监控接口
// ============================================

/**
 * GET /api/admin/database/stats
 * 获取数据库各表大小统计
 */
router.get('/database/stats', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = await getDatabase();
    
    // 获取数据库文件大小
    let dbFileSizeMB = 0;
    try {
      const stats = fs.statSync(config.dbPath);
      dbFileSizeMB = stats.size / (1024 * 1024);
    } catch {
      // 文件不存在或无法访问
    }

    // 获取所有表名和列信息
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tableNames = tablesResult.length > 0 ? tablesResult[0].values.map(row => row[0] as string) : [];

    // 获取每个表的统计信息
    const tableStats = [];
    for (const tableName of tableNames) {
      // 获取行数
      const countResult = db.exec(`SELECT COUNT(*) FROM "${tableName}"`);
      const rowCount = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

      let dataSizeBytes = 0;
      
      if (rowCount > 0) {
        // 获取表的列信息
        const columnsResult = db.exec(`PRAGMA table_info("${tableName}")`);
        if (columnsResult.length > 0) {
          const columnNames = columnsResult[0].values.map(row => row[1] as string);
          
          // 构建计算每行所有列字节长度的 SQL
          // 使用 COALESCE 处理 NULL 值，LENGTH 对 BLOB 返回字节数，对 TEXT 返回字符数
          // 使用 CAST AS BLOB 确保获取实际字节数
          const lengthExprs = columnNames.map(col => 
            `COALESCE(LENGTH(CAST("${col}" AS BLOB)), 0)`
          ).join(' + ');
          
          const sizeResult = db.exec(`SELECT SUM(${lengthExprs}) FROM "${tableName}"`);
          if (sizeResult.length > 0 && sizeResult[0].values[0][0] !== null) {
            dataSizeBytes = sizeResult[0].values[0][0] as number;
          }
        }
      }

      tableStats.push({
        name: tableName,
        rowCount,
        sizeMB: Math.round((dataSizeBytes / (1024 * 1024)) * 1000) / 1000,
      });
    }

    // 按大小排序
    tableStats.sort((a, b) => b.sizeMB - a.sizeMB);

    res.json({
      success: true,
      data: {
        dbFileSizeMB: Math.round(dbFileSizeMB * 1000) / 1000,
        tables: tableStats,
        totalTables: tableStats.length,
        totalRows: tableStats.reduce((sum, t) => sum + t.rowCount, 0),
        totalDataSizeMB: Math.round(tableStats.reduce((sum, t) => sum + t.sizeMB, 0) * 1000) / 1000,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// 清理服务接口
// ============================================

/**
 * GET /api/admin/cleanup/status
 * 获取清理服务状态
 */
router.get('/cleanup/status', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cleanup = getCleanupService();
    const status = cleanup.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/cleanup/trigger
 * 手动触发清理服务
 */
router.post('/cleanup/trigger', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cleanup = getCleanupService();
    const statusBefore = cleanup.getStatus();

    console.log('[Admin] 手动触发清理服务');

    // 异步执行，不阻塞响应
    cleanup.runOnce().catch(err => {
      console.error('[Admin] 手动触发清理失败:', err);
    });

    res.json({
      success: true,
      data: {
        message: '清理服务已触发',
        status: statusBefore,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// 文章管理接口
// ============================================

/**
 * GET /api/admin/articles
 * 获取所有文章列表（包含评论数量）
 */
router.get('/articles', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const articleRepo = new ArticleTranslationRepository();
    const commentRepo = new CommentRepository();
    const db = await getDatabase();

    // 获取所有文章（按更新时间倒序）
    const result = db.exec(
      `SELECT * FROM article_translations ORDER BY updated_at DESC`
    );

    if (result.length === 0) {
      return res.json({
        success: true,
        data: {
          articles: [],
          total: 0,
        },
      });
    }

    const articles = result[0].values.map(row => {
      const obj: any = {};
      result[0].columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    // 获取每篇文章的评论数量
    const storyIds = articles.map(a => a.story_id);
    const commentCounts = await commentRepo.countByStoryIds(storyIds);

    // 合并评论数量
    const articlesWithComments = articles.map(article => ({
      ...article,
      comment_count: commentCounts.get(article.story_id) || 0,
    }));

    res.json({
      success: true,
      data: {
        articles: articlesWithComments,
        total: articlesWithComments.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/articles/:id
 * 删除文章及其所有评论
 */
router.delete('/articles/:id', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storyId = parseInt(req.params.id, 10);

    if (isNaN(storyId)) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '无效的文章ID', 400);
    }

    const db = await getDatabase();
    const commentRepo = new CommentRepository();
    const commentTranslationRepo = new CommentTranslationRepository();
    const articleRepo = new ArticleTranslationRepository();

    // 1. 获取该文章的所有评论ID
    const commentsResult = db.exec(
      'SELECT comment_id FROM comments WHERE story_id = ?',
      [storyId]
    );
    const commentIds = commentsResult.length > 0 
      ? commentsResult[0].values.map(row => row[0] as number)
      : [];

    // 2. 删除评论翻译
    if (commentIds.length > 0) {
      await commentTranslationRepo.deleteByCommentIds(commentIds);
    }

    // 3. 删除评论
    db.run('DELETE FROM comments WHERE story_id = ?', [storyId]);

    // 4. 删除文章翻译
    await articleRepo.delete(storyId);

    saveDatabase();

    console.log(`[Admin] 已删除文章 ${storyId} 及其 ${commentIds.length} 条评论`);

    res.json({
      success: true,
      data: {
        message: '文章及评论已删除',
        deletedComments: commentIds.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/articles/:id/comments
 * 删除文章的所有评论（保留文章）
 */
router.delete('/articles/:id/comments', requireAdminAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storyId = parseInt(req.params.id, 10);

    if (isNaN(storyId)) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '无效的文章ID', 400);
    }

    const db = await getDatabase();
    const commentTranslationRepo = new CommentTranslationRepository();

    // 1. 获取该文章的所有评论ID
    const commentsResult = db.exec(
      'SELECT comment_id FROM comments WHERE story_id = ?',
      [storyId]
    );
    const commentIds = commentsResult.length > 0 
      ? commentsResult[0].values.map(row => row[0] as number)
      : [];

    if (commentIds.length === 0) {
      return res.json({
        success: true,
        data: {
          message: '该文章没有评论',
          deletedComments: 0,
        },
      });
    }

    // 2. 删除评论翻译
    await commentTranslationRepo.deleteByCommentIds(commentIds);

    // 3. 删除评论
    db.run('DELETE FROM comments WHERE story_id = ?', [storyId]);

    saveDatabase();

    console.log(`[Admin] 已删除文章 ${storyId} 的 ${commentIds.length} 条评论`);

    res.json({
      success: true,
      data: {
        message: '评论已删除',
        deletedComments: commentIds.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
