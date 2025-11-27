import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3000', 10),

  // 数据库配置
  dbPath: process.env.DB_PATH || path.join(__dirname, '../../data/hackernews.db'),

  // LLM 配置
  llm: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-3.5-turbo',
  },

  // 任务队列配置
  queue: {
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '3', 10),
  },

  // 文章翻译并发配置
  articleTranslation: {
    concurrency: parseInt(process.env.ARTICLE_TRANSLATION_CONCURRENCY || '5', 10),
  },

  // 调度器配置
  scheduler: {
    interval: parseInt(process.env.SCHEDULER_INTERVAL || '300000', 10), // 默认 5 分钟
    storyLimit: parseInt(process.env.SCHEDULER_STORY_LIMIT || '30', 10), // 默认 30 条
  },

  // 速率限制配置
  rateLimit: {
    windowMs: 60 * 1000, // 1分钟
    maxRequests: 60, // 每分钟最多60次请求
    maxTranslationRequests: 10, // 翻译接口每分钟最多10次
  },

  // 管理员配置
  adminToken: process.env.ADMIN_TOKEN || '',

  // 环境
  isDevelopment: process.env.NODE_ENV !== 'production',
};

/**
 * 重新加载调度器配置（从 process.env 读取最新值）
 */
export function reloadSchedulerConfig(): void {
  config.scheduler.interval = parseInt(process.env.SCHEDULER_INTERVAL || '300000', 10);
  config.scheduler.storyLimit = parseInt(process.env.SCHEDULER_STORY_LIMIT || '30', 10);
  console.log(`[Config] 调度器配置已重新加载: interval=${config.scheduler.interval}ms, storyLimit=${config.scheduler.storyLimit}`);
}

// 验证必需的环境变量
if (!config.llm.apiKey) {
  console.warn('警告: OPENAI_API_KEY 未设置');
}

if (!config.adminToken && config.isDevelopment) {
  console.warn('警告: ADMIN_TOKEN 未设置');
}
