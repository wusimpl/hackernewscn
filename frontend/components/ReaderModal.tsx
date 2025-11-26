import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface ReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  originalUrl?: string;
  isLoading: boolean;
  statusMessage: string;
}

export const ReaderModal: React.FC<ReaderModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  content, 
  originalUrl,
  isLoading,
  statusMessage
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // 当打开新文章或内容变化时，滚动到顶部
  useEffect(() => {
    if (isOpen && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [isOpen, title]); // 使用 title 作为依赖，因为每篇文章的标题不同

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-[#1a1a1a] w-full max-w-3xl h-full sm:h-[90vh] shadow-2xl flex flex-col sm:rounded-lg overflow-hidden border border-[#333]"
        onClick={e => e.stopPropagation()} // Prevent close when clicking inside content
      >
        {/* Header */}
        <div className="bg-[#1a1a1a] border-b border-[#333] px-5 py-3 flex justify-between items-center shrink-0">
          <div className="flex flex-col overflow-hidden mr-4">
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
          <button 
            onClick={onClose} 
            className="text-[#828282] hover:text-white hover:bg-[#333] p-1.5 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
              {/* Using prose-sm and sm:prose-base to keep fonts smaller */}
              <article className="prose prose-invert prose-sm sm:prose-base max-w-none 
                prose-a:text-[#ff6600] prose-a:no-underline hover:prose-a:underline
                prose-headings:text-[#dcdcdc] prose-headings:font-bold
                prose-h1:text-xl sm:prose-h1:text-2xl
                prose-h2:text-lg sm:prose-h2:text-xl
                prose-p:leading-relaxed prose-p:text-[#c0c0c0]
                prose-blockquote:border-l-[#ff6600] prose-blockquote:text-[#999]
                prose-code:text-[#ff9933] prose-code:bg-[#222] prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-[#222] prose-pre:border prose-pre:border-[#333]">
                <ReactMarkdown>{content}</ReactMarkdown>
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
    </div>
  );
};