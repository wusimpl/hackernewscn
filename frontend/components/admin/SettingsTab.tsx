import React, { useState, useEffect } from 'react';

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

interface CommentRefreshConfig {
  enabled: boolean;
  interval: number;
  storyLimit: number;
  batchSize: number;
  defaults: {
    enabled: boolean;
    interval: number;
    storyLimit: number;
    batchSize: number;
  };
}

interface Props {
  config: SchedulerConfig | null;
  password: string;
  onConfigUpdate: () => void;
  onStatusRefresh: () => void;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';


export const SettingsTab: React.FC<Props> = ({ 
  config, password, onConfigUpdate, onStatusRefresh, onMessage, onError 
}) => {
  // 文章抓取配置
  const [intervalMinutes, setIntervalMinutes] = useState('');
  const [storyLimit, setStoryLimit] = useState('');
  const [maxCommentTranslations, setMaxCommentTranslations] = useState('');
  
  // 评论刷新配置
  const [commentConfig, setCommentConfig] = useState<CommentRefreshConfig | null>(null);
  const [commentEnabled, setCommentEnabled] = useState(true);
  const [commentIntervalMinutes, setCommentIntervalMinutes] = useState('');
  const [commentStoryLimit, setCommentStoryLimit] = useState('');
  const [commentBatchSize, setCommentBatchSize] = useState('');
  
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchCommentConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/comment-refresh/config`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCommentConfig(data.data);
      }
    } catch {
      // 静默失败
    }
  };

  useEffect(() => {
    fetchCommentConfig();
  }, [password]);

  useEffect(() => {
    if (config) {
      setIntervalMinutes((config.interval / 60000).toString());
      setStoryLimit(config.storyLimit.toString());
      setMaxCommentTranslations(config.maxCommentTranslations.toString());
    }
  }, [config]);

  useEffect(() => {
    if (commentConfig) {
      setCommentEnabled(commentConfig.enabled);
      setCommentIntervalMinutes((commentConfig.interval / 60000).toString());
      setCommentStoryLimit(commentConfig.storyLimit.toString());
      setCommentBatchSize(commentConfig.batchSize.toString());
    }
  }, [commentConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 验证文章抓取配置
      const interval = parseFloat(intervalMinutes) * 60000;
      const limit = parseInt(storyLimit, 10);
      const commentLimit = parseInt(maxCommentTranslations, 10);

      if (isNaN(interval) || interval < 60000 || interval > 86400000) {
        onError('调度间隔必须在 1 分钟到 24 小时之间');
        setSaving(false);
        return;
      }
      if (isNaN(limit) || limit < 10 || limit > 100) {
        onError('抓取数量必须在 10 到 100 之间');
        setSaving(false);
        return;
      }
      if (isNaN(commentLimit) || commentLimit < 10 || commentLimit > 200) {
        onError('评论翻译数量必须在 10 到 200 之间');
        setSaving(false);
        return;
      }

      // 验证评论刷新配置
      const cInterval = parseFloat(commentIntervalMinutes) * 60000;
      const cLimit = parseInt(commentStoryLimit, 10);
      const cBatch = parseInt(commentBatchSize, 10);

      if (isNaN(cInterval) || cInterval < 60000 || cInterval > 86400000) {
        onError('评论刷新间隔必须在 1 分钟到 24 小时之间');
        setSaving(false);
        return;
      }
      if (isNaN(cLimit) || cLimit < 10 || cLimit > 100) {
        onError('评论刷新文章数必须在 10 到 100 之间');
        setSaving(false);
        return;
      }
      if (isNaN(cBatch) || cBatch < 1 || cBatch > 20) {
        onError('批次大小必须在 1 到 20 之间');
        setSaving(false);
        return;
      }

      // 保存文章抓取配置
      const res1 = await fetch(`${API_BASE}/admin/scheduler-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ interval, storyLimit: limit, maxCommentTranslations: commentLimit }),
      });

      if (!res1.ok) {
        const data = await res1.json();
        onError(data.error?.message || '保存文章配置失败');
        setSaving(false);
        return;
      }

      // 保存评论刷新配置
      const res2 = await fetch(`${API_BASE}/admin/comment-refresh/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ 
          enabled: commentEnabled, 
          interval: cInterval, 
          storyLimit: cLimit, 
          batchSize: cBatch 
        }),
      });

      if (!res2.ok) {
        const data = await res2.json();
        onError(data.error?.message || '保存评论配置失败');
        setSaving(false);
        return;
      }

      onMessage('配置已保存');
      onConfigUpdate();
      fetchCommentConfig();
      setTimeout(onStatusRefresh, 1000);
    } catch {
      onError('请求失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定重置所有配置为默认值？')) return;
    setResetting(true);
    try {
      const [res1, res2] = await Promise.all([
        fetch(`${API_BASE}/admin/scheduler-config/reset`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${password}` },
        }),
        fetch(`${API_BASE}/admin/comment-refresh/config/reset`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${password}` },
        }),
      ]);

      if (res1.ok && res2.ok) {
        onMessage('已重置为默认配置');
        onConfigUpdate();
        fetchCommentConfig();
        setTimeout(onStatusRefresh, 1000);
      } else {
        onError('重置失败');
      }
    } catch {
      onError('请求失败');
    } finally {
      setResetting(false);
    }
  };

  if (!config || !commentConfig) {
    return <div className="text-[#828282]">加载中...</div>;
  }


  return (
    <div>
      <h2 className="text-[#dcdcdc] text-xl font-bold mb-6">调度配置</h2>

      {/* 文章抓取配置 */}
      <div className="bg-[#121212] border border-[#333] rounded-lg p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[#828282]">📰</span>
          <h3 className="text-[#dcdcdc] font-medium">文章抓取</h3>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
              调度间隔
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(e.target.value)}
                min="1"
                max="1440"
                className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors"
              />
              <span className="text-[#828282] text-sm">分钟</span>
            </div>
            <p className="text-[#666] text-xs mt-2">
              范围: 1 ~ 1440 分钟 | 默认: {config.defaults.interval / 60000} 分钟
            </p>
          </div>

          <div>
            <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
              每次抓取文章数
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={storyLimit}
                onChange={(e) => setStoryLimit(e.target.value)}
                min="10"
                max="100"
                className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors"
              />
              <span className="text-[#828282] text-sm">条</span>
            </div>
            <p className="text-[#666] text-xs mt-2">
              范围: 10 ~ 100 条 | 默认: {config.defaults.storyLimit} 条
            </p>
          </div>

          <div>
            <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
              每篇文章翻译评论数
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={maxCommentTranslations}
                onChange={(e) => setMaxCommentTranslations(e.target.value)}
                min="10"
                max="200"
                step="10"
                className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors"
              />
              <span className="text-[#828282] text-sm">条</span>
            </div>
            <p className="text-[#666] text-xs mt-2">
              范围: 10 ~ 200 条 | 默认: {config.defaults.maxCommentTranslations} 条
            </p>
          </div>
        </div>
      </div>

      {/* 评论刷新配置 */}
      <div className="bg-[#121212] border border-[#333] rounded-lg p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[#828282]">💬</span>
          <h3 className="text-[#dcdcdc] font-medium">评论刷新</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={commentEnabled}
                onChange={(e) => setCommentEnabled(e.target.checked)}
                className="w-5 h-5 rounded border-[#444] bg-[#1a1a1a] text-[#ff6600] focus:ring-[#ff6600]"
              />
              <span className="text-[#dcdcdc] font-medium">启用评论刷新</span>
            </label>
            <p className="text-[#666] text-xs mt-2 ml-8">
              启用后将定时刷新最新文章的评论
            </p>
          </div>

          <div>
            <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
              刷新间隔
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={commentIntervalMinutes}
                onChange={(e) => setCommentIntervalMinutes(e.target.value)}
                min="1"
                max="1440"
                disabled={!commentEnabled}
                className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors disabled:opacity-50"
              />
              <span className="text-[#828282] text-sm">分钟</span>
            </div>
            <p className="text-[#666] text-xs mt-2">
              范围: 1 ~ 1440 分钟 | 默认: {commentConfig.defaults.interval / 60000} 分钟
            </p>
          </div>

          <div>
            <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
              每次刷新文章数
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={commentStoryLimit}
                onChange={(e) => setCommentStoryLimit(e.target.value)}
                min="10"
                max="100"
                disabled={!commentEnabled}
                className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors disabled:opacity-50"
              />
              <span className="text-[#828282] text-sm">篇</span>
            </div>
            <p className="text-[#666] text-xs mt-2">
              范围: 10 ~ 100 篇 | 默认: {commentConfig.defaults.storyLimit} 篇
            </p>
          </div>

          <div>
            <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
              每批处理文章数
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={commentBatchSize}
                onChange={(e) => setCommentBatchSize(e.target.value)}
                min="1"
                max="20"
                disabled={!commentEnabled}
                className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors disabled:opacity-50"
              />
              <span className="text-[#828282] text-sm">篇</span>
            </div>
            <p className="text-[#666] text-xs mt-2">
              范围: 1 ~ 20 篇 | 默认: {commentConfig.defaults.batchSize} 篇
            </p>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || resetting}
          className="bg-[#ff6600] text-black px-6 py-2.5 rounded font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button
          onClick={handleReset}
          disabled={saving || resetting}
          className="bg-[#1a1a1a] text-[#dcdcdc] px-6 py-2.5 rounded font-medium hover:bg-[#242424] transition-colors border border-[#444] disabled:opacity-50"
        >
          {resetting ? '重置中...' : '重置为默认'}
        </button>
      </div>
    </div>
  );
};
