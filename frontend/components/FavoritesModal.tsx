import React from 'react';
import { Story } from '../types';
import { FavoriteItem, removeFavorite } from '../services/favoritesService';

interface FavoritesModalProps {
  isOpen: boolean;
  onClose: () => void;
  favorites: FavoriteItem[];
  onStoryClick: (story: Story) => void;
  onFavoritesChange: () => void;
}

const timeAgo = (timestamp: number) => {
  const seconds = Math.floor(Date.now() / 1000 - timestamp / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " 年前";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " 月前";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " 天前";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " 小时前";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " 分钟前";
  return Math.floor(seconds) + " 秒前";
};

const getDomain = (url?: string) => {
  if (!url) return '';
  try {
    const domain = new URL(url).hostname;
    return `(${domain.replace('www.', '')})`;
  } catch {
    return '';
  }
};

export const FavoritesModal: React.FC<FavoritesModalProps> = ({
  isOpen,
  onClose,
  favorites,
  onStoryClick,
  onFavoritesChange
}) => {
  if (!isOpen) return null;

  const handleRemove = (e: React.MouseEvent, storyId: number) => {
    e.stopPropagation();
    removeFavorite(storyId);
    onFavoritesChange();
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm" 
      onClick={onClose}
    >
      <div 
        className="bg-[#1a1a1a] w-full h-full sm:h-[90vh] sm:max-w-3xl shadow-2xl flex flex-col sm:rounded-lg overflow-hidden border border-[#333]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1a1a1a] border-b border-[#333] px-5 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#ff6600]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
            <h2 className="text-[#dcdcdc] font-bold text-base sm:text-lg">
              我的收藏 ({favorites.length})
            </h2>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1a1a1a]">
          {favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#828282] gap-4 p-8">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <p className="text-sm">暂无收藏</p>
              <p className="text-xs text-[#666]">在阅读文章时点击右上角的星标即可收藏</p>
            </div>
          ) : (
            <div>
              {favorites.map((item, idx) => (
                <div 
                  key={item.story.id}
                  className="flex gap-2 py-2 px-2 sm:px-4 hover:bg-[#242424] transition-colors group cursor-pointer"
                  onClick={() => onStoryClick(item.story)}
                >
                  {/* Index */}
                  <div className="flex flex-col items-end min-w-[30px] sm:min-w-[40px] pt-1">
                    <span className="text-[#828282] text-sm font-mono">{idx + 1}.</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-hidden">
                    <div className="flex flex-col">
                      {/* Title */}
                      <div className="flex items-baseline flex-wrap gap-x-2">
                        <span className="font-medium text-[15px] sm:text-[16px] leading-snug text-[#dcdcdc] hover:text-white">
                          {item.story.translatedTitle || item.story.title}
                        </span>
                        <span className="text-[#666] text-xs sm:text-sm truncate">
                          {getDomain(item.story.url)}
                        </span>
                      </div>

                      {/* Sub Title */}
                      {item.story.translatedTitle && (
                        <div className="text-[#666] text-xs sm:text-sm mt-0.5 font-light">
                          {item.story.title}
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="text-[#828282] text-xs mt-1.5 flex flex-wrap gap-x-1">
                        <span>{item.story.score} 分</span>
                        <span>作者 {item.story.by}</span>
                        <span>|</span>
                        <span>收藏于 {timeAgo(item.savedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={(e) => handleRemove(e, item.story.id)}
                    className="opacity-0 group-hover:opacity-100 text-[#828282] hover:text-red-500 p-1 transition-all"
                    title="取消收藏"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
