import { API_BASE_URL } from '../config';
import {
  ApiResponse,
  ArticleTranslationRecord,
  TranslateArticleResponseData
} from '../types';

const ARTICLES_ENDPOINT = `${API_BASE_URL}/articles`;
const defaultHeaders = {
  'Content-Type': 'application/json'
};

const buildUrl = (path: string = '') => `${ARTICLES_ENDPOINT}${path}`;

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let payload: ApiResponse<T>;

  try {
    payload = text ? JSON.parse(text) : { success: false };
  } catch (error) {
    throw new Error(`Failed to parse API response: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok || !payload.success) {
    const message = payload.error?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (payload.data === undefined) {
    throw new Error('API response missing data field');
  }

  return payload.data;
};

const request = async <T>(path: string, init?: RequestInit) => {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), init);
  } catch (error) {
    throw new Error(
      `Articles API network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return parseResponse<T>(response);
};

export const getArticleCache = async (): Promise<ArticleTranslationRecord[]> => {
  return request<ArticleTranslationRecord[]>('');
};

export const getArticle = async (storyId: number): Promise<ArticleTranslationRecord> => {
  return request<ArticleTranslationRecord>(`/${storyId}`);
};

export const translateArticle = async (
  storyId: number
): Promise<TranslateArticleResponseData> => {
  return request<TranslateArticleResponseData>(`/${storyId}/translate`, {
    method: 'POST',
    headers: defaultHeaders
  });
};

export const deleteArticle = async (storyId: number): Promise<string> => {
  const result = await request<{ message: string }>(`/cache/${storyId}`, {
    method: 'DELETE'
  });
  return result.message;
};

export const clearAllCache = async (): Promise<string> => {
  const result = await request<{ message: string }>('/cache', {
    method: 'DELETE'
  });
  return result.message;
};
