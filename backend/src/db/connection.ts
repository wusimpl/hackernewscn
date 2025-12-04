import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

let db: Database | null = null;

// 获取数据库实例
export async function getDatabase(): Promise<Database> {
  if (!db) {
    throw new Error('数据库未初始化,请先调用 initDatabase()');
  }
  return db;
}

// 初始化数据库
export async function initDatabase(): Promise<void> {
  try {
    // 初始化 SQL.js
    const SQL = await initSqlJs();

    // 确保数据目录存在
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 检查数据库文件是否存在
    if (fs.existsSync(config.dbPath)) {
      // 加载现有数据库
      const buffer = fs.readFileSync(config.dbPath);
      db = new SQL.Database(new Uint8Array(buffer));
      console.log('已加载现有数据库文件');
    } else {
      // 创建新数据库
      db = new SQL.Database();
      console.log('创建新数据库文件');
    }

    // 执行数据库架构初始化
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);

    // 保存数据库到文件
    saveDatabase();

    console.log('数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

// 保存数据库到磁盘
export function saveDatabase(): void {
  if (!db) {
    throw new Error('数据库未初始化');
  }

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.dbPath, buffer);
  } catch (error) {
    console.error('保存数据库失败:', error);
    throw error;
  }
}

// 关闭数据库连接
export function closeDatabase(): void {
  if (db) {
    saveDatabase(); // 保存最后的更改
    db.close();
    db = null;
    console.log('数据库连接已关闭');
  }
}

// 优雅关闭
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});
