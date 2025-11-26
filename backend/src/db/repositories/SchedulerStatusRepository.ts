import { getDatabase, saveDatabase } from '../connection';
import { SchedulerStatusRecord } from '../../types';

export class SchedulerStatusRepository {
  // 获取调度器状态
  async getStatus(): Promise<SchedulerStatusRecord | null> {
    const db = await getDatabase();
    const result = db.exec('SELECT * FROM scheduler_status WHERE id = 1');

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return this.mapRowToStatus(result[0].columns, row);
  }

  // 更新调度器状态
  async updateStatus(status: Partial<Omit<SchedulerStatusRecord, 'id' | 'updated_at'>>): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    // 构建动态更新语句
    const updates: string[] = [];
    const values: (number | null)[] = [];

    if (status.last_run_at !== undefined) {
      updates.push('last_run_at = ?');
      values.push(status.last_run_at);
    }

    if (status.stories_fetched !== undefined) {
      updates.push('stories_fetched = ?');
      values.push(status.stories_fetched);
    }

    if (status.titles_translated !== undefined) {
      updates.push('titles_translated = ?');
      values.push(status.titles_translated);
    }

    // 始终更新 updated_at
    updates.push('updated_at = ?');
    values.push(now);

    if (updates.length === 1) {
      // 只有 updated_at，没有其他更新
      return;
    }

    const sql = `UPDATE scheduler_status SET ${updates.join(', ')} WHERE id = 1`;
    db.run(sql, values);
    saveDatabase();
  }

  // 辅助方法：将数据库行映射为 SchedulerStatusRecord 对象
  private mapRowToStatus(columns: string[], row: any[]): SchedulerStatusRecord {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    return {
      id: obj.id,
      last_run_at: obj.last_run_at,
      stories_fetched: obj.stories_fetched,
      titles_translated: obj.titles_translated,
      updated_at: obj.updated_at,
    };
  }
}
