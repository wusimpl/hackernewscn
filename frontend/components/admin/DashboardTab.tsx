import React, { useState, useEffect } from 'react';

interface SchedulerStatus {
  isRunning: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  storiesFetched: number;
  titlesTranslated: number;
}

interface CommentRefreshStatus {
  isRunning: boolean;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  storiesProcessed: number;
  commentsRefreshed: number;
}

interface Stats {
  stories: { total: number };
  titles: { translated: number };
  articles: {
    done: number;
    blocked: number;
    error: number;
    running: number;
    queued: number;
  };
  comments: {
    total: number;
    translated: number;
  };
}

interface Props {
  status: SchedulerStatus | null;
  password: string;
  onRefresh: () => void;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';


export const DashboardTab: React.FC<Props> = ({ status, password, onRefresh, onMessage, onError }) => {
  const [triggering, setTriggering] = useState(false);
  const [triggeringComments, setTriggeringComments] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [commentStatus, setCommentStatus] = useState<CommentRefreshStatus | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch {
      // 静默失败
    }
  };

  const fetchCommentStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/comment-refresh/status`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCommentStatus(data.data);
      }
    } catch {
      // 静默失败
    }
  };

  useEffect(() => {
    fetchStats();
    fetchCommentStatus();
  }, [password]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      onRefresh();
      fetchStats();
      fetchCommentStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, onRefresh]);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await fetch(`${API_BASE}/admin/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        onMessage('调度器已触发，正在后台执行...');
        setTimeout(() => {
          onRefresh();
          fetchStats();
        }, 3000);
      } else {
        const data = await res.json();
        onError(data.error?.message || '触发失败');
      }
    } catch {
      onError('请求失败');
    } finally {
      setTriggering(false);
    }
  };

  const handleRefresh = () => {
    onRefresh();
    fetchStats();
    fetchCommentStatus();
  };

  const handleTriggerComments = async () => {
    setTriggeringComments(true);
    try {
      const res = await fetch(`${API_BASE}/admin/comment-refresh/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        onMessage('评论刷新已触发，正在后台执行...');
        setTimeout(() => {
          onRefresh();
          fetchStats();
          fetchCommentStatus();
        }, 3000);
      } else {
        const data = await res.json();
        onError(data.error?.message || '触发失败');
      }
    } catch {
      onError('请求失败');
    } finally {
      setTriggeringComments(false);
    }
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('zh-CN');
  };


  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[#dcdcdc] text-xl font-bold">概览</h2>
        <label className="flex items-center gap-2 text-sm text-[#828282]">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-[#ff6600]"
          />
          自动刷新
        </label>
      </div>

      {/* 服务状态 */}
      <div className="space-y-3 mb-6">
        {/* 文章调度器状态 */}
        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#828282]">📰</span>
            <span className="text-[#dcdcdc] font-medium">文章调度器</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[#666] text-xs mb-1">运行状态</div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${status?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={status?.isRunning ? 'text-green-400' : 'text-red-400'}>
                  {status?.isRunning ? '运行中' : '已停止'}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[#666] text-xs mb-1">上次抓取时间</div>
              <div className="text-[#dcdcdc]">{formatTime(status?.lastRunAt ?? null)}</div>
            </div>
            <div>
              <div className="text-[#666] text-xs mb-1">下次抓取时间</div>
              <div className="text-[#dcdcdc]">{formatTime(status?.nextRunAt ?? null)}</div>
            </div>
            <div>
              <div className="text-[#666] text-xs mb-1">上次抓取</div>
              <div className="text-[#dcdcdc]">
                <span className="text-[#ff6600]">{status?.storiesFetched ?? 0}</span> 条
              </div>
            </div>
          </div>
        </div>

        {/* 评论刷新状态 */}
        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#828282]">💬</span>
            <span className="text-[#dcdcdc] font-medium">评论刷新</span>
            {commentStatus && !commentStatus.enabled && (
              <span className="text-xs text-[#666] bg-[#1a1a1a] px-2 py-0.5 rounded">已禁用</span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[#666] text-xs mb-1">运行状态</div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${commentStatus?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={commentStatus?.isRunning ? 'text-green-400' : 'text-red-400'}>
                  {commentStatus?.isRunning ? '运行中' : '已停止'}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[#666] text-xs mb-1">上次刷新时间</div>
              <div className="text-[#dcdcdc]">{formatTime(commentStatus?.lastRunAt ?? null)}</div>
            </div>
            <div>
              <div className="text-[#666] text-xs mb-1">下次刷新时间</div>
              <div className="text-[#dcdcdc]">{formatTime(commentStatus?.nextRunAt ?? null)}</div>
            </div>
            <div>
              <div className="text-[#666] text-xs mb-1">上次刷新</div>
              <div className="text-[#dcdcdc]">
                <span className="text-[#ff6600]">{commentStatus?.storiesProcessed ?? 0}</span> 篇 / <span className="text-[#ff6600]">{commentStatus?.commentsRefreshed ?? 0}</span> 条
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* 统计数据 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="text-[#666] text-xs mb-2">故事总数</div>
          <div className="text-[#dcdcdc] text-2xl font-bold">
            {stats?.stories.total.toLocaleString() ?? '-'}
          </div>
        </div>

        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="text-[#666] text-xs mb-2">标题翻译</div>
          <div className="text-[#dcdcdc] text-2xl font-bold">
            {stats?.titles.translated.toLocaleString() ?? '-'}
          </div>
        </div>

        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="text-[#666] text-xs mb-2">文章翻译</div>
          {stats ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-400">✓</span>
                <span className="text-[#dcdcdc]">{stats.articles.done}</span>
                <span className="text-[#666]">完成</span>
              </div>
              {stats.articles.blocked > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-yellow-400">⊘</span>
                  <span className="text-[#dcdcdc]">{stats.articles.blocked}</span>
                  <span className="text-[#666]">被阻止</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[#dcdcdc] text-2xl font-bold">-</div>
          )}
        </div>

        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="text-[#666] text-xs mb-2">评论</div>
          {stats ? (
            <div className="space-y-1">
              <div className="text-[#dcdcdc] text-lg font-bold">
                {stats.comments.total.toLocaleString()}
              </div>
              <div className="text-sm text-[#666]">
                已翻译 <span className="text-[#ff6600]">{stats.comments.translated.toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="text-[#dcdcdc] text-2xl font-bold">-</div>
          )}
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="bg-[#121212] border border-[#333] rounded-lg p-6">
        <h3 className="text-[#dcdcdc] font-medium mb-4">快捷操作</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="bg-[#ff6600] text-black px-6 py-2.5 rounded font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {triggering && (
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            )}
            {triggering ? '执行中...' : '立即抓取最新文章'}
          </button>
          <button
            onClick={handleTriggerComments}
            disabled={triggeringComments}
            className="bg-[#1a1a1a] text-[#dcdcdc] px-6 py-2.5 rounded font-medium hover:bg-[#242424] transition-colors border border-[#444] disabled:opacity-50 flex items-center gap-2"
          >
            {triggeringComments && (
              <span className="w-4 h-4 border-2 border-[#dcdcdc]/30 border-t-[#dcdcdc] rounded-full animate-spin" />
            )}
            {triggeringComments ? '执行中...' : '立即更新评论'}
          </button>
          <button
            onClick={handleRefresh}
            className="bg-[#1a1a1a] text-[#dcdcdc] px-6 py-2.5 rounded font-medium hover:bg-[#242424] transition-colors border border-[#444]"
          >
            刷新状态
          </button>
        </div>
      </div>
    </div>
  );
};
