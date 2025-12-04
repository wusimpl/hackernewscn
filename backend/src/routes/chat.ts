import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';
import { getCurrentProvider } from '../services/llmConfig';
import { chatRateLimit } from '../middleware/rateLimit';

const router = Router();

// Chat系统提示词 - 围绕文章内容进行对话
const CHAT_SYSTEM_PROMPT = `你是一个帮助用户理解文章的AI助手。用户会提供一篇文章，你需要围绕这篇文章与用户对话。

你可以回答的问题类型：
1. 直接关于文章内容的问题（总结、解释、分析等）
2. 与文章主题相关的延伸问题（背景知识、相关概念、最新进展等）
3. 帮助用户更好理解文章的补充信息

你应该拒绝的问题类型：
1. 与文章主题完全无关的闲聊（如"今天天气怎么样"、"给我讲个笑话"）
2. 与文章主题完全无关的其他领域问题
3. 不当或有害的请求

判断标准：如果问题能帮助用户更好地理解文章内容或其相关领域，就应该回答。

回答要求：
- 使用简体中文
- 保持简洁、准确、有帮助
- 对于延伸问题，可以结合你的固有的知识进行回答

当用户的问题与文章完全无关时，请回复类似：
"这个问题似乎与当前文章无关。这篇文章讨论的是[简述主题]，如果您对文章内容有任何疑问，我很乐意为您解答。"`;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  articleContent: string;
  articleTitle: string;
  messages: ChatMessage[];
}

/**
 * POST /api/chat/stream
 * 流式聊天接口
 */
router.post('/stream', chatRateLimit, async (req: Request, res: Response) => {
  const { articleContent, articleTitle, messages } = req.body as ChatRequest;

  if (!articleContent || !messages || !Array.isArray(messages)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
    });
    return;
  }

  if (messages.length > 20) { // 10轮对话 = 20条消息
    res.status(400).json({
      success: false,
      error: { code: 'TOO_MANY_MESSAGES', message: '对话轮数已达上限' }
    });
    return;
  }

  // 获取当前 LLM Provider
  const llmConfig = getCurrentProvider();
  if (!llmConfig) {
    res.status(500).json({
      success: false,
      error: { code: 'LLM_NOT_CONFIGURED', message: 'LLM服务未配置' }
    });
    return;
  }

  // 构建完整的消息列表
  const fullMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `${CHAT_SYSTEM_PROMPT}\n\n---\n文章标题：${articleTitle}\n\n文章内容：\n${articleContent}`
    },
    ...messages
  ];

  try {
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const response = await fetch(`${llmConfig.api_base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.api_key}`
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: fullMessages,
        temperature: 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chat] LLM API Error:', response.status, errorText);
      res.write(`data: ${JSON.stringify({ error: 'LLM服务请求失败' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // 流式转发响应
    const body = response.body;
    if (!body) {
      res.write(`data: ${JSON.stringify({ error: '无响应内容' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    let buffer = '';
    // 使用 TextDecoder 正确处理 UTF-8 多字节字符，避免中文乱码
    const decoder = new TextDecoder('utf-8');
    
    body.on('data', (chunk: Buffer) => {
      // stream: true 确保不完整的多字节字符会被保留到下一个 chunk
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {
          // 忽略解析错误
        }
      }
    });

    body.on('end', () => {
      // 处理剩余buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {
            // 忽略
          }
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });

    body.on('error', (err: Error) => {
      console.error('[Chat] Stream error:', err);
      res.write(`data: ${JSON.stringify({ error: '流式传输错误' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });

    // 客户端断开连接时清理
    req.on('close', () => {
      if (body && typeof (body as any).destroy === 'function') {
        (body as any).destroy();
      }
    });

  } catch (error) {
    console.error('[Chat] Error:', error);
    res.write(`data: ${JSON.stringify({ error: '服务器错误' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

export default router;
