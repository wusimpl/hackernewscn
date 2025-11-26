import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { config } from '../config';
import { TranslationJob, ArticleStatus, SSEEvent } from '../types';
import { JobRepository } from '../db/repositories';

/**
 * 任务队列服务
 * 负责管理和执行翻译任务,支持任务持久化和恢复
 */
export class QueueService extends EventEmitter {
  private queue: PQueue;
  private jobRepo: JobRepository;

  constructor() {
    super();
    this.queue = new PQueue({ concurrency: config.queue.maxConcurrency });
    this.jobRepo = new JobRepository();

    console.log(`[Queue Service] 初始化任务队列, 最大并发数: ${config.queue.maxConcurrency}`);
  }

  /**
   * 添加文章翻译任务到队列
   * @param storyId 故事 ID
   * @param taskFn 异步任务函数
   * @returns 任务 ID
   */
  async addArticleTranslationTask(
    storyId: number,
    taskFn: () => Promise<void>
  ): Promise<string> {
    // 创建任务记录
    const jobId = await this.jobRepo.create(storyId, 'article', 'queued');

    console.log(`[Queue Service] 添加文章翻译任务: storyId=${storyId}, jobId=${jobId}`);

    // 将任务加入队列
    this.queue.add(async () => {
      try {
        // 更新任务状态为运行中
        await this.jobRepo.updateStatus(jobId, 'running');
        console.log(`[Queue Service] 开始执行任务: jobId=${jobId}`);

        // 执行任务
        await taskFn();

        // 更新任务状态为完成
        await this.jobRepo.updateStatus(jobId, 'done');
        console.log(`[Queue Service] 任务完成: jobId=${jobId}`);

      } catch (error) {
        // 更新任务状态为错误
        await this.jobRepo.updateStatus(jobId, 'error');
        console.error(`[Queue Service] 任务失败: jobId=${jobId}`, error);
        throw error;
      }
    });

    return jobId;
  }

  /**
   * 获取队列状态
   * @returns 队列统计信息
   */
  getQueueStatus() {
    return {
      pending: this.queue.pending,
      size: this.queue.size,
      isPaused: this.queue.isPaused
    };
  }

  /**
   * 获取任务状态
   * @param jobId 任务 ID
   * @returns 任务记录或 null
   */
  async getJobStatus(jobId: string): Promise<TranslationJob | null> {
    return await this.jobRepo.findById(jobId);
  }

  /**
   * 获取某个故事的所有任务
   * @param storyId 故事 ID
   * @returns 任务数组
   */
  async getJobsByStory(storyId: number): Promise<TranslationJob[]> {
    const job = await this.jobRepo.findByStoryAndType(storyId, 'article');
    return job ? [job] : [];
  }

  /**
   * 获取所有未完成的任务
   * @returns 任务数组
   */
  async getPendingJobs(): Promise<TranslationJob[]> {
    const queued = await this.jobRepo.findByStatus('queued');
    const running = await this.jobRepo.findByStatus('running');
    return [...queued, ...running];
  }

  /**
   * 暂停队列
   */
  pause() {
    this.queue.pause();
    console.log('[Queue Service] 队列已暂停');
  }

  /**
   * 恢复队列
   */
  resume() {
    this.queue.start();
    console.log('[Queue Service] 队列已恢复');
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue.clear();
    console.log('[Queue Service] 队列已清空');
  }

  /**
   * 触发 SSE 事件
   * @param event SSE 事件对象
   */
  emitSSEEvent(event: SSEEvent) {
    this.emit('sse', event);
  }
}

// 单例实例
let queueServiceInstance: QueueService | null = null;

/**
 * 获取队列服务单例
 */
export function getQueueService(): QueueService {
  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService();
  }
  return queueServiceInstance;
}
