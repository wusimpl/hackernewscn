import React, { useState, useEffect } from 'react';
import { getPrompts, updatePrompts } from '../../services/settingsService';
import { DEFAULT_PROMPTS } from '../../services/llmService';
import { PromptType, PromptsConfig } from '../../types';

interface Props {
  password: string;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

// 提示词配置信息
const PROMPT_INFO: Record<PromptType, { name: string; description: string; icon: string }> = {
  article: {
    name: '文章翻译',
    description: '用于翻译文章标题和正文内容',
    icon: '📄'
  },
  tldr: {
    name: 'TLDR 摘要',
    description: '用于生成文章的简短中文摘要',
    icon: '📝'
  },
  comment: {
    name: '评论翻译',
    description: '用于翻译 Hacker News 评论内容',
    icon: '💬'
  }
};

const PROMPT_TYPES: PromptType[] = ['article', 'tldr', 'comment'];

export const PromptTab: React.FC<Props> = ({ password, onMessage, onError }) => {
  const [prompts, setPrompts] = useState<PromptsConfig | null>(null);
  const [defaults, setDefaults] = useState<Record<PromptType, string>>({
    article: DEFAULT_PROMPTS.article,
    tldr: DEFAULT_PROMPTS.tldr,
    comment: DEFAULT_PROMPTS.comment
  });
  const [activeTab, setActiveTab] = useState<PromptType>('article');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editedPrompts, setEditedPrompts] = useState<Record<PromptType, string>>({
    article: '',
    tldr: '',
    comment: ''
  });

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const data = await getPrompts();
      setPrompts(data.prompts);
      setDefaults(data.defaults);
      setEditedPrompts({
        article: data.prompts.article.prompt,
        tldr: data.prompts.tldr.prompt,
        comment: data.prompts.comment.prompt
      });
    } catch (err) {
      console.error('Failed to fetch prompts:', err);
      // 使用默认值
      setEditedPrompts({
        article: DEFAULT_PROMPTS.article,
        tldr: DEFAULT_PROMPTS.tldr,
        comment: DEFAULT_PROMPTS.comment
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (type: PromptType) => {
    setSaving(true);
    try {
      const result = await updatePrompts(
        { [type]: { prompt: editedPrompts[type] } },
        password
      );
      
      // 更新本地状态
      if (result.prompts) {
        setPrompts(result.prompts);
      }
      
      const typeInfo = PROMPT_INFO[type];
      onMessage(`${typeInfo.name}提示词已保存`);
    } catch (err) {
      onError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (type: PromptType) => {
    const typeInfo = PROMPT_INFO[type];
    if (confirm(`确定恢复${typeInfo.name}为默认提示词？`)) {
      setEditedPrompts(prev => ({
        ...prev,
        [type]: defaults[type]
      }));
    }
  };

  const isModified = (type: PromptType) => {
    return editedPrompts[type] !== defaults[type];
  };

  if (loading) {
    return <div className="text-[#828282]">加载中...</div>;
  }

  return (
    <div>
      <h2 className="text-[#dcdcdc] text-xl font-bold mb-6">提示词配置</h2>

      {/* Tab Navigation */}
      <div className="flex border-b border-[#333] mb-6">
        {PROMPT_TYPES.map((type) => {
          const info = PROMPT_INFO[type];
          const modified = isModified(type);
          const charCount = editedPrompts[type].length;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === type
                  ? 'text-[#ff6600] border-b-2 border-[#ff6600] -mb-[1px]'
                  : 'text-[#828282] hover:text-[#dcdcdc]'
              }`}
            >
              <span className="mr-2">{info.icon}</span>
              {info.name}
              <span className="ml-1 text-xs opacity-60">({charCount}字符)</span>
              {modified && (
                <span className="ml-2 w-2 h-2 bg-[#ff6600] rounded-full inline-block" />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      <div className="bg-[#121212] border border-[#333] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <label className="text-[#dcdcdc] text-sm font-medium flex items-center gap-2">
              <span>{PROMPT_INFO[activeTab].icon}</span>
              {PROMPT_INFO[activeTab].name}
            </label>
            <p className="text-[#828282] text-xs mt-1">
              {PROMPT_INFO[activeTab].description}
            </p>
          </div>
          {isModified(activeTab) && (
            <span className="text-xs text-[#ff6600] bg-[#ff6600]/10 px-2 py-1 rounded">
              已修改
            </span>
          )}
        </div>

        <textarea
          value={editedPrompts[activeTab]}
          onChange={(e) => setEditedPrompts(prev => ({
            ...prev,
            [activeTab]: e.target.value
          }))}
          className="w-full h-80 bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded p-4 font-mono text-sm focus:outline-none focus:border-[#ff6600] transition-colors resize-none"
          spellCheck={false}
        />

        <div className="flex justify-between items-center mt-4 pt-4 border-t border-[#333]">
          <button
            onClick={() => handleReset(activeTab)}
            className="text-[#828282] text-sm hover:text-[#dcdcdc] transition-colors"
          >
            恢复默认
          </button>
          <button
            onClick={() => handleSave(activeTab)}
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
