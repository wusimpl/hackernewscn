import React, { useState, useEffect, useMemo } from 'react';
import { getArticleCache, clearAllCache, deleteArticle } from '../../services/cacheService';
import { CachedArticle } from '../../types';

interface Props {
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

const PAGE_SIZE = 20;

export const CacheTab: React.FC<Props> = ({ onMessage, onError }) => {
  const [articles, setArticles] = useState<CachedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetchArticles();
  }, []);

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
          timestamp: (r.updated_at || 0) * 1000 || Date.now()
        }));
      setArticles(mapped);
    } catch {
      onError('加载缓存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('确定清除所有已翻译的文章缓存？此操作不可恢复。')) return;
    setClearing(true);
    try {
      await clearAllCache();
      setArticles([]);
      onMessage('缓存已清除');
    } catch {
      onError('清除失败');
    } finally {
      setClearing(false);
    }
  };

  const handleDelete = async (article: CachedArticle) => {
    if (!confirm(`确定删除「${article.title}」的缓存？`)) return;
    try {
      await deleteArticle(article.id);
      setArticles(prev => prev.filter(a => a.id !== article.id));
      onMessage('已删除');
    } catch {
      onError('删除失败');
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

  return (
    <div>
      <h2 className="text-[#dcdcdc] text-xl font-bold mb-6">缓存管理</h2>

      {/* Toolbar */}
      <div className="bg-[#121212] border border-[#333] rounded-lg p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题或链接..."
            className="flex-1 min-w-[200px] bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2 text-sm focus:outline-none focus:border-[#ff6600] transition-colors"
          />
          <button
            onClick={fetchArticles}
            disabled={loading}
            className="bg-[#1a1a1a] text-[#dcdcdc] px-4 py-2 rounded text-sm hover:bg-[#242424] transition-colors border border-[#444]"
          >
            刷新
          </button>
          <button
            onClick={handleClearAll}
            disabled={clearing || articles.length === 0}
            className="bg-red-900/50 text-red-200 px-4 py-2 rounded text-sm hover:bg-red-900 transition-colors border border-red-800 disabled:opacity-50"
          >
            {clearing ? '清除中...' : '清空所有'}
          </button>
        </div>
        <div className="text-[#666] text-xs mt-3">
          共 {filtered.length} 条记录 {search && `(搜索结果)`}
        </div>
      </div>

      {/* List */}
      <div className="bg-[#121212] border border-[#333] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#828282]">加载中...</div>
        ) : paginated.length === 0 ? (
          <div className="p-8 text-center text-[#828282]">
            {search ? '无匹配结果' : '暂无缓存数据'}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-[#333]">
              {paginated.map(article => (
                <li key={article.id} className="p-4 hover:bg-[#1a1a1a] transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-[#dcdcdc] text-sm mb-1 line-clamp-1">
                        {article.title}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#666]">
                        <a 
                          href={article.originalUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="truncate max-w-[300px] hover:text-[#ff6600]"
                        >
                          {article.originalUrl}
                        </a>
                        <span className="shrink-0">
                          {new Date(article.timestamp).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(article)}
                      className="text-red-400/60 hover:text-red-400 text-xs px-3 py-1.5 rounded hover:bg-red-900/20 transition-colors shrink-0"
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 border-t border-[#333]">
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
          </>
        )}
      </div>
    </div>
  );
};
