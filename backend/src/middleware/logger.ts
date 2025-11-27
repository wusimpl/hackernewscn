import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * 日志文件路径
 */
const LOG_DIR = path.join(__dirname, '../../logs');
const ACCESS_LOG = path.join(LOG_DIR, 'access.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');

/**
 * 确保日志目录存在
 */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * 写入日志文件
 */
function writeToFile(filePath: string, message: string) {
  try {
    ensureLogDir();
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(filePath, logMessage, 'utf-8');
  } catch (err) {
    console.error('写入日志文件失败:', err);
  }
}

/**
 * 过滤敏感信息 (如 API Key, Token 等) 和大文本字段
 */
function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const sensitiveKeys = ['apiKey', 'api_key', 'token', 'password', 'authorization'];
  // 需要截断的大文本字段
  const truncateKeys = ['articleContent', 'content'];
  const MAX_CONTENT_LENGTH = 50;
  
  const sanitized = { ...data };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '***REDACTED***';
    } else if (truncateKeys.includes(key) && typeof sanitized[key] === 'string') {
      // 截断大文本字段，只显示前50个字符
      const value = sanitized[key] as string;
      if (value.length > MAX_CONTENT_LENGTH) {
        sanitized[key] = `${value.slice(0, MAX_CONTENT_LENGTH)}... [${value.length} chars]`;
      }
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * 请求日志中间件
 * 记录请求方法、路径、耗时、响应状态码
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, path, query, body } = req;

  // 记录请求开始 (开发环境)
  if (config.isDevelopment) {
    const logData: Record<string, any> = {};
    if (Object.keys(query).length > 0) {
      logData.query = query;
    }
    if ((method === 'POST' || method === 'PUT') && body) {
      logData.body = sanitizeData(body);
    }
    
    if (Object.keys(logData).length > 0) {
      console.log(`\n→ ${method} ${path}`, logData);
    } else {
      console.log(`\n→ ${method} ${path}`);
    }
  }

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    // 根据状态码选择颜色
    let statusColor = '\x1b[32m'; // 绿色 (2xx)
    if (statusCode >= 400 && statusCode < 500) {
      statusColor = '\x1b[33m'; // 黄色 (4xx)
    } else if (statusCode >= 500) {
      statusColor = '\x1b[31m'; // 红色 (5xx)
    }

    // 根据耗时选择颜色
    let durationColor = '\x1b[32m'; // 绿色 (<100ms)
    if (duration >= 100 && duration < 500) {
      durationColor = '\x1b[33m'; // 黄色 (100-500ms)
    } else if (duration >= 500) {
      durationColor = '\x1b[31m'; // 红色 (>=500ms)
    }

    const reset = '\x1b[0m';

    // 控制台输出日志
    console.log(
      `← ${method} ${path} - ${statusColor}${statusCode}${reset} - ${durationColor}${duration}ms${reset}`
    );

    // 生产环境记录到文件
    if (!config.isDevelopment) {
      const logMessage = `${req.ip} - ${method} ${path} - ${statusCode} - ${duration}ms`;
      writeToFile(ACCESS_LOG, logMessage);

      // 错误请求额外记录
      if (statusCode >= 400) {
        writeToFile(ERROR_LOG, `${logMessage} - UA: ${req.get('user-agent')}`);
      }
    }
  });

  next();
}

/**
 * 错误日志记录器
 * 用于记录详细的错误信息
 */
export function logError(error: Error, context?: any) {
  const errorInfo = {
    message: error.message,
    name: error.name,
    stack: config.isDevelopment ? error.stack : error.stack?.split('\n')[0], // 生产环境只记录第一行
    context: sanitizeData(context),
    timestamp: new Date().toISOString(),
  };

  // 控制台输出
  console.error('\n❌ 错误详情:', errorInfo);

  // 生产环境写入文件
  if (!config.isDevelopment) {
    const errorMessage = `${error.name}: ${error.message}\n  Context: ${JSON.stringify(errorInfo.context)}\n  Stack: ${errorInfo.stack}`;
    writeToFile(ERROR_LOG, errorMessage);
  }
}

/**
 * 信息日志记录器
 */
export function logInfo(message: string, data?: any) {
  const sanitized = sanitizeData(data);
  console.log(`\nℹ️  ${message}`, sanitized || '');

  if (!config.isDevelopment && data) {
    writeToFile(ACCESS_LOG, `INFO: ${message} - ${JSON.stringify(sanitized)}`);
  }
}

/**
 * 警告日志记录器
 */
export function logWarning(message: string, data?: any) {
  const sanitized = sanitizeData(data);
  console.warn(`\n⚠️  ${message}`, sanitized || '');

  if (!config.isDevelopment) {
    writeToFile(ERROR_LOG, `WARN: ${message} - ${JSON.stringify(sanitized || {})}`);
  }
}
