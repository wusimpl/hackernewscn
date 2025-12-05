import fs from 'fs';
import path from 'path';
import { LLMConfig, LLMProvider } from '../types';

const CONFIG_PATH = path.join(__dirname, '../../data/llm-config.json');

// 默认配置
const DEFAULT_CONFIG: LLMConfig = {
  default_provider: '',
  providers: []
};

/**
 * 读取 LLM 配置
 */
export function getLLMConfig(): LLMConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      saveLLMConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(content) as LLMConfig;
  } catch (error) {
    console.error('[LLM Config] 读取配置失败:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存 LLM 配置
 */
export function saveLLMConfig(config: LLMConfig): void {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[LLM Config] 配置已保存');
  } catch (error) {
    console.error('[LLM Config] 保存配置失败:', error);
    throw error;
  }
}

/**
 * 获取当前使用的 Provider
 */
export function getCurrentProvider(): LLMProvider | null {
  const config = getLLMConfig();
  if (!config.default_provider || config.providers.length === 0) {
    return null;
  }
  return config.providers.find(p => p.name === config.default_provider) || config.providers[0] || null;
}

/**
 * 设置默认 Provider
 */
export function setDefaultProvider(name: string): boolean {
  const config = getLLMConfig();
  const provider = config.providers.find(p => p.name === name);
  if (!provider) {
    return false;
  }
  config.default_provider = name;
  saveLLMConfig(config);
  return true;
}

/**
 * 添加 Provider
 */
export function addProvider(provider: LLMProvider): void {
  const config = getLLMConfig();
  // 检查是否已存在同名 provider
  const existingIndex = config.providers.findIndex(p => p.name === provider.name);
  if (existingIndex >= 0) {
    throw new Error(`Provider "${provider.name}" 已存在`);
  }
  config.providers.push(provider);
  // 如果是第一个 provider，设为默认
  if (config.providers.length === 1) {
    config.default_provider = provider.name;
  }
  saveLLMConfig(config);
}

/**
 * 更新 Provider
 */
export function updateProvider(name: string, updates: Partial<LLMProvider>): boolean {
  const config = getLLMConfig();
  const index = config.providers.findIndex(p => p.name === name);
  if (index < 0) {
    return false;
  }
  
  const oldName = config.providers[index].name;
  config.providers[index] = { ...config.providers[index], ...updates };
  
  // 如果更新了名称，同步更新 default_provider
  if (updates.name && updates.name !== oldName && config.default_provider === oldName) {
    config.default_provider = updates.name;
  }
  
  saveLLMConfig(config);
  return true;
}

/**
 * 删除 Provider
 */
export function deleteProvider(name: string): boolean {
  const config = getLLMConfig();
  const index = config.providers.findIndex(p => p.name === name);
  if (index < 0) {
    return false;
  }
  
  config.providers.splice(index, 1);
  
  // 如果删除的是默认 provider，重新设置默认
  if (config.default_provider === name) {
    config.default_provider = config.providers[0]?.name || '';
  }
  
  saveLLMConfig(config);
  return true;
}

/**
 * 获取所有 Providers（隐藏 API Key）
 */
export function getProvidersForDisplay(): (Omit<LLMProvider, 'api_key'> & { api_key_masked: string })[] {
  const config = getLLMConfig();
  return config.providers.map(p => ({
    name: p.name,
    api_base: p.api_base,
    model: p.model,
    description: p.description,
    is_thinking_model: p.is_thinking_model,
    api_key_masked: maskApiKey(p.api_key)
  }));
}

/**
 * 遮蔽 API Key
 */
function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
