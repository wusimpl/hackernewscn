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

interface ProviderModalProps {
  isOpen: boolean;
  editingProvider: LLMProvider | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    api_base: string;
    model: string;
    api_key: string;
    description?: string;
  }) => Promise<void>;
  onTest: (data: { api_base: string; model: string; api_key: string }) => Promise<void>;
  saving: boolean;
  testing: boolean;
  testResult: { connected: boolean; latency: number; error?: string } | null;
}

const ProviderModal: React.FC<ProviderModalProps> = ({
  isOpen,
  editingProvider,
  onClose,
  onSave,
  onTest,
  saving,
  testing,
  testResult
}) => {
  const [formName, setFormName] = useState('');
  const [formApiBase, setFormApiBase] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formDescription, setFormDescription] = useState('');

  useEffect(() => {
    if (editingProvider) {
      setFormName(editingProvider.name);
      setFormApiBase(editingProvider.api_base);
      setFormModel(editingProvider.model);
      setFormApiKey('');
      setFormDescription(editingProvider.description || '');
    } else {
      setFormName('');
      setFormApiBase('');
      setFormModel('');
      setFormApiKey('');
      setFormDescription('');
    }
  }, [editingProvider, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSave({
      name: formName,
      api_base: formApiBase,
      model: formModel,
      api_key: formApiKey,
      description: formDescription || undefined
    });
  };

  const handleTest = () => {
    // 编辑模式下如果没填新key，需要提示
    if (isEditing && !formApiKey) {
      alert('测试需要输入 API Key');
      return;
    }
    onTest({
      api_base: formApiBase,
      model: formModel,
      api_key: formApiKey
    });
  };

  const isEditing = !!editingProvider;
  const canTest = formApiBase && formModel && (formApiKey || !isEditing);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-[#1a1a1a] border border-[#333] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h3 className="text-[#dcdcdc] font-bold text-lg">
            {isEditing ? `编辑: ${editingProvider.name}` : '添加新 Provider'}
          </h3>
          <button
            onClick={onClose}
            className="text-[#828282] hover:text-[#dcdcdc] text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[#828282] text-sm mb-1">名称 *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="如: Deepseek V3"
              className="w-full bg-[#121212] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
            />
          </div>
          
          <div>
            <label className="block text-[#828282] text-sm mb-1">API Base URL *</label>
            <input
              type="text"
              value={formApiBase}
              onChange={(e) => setFormApiBase(e.target.value)}
              placeholder="如: https://api.deepseek.com/v1"
              className="w-full bg-[#121212] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
            />
          </div>
          
          <div>
            <label className="block text-[#828282] text-sm mb-1">模型名称 *</label>
            <input
              type="text"
              value={formModel}
              onChange={(e) => setFormModel(e.target.value)}
              placeholder="如: deepseek-chat"
              className="w-full bg-[#121212] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
            />
          </div>
          
          <div>
            <label className="block text-[#828282] text-sm mb-1">
              API Key * {isEditing && <span className="text-[#666]">(留空则不修改)</span>}
            </label>
            <input
              type="password"
              value={formApiKey}
              onChange={(e) => setFormApiKey(e.target.value)}
              placeholder={isEditing ? '留空则保持原有 Key' : '输入 API Key'}
              className="w-full bg-[#121212] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
            />
          </div>
          
          <div>
            <label className="block text-[#828282] text-sm mb-1">描述</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="如: 速度与质量平衡"
              className="w-full bg-[#121212] text-[#dcdcdc] border border-[#444] rounded px-3 py-2 focus:outline-none focus:border-[#ff6600]"
            />
          </div>

          {/* 测试连通性 */}
          <div className="pt-2 border-t border-[#333]">
            <div className="flex items-center gap-3">
              <button
                onClick={handleTest}
                disabled={testing || !canTest}
                className="bg-[#242424] text-[#dcdcdc] px-4 py-2 rounded font-medium hover:bg-[#333] transition-colors border border-[#444] disabled:opacity-50 text-sm"
              >
                {testing ? '测试中...' : '🔗 测试连通性'}
              </button>
              {testResult && (
                <span className={`text-sm ${testResult.connected ? 'text-green-500' : 'text-red-500'}`}>
                  {testResult.connected 
                    ? `✓ 连接成功 (${testResult.latency}ms)` 
                    : `✗ ${testResult.error || '连接失败'}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 弹窗底部按钮 */}
        <div className="flex justify-end gap-3 p-4 border-t border-[#333]">
          <button
            onClick={onClose}
            className="bg-[#242424] text-[#dcdcdc] px-6 py-2 rounded font-medium hover:bg-[#333] transition-colors border border-[#444]"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#ff6600] text-black px-6 py-2 rounded font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : (isEditing ? '更新' : '添加')}
          </button>
        </div>
      </div>
    </div>
  );
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const LLMProvidersTab: React.FC<Props> = ({ password, onMessage, onError }) => {
  const [data, setData] = useState<LLMProvidersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; latency: number; error?: string } | null>(null);

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

  const closeModal = () => {
    setModalOpen(false);
    setEditingProvider(null);
    setTestResult(null);
  };

  const openAddModal = () => {
    setEditingProvider(null);
    setTestResult(null);
    setModalOpen(true);
  };

  const openEditModal = (provider: LLMProvider) => {
    setEditingProvider(provider);
    setTestResult(null);
    setModalOpen(true);
  };

  const handleSave = async (formData: {
    name: string;
    api_base: string;
    model: string;
    api_key: string;
    description?: string;
  }) => {
    if (editingProvider) {
      await handleUpdate(formData);
    } else {
      await handleAdd(formData);
    }
  };

  const handleTest = async (testData: { api_base: string; model: string; api_key: string }) => {
    if (!testData.api_base || !testData.model || !testData.api_key) {
      onError('请填写 API Base、模型名称和 API Key');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`${API_BASE}/llm-providers/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`
        },
        body: JSON.stringify(testData)
      });

      if (res.ok) {
        const result = await res.json();
        setTestResult(result.data);
      } else {
        const result = await res.json();
        onError(result.error?.message || '测试请求失败');
      }
    } catch {
      onError('测试请求失败');
    } finally {
      setTesting(false);
    }
  };

  const handleAdd = async (formData: {
    name: string;
    api_base: string;
    model: string;
    api_key: string;
    description?: string;
  }) => {
    if (!formData.name || !formData.api_base || !formData.model || !formData.api_key) {
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
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        onMessage('Provider 已添加');
        closeModal();
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

  const handleUpdate = async (formData: {
    name: string;
    api_base: string;
    model: string;
    api_key: string;
    description?: string;
  }) => {
    if (!editingProvider) return;

    const updates: Record<string, string> = {};
    if (formData.name) updates.name = formData.name;
    if (formData.api_base) updates.api_base = formData.api_base;
    if (formData.model) updates.model = formData.model;
    if (formData.api_key) updates.api_key = formData.api_key;
    if (formData.description !== undefined) updates.description = formData.description || '';

    if (Object.keys(updates).length === 0) {
      onError('请至少修改一个字段');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/llm-providers/${encodeURIComponent(editingProvider.name)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${password}`
        },
        body: JSON.stringify(updates)
      });

      if (res.ok) {
        onMessage('Provider 已更新');
        closeModal();
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

  if (loading) {
    return <div className="text-[#828282]">加载中...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[#dcdcdc] text-xl font-bold">大模型配置</h2>
        <button
          onClick={openAddModal}
          className="bg-[#ff6600] text-black px-4 py-2 rounded font-bold hover:bg-[#ff8533] transition-colors text-sm"
        >
          + 添加 Provider
        </button>
      </div>

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
                    onClick={() => openEditModal(provider)}
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

      {/* 添加/编辑弹窗 */}
      <ProviderModal
        isOpen={modalOpen}
        editingProvider={editingProvider}
        onClose={closeModal}
        onSave={handleSave}
        onTest={handleTest}
        saving={saving}
        testing={testing}
        testResult={testResult}
      />
    </div>
  );
};
