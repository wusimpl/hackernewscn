import { getDatabase, saveDatabase } from '../connection';
import { StoryRecord } from '../../types';

export class StoryRepository {
  // 创建或更新故事
  async upsert(story: Omit<StoryRecord, 'fetched_at'>): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.run(
      `INSERT INTO stories (story_id, title_en, by, score, time, url, descendants, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(story_id) DO UPDATE SET
         title_en = excluded.title_en,
         by = excluded.by,
         score = excluded.score,
         time = excluded.time,
         url = excluded.url,
         descendants = excluded.descendants,
         fetched_at = excluded.fetched_at`,
      [
        story.story_id,
        story.title_en,
        story.by,
        story.score,
        story.time,
        story.url || null,
        story.descendants || 0,
        now,
      ]
    );

    saveDatabase();
  }

  // 批量创建或更新
  async upsertMany(stories: Omit<StoryRecord, 'fetched_at'>[]): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    for (const story of stories) {
      db.run(
        `INSERT INTO stories (story_id, title_en, by, score, time, url, descendants, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(story_id) DO UPDATE SET
           title_en = excluded.title_en,
           by = excluded.by,
           score = excluded.score,
           time = excluded.time,
           url = excluded.url,
           descendants = excluded.descendants,
           fetched_at = excluded.fetched_at`,
        [
          story.story_id,
          story.title_en,
          story.by,
          story.score,
          story.time,
          story.url || null,
          story.descendants || 0,
          now,
        ]
      );
    }

    saveDatabase();
  }

  // 根据ID获取故事
  async findById(storyId: number): Promise<StoryRecord | null> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM stories WHERE story_id = ?',
      [storyId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return this.mapRowToStory(result[0].columns, row);
  }

  // 根据ID列表获取故事
  async findByIds(storyIds: number[]): Promise<StoryRecord[]> {
    if (storyIds.length === 0) return [];

    const db = await getDatabase();
    const placeholders = storyIds.map(() => '?').join(',');
    const result = db.exec(
      `SELECT * FROM stories WHERE story_id IN (${placeholders})`,
      storyIds
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToStory(result[0].columns, row)
    );
  }

  // 别名方法
  async getStoriesByIds(storyIds: number[]): Promise<StoryRecord[]> {
    return this.findByIds(storyIds);
  }

  // 分页查询故事(按时间倒序)
  async findAll(offset: number = 0, limit: number = 30): Promise<StoryRecord[]> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM stories ORDER BY time DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToStory(result[0].columns, row)
    );
  }

  // 检查故事是否存在
  async exists(storyId: number): Promise<boolean> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT 1 FROM stories WHERE story_id = ? LIMIT 1',
      [storyId]
    );

    return result.length > 0 && result[0].values.length > 0;
  }

  // 删除故事
  async delete(storyId: number): Promise<void> {
    const db = await getDatabase();
    db.run('DELETE FROM stories WHERE story_id = ?', [storyId]);
    saveDatabase();
  }

  // 辅助方法:将数据库行映射为Story对象
  private mapRowToStory(columns: string[], row: any[]): StoryRecord {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    return {
      story_id: obj.story_id,
      title_en: obj.title_en,
      by: obj.by,
      score: obj.score,
      time: obj.time,
      url: obj.url,
      descendants: obj.descendants,
      fetched_at: obj.fetched_at,
    };
  }
}
