import React, { useState, useEffect, useMemo } from 'react';
import { Story, CachedArticle } from '../types';
import { getArticleCache } from '../services/cacheService';
import { CommentsPanel } from './CommentsPanel';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryClick: (story: Story) => void;
}

const PAGE_SIZE = 20;

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

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  onStoryClick
}) => {
  const [articles, setArticles] = useState<CachedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showComments, setShowComments] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState<number | null>(null);
  const [activeStoryTitle, setActiveStoryTitle] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      fetchArticles();
    }
  }, [isOpen]);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const records = await getArticleCache();
      const mapped: CachedArticle[] = records
        .filter(r => r.status === 'done')
        .map(r => ({
          id: r.story_id,
          title: r.title_snapshot,
          content: r.content_markdown,
          originalUrl: r.original_url,
          timestamp: (r.updated_at || 0) * 1000 || Date.now(),
          tldr: r.tldr
        }));
      setArticles(mapped);
    } catch {
      console.error('加载历史文章失败');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const sorted = [...articles].sort((a, b) => b.timestamp - a.timestamp);
    if (!search.trim()) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.originalUrl?.toLowerCase().includes(q)
    );
  }, [articles, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleArticleClick = (article: CachedArticle) => {
    const story: Story = {
      id: article.id,
      title: article.title,
      translatedTitle: article.title,
      by: 'unknown',
      score: 0,
      time: Math.floor(article.timestamp / 1000),
      descendants: 0,
      url: article.originalUrl,
      type: 'story',
      hasTranslatedArticle: true
    };
    onStoryClick(story);
  };

  const handleCommentsClick = (e: React.MouseEvent, article: CachedArticle) => {
    e.stopPropagation();
    setActiveStoryId(article.id);
    setActiveStoryTitle(article.title);
    setShowComments(true);
  };

  if (!isOpen) return null;

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
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#ff6600]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-[#dcdcdc] font-bold text-base sm:text-lg">
              历史文章 ({filtered.length})
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

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#333] shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题或链接..."
            className="w-full bg-[#121212] text-[#dcdcdc] border border-[#444] rounded px-4 py-2 text-sm focus:outline-none focus:border-[#ff6600] transition-colors"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1a1a1a]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-[#828282]">
              加载中...
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#828282] gap-4 p-8">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">{search ? '无匹配结果' : '暂无历史文章'}</p>
            </div>
          ) : (
            <div>
              {paginated.map((article, idx) => (
                <div
                  key={article.id}
                  className="flex gap-2 py-2 px-2 sm:px-4 hover:bg-[#242424] transition-colors group cursor-pointer"
                  onClick={() => handleArticleClick(article)}
                >
                  {/* Index */}
                  <div className="flex flex-col items-end min-w-[30px] sm:min-w-[40px] pt-1">
                    <span className="text-[#828282] text-sm font-mono">{(page - 1) * PAGE_SIZE + idx + 1}.</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 overflow-hidden">
                    <div className="flex flex-col">
                      {/* Title */}
                      <div className="flex items-baseline flex-wrap gap-x-2">
                        <span className="font-medium text-[15px] sm:text-[16px] leading-snug text-[#dcdcdc] hover:text-white">
                          {article.title}
                        </span>
                        <span className="text-[#666] text-xs sm:text-sm truncate">
                          {getDomain(article.originalUrl)}
                        </span>
                        {/* External link */}
                        {article.originalUrl && (
                          <a
                            href={article.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#828282] hover:text-[#ff6600] text-xs hover:underline ml-1"
                            title="Open original link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            [原文 ↗]
                          </a>
                        )}
                      </div>

                      {/* Metadata */}
                      <div className="text-[#828282] text-xs mt-1.5 flex flex-wrap gap-x-1">
                        <span>翻译于 {timeAgo(article.timestamp)}</span>
                        <span>|</span>
                        <button
                          onClick={(e) => handleCommentsClick(e, article)}
                          className="hover:underline hover:text-[#ff6600] transition-colors cursor-pointer bg-transparent border-none p-0 text-[#828282] text-xs"
                        >
                          查看评论
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-[#333] shrink-0">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm text-[#828282] hover:text-[#dcdcdc] disabled:opacity-50"
            >
              上一页
            </button>
            <span className="text-[#666] text-sm">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm text-[#828282] hover:text-[#dcdcdc] disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* Comments Panel */}
      {activeStoryId && (
        <CommentsPanel
          isOpen={showComments}
          onClose={() => setShowComments(false)}
          storyId={activeStoryId}
          storyTitle={activeStoryTitle}
          mode="overlay"
        />
      )}
    </div>
  );
};
