import React, { useState, useEffect } from 'react';
import { getPrompt, updatePrompt } from '../../services/settingsService';
import { DEFAULT_PROMPT } from '../../services/llmService';

interface Props {
  password: string;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

export const PromptTab: React.FC<Props> = ({ password, onMessage, onError }) => {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPrompt();
  }, []);

  const fetchPrompt = async () => {
    setLoading(true);
    try {
      const data = await getPrompt();
      setPrompt(data.prompt);
      setIsDefault(data.isDefault);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updatePrompt(prompt, password);
      onMessage(`提示词已保存，已失效 ${result.invalidatedTitles} 条标题翻译缓存`);
      setIsDefault(false);
    } catch {
      onError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('确定恢复为默认提示词？')) {
      setPrompt(DEFAULT_PROMPT);
    }
  };

  if (loading) {
    return <div className="text-[#828282]">加载中...</div>;
  }

  return (
    <div>
      <h2 className="text-[#dcdcdc] text-xl font-bold mb-6">提示词配置</h2>

      {/* Warning Alert */}
      <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-yellow-500 text-lg">⚠️</span>
          <div>
            <p className="text-yellow-200 text-sm font-medium">注意</p>
            <p className="text-yellow-200/70 text-xs mt-1">
              修改提示词会使所有旧的标题翻译缓存失效，调度器将在下次运行时重新翻译。
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#121212] border border-[#333] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <label className="text-[#dcdcdc] text-sm font-medium">
            LLM 翻译提示词
          </label>
          {!isDefault && (
            <span className="text-xs text-[#ff6600] bg-[#ff6600]/10 px-2 py-1 rounded">
              已自定义
            </span>
          )}
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full h-80 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded p-4 font-mono text-sm focus:outline-none focus:border-[#ff6600] transition-colors resize-none"
          spellCheck={false}
        />

        <div className="flex justify-between items-center mt-4 pt-4 border-t border-[#333]">
          <button
            onClick={handleReset}
            className="text-[#828282] text-sm hover:text-[#dcdcdc] transition-colors"
          >
            恢复默认
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#ff6600] text-black px-6 py-2.5 rounded font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存提示词'}
          </button>
        </div>
      </div>
    </div>
  );
};
