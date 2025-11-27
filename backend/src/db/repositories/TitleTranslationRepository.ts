import { getDatabase, saveDatabase } from '../connection';
import { TitleTranslation } from '../../types';

export class TitleTranslationRepository {
  // 创建或更新标题翻译
  async upsert(translation: Omit<TitleTranslation, 'updated_at'>): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.run(
      `INSERT INTO title_translations (story_id, title_en, title_zh, prompt_hash, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(story_id) DO UPDATE SET
         title_en = excluded.title_en,
         title_zh = excluded.title_zh,
         prompt_hash = excluded.prompt_hash,
         updated_at = excluded.updated_at`,
      [
        translation.story_id,
        translation.title_en,
        translation.title_zh,
        translation.prompt_hash,
        now,
      ]
    );

    saveDatabase();
  }

  // 批量创建或更新
  async upsertMany(translations: Omit<TitleTranslation, 'updated_at'>[]): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    for (const translation of translations) {
      db.run(
        `INSERT INTO title_translations (story_id, title_en, title_zh, prompt_hash, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(story_id) DO UPDATE SET
           title_en = excluded.title_en,
           title_zh = excluded.title_zh,
           prompt_hash = excluded.prompt_hash,
           updated_at = excluded.updated_at`,
        [
          translation.story_id,
          translation.title_en,
          translation.title_zh,
          translation.prompt_hash,
          now,
        ]
      );
    }

    saveDatabase();
  }

  // 根据ID获取翻译
  async findById(storyId: number): Promise<TitleTranslation | null> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM title_translations WHERE story_id = ?',
      [storyId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return this.mapRowToTranslation(result[0].columns, row);
  }

  // 别名方法
  async getTitleTranslation(storyId: number): Promise<TitleTranslation | null> {
    return this.findById(storyId);
  }

  // 根据ID列表获取翻译
  async findByIds(storyIds: number[]): Promise<TitleTranslation[]> {
    if (storyIds.length === 0) return [];

    const db = await getDatabase();
    const placeholders = storyIds.map(() => '?').join(',');
    const result = db.exec(
      `SELECT * FROM title_translations WHERE story_id IN (${placeholders})`,
      storyIds
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToTranslation(result[0].columns, row)
    );
  }

  // 根据prompt_hash查询翻译
  async findByPromptHash(promptHash: string): Promise<TitleTranslation[]> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM title_translations WHERE prompt_hash = ?',
      [promptHash]
    );

    if (result.length === 0) return [];

    return result[0].values.map(row =>
      this.mapRowToTranslation(result[0].columns, row)
    );
  }

  // 删除所有使用旧prompt_hash的翻译(用于提示词变更后清除缓存)
  async deleteByPromptHashNot(currentPromptHash: string): Promise<number> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT COUNT(*) as count FROM title_translations WHERE prompt_hash != ?',
      [currentPromptHash]
    );

    const count = result.length > 0 ? (result[0].values[0][0] as number) : 0;

    db.run(
      'DELETE FROM title_translations WHERE prompt_hash != ?',
      [currentPromptHash]
    );

    saveDatabase();
    return count;
  }

  // 删除指定翻译
  async delete(storyId: number): Promise<void> {
    const db = await getDatabase();
    db.run('DELETE FROM title_translations WHERE story_id = ?', [storyId]);
    saveDatabase();
  }

  // 清空所有翻译
  async deleteAll(): Promise<void> {
    const db = await getDatabase();
    db.run('DELETE FROM title_translations');
    saveDatabase();
  }

  // 获取翻译总数
  async count(): Promise<number> {
    const db = await getDatabase();
    const result = db.exec('SELECT COUNT(*) as count FROM title_translations');
    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }

  // 辅助方法:将数据库行映射为TitleTranslation对象
  private mapRowToTranslation(columns: string[], row: any[]): TitleTranslation {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    return {
      story_id: obj.story_id,
      title_en: obj.title_en,
      title_zh: obj.title_zh,
      prompt_hash: obj.prompt_hash,
      updated_at: obj.updated_at,
    };
  }
}
