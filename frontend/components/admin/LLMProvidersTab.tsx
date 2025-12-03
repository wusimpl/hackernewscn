import React, { useState, useEffect } from 'react';

interface LLMProvider {
  name: string;
  api_base: string;
  model: string;
  api_key_masked: string;
  description?: string;
}

interface LLMProvidersData {
  default_provider: string;
  providers: LLMProvider[];
}

interface Props {
  password: string;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const LLMProvidersTab: React.FC<Props> = ({ password, onMessage, onError }) => {
  const [data, setData] = useState<LLMProvidersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  
  // 表单状态
  const [formName, setFormName] = useState('');
  const [formApiBase, setFormApiBase] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const res = await fetch(`${API_BASE}/llm-providers`, {
        headers: { Authorization: `Bearer ${password}` }
      });
      if (res.ok) {
        const result = await res.json();
        setData(result.data);
      } else {
        onError('获取配置失败');
      }
    } catch {
      onError('请求失败');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormApiBase('');
    setFormModel('');
    setFormApiKey('');
    setFormDescription('');
    setShowAddForm(false);
    setEditingProvider(null);
  };

  const handleAdd = async () => {
    if (!formName || !formApiBase || !formModel || !formApiKey) {
      onError('请填写所有必填字段');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/llm-providers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`
        },
        body: JSON.stringify({
          name: formName,
          api_base: formApiBase,
          model: formModel,
          api_key: formApiKey,
          description: formDescription || undefined
        })
      });

      if (res.ok) {
        onMessage('Provider 已添加');
        resetForm();
        fetchProviders();
      } else {
        const result = await res.json();
        onError(result.error?.message || '添加失败');
      }
    } catch {
      onError('请求失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingProvider) return;

    const updates: Record<string, string> = {};
    if (formName) updates.name = formName;
    if (formApiBase) updates.api_base = formApiBase;
    if (formModel) updates.model = formModel;
    if (formApiKey) updates.api_key = formApiKey;
    if (formDescription !== undefined) updates.description = formDescription;

    if (Object.keys(updates).length === 0) {
      onError('请至少修改一个字段');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/llm-providers/${encodeURIComponent(editingProvider)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`
        },
        body: JSON.stringify(updates)
      });

      if (res.ok) {
        onMessage('Provider 已更新');
        resetForm();
        fetchProviders();
      } else {
        const result = await res.json();
        onError(result.error?.message || '更新失败');
      }
    } catch {
      onError('请求失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除 "${name}"？`)) return;

    try {
      const res = await fetch(`${API_BASE}/llm-providers/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${password}` }
      });

      if (res.ok) {
        onMessage('Provider 已删除');
        fetchProviders();
      } else {
        const result = await res.json();
        onError(result.error?.message || '删除失败');
      }
    } catch {
      onError('请求失败');
    }
  };

  const handleSetDefault = async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/llm-providers/default`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`
        },
        body: JSON.stringify({ name })
      });

      if (res.ok) {
        onMessage(`已将 "${name}" 设为默认`);
        fetchProviders();
      } else {
        const result = await res.json();
        onError(result.error?.message || '设置失败');
      }
    } catch {
      onError('请求失败');
    }
  };

  const startEdit = (provider: LLMProvider) => {
    setEditingProvider(provider.name);
    setFormName(provider.name);
    setFormApiBase(provider.api_base);
    setFormModel(provider.model);
    setFormApiKey('');
    setFormDescription(provider.description || '');
    setShowAddForm(false);
  };

  if (loading) {
    return <div className="text-[#828282]">加载中...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[#dcdcdc] text-xl font-bold">大模型配置</h2>
        <button
          onClick={() => { resetForm(); setShowAddForm(true); }}
          className="bg-[#ff6600] text-black px-4 py-2 rounded font-bold hover:bg-[#ff8533] transition-colors text-sm"
        >
          + 添加 Provider
        </button>
      </div>

      {/* 添加/编辑表单 */}
      {(showAddForm || editingProvider) && (
        <div className="bg-[#121212] border border-[#333] rounded-lg p-6 mb-6">
          <h3 className="text-[#dcdcdc] font-bold mb-4">
            {editingProvider ? `编辑: ${editingProvider}` : '添加新 Provider'}
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[#828282] text-sm mb-1">名称 *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="如: Deepseek V3"
                className="w-full bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
              />
            </div>
            
            <div>
              <label className="block text-[#828282] text-sm mb-1">API Base URL *</label>
              <input
                type="text"
                value={formApiBase}
                onChange={(e) => setFormApiBase(e.target.value)}
                placeholder="如: https://api.deepseek.com/v1"
                className="w-full bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
              />
            </div>
            
            <div>
              <label className="block text-[#828282] text-sm mb-1">模型名称 *</label>
              <input
                type="text"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                placeholder="如: deepseek-chat"
                className="w-full bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
              />
            </div>
            
            <div>
              <label className="block text-[#828282] text-sm mb-1">
                API Key * {editingProvider && <span className="text-[#666]">(留空则不修改)</span>}
              </label>
              <input
                type="password"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                placeholder={editingProvider ? '留空则保持原有 Key' : '输入 API Key'}
                className="w-full bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
              />
            </div>
            
            <div>
              <label className="block text-[#828282] text-sm mb-1">描述</label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="如: 速度与质量平衡"
                className="w-full bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={editingProvider ? handleUpdate : handleAdd}
              disabled={saving}
              className="bg-[#ff6600] text-black px-6 py-2 rounded font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : (editingProvider ? '更新' : '添加')}
            </button>
            <button
              onClick={resetForm}
              className="bg-[#1a1a1a] text-[#dcdcdc] px-6 py-2 rounded font-medium hover:bg-[#242424] transition-colors border border-[#444]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Provider 列表 */}
      {data && data.providers.length > 0 ? (
        <div className="space-y-4">
          {data.providers.map((provider) => (
            <div
              key={provider.name}
              className={`bg-[#121212] border rounded-lg p-4 ${
                provider.name === data.default_provider
                  ? 'border-[#ff6600]'
                  : 'border-[#333]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[#dcdcdc] font-bold">{provider.name}</span>
                    {provider.name === data.default_provider && (
                      <span className="bg-[#ff6600] text-black text-xs px-2 py-0.5 rounded">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="text-[#828282] text-sm space-y-1">
                    <div>模型: <span className="text-[#aaa]">{provider.model}</span></div>
                    <div>API: <span className="text-[#aaa]">{provider.api_base}</span></div>
                    <div>Key: <span className="text-[#aaa]">{provider.api_key_masked}</span></div>
                    {provider.description && (
                      <div>描述: <span className="text-[#aaa]">{provider.description}</span></div>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 ml-4">
                  {provider.name !== data.default_provider && (
                    <button
                      onClick={() => handleSetDefault(provider.name)}
                      className="text-[#ff6600] hover:text-[#ff8533] text-sm"
                    >
                      设为默认
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(provider)}
                    className="text-[#828282] hover:text-[#dcdcdc] text-sm"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(provider.name)}
                    className="text-red-500 hover:text-red-400 text-sm"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#121212] border border-[#333] rounded-lg p-8 text-center">
          <p className="text-[#828282]">暂无配置，请添加 Provider</p>
        </div>
      )}
    </div>
  );
};
