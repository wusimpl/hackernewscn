import { getDatabase, saveDatabase } from '../connection';
import { TranslationJob, TranslationJobType, ArticleStatus } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class JobRepository {
  // 创建新任务
  async create(
    storyId: number,
    type: TranslationJobType,
    status: ArticleStatus = 'queued'
  ): Promise<string> {
    const db = await getDatabase();
    const jobId = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    db.run(
      `INSERT INTO translation_jobs (job_id, story_id, type, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [jobId, storyId, type, status, 0, now, now]
    );

    saveDatabase();
    return jobId;
  }

  // 根据ID获取任务
  async findById(jobId: string): Promise<TranslationJob | null> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM translation_jobs WHERE job_id = ?',
      [jobId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return this.mapRowToJob(result[0].columns, row);
  }

  // 根据story_id和type查询任务
  async findByStoryAndType(
    storyId: number,
    type: TranslationJobType
  ): Promise<TranslationJob | null> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM translation_jobs WHERE story_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1',
      [storyId, type]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return this.mapRowToJob(result[0].columns, row);
  }

  // 根据状态查询任务
  async findByStatus(status: ArticleStatus): Promise<TranslationJob[]> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM translation_jobs WHERE status = ? ORDER BY created_at ASC',
      [status]
    );

    if (result.length === 0) return [];

    return result[0].values.map(row => this.mapRowToJob(result[0].columns, row));
  }

  // 更新任务状态
  async updateStatus(
    jobId: string,
    status: ArticleStatus,
    progress?: number
  ): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    if (progress !== undefined) {
      db.run(
        'UPDATE translation_jobs SET status = ?, progress = ?, updated_at = ? WHERE job_id = ?',
        [status, progress, now, jobId]
      );
    } else {
      db.run(
        'UPDATE translation_jobs SET status = ?, updated_at = ? WHERE job_id = ?',
        [status, now, jobId]
      );
    }

    saveDatabase();
  }

  // 删除任务
  async delete(jobId: string): Promise<void> {
    const db = await getDatabase();
    db.run('DELETE FROM translation_jobs WHERE job_id = ?', [jobId]);
    saveDatabase();
  }

  // 删除所有已完成或错误的任务
  async deleteCompleted(): Promise<void> {
    const db = await getDatabase();
    db.run("DELETE FROM translation_jobs WHERE status IN ('done', 'error')");
    saveDatabase();
  }

  // 辅助方法:将数据库行映射为TranslationJob对象
  private mapRowToJob(columns: string[], row: any[]): TranslationJob {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    return {
      job_id: obj.job_id,
      story_id: obj.story_id,
      type: obj.type as TranslationJobType,
      status: obj.status as ArticleStatus,
      progress: obj.progress,
      created_at: obj.created_at,
      updated_at: obj.updated_at,
    };
  }
}
