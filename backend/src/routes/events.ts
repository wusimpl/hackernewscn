import { Router, Request, Response } from 'express';
import { getQueueService } from '../services/queue';
import { SSEEvent, SSEArticleEvent } from '../types';

const router = Router();

/**
 * GET /api/events
 * Server-Sent Events (SSE) 端点
 * 用于实时推送翻译完成事件到前端
 *
 * 事件类型:
 * - article.done: 文章翻译完成
 * - article.error: 文章翻译失败
 */
router.get('/', (req: Request, res: Response) => {
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域

  // 发送初始连接确认
  res.write('data: {"type":"connected"}\n\n');
  console.log('[Events API] 新的 SSE 连接建立');

  // 获取队列服务
  const queueService = getQueueService();

  // SSE 事件处理器
  const eventHandler = (event: SSEEvent) => {
    try {
      // 将事件序列化为 JSON
      const data = JSON.stringify(event);

      // 发送 SSE 格式数据
      res.write(`data: ${data}\n\n`);

      const articleEvent = event as SSEArticleEvent;
      console.log(`[Events API] 推送事件: ${event.type}, storyId=${articleEvent.storyId}`);
    } catch (error) {
      console.error('[Events API] 发送事件错误:', error);
    }
  };

  // 注册事件监听器
  queueService.on('sse', eventHandler);

  // 心跳机制 - 每30秒发送一次心跳,保持连接
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      console.error('[Events API] 心跳发送失败:', error);
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  // 处理客户端断开连接
  req.on('close', () => {
    console.log('[Events API] SSE 连接关闭');
    clearInterval(heartbeatInterval);
    queueService.off('sse', eventHandler);
    res.end();
  });

  // 处理错误
  req.on('error', (error) => {
    console.error('[Events API] 连接错误:', error);
    clearInterval(heartbeatInterval);
    queueService.off('sse', eventHandler);
    res.end();
  });
});

export default router;
