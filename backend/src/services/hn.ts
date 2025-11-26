import fetch, { Response } from 'node-fetch';
import { StoryRepository } from '../db/repositories';
import { Story, StoryRecord } from '../types';

const BASE_URL = 'https://hacker-news.firebaseio.com/v0';

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 初始延迟 1 秒
  maxDelay: 5000,  // 最大延迟 5 秒
};

/**
 * 延迟函数
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 带重试的 fetch 请求
 */
const fetchWithRetry = async (url: string, retries = RETRY_CONFIG.maxRetries): Promise<Response | null> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      // 非网络错误，不重试
      if (response.status >= 400 && response.status < 500) {
        console.warn(`[HN Service] Request failed with status ${response.status}, not retrying`);
        return null;
      }
    } catch (error: any) {
      const isRetryable = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code);
      
      if (attempt < retries && isRetryable) {
        const delayMs = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelay
        );
        console.log(`[HN Service] Retry ${attempt + 1}/${retries} for ${url} after ${delayMs}ms (${error.code})`);
        await delay(delayMs);
        continue;
      }
      
      if (attempt === retries) {
        console.error(`[HN Service] All ${retries} retries failed for ${url}:`, error.message);
      }
      return null;
    }
  }
  return null;
};

// HN API 返回的原始数据结构
interface HnStoryRaw {
  id: number;
  title: string;
  by: string;
  score: number;
  time: number;
  descendants?: number;
  url?: string;
  type: string;
}

/**
 * 获取 HackerNews Top Stories 的 ID 列表
 * @returns 前500个热门故事的 ID 数组
 */
export const fetchTopStoryIds = async (): Promise<number[]> => {
  try {
    const response = await fetchWithRetry(`${BASE_URL}/topstories.json`);
    if (!response) {
      return [];
    }
    const ids = await response.json() as number[];
    return ids;
  } catch (error) {
    console.error('[HN Service] Error fetching top story IDs:', error);
    return [];
  }
};

/**
 * 获取单个故事的详细信息
 * @param id 故事 ID
 * @returns 故事详情或 null
 */
export const fetchStoryDetails = async (id: number): Promise<HnStoryRaw | null> => {
  try {
    const response = await fetchWithRetry(`${BASE_URL}/item/${id}.json`);
    if (!response) {
      return null;
    }
    const story = await response.json() as HnStoryRaw;
    return story;
  } catch (error) {
    console.error(`[HN Service] Error fetching story ${id}:`, error);
    return null;
  }
};

/**
 * 批量获取故事详情
 * @param ids 故事 ID 数组
 * @returns 过滤后的故事数组(仅包含有效的 story 类型)
 */
export const fetchStoriesBatch = async (ids: number[]): Promise<HnStoryRaw[]> => {
  const promises = ids.map(id => fetchStoryDetails(id));
  const results = await Promise.all(promises);

  // 过滤掉 null 值和非 story 类型(如 job, poll)
  return results.filter((item): item is HnStoryRaw =>
    item !== null && item.type === 'story' && !!item.title
  );
};

/**
 * 带 HN 排名的故事
 */
export interface StoryWithRank extends Story {
  hnRank: number;
}

/**
 * 从 HN API 获取故事数据
 * 总是从 API 获取最新数据，让 scheduler 决定哪些需要翻译
 * @param ids 故事 ID 数组
 * @param startRank 起始排名位置 (用于分页时保持正确的 hnRank)
 * @returns 故事数组（带 hnRank）
 */
export const fetchAndCacheStories = async (ids: number[], startRank: number = 0): Promise<StoryWithRank[]> => {
  console.log(`[HN Service] Fetching ${ids.length} stories from HN API, startRank=${startRank}`);
  const stories = await fetchStoriesBatch(ids);
  console.log(`[HN Service] Fetched ${stories.length} stories from API`);

  // 创建 id -> 原始位置的映射
  const idOrder = new Map(ids.map((id, index) => [id, index]));

  const result: StoryWithRank[] = stories.map(s => ({
    id: s.id,
    title: s.title,
    by: s.by,
    score: s.score,
    time: s.time,
    url: s.url,
    descendants: s.descendants || 0,
    hnRank: startRank + (idOrder.get(s.id) ?? 0)
  }));

  // 按照原始 HN 排名顺序排序
  result.sort((a, b) => a.hnRank - b.hnRank);

  return result;
};

/**
 * 保存故事到数据库（翻译完成后调用）
 * @param story 故事数据
 */
export const saveStoryToDatabase = async (story: Story): Promise<void> => {
  const storyRepo = new StoryRepository();
  await storyRepo.upsert({
    story_id: story.id,
    title_en: story.title,
    by: story.by,
    score: story.score,
    time: story.time,
    url: story.url,
    descendants: story.descendants || 0
  });
};

/**
 * 刷新热门故事列表(获取最新的前30条)
 * @param limit 要获取的故事数量,默认30
 * @returns 故事数组（带 hnRank）
 */
export const refreshTopStories = async (limit: number = 30): Promise<StoryWithRank[]> => {
  const topIds = await fetchTopStoryIds();
  const targetIds = topIds.slice(0, limit);
  return fetchAndCacheStories(targetIds, 0);
};

/**
 * 加载更多故事(分页)
 * @param cursor HN 排名起始位置 (0-based)
 * @param limit 要加载的数量
 * @returns 故事数组（带 hnRank）
 */
export const loadMoreStories = async (cursor: number, limit: number): Promise<StoryWithRank[]> => {
  const topIds = await fetchTopStoryIds();
  const targetIds = topIds.slice(cursor, cursor + limit);
  return fetchAndCacheStories(targetIds, cursor);
};
