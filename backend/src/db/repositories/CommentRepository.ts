import { getDatabase, saveDatabase } from '../connection';
import { CommentRecord } from '../../types';

export class CommentRepository {
  // Batch insert or update comments
  async upsertMany(comments: Omit<CommentRecord, 'fetched_at'>[]): Promise<void> {
    if (comments.length === 0) return;

    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    for (const comment of comments) {
      db.run(
        `INSERT INTO comments (comment_id, story_id, parent_id, author, text, time, kids, deleted, dead, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(comment_id) DO UPDATE SET
           story_id = excluded.story_id,
           parent_id = excluded.parent_id,
           author = excluded.author,
           text = excluded.text,
           time = excluded.time,
           kids = excluded.kids,
           deleted = excluded.deleted,
           dead = excluded.dead,
           fetched_at = excluded.fetched_at`,
        [
          comment.comment_id,
          comment.story_id,
          comment.parent_id,
          comment.author,
          comment.text,
          comment.time,
          comment.kids,
          comment.deleted,
          comment.dead,
          now,
        ]
      );
    }

    saveDatabase();
  }

  // Get all comments for a story
  async findByStoryId(storyId: number): Promise<CommentRecord[]> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM comments WHERE story_id = ? ORDER BY time ASC',
      [storyId]
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToComment(result[0].columns, row)
    );
  }

  // Check if comments exist for a story
  async hasComments(storyId: number): Promise<boolean> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT 1 FROM comments WHERE story_id = ? LIMIT 1',
      [storyId]
    );

    return result.length > 0 && result[0].values.length > 0;
  }

  // 获取评论总数
  async count(): Promise<number> {
    const db = await getDatabase();
    const result = db.exec('SELECT COUNT(*) as count FROM comments');
    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }

  // 批量获取多个故事的评论数量
  async countByStoryIds(storyIds: number[]): Promise<Map<number, number>> {
    if (storyIds.length === 0) return new Map();

    const db = await getDatabase();
    const placeholders = storyIds.map(() => '?').join(',');
    const result = db.exec(
      `SELECT story_id, COUNT(*) as count FROM comments WHERE story_id IN (${placeholders}) GROUP BY story_id`,
      storyIds
    );

    const countMap = new Map<number, number>();
    if (result.length > 0) {
      for (const row of result[0].values) {
        countMap.set(row[0] as number, row[1] as number);
      }
    }
    return countMap;
  }

  // 删除最旧的N条评论，返回被删除的评论ID列表
  async deleteOldest(limit: number): Promise<number[]> {
    const db = await getDatabase();
    
    // 先获取要删除的评论ID
    const result = db.exec(
      'SELECT comment_id FROM comments ORDER BY fetched_at ASC LIMIT ?',
      [limit]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }
    
    const commentIds = result[0].values.map(row => row[0] as number);
    
    // 删除这些评论
    const placeholders = commentIds.map(() => '?').join(',');
    db.run(`DELETE FROM comments WHERE comment_id IN (${placeholders})`, commentIds);
    
    saveDatabase();
    return commentIds;
  }

  // Helper method to map database row to CommentRecord
  private mapRowToComment(columns: string[], row: any[]): CommentRecord {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    return {
      comment_id: obj.comment_id,
      story_id: obj.story_id,
      parent_id: obj.parent_id,
      author: obj.author,
      text: obj.text,
      time: obj.time,
      kids: obj.kids,
      deleted: obj.deleted,
      dead: obj.dead,
      fetched_at: obj.fetched_at,
    };
  }
}
