import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChatMessage,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  streamChat,
  canSendMessage,
  getRemainingMessages
} from '../services/chatService';

interface ArticleChatProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: number;
  articleTitle: string;
  articleContent: string;
  mode: 'side-by-side' | 'overlay';
}

export const ArticleChat: React.FC<ArticleChatProps> = ({
  isOpen,
  onClose,
  storyId,
  articleTitle,
  articleContent,
  mode
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 加载历史记录
  useEffect(() => {
    if (isOpen && storyId) {
      const history = getChatHistory(storyId);
      if (history) {
        setMessages(history.messages);
      } else {
        setMessages([]);
      }
      setStreamingContent('');
      setInput('');
    }
  }, [isOpen, storyId]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // 聚焦输入框
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || !canSendMessage(messages)) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmedInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    let assistantContent = '';

    await streamChat(
      articleContent,
      articleTitle,
      newMessages,
      (chunk) => {
        assistantContent += chunk;
        setStreamingContent(assistantContent);
      },
      (error) => {
        console.error('Chat error:', error);
        assistantContent = `抱歉，发生了错误：${error}`;
        setStreamingContent(assistantContent);
      },
      () => {
        const finalMessages: ChatMessage[] = [
          ...newMessages,
          { role: 'assistant', content: assistantContent }
        ];
        setMessages(finalMessages);
        setStreamingContent('');
        setIsLoading(false);
        
        // 保存到本地存储
        saveChatHistory({
          storyId,
          articleTitle,
          messages: finalMessages,
          updatedAt: Date.now()
        });
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    if (confirm('确定要清空对话记录吗？')) {
      clearChatHistory(storyId);
      setMessages([]);
      setStreamingContent('');
    }
  };

  if (!isOpen) return null;

  const remaining = getRemainingMessages(messages);
  const canSend = canSendMessage(messages);

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-[#333] px-4 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2 overflow-hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#ff6600] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <span className="text-[#dcdcdc] font-medium text-sm truncate">与文章对话</span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-[#666] hover:text-[#ff6600] px-2 py-1 rounded transition-colors text-xs"
              title="清空对话"
            >
              清空
            </button>
          )}
          <button 
            onClick={onClose}
            className="text-[#828282] hover:text-white hover:bg-[#333] p-1.5 rounded-full transition-colors"
            title={mode === 'overlay' ? '返回文章' : '关闭对话'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#111]">
        {messages.length === 0 && !streamingContent && (
          <div className="text-center text-[#666] py-8">
            <p className="mb-2">👋 你好！我可以帮你解答关于这篇文章的问题。</p>
            <p className="text-xs">你可以问我文章的主要内容、关键概念或任何细节。</p>
          </div>
        )}
        
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-[#ff6600] text-white'
                  : 'bg-[#2a2a2a] text-[#dcdcdc]'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              ) : (
                <div className="text-sm prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-pre:my-2 prose-code:text-[#ff6600] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:rounded prose-pre:bg-[#1a1a1a] prose-pre:p-3 prose-a:text-[#ff6600]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-4 py-2 bg-[#2a2a2a] text-[#dcdcdc]">
              <div className="text-sm prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-pre:my-2 prose-code:text-[#ff6600] prose-code:bg-[#1a1a1a] prose-code:px-1 prose-code:rounded prose-pre:bg-[#1a1a1a] prose-pre:p-3 prose-a:text-[#ff6600]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
              </div>
              <span className="inline-block w-2 h-4 bg-[#ff6600] animate-pulse ml-1"></span>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-[#2a2a2a] rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-[#666] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-[#666] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-[#666] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#333] p-4 bg-[#1a1a1a]">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs ${remaining <= 3 ? 'text-[#ff6600]' : 'text-[#666]'}`}>
            剩余 {remaining} 次提问
          </span>
        </div>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={canSend ? "输入你的问题..." : "已达到提问上限"}
            disabled={isLoading || !canSend}
            className="flex-1 bg-[#2a2a2a] text-[#dcdcdc] rounded-lg px-4 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#ff6600] disabled:opacity-50 placeholder-[#666]"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !canSend}
            className="bg-[#ff6600] text-white px-4 py-2 rounded-lg hover:bg-[#ff7722] disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
