import rateLimit from 'express-rate-limit';

/**
 * 通用速率限制中间件
 * 限制:每 IP 每分钟最多 60 次请求
 * 排除:健康检查端点 /health
 */
export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 60, // 最多 60 次请求
  standardHeaders: true, // 返回 RateLimit-* 响应头
  legacyHeaders: false, // 禁用 X-RateLimit-* 响应头
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求过于频繁,请稍后再试',
    },
  },
  // 跳过健康检查和静态资源
  skip: (req) => {
    return req.path === '/health' ||
           req.path === '/metrics' ||
           req.path.startsWith('/static');
  },
});

/**
 * 翻译接口速率限制中间件
 * 限制:每 IP 每分钟最多 10 次翻译请求
 */
export const translationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 10, // 最多 10 次请求
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TRANSLATION_RATE_LIMIT_EXCEEDED',
      message: '翻译请求过于频繁,请稍后再试(每分钟最多 10 次)',
    },
  },
});

/**
 * 严格速率限制中间件(用于敏感操作)
 * 限制:每 IP 每分钟最多 5 次请求
 */
export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 5, // 最多 5 次请求
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'STRICT_RATE_LIMIT_EXCEEDED',
      message: '操作过于频繁,请稍后再试(每分钟最多 5 次)',
    },
  },
});
