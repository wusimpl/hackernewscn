import { getDatabase, saveDatabase } from '../connection';

export interface CommentTranslationRecord {
  comment_id: number;
  text_en: string;
  text_zh: string;
  updated_at: number;
}

export class CommentTranslationRepository {
  // Batch insert or update comment translations
  async upsertMany(translations: Omit<CommentTranslationRecord, 'updated_at'>[]): Promise<void> {
    if (translations.length === 0) return;

    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    for (const translation of translations) {
      db.run(
        `INSERT INTO comment_translations (comment_id, text_en, text_zh, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(comment_id) DO UPDATE SET
           text_en = excluded.text_en,
           text_zh = excluded.text_zh,
           updated_at = excluded.updated_at`,
        [
          translation.comment_id,
          translation.text_en,
          translation.text_zh,
          now,
        ]
      );
    }

    saveDatabase();
  }

  // Get translations for multiple comment IDs
  async findByIds(commentIds: number[]): Promise<CommentTranslationRecord[]> {
    if (commentIds.length === 0) return [];

    const db = await getDatabase();
    const placeholders = commentIds.map(() => '?').join(',');
    const result = db.exec(
      `SELECT * FROM comment_translations WHERE comment_id IN (${placeholders})`,
      commentIds
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToTranslation(result[0].columns, row)
    );
  }

  // Get translations for a story's comments
  async findByStoryId(storyId: number): Promise<CommentTranslationRecord[]> {
    const db = await getDatabase();
    const result = db.exec(
      `SELECT ct.* FROM comment_translations ct
       INNER JOIN comments c ON ct.comment_id = c.comment_id
       WHERE c.story_id = ?`,
      [storyId]
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToTranslation(result[0].columns, row)
    );
  }

  // Check if translation exists for a comment
  async hasTranslation(commentId: number): Promise<boolean> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT 1 FROM comment_translations WHERE comment_id = ? LIMIT 1',
      [commentId]
    );

    return result.length > 0 && result[0].values.length > 0;
  }

  // 获取评论翻译总数
  async count(): Promise<number> {
    const db = await getDatabase();
    const result = db.exec('SELECT COUNT(*) as count FROM comment_translations');
    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }

  // Helper method to map database row to CommentTranslationRecord
  private mapRowToTranslation(columns: string[], row: any[]): CommentTranslationRecord {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    return {
      comment_id: obj.comment_id,
      text_en: obj.text_en,
      text_zh: obj.text_zh,
      updated_at: obj.updated_at,
    };
  }
}
