import { API_BASE_URL } from '../config';
import { StoriesApiResponse, Story, StoriesResponseData } from '../types';

const STORIES_ENDPOINT = `${API_BASE_URL}/stories`;
const DEFAULT_LIMIT = 20;

export interface FetchStoriesParams {
  cursor?: number;
  limit?: number;
}

export interface FetchStoriesResult {
  stories: Story[];
  lastUpdatedAt: number | null;
  untranslatedCount?: number;
}

const buildQuery = (params: FetchStoriesParams) => {
  const query = new URLSearchParams();
  if (typeof params.cursor === 'number') {
    query.set('cursor', params.cursor.toString());
  }
  if (typeof params.limit === 'number') {
    query.set('limit', params.limit.toString());
  }
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

const requestStories = async (params: FetchStoriesParams): Promise<StoriesResponseData> => {
  const url = `${STORIES_ENDPOINT}${buildQuery(params)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Stories API network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  if (!response.ok) {
    throw new Error(`Stories API request failed: ${response.status}`);
  }

  const payload = await response.json() as StoriesApiResponse;
  if (!payload.success || !payload.data) {
    const message = payload.error?.message || 'Stories API returned an empty response';
    throw new Error(message);
  }

  return payload.data;
};

/**
 * Fetches stories from the backend API with cursor/limit controls.
 * Returns both stories and lastUpdatedAt timestamp from backend.
 */
export const fetchStories = async (
  params: FetchStoriesParams = {}
): Promise<FetchStoriesResult> => {
  const { cursor = 0, limit = DEFAULT_LIMIT } = params;
  const data = await requestStories({ cursor, limit });
  return {
    stories: data.stories,
    lastUpdatedAt: data.lastUpdatedAt,
    untranslatedCount: data.untranslatedCount
  };
};

export interface FetchMoreStoriesResult {
  stories: Story[];
  untranslatedCount: number;
}

/**
 * Fetches more stories for pagination (load more).
 * Returns stories array and untranslated count for notification.
 */
export const fetchMoreStories = async (
  cursor: number,
  limit: number = DEFAULT_LIMIT
): Promise<FetchMoreStoriesResult> => {
  const data = await requestStories({ cursor, limit });
  return {
    stories: data.stories,
    untranslatedCount: data.untranslatedCount || 0
  };
};
