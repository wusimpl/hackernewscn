import React from 'react';

interface HeaderProps {
  isLoading: boolean;
  lastUpdatedAt: number | null;
  favoritesCount: number;
  onFavoritesClick: () => void;
}

// Format timestamp to locale time string
const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString();
};

export const Header: React.FC<HeaderProps> = ({
  isLoading,
  lastUpdatedAt,
  favoritesCount,
  onFavoritesClick
}) => {
  return (
    <header className="bg-[#ff6600] text-black px-2 py-1 flex items-center justify-between sticky top-0 z-50 shadow-md">
      <div className="flex items-center gap-3">
        <div className="border border-white p-0.5 font-bold text-sm leading-none text-white">
          YCN
        </div>
        <h1 className="font-bold text-sm sm:text-base whitespace-nowrap">
          Hacker News <span className="font-normal opacity-80">CN</span>
        </h1>
        <span className="text-white/50">|</span>
        <button
          onClick={onFavoritesClick}
          className="text-white text-sm font-medium hover:underline transition-colors"
          title="我的收藏"
        >
          收藏{favoritesCount > 0 ? ` (${favoritesCount})` : ''}
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs sm:text-sm">
        {lastUpdatedAt && (
          <span className="hidden sm:inline opacity-70">
            更新于: {formatTimestamp(lastUpdatedAt)}
          </span>
        )}
        {isLoading && (
          <span className="opacity-70">加载中...</span>
        )}
      </div>
    </header>
  );
};
