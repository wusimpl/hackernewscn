import React, { useState, useEffect } from 'react';
import { getPrompt, updatePrompt } from '../services/settingsService';
import { getArticleCache, clearAllCache, deleteArticle } from '../services/cacheService';
import { DEFAULT_PROMPT } from '../services/llmService';
import { CachedArticle } from '../types';

interface SchedulerStatus {
  isRunning: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  storiesFetched: number;
  titlesTranslated: number;
}

interface SchedulerConfig {
  interval: number;
  storyLimit: number;
  maxCommentTranslations: number;
  defaults: {
    interval: number;
    storyLimit: number;
    maxCommentTranslations: number;
  };
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const AdminPanel: React.FC = () => {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // 调度参数状态
  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig | null>(null);
  const [intervalMinutes, setIntervalMinutes] = useState('');
  const [storyLimit, setStoryLimit] = useState('');
  const [maxCommentTranslations, setMaxCommentTranslations] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

  // 提示词配置状态
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_PROMPT);
  const [promptLoading, setPromptLoading] = useState(false);

  // 已翻译文章列表状态
  const [articleCache, setArticleCache] = useState<CachedArticle[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);

  // 检查本地存储的 token
  useEffect(() => {
    const savedToken = sessionStorage.getItem('adminToken');
    if (savedToken) {
      setPassword(savedToken);
      verifyAndFetchStatus(savedToken);
    }
  }, []);

  const verifyAndFetchStatus = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
        setIsAuthenticated(true);
        sessionStorage.setItem('adminToken', token);
        setError('');
        // 同时获取调度配置、提示词和文章列表
        fetchSchedulerConfig(token);
        fetchPrompt();
        fetchArticles();
      } else {
        setError('密码错误');
        sessionStorage.removeItem('adminToken');
      }
    } catch {
      setError('连接失败');
    }
  };

  const fetchSchedulerConfig = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/scheduler-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSchedulerConfig(data.data);
        setIntervalMinutes((data.data.interval / 60000).toString());
        setStoryLimit(data.data.storyLimit.toString());
        setMaxCommentTranslations(data.data.maxCommentTranslations.toString());
      }
    } catch {
      // ignore
    }
  };

  const fetchPrompt = async () => {
    try {
      const promptData = await getPrompt();
      setCustomPrompt(promptData.prompt);
    } catch {
      // ignore
    }
  };

  const fetchArticles = async () => {
    setArticlesLoading(true);
    try {
      const cacheRecords = await getArticleCache();
      const articles: CachedArticle[] = cacheRecords
        .filter(record => record.status === 'done')
        .map(record => ({
          id: record.story_id,
          title: record.title_snapshot,
          content: record.content_markdown,
          originalUrl: record.original_url,
          // updated_at 在数据库中是秒级时间戳，需要转换为毫秒
          timestamp: (record.updated_at || 0) * 1000 || Date.now()
        }));
      setArticleCache(articles);
    } catch {
      // ignore
    } finally {
      setArticlesLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setConfigLoading(true);
    setMessage('');
    setError('');

    try {
      const interval = parseFloat(intervalMinutes) * 60000;
      const limit = parseInt(storyLimit, 10);
      const commentLimit = parseInt(maxCommentTranslations, 10);

      if (isNaN(interval) || interval < 60000 || interval > 86400000) {
        setError('间隔时间必须在 1 分钟到 24 小时之间');
        setConfigLoading(false);
        return;
      }

      if (isNaN(limit) || limit < 10 || limit > 100) {
        setError('抓取数量必须在 10 到 100 之间');
        setConfigLoading(false);
        return;
      }

      if (isNaN(commentLimit) || commentLimit < 10 || commentLimit > 200) {
        setError('评论翻译数量必须在 10 到 200 之间');
        setConfigLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/admin/scheduler-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ interval, storyLimit: limit, maxCommentTranslations: commentLimit }),
      });

      if (res.ok) {
        setMessage('调度配置已保存并生效');
        fetchSchedulerConfig(password);
        setTimeout(() => fetchStatus(), 1000);
      } else {
        const data = await res.json();
        setError(data.error?.message || '保存失败');
      }
    } catch {
      setError('请求失败');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleResetConfig = async () => {
    setConfigLoading(true);
    setMessage('');
    setError('');

    try {
      const res = await fetch(`${API_BASE}/admin/scheduler-config/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
      });

      if (res.ok) {
        setMessage('调度配置已重置为默认值');
        fetchSchedulerConfig(password);
        setTimeout(() => fetchStatus(), 1000);
      } else {
        const data = await res.json();
        setError(data.error?.message || '重置失败');
      }
    } catch {
      setError('请求失败');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleSavePrompt = async () => {
    setPromptLoading(true);
    setMessage('');
    setError('');

    try {
      const result = await updatePrompt(customPrompt, password);
      setMessage(`提示词已保存，已失效 ${result.invalidatedTitles} 条标题翻译缓存。调度器将在下次运行时自动重新翻译。`);
    } catch {
      setError('保存提示词失败');
    } finally {
      setPromptLoading(false);
    }
  };

  const handleResetPrompt = () => {
    if (window.confirm('确定恢复为默认提示词?')) {
      setCustomPrompt(DEFAULT_PROMPT);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('确定清除所有已翻译的文章缓存?')) return;
    
    setArticlesLoading(true);
    setMessage('');
    setError('');

    try {
      await clearAllCache();
      setArticleCache([]);
      setMessage('文章缓存已清除');
    } catch {
      setError('清除缓存失败');
    } finally {
      setArticlesLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    await verifyAndFetchStatus(password);
  };

  const handleTrigger = async () => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const res = await fetch(`${API_BASE}/admin/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
      });

      if (res.ok) {
        setMessage('调度器已触发，正在后台执行...');
        // 3秒后刷新状态
        setTimeout(() => fetchStatus(), 3000);
      } else {
        const data = await res.json();
        setError(data.error?.message || '触发失败');
      }
    } catch {
      setError('请求失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/status`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
      }
    } catch {
      // ignore
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    setStatus(null);
    sessionStorage.removeItem('adminToken');
  };

  const formatTime = (ts: number | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('zh-CN');
  };

  // 登录界面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-[#1a1a1a] p-6 w-full max-w-sm">
          <h1 className="text-[#ff6600] text-lg font-bold mb-4">管理面板</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入管理密码"
            className="w-full bg-[#242424] text-[#dcdcdc] border border-[#444] p-2 mb-3 focus:outline-none focus:border-[#ff6600]"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <button
            type="submit"
            className="w-full bg-[#ff6600] text-black py-2 font-bold hover:bg-[#ff8533] transition-colors"
          >
            登录
          </button>
        </form>
      </div>
    );
  }

  // 管理界面
  return (
    <div className="min-h-screen bg-[#121212] p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-[#ff6600] text-xl font-bold">管理面板</h1>
          <button
            onClick={handleLogout}
            className="text-[#828282] text-sm hover:text-[#dcdcdc]"
          >
            退出
          </button>
        </div>

        {/* 状态卡片 */}
        <div className="bg-[#1a1a1a] p-4 mb-4">
          <h2 className="text-[#dcdcdc] font-bold mb-3">调度器状态</h2>
          {status ? (
            <div className="text-sm text-[#828282] space-y-2">
              <p>运行状态: <span className={status.isRunning ? 'text-green-500' : 'text-red-500'}>{status.isRunning ? '运行中' : '已停止'}</span></p>
              <p>上次运行: {formatTime(status.lastRunAt)}</p>
              <p>下次运行: {formatTime(status.nextRunAt)}</p>
              <p>已抓取文章: {status.storiesFetched}</p>
              <p>已翻译标题: {status.titlesTranslated}</p>
            </div>
          ) : (
            <p className="text-[#828282]">加载中...</p>
          )}
          <button
            onClick={fetchStatus}
            className="mt-3 text-[#ff6600] text-sm hover:underline"
          >
            刷新状态
          </button>
        </div>

        {/* 调度参数设置 */}
        <div className="bg-[#1a1a1a] p-4 mb-4">
          <h2 className="text-[#dcdcdc] font-bold mb-3">调度参数设置</h2>
          {schedulerConfig ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[#828282] text-sm mb-1">
                  调度间隔（分钟）
                  <span className="text-[#666] ml-2">
                    默认: {schedulerConfig.defaults.interval / 60000} 分钟
                  </span>
                </label>
                <input
                  type="number"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(e.target.value)}
                  min="1"
                  max="1440"
                  step="1"
                  className="w-full bg-[#242424] text-[#dcdcdc] border border-[#444] p-2 focus:outline-none focus:border-[#ff6600]"
                  placeholder="1-1440"
                />
                <p className="text-[#666] text-xs mt-1">范围: 1 分钟 ~ 24 小时</p>
              </div>
              <div>
                <label className="block text-[#828282] text-sm mb-1">
                  每次抓取文章数
                  <span className="text-[#666] ml-2">
                    默认: {schedulerConfig.defaults.storyLimit} 条
                  </span>
                </label>
                <input
                  type="number"
                  value={storyLimit}
                  onChange={(e) => setStoryLimit(e.target.value)}
                  min="10"
                  max="100"
                  step="1"
                  className="w-full bg-[#242424] text-[#dcdcdc] border border-[#444] p-2 focus:outline-none focus:border-[#ff6600]"
                  placeholder="10-100"
                />
                <p className="text-[#666] text-xs mt-1">范围: 10 ~ 100 条</p>
              </div>
              <div>
                <label className="block text-[#828282] text-sm mb-1">
                  每篇文章翻译评论数
                  <span className="text-[#666] ml-2">
                    默认: {schedulerConfig.defaults.maxCommentTranslations} 条
                  </span>
                </label>
                <input
                  type="number"
                  value={maxCommentTranslations}
                  onChange={(e) => setMaxCommentTranslations(e.target.value)}
                  min="10"
                  max="200"
                  step="10"
                  className="w-full bg-[#242424] text-[#dcdcdc] border border-[#444] p-2 focus:outline-none focus:border-[#ff6600]"
                  placeholder="10-200"
                />
                <p className="text-[#666] text-xs mt-1">范围: 10 ~ 200 条</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveConfig}
                  disabled={configLoading}
                  className="bg-[#ff6600] text-black px-4 py-2 font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50"
                >
                  {configLoading ? '保存中...' : '保存配置'}
                </button>
                <button
                  onClick={handleResetConfig}
                  disabled={configLoading}
                  className="bg-[#333] text-[#dcdcdc] px-4 py-2 font-bold hover:bg-[#444] transition-colors disabled:opacity-50"
                >
                  重置为默认
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[#828282]">加载中...</p>
          )}
        </div>

        {/* 操作区 */}
        <div className="bg-[#1a1a1a] p-4 mb-4">
          <h2 className="text-[#dcdcdc] font-bold mb-3">手动操作</h2>
          <button
            onClick={handleTrigger}
            disabled={loading}
            className="bg-[#ff6600] text-black px-4 py-2 font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50"
          >
            {loading ? '执行中...' : '立即抓取并翻译'}
          </button>
          {message && <p className="text-green-500 text-sm mt-3">{message}</p>}
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </div>

        {/* 提示词配置 */}
        <div className="bg-[#1a1a1a] p-4 mb-4">
          <h2 className="text-[#dcdcdc] font-bold mb-3">提示词配置</h2>
          <p className="text-[#828282] text-xs mb-2">
            自定义大模型翻译标题的方式。
          </p>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="w-full h-48 bg-[#242424] text-[#dcdcdc] border border-[#444] p-2 font-mono text-sm focus:outline-none focus:border-[#ff6600] mb-3 scrollbar-hide"
            spellCheck={false}
          />
          <div className="flex justify-between items-center">
            <button
              onClick={handleResetPrompt}
              className="text-[#828282] text-sm hover:text-[#dcdcdc] underline"
            >
              恢复默认
            </button>
            <button
              onClick={handleSavePrompt}
              disabled={promptLoading}
              className="bg-[#ff6600] text-black px-4 py-2 font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50"
            >
              {promptLoading ? '保存中...' : '保存提示词'}
            </button>
          </div>
        </div>

        {/* 已翻译文章列表 */}
        <div className="bg-[#1a1a1a] p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[#dcdcdc] font-bold">已翻译文章 ({articleCache.length})</h2>
            <div className="flex gap-2">
              <button
                onClick={fetchArticles}
                disabled={articlesLoading}
                className="text-[#ff6600] text-sm hover:underline"
              >
                刷新
              </button>
              <button
                onClick={handleClearCache}
                disabled={articlesLoading || articleCache.length === 0}
                className="text-red-900 hover:text-red-500 text-sm disabled:opacity-50"
              >
                清除缓存
              </button>
            </div>
          </div>
          {articlesLoading ? (
            <p className="text-[#828282]">加载中...</p>
          ) : articleCache.length === 0 ? (
            <p className="text-[#828282] text-center py-4">暂无已翻译文章</p>
          ) : (
            <div className="max-h-64 overflow-y-auto scrollbar-hide">
              <ul className="divide-y divide-[#333]">
                {[...articleCache].sort((a, b) => b.timestamp - a.timestamp).map(article => (
                  <li key={article.id} className="py-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[#dcdcdc] text-sm mb-1 line-clamp-1">
                          {article.title}
                        </div>
                        <div className="flex justify-between items-center text-xs text-[#666]">
                          <span className="truncate max-w-[70%]">{article.originalUrl}</span>
                          <span>{new Date(article.timestamp).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm(`确定删除「${article.title}」的翻译缓存？`)) return;
                          try {
                            await deleteArticle(article.id);
                            setArticleCache(prev => prev.filter(a => a.id !== article.id));
                            setMessage('文章缓存已删除');
                          } catch {
                            setError('删除失败');
                          }
                        }}
                        className="text-red-900 hover:text-red-500 text-xs shrink-0 px-2 py-1"
                        title="删除此文章缓存"
                      >
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
