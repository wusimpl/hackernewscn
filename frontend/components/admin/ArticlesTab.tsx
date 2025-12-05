import React, { useState, useEffect, useMemo } from 'react';

interface Article {
  story_id: number;
  title_snapshot: string;
  original_url: string;
  status: string;
  updated_at: number;
  comment_count: number;
  error_message?: string;
}

interface Props {
  password: string;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const PAGE_SIZE = 20;

const timeAgo = (timestamp: number) => {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
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
    return domain.replace('www.', '');
  } catch {
    return '';
  }
};

export const ArticlesTab: React.FC<Props> = ({ password, onMessage, onError }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; type: 'article' | 'comments' } | null>(null);

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/articles`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setArticles(data.data.articles || []);
      } else {
        onError('获取文章列表失败');
      }
    } catch {
      onError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return articles;
    const q = search.toLowerCase();
    return articles.filter(a =>
      a.title_snapshot.toLowerCase().includes(q) ||
      a.original_url?.toLowerCase().includes(q)
    );
  }, [articles, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleDeleteArticle = async (storyId: number) => {
    setDeleting(storyId);
    try {
      const res = await fetch(`${API_BASE}/admin/articles/${storyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        onMessage(`文章已删除，同时删除了 ${data.data.deletedComments} 条评论`);
        setArticles(prev => prev.filter(a => a.story_id !== storyId));
      } else {
        onError('删除失败');
      }
    } catch {
      onError('网络错误');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const handleDeleteComments = async (storyId: number) => {
    setDeleting(storyId);
    try {
      const res = await fetch(`${API_BASE}/admin/articles/${storyId}/comments`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        onMessage(`已删除 ${data.data.deletedComments} 条评论`);
        setArticles(prev => prev.map(a => 
          a.story_id === storyId ? { ...a, comment_count: 0 } : a
        ));
      } else {
        onError('删除失败');
      }
    } catch {
      onError('网络错误');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      done: 'bg-green-900/50 text-green-400 border-green-700',
      error: 'bg-red-900/50 text-red-400 border-red-700',
      running: 'bg-blue-900/50 text-blue-400 border-blue-700',
      queued: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
      blocked: 'bg-gray-900/50 text-gray-400 border-gray-700',
    };
    const labels: Record<string, string> = {
      done: '已完成',
      error: '错误',
      running: '翻译中',
      queued: '队列中',
      blocked: '已屏蔽',
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded border ${styles[status] || styles.blocked}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-[#dcdcdc]">📰 文章管理</h2>
        <button
          onClick={fetchArticles}
          disabled={loading}
          className="px-3 py-1.5 text-sm bg-[#333] text-[#dcdcdc] rounded hover:bg-[#444] transition-colors disabled:opacity-50"
        >
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索标题或链接..."
          className="w-full bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2 text-sm focus:outline-none focus:border-[#ff6600] transition-colors"
        />
      </div>

      {/* Stats */}
      <div className="mb-4 text-sm text-[#828282]">
        共 {filtered.length} 篇文章
        {search && ` (搜索结果)`}
      </div>

      {/* Article List */}
      <div className="bg-[#1a1a1a] rounded-lg border border-[#333] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#828282]">加载中...</div>
        ) : paginated.length === 0 ? (
          <div className="p-8 text-center text-[#828282]">
            {search ? '无匹配结果' : '暂无文章'}
          </div>
        ) : (
          <div className="divide-y divide-[#333]">
            {paginated.map((article, idx) => (
              <div
                key={article.story_id}
                className="p-4 hover:bg-[#242424] transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Index */}
                  <div className="text-[#666] text-sm font-mono min-w-[30px] pt-0.5">
                    {(page - 1) * PAGE_SIZE + idx + 1}.
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[#dcdcdc] font-medium break-words">
                        {article.title_snapshot}
                      </span>
                      {getStatusBadge(article.status)}
                    </div>

                    {/* URL */}
                    <div className="text-[#666] text-xs mt-1 truncate">
                      {getDomain(article.original_url)}
                      {article.original_url && (
                        <a
                          href={article.original_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-[#828282] hover:text-[#ff6600]"
                        >
                          [原文 ↗]
                        </a>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-[#828282]">
                      <span>ID: {article.story_id}</span>
                      <span>|</span>
                      <span>{timeAgo(article.updated_at)}</span>
                      <span>|</span>
                      <span>{article.comment_count} 条评论</span>
                      {article.error_message && (
                        <>
                          <span>|</span>
                          <span className="text-red-400" title={article.error_message}>
                            错误: {article.error_message.slice(0, 30)}...
                          </span>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3">
                      {article.comment_count > 0 && (
                        <button
                          onClick={() => setConfirmDelete({ id: article.story_id, type: 'comments' })}
                          disabled={deleting === article.story_id}
                          className="px-2 py-1 text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-700/50 rounded hover:bg-yellow-900/50 transition-colors disabled:opacity-50"
                        >
                          删除评论
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete({ id: article.story_id, type: 'article' })}
                        disabled={deleting === article.story_id}
                        className="px-2 py-1 text-xs bg-red-900/30 text-red-400 border border-red-700/50 rounded hover:bg-red-900/50 transition-colors disabled:opacity-50"
                      >
                        {deleting === article.story_id ? '删除中...' : '删除文章'}
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
        <div className="flex items-center justify-center gap-2 mt-4">
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

      {/* Confirm Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-[#dcdcdc] mb-4">
              确认{confirmDelete.type === 'article' ? '删除文章' : '删除评论'}
            </h3>
            <p className="text-[#828282] text-sm mb-6">
              {confirmDelete.type === 'article'
                ? '删除文章将同时删除该文章的所有评论（包括原始评论和翻译），此操作不可恢复。'
                : '删除评论将同时删除原始评论和翻译评论，此操作不可恢复。'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-[#828282] hover:text-[#dcdcdc] transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === 'article') {
                    handleDeleteArticle(confirmDelete.id);
                  } else {
                    handleDeleteComments(confirmDelete.id);
                  }
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
