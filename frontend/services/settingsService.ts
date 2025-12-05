import { API_BASE_URL } from '../config';
import {
  ApiResponse,
  PromptResponseData,
  PromptUpdateResponseData,
  PromptsResponseData,
  PromptsUpdateResponseData,
  PromptType
} from '../types';

const SETTINGS_ENDPOINT = `${API_BASE_URL}/settings`;
const JSON_HEADERS = {
  'Content-Type': 'application/json'
};

const buildUrl = (path: string) => `${SETTINGS_ENDPOINT}${path}`;

const parseResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({ success: false } as ApiResponse<T>));

  if (!response.ok || !payload.success) {
    const message = payload.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (payload.data === undefined) {
    throw new Error('API response missing data field');
  }

  return payload.data;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), init);
  } catch (error) {
    throw new Error(
      `Settings API network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return parseResponse<T>(response);
};

// ========== 新的多提示词 API ==========

/**
 * 获取所有提示词配置
 */
export const getPrompts = async (): Promise<PromptsResponseData> => {
  return request<PromptsResponseData>('/prompts');
};

/**
 * 更新多个提示词
 */
export const updatePrompts = async (
  prompts: Partial<{ article: { prompt: string }; tldr: { prompt: string }; comment: { prompt: string } }>,
  adminToken?: string
): Promise<PromptsUpdateResponseData> => {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  return request<PromptsUpdateResponseData>('/prompts', {
    method: 'PUT',
    headers,
    body: JSON.stringify(prompts)
  });
};

// ========== 向后兼容的单提示词 API ==========

export const getPrompt = async (): Promise<PromptResponseData> => {
  return request<PromptResponseData>('/prompt');
};

export const updatePrompt = async (
  prompt: string,
  adminToken?: string
): Promise<PromptUpdateResponseData> => {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  return request<PromptUpdateResponseData>('/prompt', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ prompt })
  });
};
