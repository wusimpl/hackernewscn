import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { initDatabase } from './db/connection';
import apiRouter from './routes';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalRateLimit } from './middleware/rateLimit';
import { getSchedulerService } from './services/scheduler';

const app = express();

// 基础中间件
app.use(cors());
app.use(express.json());

// 请求日志中间件
app.use(requestLogger);

// 通用速率限制（应用到所有路由）
app.use(generalRateLimit);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// API 路由
app.use('/api', apiRouter);

// 静态文件服务 (生产环境)
if (!config.isDevelopment) {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// 404 错误处理
app.use(notFoundHandler);

// 全局错误处理中间件（必须放在最后）
app.use(errorHandler);

// 初始化数据库并启动服务器
async function startServer() {
  try {
    await initDatabase();
    console.log('✅ 数据库初始化成功');

    // Initialize and start the scheduler after database init
    // Requirements: 1.1 - Scheduler starts and immediately fetches stories
    const scheduler = getSchedulerService();
    scheduler.start();
    console.log('✅ 调度器启动成功');

    const server = app.listen(config.port, () => {
      console.log(`\n🚀 服务器运行在端口 ${config.port}`);
      console.log(`📝 环境: ${config.isDevelopment ? '开发' : '生产'}`);
      console.log(`🔗 健康检查: http://localhost:${config.port}/health\n`);
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal: string) => {
      console.log(`\n📴 收到 ${signal} 信号，正在优雅关闭...`);
      
      // Stop the scheduler first
      scheduler.stop();
      console.log('✅ 调度器已停止');

      // Close the HTTP server
      server.close((err) => {
        if (err) {
          console.error('❌ 服务器关闭出错:', err);
          process.exit(1);
        }
        console.log('✅ 服务器已关闭');
        process.exit(0);
      });

      // Force exit after 10 seconds if graceful shutdown fails
      setTimeout(() => {
        console.error('❌ 强制关闭（超时）');
        process.exit(1);
      }, 10000);
    };

    // Listen for termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();
