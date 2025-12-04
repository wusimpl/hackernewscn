import { CommentRepository, CommentTranslationRepository, StoryRepository } from '../db/repositories';

// 清理配置
const CLEANUP_CONFIG = {
  // 每天检查一次 (24小时)
  interval: 24 * 60 * 60 * 1000,
  // 评论配置
  comments: {
    maxCount: 100000,      // 最多存储10万条评论
    deleteCount: 10000,    // 超过时删除1万条
  },
  // 文章配置
  stories: {
    maxCount: 3000,        // 最多存储3000条文章
    deleteCount: 200,      // 超过时删除200条
  },
};

/**
 * 清理服务状态
 */
export interface CleanupStatus {
  isRunning: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  lastCleanup: {
    commentsDeleted: number;
    storiesDeleted: number;
  } | null;
}

/**
 * 数据清理服务
 * 定时清理过期的评论和文章数据，控制数据库大小
 */
export class CleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastRunAt: number | null = null;
  private nextRunAt: number | null = null;
  private lastCleanup: { commentsDeleted: number; storiesDeleted: number } | null = null;

  private commentRepo: CommentRepository;
  private commentTranslationRepo: CommentTranslationRepository;
  private storyRepo: StoryRepository;

  constructor() {
    this.commentRepo = new CommentRepository();
    this.commentTranslationRepo = new CommentTranslationRepository();
    this.storyRepo = new StoryRepository();
  }

  /**
   * 启动清理服务
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      console.log('[Cleanup] 服务已在运行');
      return;
    }

    console.log(`[Cleanup] 启动服务: interval=${CLEANUP_CONFIG.interval / 1000 / 60 / 60}h`);

    // 不立即执行清理，等待下一次定时检查
    this.nextRunAt = Date.now() + CLEANUP_CONFIG.interval;

    this.intervalId = setInterval(() => {
      this.runOnce().catch(err => {
        console.error('[Cleanup] 定时运行失败:', err);
      });
      this.nextRunAt = Date.now() + CLEANUP_CONFIG.interval;
    }, CLEANUP_CONFIG.interval);

    this.isRunning = true;
    console.log('[Cleanup] 服务启动成功');
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      this.nextRunAt = null;
      console.log('[Cleanup] 服务已停止');
    }
  }

  /**
   * 获取服务状态
   */
  getStatus(): CleanupStatus {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      lastCleanup: this.lastCleanup,
    };
  }

  /**
   * 执行一次清理
   */
  async runOnce(): Promise<void> {
    console.log('[Cleanup] 开始数据清理检查...');
    const startTime = Date.now();

    let commentsDeleted = 0;
    let storiesDeleted = 0;

    try {
      // 1. 清理评论
      commentsDeleted = await this.cleanupComments();

      // 2. 清理文章
      storiesDeleted = await this.cleanupStories();

      this.lastRunAt = Date.now();
      this.lastCleanup = { commentsDeleted, storiesDeleted };

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Cleanup] 清理完成: 耗时${duration}s, 删除评论${commentsDeleted}条, 删除文章${storiesDeleted}条`);
    } catch (error) {
      console.error('[Cleanup] 清理失败:', error);
      throw error;
    }
  }

  /**
   * 清理评论
   */
  private async cleanupComments(): Promise<number> {
    const count = await this.commentRepo.count();
    console.log(`[Cleanup] 当前评论数: ${count}, 上限: ${CLEANUP_CONFIG.comments.maxCount}`);

    if (count <= CLEANUP_CONFIG.comments.maxCount) {
      return 0;
    }

    console.log(`[Cleanup] 评论数超限，准备删除 ${CLEANUP_CONFIG.comments.deleteCount} 条最旧评论`);

    // 删除最旧的评论
    const deletedIds = await this.commentRepo.deleteOldest(CLEANUP_CONFIG.comments.deleteCount);

    // 删除对应的翻译
    if (deletedIds.length > 0) {
      await this.commentTranslationRepo.deleteByCommentIds(deletedIds);
      console.log(`[Cleanup] 已删除 ${deletedIds.length} 条评论及其翻译`);
    }

    return deletedIds.length;
  }

  /**
   * 清理文章
   */
  private async cleanupStories(): Promise<number> {
    const count = await this.storyRepo.count();
    console.log(`[Cleanup] 当前文章数: ${count}, 上限: ${CLEANUP_CONFIG.stories.maxCount}`);

    if (count <= CLEANUP_CONFIG.stories.maxCount) {
      return 0;
    }

    console.log(`[Cleanup] 文章数超限，准备删除 ${CLEANUP_CONFIG.stories.deleteCount} 条最旧文章`);

    // 删除最旧的文章（级联删除会自动清理关联数据）
    const deletedIds = await this.storyRepo.deleteOldest(CLEANUP_CONFIG.stories.deleteCount);
    console.log(`[Cleanup] 已删除 ${deletedIds.length} 条文章及其关联数据`);

    return deletedIds.length;
  }
}

// 单例
let cleanupInstance: CleanupService | null = null;

/**
 * 获取清理服务单例
 */
export function getCleanupService(): CleanupService {
  if (!cleanupInstance) {
    cleanupInstance = new CleanupService();
  }
  return cleanupInstance;
}
