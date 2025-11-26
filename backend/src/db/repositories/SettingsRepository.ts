import { getDatabase, saveDatabase } from '../connection';
import { Setting } from '../../types';

export class SettingsRepository {
  // 获取设置对象
  async getSetting(key: string): Promise<Setting | null> {
    const db = await getDatabase();
    const result = db.exec(
      'SELECT * FROM settings WHERE key = ?',
      [key]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return this.mapRowToSetting(result[0].columns, row);
  }

  // 获取设置值
  async get(key: string): Promise<string | null> {
    const setting = await this.getSetting(key);
    return setting?.value || null;
  }

  // 设置值
  async set(key: string, value: string): Promise<void> {
    const db = await getDatabase();
    const now = Math.floor(Date.now() / 1000);

    db.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [key, value, now]
    );

    saveDatabase();
  }

  // upsert设置(别名)
  async upsertSetting(key: string, value: string): Promise<void> {
    await this.set(key, value);
  }

  // 获取所有设置
  async getAll(): Promise<Setting[]> {
    const db = await getDatabase();
    const result = db.exec('SELECT * FROM settings');

    if (result.length === 0) return [];

    return result[0].values.map(row => this.mapRowToSetting(result[0].columns, row));
  }

  // 删除设置
  async delete(key: string): Promise<void> {
    const db = await getDatabase();
    db.run('DELETE FROM settings WHERE key = ?', [key]);
    saveDatabase();
  }

  // 删除设置(别名)
  async deleteSetting(key: string): Promise<void> {
    await this.delete(key);
  }

  // 辅助方法:将数据库行映射为Setting对象
  private mapRowToSetting(columns: string[], row: any[]): Setting {
    const obj: any = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });

    return {
      key: obj.key,
      value: obj.value,
      updated_at: obj.updated_at,
    };
  }
}
