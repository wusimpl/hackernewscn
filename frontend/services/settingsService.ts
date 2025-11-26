import { API_BASE_URL } from '../config';
import {
  ApiResponse,
  PromptResponseData,
  PromptUpdateResponseData
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
