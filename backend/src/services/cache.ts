import crypto from 'crypto';
import { TitleTranslationRepository, ArticleTranslationRepository } from '../db/repositories';
import { TitleTranslation, ArticleTranslation } from '../types';

/**
 * 生成提示词的哈希值,用于缓存失效判断
 * @param prompt 提示词字符串
 * @returns SHA256 哈希值
 */
export function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt.trim()).digest('hex');
}

/**
 * 获取标题翻译缓存
 * @param storyId 故事 ID
 * @returns 翻译记录或 null(如果缓存不存在)
 */
export async function getTitleTranslation(
  storyId: number
): Promise<TitleTranslation | null> {
  const repo = new TitleTranslationRepository();
  return await repo.findById(storyId);
}

/**
 * 设置标题翻译缓存
 * @param storyId 故事 ID
 * @param titleEn 英文标题
 * @param titleZh 中文翻译
 * @param promptHash 提示词哈希
 */
export async function setTitleTranslation(
  storyId: number,
  titleEn: string,
  titleZh: string,
  promptHash: string
): Promise<void> {
  const repo = new TitleTranslationRepository();
  await repo.upsert({
    story_id: storyId,
    title_en: titleEn,
    title_zh: titleZh,
    prompt_hash: promptHash
  });
}

/**
 * 批量获取标题翻译
 * @param storyIds 故事 ID 数组
 * @returns Map<storyId, titleZh>
 */
export async function getTitleTranslationsBatch(
  storyIds: number[]
): Promise<Map<number, string>> {
  const repo = new TitleTranslationRepository();
  const result = new Map<number, string>();

  for (const id of storyIds) {
    const cached = await getTitleTranslation(id);
    if (cached) {
      result.set(id, cached.title_zh);
    }
  }

  return result;
}

/**
 * 批量设置标题翻译
 * @param translations { id, titleEn, titleZh }[]
 * @param promptHash 提示词哈希
 */
export async function setTitleTranslationsBatch(
  translations: { id: number; titleEn: string; titleZh: string }[],
  promptHash: string
): Promise<void> {
  for (const item of translations) {
    await setTitleTranslation(item.id, item.titleEn, item.titleZh, promptHash);
  }
}

/**
 * 获取文章翻译缓存
 * @param storyId 故事 ID
 * @returns 文章翻译记录或 null
 */
export async function getArticleTranslation(storyId: number): Promise<ArticleTranslation | null> {
  const repo = new ArticleTranslationRepository();
  return await repo.findById(storyId);
}

/**
 * 设置文章翻译缓存
 * @param translation 文章翻译记录
 */
export async function setArticleTranslation(translation: Omit<ArticleTranslation, 'updated_at'>): Promise<void> {
  const repo = new ArticleTranslationRepository();
  await repo.upsert(translation);
}

/**
 * 更新文章翻译状态
 * @param storyId 故事 ID
 * @param status 新状态
 * @param errorMessage 错误信息(可选)
 */
export async function updateArticleStatus(
  storyId: number,
  status: 'queued' | 'running' | 'done' | 'error',
  errorMessage?: string
): Promise<void> {
  const repo = new ArticleTranslationRepository();
  await repo.updateStatus(storyId, status, errorMessage);
}

/**
 * 获取所有已完成的文章翻译
 * @returns 文章翻译数组
 */
export async function getAllCompletedArticles(): Promise<ArticleTranslation[]> {
  const repo = new ArticleTranslationRepository();
  return await repo.findAllDone();
}

/**
 * 删除文章翻译缓存
 * @param storyId 故事 ID
 */
export async function deleteArticleTranslation(storyId: number): Promise<void> {
  const repo = new ArticleTranslationRepository();
  await repo.delete(storyId);
}

/**
 * 清空所有文章翻译缓存
 */
export async function clearAllArticleTranslations(): Promise<void> {
  const repo = new ArticleTranslationRepository();
  await repo.deleteAll();
}

// invalidateOldTitleTranslations 已移除
// 提示词修改不再删除旧缓存，已有翻译保留使用，新翻译使用新提示词
