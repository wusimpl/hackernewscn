import React, { useState, useEffect } from 'react';

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

interface CommentRefreshStatus {
  isRunning: boolean;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  storiesProcessed: number;
  commentsRefreshed: number;
}

interface Props {
  password: string;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const CommentRefreshTab: React.FC<Props> = ({ password, onMessage, onError }) => {
  const [config, setConfig] = useState<CommentRefreshConfig | null>(null);
  const [status, setStatus] = useState<CommentRefreshStatus | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState('');
  const [storyLimit, setStoryLimit] = useState('');
  const [batchSize, setBatchSize] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/comment-refresh/config`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.data);
      }
    } catch {
      onError('获取配置失败');
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/comment-refresh/status`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
      }
    } catch {
      // 静默失败
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [password]);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setIntervalMinutes((config.interval / 60000).toString());
      setStoryLimit(config.storyLimit.toString());
      setBatchSize(config.batchSize.toString());
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const interval = parseFloat(intervalMinutes) * 60000;
      const limit = parseInt(storyLimit, 10);
      const batch = parseInt(batchSize, 10);

      if (isNaN(interval) || interval < 60000 || interval > 86400000) {
        onError('间隔时间必须在 1 分钟到 24 小时之间');
        setSaving(false);
        return;
      }
      if (isNaN(limit) || limit < 10 || limit > 100) {
        onError('文章数量必须在 10 到 100 之间');
        setSaving(false);
        return;
      }
      if (isNaN(batch) || batch < 1 || batch > 20) {
        onError('批次大小必须在 1 到 20 之间');
        setSaving(false);
        return;
      }

      const res = await fetch(`${API_BASE}/admin/comment-refresh/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ enabled, interval, storyLimit: limit, batchSize: batch }),
      });

      if (res.ok) {
        onMessage('配置已保存');
        fetchConfig();
        setTimeout(fetchStatus, 1000);
      } else {
        const data = await res.json();
        onError(data.error?.message || '保存失败');
      }
    } catch {
      onError('请求失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('确定重置为默认配置？')) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_BASE}/admin/comment-refresh/config/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        onMessage('已重置为默认配置');
        fetchConfig();
        setTimeout(fetchStatus, 1000);
      } else {
        const data = await res.json();
        onError(data.error?.message || '重置失败');
      }
    } catch {
      onError('请求失败');
    } finally {
      setResetting(false);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await fetch(`${API_BASE}/admin/comment-refresh/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        onMessage('评论刷新已触发');
        setTimeout(fetchStatus, 1000);
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

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  if (!config) {
    return <div className="text-[#828282]">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-[#dcdcdc] text-xl font-bold">评论刷新配置</h2>

      {/* 状态卡片 */}
      {status && (
        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <h3 className="text-[#dcdcdc] font-medium mb-3">服务状态</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[#828282]">状态：</span>
              <span className={status.isRunning ? 'text-green-500' : 'text-red-500'}>
                {status.isRunning ? '运行中' : '已停止'}
              </span>
            </div>
            <div>
              <span className="text-[#828282]">已处理文章：</span>
              <span className="text-[#dcdcdc]">{status.storiesProcessed}</span>
            </div>
            <div>
              <span className="text-[#828282]">已刷新评论：</span>
              <span className="text-[#dcdcdc]">{status.commentsRefreshed}</span>
            </div>
            <div>
              <span className="text-[#828282]">上次运行：</span>
              <span className="text-[#dcdcdc]">{formatTime(status.lastRunAt)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 配置表单 */}
      <div className="bg-[#121212] border border-[#333] rounded-lg p-6 space-y-6">
        {/* 启用开关 */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-5 h-5 rounded border-[#444] bg-[#1a1a1a] text-[#ff6600] focus:ring-[#ff6600]"
            />
            <span className="text-[#dcdcdc] font-medium">启用评论刷新</span>
          </label>
          <p className="text-[#666] text-xs mt-2 ml-8">
            启用后将定时刷新最新文章的评论
          </p>
        </div>

        {/* 刷新间隔 */}
        <div>
          <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
            刷新间隔
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(e.target.value)}
              min="1"
              max="1440"
              disabled={!enabled}
              className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors disabled:opacity-50"
            />
            <span className="text-[#828282] text-sm">分钟</span>
          </div>
          <p className="text-[#666] text-xs mt-2">
            范围: 1 ~ 1440 分钟 | 默认: {config.defaults.interval / 60000} 分钟
          </p>
        </div>

        {/* 文章数量 */}
        <div>
          <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
            每次刷新文章数
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={storyLimit}
              onChange={(e) => setStoryLimit(e.target.value)}
              min="10"
              max="100"
              disabled={!enabled}
              className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors disabled:opacity-50"
            />
            <span className="text-[#828282] text-sm">篇</span>
          </div>
          <p className="text-[#666] text-xs mt-2">
            范围: 10 ~ 100 篇 | 默认: {config.defaults.storyLimit} 篇
          </p>
        </div>

        {/* 批次大小 */}
        <div>
          <label className="block text-[#dcdcdc] text-sm font-medium mb-2">
            每批处理文章数
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              min="1"
              max="20"
              disabled={!enabled}
              className="flex-1 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-2.5 focus:outline-none focus:border-[#ff6600] transition-colors disabled:opacity-50"
            />
            <span className="text-[#828282] text-sm">篇</span>
          </div>
          <p className="text-[#666] text-xs mt-2">
            范围: 1 ~ 20 篇 | 默认: {config.defaults.batchSize} 篇
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-4 border-t border-[#333]">
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
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="bg-[#1a1a1a] text-[#dcdcdc] px-6 py-2.5 rounded font-medium hover:bg-[#242424] transition-colors border border-[#444] disabled:opacity-50"
          >
            {triggering ? '触发中...' : '立即刷新'}
          </button>
        </div>
      </div>

      {/* 说明 */}
      <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
        <h3 className="text-[#dcdcdc] font-medium mb-2">说明</h3>
        <ul className="text-[#828282] text-sm space-y-1 list-disc list-inside">
          <li>评论刷新服务会定时获取最新文章的评论更新</li>
          <li>新增的评论会自动翻译（每篇文章最多翻译配置的评论数）</li>
          <li>已存在的评论会更新但不会重新翻译</li>
          <li>分批处理可以避免一次性请求过多导致的问题</li>
        </ul>
      </div>
    </div>
  );
};
