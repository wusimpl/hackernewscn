import { API_BASE_URL } from '../config';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatHistory {
  storyId: number;
  articleTitle: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const CHAT_STORAGE_KEY = 'article_chat_history';
const MAX_USER_MESSAGES = 10;

// 本地存储管理
export const getChatHistory = (storyId: number): ChatHistory | null => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return null;
    const allHistory: Record<string, ChatHistory> = JSON.parse(stored);
    return allHistory[storyId.toString()] || null;
  } catch {
    return null;
  }
};

export const saveChatHistory = (history: ChatHistory): void => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    const allHistory: Record<string, ChatHistory> = stored ? JSON.parse(stored) : {};
    allHistory[history.storyId.toString()] = {
      ...history,
      updatedAt: Date.now()
    };
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(allHistory));
  } catch (e) {
    console.error('Failed to save chat history:', e);
  }
};

export const clearChatHistory = (storyId: number): void => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) return;
    const allHistory: Record<string, ChatHistory> = JSON.parse(stored);
    delete allHistory[storyId.toString()];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(allHistory));
  } catch (e) {
    console.error('Failed to clear chat history:', e);
  }
};

export const getUserMessageCount = (messages: ChatMessage[]): number => {
  return messages.filter(m => m.role === 'user').length;
};

export const canSendMessage = (messages: ChatMessage[]): boolean => {
  return getUserMessageCount(messages) < MAX_USER_MESSAGES;
};

export const getRemainingMessages = (messages: ChatMessage[]): number => {
  return MAX_USER_MESSAGES - getUserMessageCount(messages);
};

// 流式聊天API
export const streamChat = async (
  articleContent: string,
  articleTitle: string,
  messages: ChatMessage[],
  onChunk: (content: string) => void,
  onError: (error: string) => void,
  onDone: () => void
): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        articleContent,
        articleTitle,
        messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      onError(errorData.error?.message || '请求失败');
      onDone();
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('无法读取响应');
      onDone();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            onError(parsed.error);
          } else if (parsed.content) {
            onChunk(parsed.content);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    onDone();
  } catch (error) {
    onError(error instanceof Error ? error.message : '网络错误');
    onDone();
  }
};
