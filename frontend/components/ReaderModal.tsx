import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CommentsPanel } from './CommentsPanel';

interface ReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  originalUrl?: string;
  isLoading: boolean;
  statusMessage: string;
  storyId?: number;
  commentCount?: number;
}

export const ReaderModal: React.FC<ReaderModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  content, 
  originalUrl,
  isLoading,
  statusMessage,
  storyId,
  commentCount = 0
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [showComments, setShowComments] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 检测是否为移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 当打开新文章或内容变化时，滚动到顶部并关闭评论
  useEffect(() => {
    if (isOpen && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    setShowComments(false);
  }, [isOpen, title]); // 使用 title 作为依赖，因为每篇文章的标题不同

  if (!isOpen) return null;

  const handleCommentsToggle = () => {
    setShowComments(!showComments);
  };

  // 移动端评论覆盖模式
  if (isMobile && showComments && storyId) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm" onClick={onClose}>
        <div 
          className="bg-[#1a1a1a] w-full h-full flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <CommentsPanel
            isOpen={true}
            onClose={() => setShowComments(false)}
            storyId={storyId}
            storyTitle={title}
            mode="overlay"
          />
        </div>
      </div>
    );
  }

  // 桌面端分栏布局
  const showSideBySide = !isMobile && showComments && storyId;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm" onClick={onClose}>
      <div 
        className={`bg-[#1a1a1a] w-full h-full sm:h-[90vh] shadow-2xl flex sm:rounded-lg overflow-hidden border border-[#333] ${
          showSideBySide ? 'max-w-6xl' : 'max-w-3xl'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* 文章区域 */}
        <div className={`flex flex-col ${showSideBySide ? 'w-1/2 border-r border-[#333]' : 'w-full'}`}>
          {/* Header */}
          <div className="bg-[#1a1a1a] border-b border-[#333] px-5 py-3 flex justify-between items-center shrink-0">
            <div className="flex flex-col overflow-hidden mr-4 flex-1">
               <h2 className="text-[#dcdcdc] font-bold text-base sm:text-lg truncate leading-tight">
                 {title}
               </h2>
               {originalUrl && (
                  <a 
                    href={originalUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[#ff6600] text-xs hover:underline mt-0.5 truncate block"
                  >
                    {originalUrl} ↗
                  </a>
               )}
            </div>
            <div className="flex items-center gap-2">
              {/* 评论按钮 */}
              {storyId && (
                <button
                  onClick={handleCommentsToggle}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors text-sm ${
                    showComments 
                      ? 'bg-[#ff6600] text-white' 
                      : 'text-[#828282] hover:text-white hover:bg-[#333]'
                  }`}
                  title="查看评论"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>{commentCount > 0 ? commentCount : '评论'}</span>
                </button>
              )}
              {/* 关闭按钮 */}
              <button 
                onClick={onClose} 
                className="text-[#828282] hover:text-white hover:bg-[#333] p-1.5 rounded-full transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar bg-[#111]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-[#828282] gap-4 p-8">
                 <div className="w-10 h-10 border-2 border-[#333] border-t-[#ff6600] rounded-full animate-spin"></div>
                 <p className="animate-pulse text-sm">{statusMessage}</p>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto px-5 py-8 sm:px-8">
                <article className="prose prose-invert prose-sm sm:prose-base max-w-none 
                  prose-a:text-[#ff6600] prose-a:no-underline hover:prose-a:underline
                  prose-headings:text-[#dcdcdc] prose-headings:font-bold
                  prose-h1:text-xl sm:prose-h1:text-2xl
                  prose-h2:text-lg sm:prose-h2:text-xl
                  prose-p:leading-relaxed prose-p:text-[#c0c0c0]
                  prose-blockquote:border-l-[#ff6600] prose-blockquote:text-[#999]
                  prose-code:text-[#ff9933] prose-code:bg-[#222] prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-[#222] prose-pre:border prose-pre:border-[#333]
                  prose-table:border-collapse prose-table:w-full prose-table:text-sm
                  prose-th:border prose-th:border-[#444] prose-th:bg-[#222] prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-[#dcdcdc]
                  prose-td:border prose-td:border-[#333] prose-td:px-3 prose-td:py-2 prose-td:text-[#c0c0c0]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </article>
                
                <div className="mt-12 pt-8 border-t border-[#333] text-center">
                   <p className="text-[#666] text-xs">
                     <a href={originalUrl} target="_blank" className="hover:underline text-[#828282]">查看原文</a>
                   </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 桌面端评论区域 */}
        {showSideBySide && (
          <div className="w-1/2 flex flex-col">
            <CommentsPanel
              isOpen={true}
              onClose={() => setShowComments(false)}
              storyId={storyId}
              storyTitle={title}
              mode="side-by-side"
            />
          </div>
        )}
      </div>
    </div>
  );
};