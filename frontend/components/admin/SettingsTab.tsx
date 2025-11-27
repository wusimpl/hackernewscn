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
  const [intervalMinutes, setIntervalMinutes] = useState('');
  const [storyLimit, setStoryLimit] = useState('');
  const [maxCommentTranslations, setMaxCommentTranslations] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (config) {
      setIntervalMinutes((config.interval / 60000).toString());
      setStoryLimit(config.storyLimit.toString());
      setMaxCommentTranslations(config.maxCommentTranslations.toString());
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const interval = parseFloat(intervalMinutes) * 60000;
      const limit = parseInt(storyLimit, 10);
      const commentLimit = parseInt(maxCommentTranslations, 10);

      if (isNaN(interval) || interval < 60000 || interval > 86400000) {
        onError('间隔时间必须在 1 分钟到 24 小时之间');
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

      const res = await fetch(`${API_BASE}/admin/scheduler-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`,
        },
        body: JSON.stringify({ interval, storyLimit: limit, maxCommentTranslations: commentLimit }),
      });

      if (res.ok) {
        onMessage('配置已保存');
        onConfigUpdate();
        setTimeout(onStatusRefresh, 1000);
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
      const res = await fetch(`${API_BASE}/admin/scheduler-config/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        onMessage('已重置为默认配置');
        onConfigUpdate();
        setTimeout(onStatusRefresh, 1000);
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

  if (!config) {
    return <div className="text-[#828282]">加载中...</div>;
  }

  return (
    <div>
      <h2 className="text-[#dcdcdc] text-xl font-bold mb-6">调度配置</h2>

      <div className="bg-[#121212] border border-[#333] rounded-lg p-6 space-y-6">
        {/* Interval */}
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

        {/* Story Limit */}
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

        {/* Comment Translations */}
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

        {/* Actions */}
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
        </div>
      </div>
    </div>
  );
};
