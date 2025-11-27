import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const ENV_PATH = path.join(__dirname, '../../.env');

/**
 * 读取 .env 文件内容为对象
 */
export function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  return dotenv.parse(content);
}

/**
 * 写入 .env 文件
 */
export function writeEnvFile(envVars: Record<string, string>): void {
  // 读取现有内容，保留注释和格式
  const existingContent = fs.existsSync(ENV_PATH) 
    ? fs.readFileSync(ENV_PATH, 'utf-8') 
    : '';
  
  const lines = existingContent.split('\n');
  const updatedKeys = new Set<string>();
  
  // 更新已存在的键
  const updatedLines = lines.map(line => {
    const trimmed = line.trim();
    // 跳过注释和空行
    if (trimmed.startsWith('#') || trimmed === '') {
      return line;
    }
    
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/i);
    if (match) {
      const key = match[1];
      if (key in envVars) {
        updatedKeys.add(key);
        return `${key}=${envVars[key]}`;
      }
    }
    return line;
  });
  
  // 添加新的键（追加到文件末尾）
  for (const [key, value] of Object.entries(envVars)) {
    if (!updatedKeys.has(key)) {
      updatedLines.push(`${key}=${value}`);
    }
  }
  
  fs.writeFileSync(ENV_PATH, updatedLines.join('\n'));
}

/**
 * 更新单个环境变量
 */
export function updateEnvVar(key: string, value: string): void {
  const envVars = readEnvFile();
  envVars[key] = value;
  writeEnvFile(envVars);
  // 同步更新 process.env
  process.env[key] = value;
}

/**
 * 删除环境变量（从 .env 文件中移除）
 */
export function deleteEnvVar(key: string): void {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }
  
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const lines = content.split('\n');
  
  const filteredLines = lines.filter(line => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/i);
    return !match || match[1] !== key;
  });
  
  fs.writeFileSync(ENV_PATH, filteredLines.join('\n'));
  // 同步删除 process.env
  delete process.env[key];
}

/**
 * 获取环境变量值
 */
export function getEnvVar(key: string): string | undefined {
  return process.env[key];
}
