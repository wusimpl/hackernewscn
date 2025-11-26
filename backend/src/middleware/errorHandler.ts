import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { config } from '../config';
import { logError } from './logger';

/**
 * API 错误类型枚举 (参考前端错误处理模式)
 */
export enum ErrorCode {
  // 验证错误 4xx
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_PARAMS = 'INVALID_PARAMS',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // 业务错误 4xx
  STORIES_NOT_FOUND = 'STORIES_NOT_FOUND',
  ARTICLE_NOT_FOUND = 'ARTICLE_NOT_FOUND',
  CONTENT_RESTRICTED = 'CONTENT_RESTRICTED', // 451 地区限制

  // 外部服务错误 5xx
  HN_API_ERROR = 'HN_API_ERROR',
  LLM_API_ERROR = 'LLM_API_ERROR',
  JINA_API_ERROR = 'JINA_API_ERROR',

  // 服务器错误 5xx
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  TRANSLATION_FAILED = 'TRANSLATION_FAILED',
}

/**
 * 自定义错误类
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public message: string,
    public status: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * 全局错误处理中间件
 * 捕获所有未处理的异常并返回统一格式的错误响应
 */
export function errorHandler(
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // 默认错误信息
  let status = 500;
  let code = ErrorCode.INTERNAL_ERROR;
  let message = '服务器内部错误';
  let details: any = undefined;

  // 如果是自定义错误
  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  }
  // Zod 验证错误
  else if (err instanceof ZodError) {
    status = 400;
    code = ErrorCode.VALIDATION_ERROR;
    message = '请求参数验证失败';
    details = err.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message
    }));
  }
  // 处理网络相关错误 (类似前端的 fetch 错误处理)
  else if (err.message?.includes('fetch') || err.message?.includes('ECONNREFUSED')) {
    status = 502;
    code = ErrorCode.HN_API_ERROR;
    message = '外部服务暂时无法访问,请稍后重试';
  }
  // 处理 451 错误 (地区限制 - 参考前端 App.tsx:283-285)
  else if (err.message?.includes('451')) {
    status = 451;
    code = ErrorCode.CONTENT_RESTRICTED;
    message = err.message.split(':')[1] || '该内容在当前地区受到法律限制';
  }
  // 其他错误
  else if (err.message) {
    message = err.message;
  }

  // 记录错误日志 (使用专用日志函数)
  logError(err, {
    code,
    status,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // 返回错误响应 (与前端期望的格式一致)
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      // 开发环境返回详细信息
      ...(config.isDevelopment && details && { details }),
      ...(config.isDevelopment && { stack: err.stack, path: req.path }),
    },
  });
}

/**
 * 404 错误处理
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `路由 ${req.method} ${req.path} 不存在`,
    },
  });
}
