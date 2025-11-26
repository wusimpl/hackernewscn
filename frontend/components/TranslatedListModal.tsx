import React from 'react';
import { CachedArticle } from '../types';

interface TranslatedListModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: CachedArticle[];
  onSelectArticle: (article: CachedArticle) => void;
  onClearCache: () => void;
}

export const TranslatedListModal: React.FC<TranslatedListModalProps> = ({ 
  isOpen, 
  onClose, 
  articles, 
  onSelectArticle,
  onClearCache
}) => {
  if (!isOpen) return null;

  // Sort by newest first
  const sortedArticles = [...articles].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div 
        className="bg-[#1a1a1a] border border-[#ff6600] w-full max-w-2xl shadow-xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#ff6600] text-black px-3 py-2 flex justify-between items-center shrink-0">
          <span className="font-bold">已翻译文章 ({articles.length})</span>
          <button onClick={onClose} className="hover:bg-black/20 px-2 font-mono">✕</button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-0">
          {sortedArticles.length === 0 ? (
             <div className="p-8 text-center text-[#828282]">
                暂无已翻译文章
             </div>
          ) : (
            <ul className="divide-y divide-[#333]">
              {sortedArticles.map(article => (
                <li 
                  key={article.id} 
                  className="hover:bg-[#242424] transition-colors cursor-pointer p-4 group"
                  onClick={() => onSelectArticle(article)}
                >
                   <div className="text-[#dcdcdc] font-medium text-sm sm:text-base group-hover:text-[#ff6600] transition-colors mb-1">
                      {article.title}
                   </div>
                   <div className="flex justify-between items-center text-xs text-[#666]">
                      <span className="truncate max-w-[70%]">{article.originalUrl}</span>
                      <span>{new Date(article.timestamp).toLocaleDateString()}</span>
                   </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#333] flex justify-between bg-[#111] shrink-0">
           <button
             onClick={() => {
                if (confirm('确定清除所有已翻译的缓存?')) {
                    onClearCache();
                }
             }}
             className="text-red-900 hover:text-red-500 text-xs uppercase font-bold tracking-wider"
           >
             清除缓存
           </button>
           <button
             onClick={onClose}
             className="text-[#828282] hover:text-white text-xs uppercase font-bold tracking-wider"
           >
             关闭
           </button>
        </div>
      </div>
    </div>
  );
};