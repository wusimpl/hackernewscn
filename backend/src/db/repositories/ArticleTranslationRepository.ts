import { getDatabase, saveDatabase } from '../connection';
import { ArticleTranslation, ArticleStatus } from '../../types';

export class ArticleTranslationRepository {
  // 创建或更新文章翻译
  async upsert(translation: Omit<ArticleTranslation, 'updated_at'>): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.run(
      `INSERT INTO article_translations (story_id, title_snapshot, content_markdown, original_url, status, error_message, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(story_id) DO UPDATE SET
         title_snapshot = excluded.title_snapshot,
         content_markdown = excluded.content_markdown,
         original_url = excluded.original_url,
         status = excluded.status,
         error_message = excluded.error_message,
         updated_at = excluded.updated_at`,
      [
        translation.story_id,
        translation.title_snapshot,
        translation.content_markdown,
        translation.original_url,
        translation.status,
        translation.error_message || null,
        now,
      ]
    );

    saveDatabase();
  }

  // 根据ID获取文章翻译
  async findById(storyId: number): Promise<ArticleTranslation | null> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM article_translations WHERE story_id = ?',
      [storyId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return this.mapRowToArticle(result[0].columns, row);
  }

  // 获取所有已完成的文章翻译
  async findAllDone(): Promise<ArticleTranslation[]> {
    const db = await getDatabase();
    const result = db.exec(
      "SELECT * FROM article_translations WHERE status = 'done' ORDER BY updated_at DESC"
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToArticle(result[0].columns, row)
    );
  }

  // 根据状态查询
  async findByStatus(status: ArticleStatus): Promise<ArticleTranslation[]> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM article_translations WHERE status = ?',
      [status]
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToArticle(result[0].columns, row)
    );
  }

  // 更新状态
  async updateStatus(
    storyId: number,
    status: ArticleStatus,
    errorMessage?: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.run(
      'UPDATE article_translations SET status = ?, error_message = ?, updated_at = ? WHERE story_id = ?',
      [status, errorMessage || null, now, storyId]
    );

    saveDatabase();
  }

  // 删除文章翻译
  async delete(storyId: number): Promise<void> {
    const db = await getDatabase();
    db.run('DELETE FROM article_translations WHERE story_id = ?', [storyId]);
    saveDatabase();
  }

  // 清空所有文章翻译
  async deleteAll(): Promise<void> {
    const db = await getDatabase();
    db.run('DELETE FROM article_translations');
    saveDatabase();
  }

  // 检查文章是否已翻译
  async exists(storyId: number): Promise<boolean> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT 1 FROM article_translations WHERE story_id = ? LIMIT 1',
      [storyId]
    );

    return result.length > 0 && result[0].values.length > 0;
  }

  // 辅助方法:将数据库行映射为ArticleTranslation对象
  private mapRowToArticle(columns: string[], row: any[]): ArticleTranslation {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    return {
      story_id: obj.story_id,
      title_snapshot: obj.title_snapshot,
      content_markdown: obj.content_markdown,
      original_url: obj.original_url,
      status: obj.status as ArticleStatus,
      error_message: obj.error_message,
      updated_at: obj.updated_at,
    };
  }
}
