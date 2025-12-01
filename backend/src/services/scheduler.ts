import fetch from 'node-fetch';
import { config, reloadCommentRefreshConfig } from '../config';
import { refreshTopStories, saveStoryToDatabase, fetchStoryComments, fetchStoryDetails } from './hn';
import { translateTitlesBatch, translateArticle, translateCommentsBatch, generateTLDR, DEFAULT_PROMPT } from './llm';
import { getQueueService } from './queue';
import { hashPrompt, setArticleTranslation, getArticleTranslation } from './cache';
import { TitleTranslationRepository, SettingsRepository, ArticleTranslationRepository, CommentRepository, CommentTranslationRepository, StoryRepository } from '../db/repositories';
import { Story, CommentRecord } from '../types';

/**
 * 获取当前调度器配置（直接从 config 读取，config 从 .env 加载）
 */
function getSchedulerConfig(): { interval: number; storyLimit: number } {
  return {
    interval: config.scheduler.interval,
    storyLimit: config.scheduler.storyLimit,
  };
}

/**
 * Scheduler status interface
 */
export interface SchedulerStatus {
  isRunning: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  storiesFetched: number;
  titlesTranslated: number;
  currentInterval?: number;
  currentStoryLimit?: number;
}

/**
 * Scheduler Service
 * Responsible for periodically fetching HN stories and translating titles
 */
export class SchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastRunAt: number | null = null;
  private nextRunAt: number | null = null;
  private storiesFetched: number = 0;
  private titlesTranslated: number = 0;

  private titleTranslationRepo: TitleTranslationRepository;
  private settingsRepo: SettingsRepository;
  private articleTranslationRepo: ArticleTranslationRepository;
  private commentRepo: CommentRepository;
  private commentTranslationRepo: CommentTranslationRepository;

  constructor() {
    this.titleTranslationRepo = new TitleTranslationRepository();
    this.settingsRepo = new SettingsRepository();
    this.articleTranslationRepo = new ArticleTranslationRepository();
    this.commentRepo = new CommentRepository();
    this.commentTranslationRepo = new CommentTranslationRepository();
  }

  /**
   * Start the scheduler with periodic execution
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      console.log('[Scheduler] Already running');
      return;
    }

    const schedulerConfig = getSchedulerConfig();
    console.log(`[Scheduler] Starting with interval: ${schedulerConfig.interval / 1000}s, storyLimit: ${schedulerConfig.storyLimit}`);

    // Run immediately on start
    this.runOnce().catch(err => {
      console.error('[Scheduler] Initial run failed:', err);
    });

    // 计算下次执行时间（固定时间点）
    this.nextRunAt = Date.now() + schedulerConfig.interval;

    // Set up periodic execution
    this.intervalId = setInterval(() => {
      this.runOnce().catch(err => {
        console.error('[Scheduler] Scheduled run failed:', err);
      });
      // 每次执行后更新下次执行时间
      this.nextRunAt = Date.now() + schedulerConfig.interval;
    }, schedulerConfig.interval);

    this.isRunning = true;
    console.log('[Scheduler] Started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      this.nextRunAt = null;
      console.log('[Scheduler] Stopped');
    }
  }

  /**
   * Restart the scheduler with new configuration
   */
  restart(): void {
    console.log('[Scheduler] Restarting with new configuration...');
    this.stop();
    this.start();
  }


  /**
   * Run a single fetch and translate cycle
   */
  async runOnce(): Promise<void> {
    console.log('[Scheduler] Starting fetch and translate cycle...');
    const startTime = Date.now();

    try {
      // Step 1: Fetch top stories from HN
      const schedulerConfig = getSchedulerConfig();
      const stories = await refreshTopStories(schedulerConfig.storyLimit);
      this.storiesFetched = stories.length;
      console.log(`[Scheduler] Fetched ${stories.length} stories`);

      if (stories.length === 0) {
        console.log('[Scheduler] No stories to process');
        this.lastRunAt = Date.now();
        return;
      }

      // Step 2: Get current prompt and compute hash
      const customPrompt = await this.settingsRepo.get('custom_prompt') || DEFAULT_PROMPT;
      const promptHash = hashPrompt(customPrompt);
      console.log(`[Scheduler] 使用提示词哈希: ${promptHash.substring(0, 8)}...`);

      // Step 3: Filter stories that need translation
      const storiesToTranslate = await this.filterStoriesNeedingTranslation(stories, promptHash);
      console.log(`[Scheduler] ${storiesToTranslate.length} stories need translation`);

      if (storiesToTranslate.length === 0) {
        console.log('[Scheduler] All stories already translated');
        this.lastRunAt = Date.now();
        return;
      }

      // Step 4: 分离需要翻译标题的和只需要翻译文章的故事
      const storiesNeedingTitleTranslation: Story[] = [];
      const storiesOnlyNeedingArticle: Story[] = [];
      
      const existingTitleTranslations = await this.titleTranslationRepo.findByIds(storiesToTranslate.map(s => s.id));
      const titleTranslationMap = new Map(
        existingTitleTranslations
          .filter(t => t.prompt_hash === promptHash)
          .map(t => [t.story_id, t])
      );
      
      for (const story of storiesToTranslate) {
        if (titleTranslationMap.has(story.id)) {
          // 标题已翻译，只需要翻译文章
          storiesOnlyNeedingArticle.push(story);
        } else {
          // 需要翻译标题
          storiesNeedingTitleTranslation.push(story);
        }
      }
      
      console.log(`[Scheduler] ${storiesNeedingTitleTranslation.length} stories need title translation`);
      console.log(`[Scheduler] ${storiesOnlyNeedingArticle.length} stories only need article translation`);

      // Step 5: 交错翻译模式 - 每批5条标题 + 对应文章，减少中途出错的损失
      const BATCH_SIZE = 5;
      this.titlesTranslated = 0;
      
      // 先处理只需要翻译文章的故事（标题已翻译）
      const storiesOnlyNeedingArticleWithUrl = storiesOnlyNeedingArticle.filter(s => s.url);
      if (storiesOnlyNeedingArticleWithUrl.length > 0) {
        console.log(`[Scheduler] 先处理 ${storiesOnlyNeedingArticleWithUrl.length} 篇只需翻译文章的故事`);
        await this.translateArticleContents(storiesOnlyNeedingArticleWithUrl, customPrompt);
      }
      
      // 交错处理需要翻译标题的故事：每5条标题 → 对应文章
      for (let i = 0; i < storiesNeedingTitleTranslation.length; i += BATCH_SIZE) {
        const batch = storiesNeedingTitleTranslation.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(storiesNeedingTitleTranslation.length / BATCH_SIZE);
        
        console.log(`[Scheduler] === 第 ${batchNum}/${totalBatches} 批：翻译 ${batch.length} 条标题 ===`);
        
        // 翻译这批标题
        const { translatedCount, translatedStories } = await this.translateAndSaveTitles(batch, customPrompt, promptHash);
        this.titlesTranslated += translatedCount;
        
        // 立即翻译这批故事的文章
        const storiesWithUrl = translatedStories.filter(s => s.url);
        if (storiesWithUrl.length > 0) {
          console.log(`[Scheduler] === 第 ${batchNum}/${totalBatches} 批：翻译 ${storiesWithUrl.length} 篇文章 ===`);
          await this.translateArticleContents(storiesWithUrl, customPrompt);
        }
        
        console.log(`[Scheduler] === 第 ${batchNum}/${totalBatches} 批完成 ===`);
      }

      this.lastRunAt = Date.now();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Scheduler] Cycle completed in ${duration}s. Translated ${this.titlesTranslated} titles.`);

    } catch (error) {
      console.error('[Scheduler] Error during fetch and translate cycle:', error);
      throw error;
    }
  }

  /**
   * Get current scheduler status
   */
  async getStatus(): Promise<SchedulerStatus> {
    // 从数据库获取实际的标题翻译总数
    const titlesCount = await this.titleTranslationRepo.count();
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      storiesFetched: this.storiesFetched,
      titlesTranslated: titlesCount,
    };
  }

  /**
   * Get current scheduler status with config
   */
  async getStatusWithConfig(): Promise<SchedulerStatus> {
    const schedulerConfig = getSchedulerConfig();
    // 从数据库获取实际的标题翻译总数
    const titlesCount = await this.titleTranslationRepo.count();
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      storiesFetched: this.storiesFetched,
      titlesTranslated: titlesCount,
      currentInterval: schedulerConfig.interval,
      currentStoryLimit: schedulerConfig.storyLimit,
    };
  }



  /**
   * Filter stories that need translation (title or article not translated)
   * Requirements: 1.3, 1.4 - Check existing translations before queueing
   * 
   * 一个故事被认为"完全翻译"需要满足：
   * 1. 标题翻译存在且 prompt_hash 匹配
   * 2. 如果有 URL，文章翻译也必须完成 (status === 'done')
   */
  private async filterStoriesNeedingTranslation(stories: Story[], promptHash: string): Promise<Story[]> {
    const storyIds = stories.map(s => s.id);
    const existingTranslations = await this.titleTranslationRepo.findByIds(storyIds);

    // Create a map of story_id -> translation for quick lookup
    const translationMap = new Map(
      existingTranslations.map(t => [t.story_id, t])
    );

    const needTranslation: Story[] = [];

    for (const story of stories) {
      const titleTranslation = translationMap.get(story.id);
      
      // 1. 没有标题翻译
      if (!titleTranslation) {
        console.log(`[Scheduler] Story ${story.id} needs translation: no title translation`);
        needTranslation.push(story);
        continue;
      }
      
      // 2. 标题翻译的 prompt_hash 不匹配
      if (titleTranslation.prompt_hash !== promptHash) {
        console.log(`[Scheduler] Story ${story.id} needs translation: prompt hash changed`);
        needTranslation.push(story);
        continue;
      }
      
      // 3. 如果有 URL，检查文章翻译是否完成
      if (story.url) {
        const articleTranslation = await this.articleTranslationRepo.findById(story.id);
        // 跳过已被标记为 blocked 的文章（因法律原因无法获取）
        if (articleTranslation?.status === 'blocked') {
          console.log(`[Scheduler] Story ${story.id} is blocked, skipping`);
          continue;
        }
        if (!articleTranslation || articleTranslation.status !== 'done') {
          console.log(`[Scheduler] Story ${story.id} needs translation: article not translated (status: ${articleTranslation?.status || 'none'})`);
          needTranslation.push(story);
          continue;
        }
      }
      
      // 完全翻译完成，不需要处理
    }

    return needTranslation;
  }

  /**
   * Translate titles and save to database
   * Requirements: 1.5 - Store result with prompt hash
   * 注意：只保存标题翻译，故事本身要等文章翻译完成后才保存
   */
  private async translateAndSaveTitles(
    stories: Story[],
    customPrompt: string,
    promptHash: string
  ): Promise<{ translatedCount: number; translatedStories: Story[] }> {
    // Prepare items for batch translation
    const items = stories.map(s => ({
      id: s.id,
      title: s.title,
    }));

    // Call LLM service for batch translation
    const results = await translateTitlesBatch(items, customPrompt);

    if (results.length === 0) {
      console.log('[Scheduler] No translations returned from LLM');
      return { translatedCount: 0, translatedStories: [] };
    }

    // Create a map of id -> translatedTitle for quick lookup
    const resultMap = new Map(
      results.map(r => [r.id, r.translatedTitle])
    );

    // 筛选出成功翻译的故事
    const translatedStories = stories.filter(s => resultMap.has(s.id));

    // Save translations to database (只保存标题翻译，不保存故事本身)
    const translations = translatedStories.map(s => ({
      story_id: s.id,
      title_en: s.title,
      title_zh: resultMap.get(s.id)!,
      prompt_hash: promptHash,
    }));

    if (translations.length > 0) {
      await this.titleTranslationRepo.upsertMany(translations);
      console.log(`[Scheduler] Saved ${translations.length} title translations to database`);
    }

    // 对于没有 URL 的故事（如 Ask HN），标题翻译完成后就可以保存到数据库
    const storiesWithoutUrl = translatedStories.filter(s => !s.url);
    for (const story of storiesWithoutUrl) {
      await saveStoryToDatabase(story);
      console.log(`[Scheduler] Story ${story.id} (no URL) saved after title translation`);
    }

    return { translatedCount: translations.length, translatedStories };
  }

  /**
   * Translate article contents for stories that have URLs
   * 标题和内容都翻译完成后才入库
   */
  private async translateArticleContents(stories: Story[], customPrompt: string): Promise<void> {
    if (stories.length === 0) {
      console.log('[Scheduler] No stories with URLs to translate');
      return;
    }

    // Check which stories already have translated articles
    const storiesNeedingTranslation: Story[] = [];
    for (const story of stories) {
      const existing = await getArticleTranslation(story.id);
      if (!existing || existing.status !== 'done') {
        storiesNeedingTranslation.push(story);
      }
    }

    if (storiesNeedingTranslation.length === 0) {
      console.log('[Scheduler] All articles already translated');
      return;
    }

    console.log(`[Scheduler] ${storiesNeedingTranslation.length} articles need translation`);

    // 获取并发数配置
    const concurrency = config.articleTranslation.concurrency;
    console.log(`[Scheduler] 使用并发数: ${concurrency}`);

    // 分批并发翻译
    for (let i = 0; i < storiesNeedingTranslation.length; i += concurrency) {
      const batch = storiesNeedingTranslation.slice(i, i + concurrency);
      console.log(`[Scheduler] 开始翻译第 ${Math.floor(i / concurrency) + 1} 批, 共 ${batch.length} 篇文章`);
      
      // 并发翻译这一批文章
      const results = await Promise.allSettled(
        batch.map(story => this.translateSingleArticle(story, customPrompt))
      );

      // 统计结果
      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;
      console.log(`[Scheduler] 第 ${Math.floor(i / concurrency) + 1} 批完成: 成功 ${succeeded}, 失败 ${failed}`);
    }
  }

  /**
   * 翻译单篇文章，标题和内容都翻译完成后才入库
   * @returns true if successful, false otherwise
   */
  private async translateSingleArticle(story: Story, customPrompt: string): Promise<boolean> {
    try {
      console.log(`[Scheduler] Translating article: ${story.id} - ${story.title}`);
      
      // Get title translation for snapshot
      const titleRepo = new TitleTranslationRepository();
      const titleTranslation = await titleRepo.getTitleTranslation(story.id);
      
      // 确保标题已翻译
      if (!titleTranslation?.title_zh) {
        console.log(`[Scheduler] Article ${story.id} title not translated yet, skipping`);
        return false;
      }
      
      const titleSnapshot = titleTranslation.title_zh;

      // Fetch article content using Jina AI Reader
      const jinaUrl = `https://r.jina.ai/${story.url}`;
      const response = await fetch(jinaUrl);

      if (!response.ok) {
        // 451: Unavailable For Legal Reasons - 标记为 blocked，永久跳过
        if (response.status === 451) {
          console.log(`[Scheduler] Article ${story.id} blocked (451), marking as blocked`);
          await setArticleTranslation({
            story_id: story.id,
            title_snapshot: titleSnapshot,
            content_markdown: '',
            original_url: story.url!,
            status: 'blocked',
            error_message: 'HTTP 451: Unavailable For Legal Reasons'
          });
          return false;
        }
        console.error(`[Scheduler] Failed to fetch article ${story.id}: ${response.status}`);
        return false;
      }

      const markdown = await response.text();
      
      if (!markdown || markdown.length < 50) {
        console.log(`[Scheduler] Article ${story.id} content too short, skipping`);
        return false;
      }

      // Translate article content and generate TLDR in parallel
      const [translatedMarkdown, tldr] = await Promise.all([
        translateArticle(markdown, customPrompt, story.id),
        generateTLDR(markdown, story.id)
      ]);

      if (!translatedMarkdown) {
        console.error(`[Scheduler] Article ${story.id} translation returned empty`);
        return false;
      }

      // 标题和内容都翻译完成，保存文章翻译
      await setArticleTranslation({
        story_id: story.id,
        title_snapshot: titleSnapshot,
        content_markdown: translatedMarkdown,
        original_url: story.url!,
        status: 'done',
        tldr: tldr || undefined
      });

      // 文章翻译完成后，保存故事到数据库
      await saveStoryToDatabase(story);
      console.log(`[Scheduler] Story ${story.id} saved after article translation completed`);

      // Fetch and store comments for the story (Requirements: 1.1, 1.2)
      // Also translate top 50 comments
      await this.fetchAndStoreComments(story, customPrompt);

      // Emit SSE event for article completion with full story info
      const queueService = getQueueService();
      const sseEvent = {
        type: 'article.done' as const,
        storyId: story.id,
        title: titleSnapshot,
        content: translatedMarkdown,
        originalUrl: story.url,
        tldr: tldr || undefined,
        story: {
          id: story.id,
          title: story.title,
          by: story.by,
          score: story.score,
          time: story.time,
          url: story.url,
          descendants: story.descendants,
          translatedTitle: titleSnapshot,
          isTranslating: false,
          hasTranslatedArticle: true,
          articleStatus: 'done' as const,
          hnRank: (story as any).hnRank, // 保留 HN 排名位置
        }
      };
      queueService.emitSSEEvent(sseEvent);

      return true;
    } catch (error) {
      console.error(`[Scheduler] Failed to translate article ${story.id}:`, error);
      return false;
    }
  }

  /**
   * Fetch and store comments for a story
   * Requirements: 1.1 - Fetch all comments when scheduler fetches a story
   * Requirements: 1.2 - Store complete comment tree structure in database
   * 
   * 重要：评论必须在翻译完成后才能入库，与文章翻译逻辑保持一致
   */
  private async fetchAndStoreComments(story: Story, customPrompt: string): Promise<void> {
    try {
      // Check if story has comments (descendants > 0)
      if (!story.descendants || story.descendants === 0) {
        console.log(`[Scheduler] Story ${story.id} has no comments, skipping comment fetch`);
        return;
      }

      // Check if we already have comments for this story
      const hasExistingComments = await this.commentRepo.hasComments(story.id);
      if (hasExistingComments) {
        console.log(`[Scheduler] Story ${story.id} already has cached comments, skipping`);
        return;
      }

      // Get the story's kids (top-level comment IDs) from HN API
      const { fetchStoryDetails } = await import('./hn');
      const storyDetails = await fetchStoryDetails(story.id);
      
      if (!storyDetails || !storyDetails.descendants) {
        console.log(`[Scheduler] Could not fetch story details for ${story.id}`);
        return;
      }

      const kids = (storyDetails as any).kids as number[] | undefined;
      if (!kids || kids.length === 0) {
        console.log(`[Scheduler] Story ${story.id} has no top-level comments`);
        return;
      }

      console.log(`[Scheduler] Fetching ${kids.length} top-level comments for story ${story.id}`);
      
      // Fetch all comments recursively
      const comments = await fetchStoryComments(story.id, kids);
      
      if (comments.length > 0) {
        // 先翻译前50条评论（包括嵌套评论），翻译完成后再一起入库
        const translations = await this.translateComments(story.id, comments, customPrompt);
        
        // 评论翻译完成后，才将评论和翻译一起入库
        await this.commentRepo.upsertMany(comments);
        console.log(`[Scheduler] Stored ${comments.length} comments for story ${story.id}`);
        
        if (translations.length > 0) {
          await this.commentTranslationRepo.upsertMany(translations);
          console.log(`[Scheduler] Stored ${translations.length} comment translations for story ${story.id}`);
        }
      }
    } catch (error) {
      // Log error but don't fail the article translation (Requirements: 1.4)
      console.error(`[Scheduler] Failed to fetch comments for story ${story.id}:`, error);
    }
  }

  /**
   * Translate comments for a story (max 50 comments including nested)
   * Only translates comments that have text content
   * 
   * 翻译范围：前50条评论（包括嵌套评论，按树结构遍历顺序）
   * 翻译方式：一次性发送50条评论翻译，不分批次
   * 
   * @returns 翻译结果数组，用于后续入库
   */
  private async translateComments(
    storyId: number,
    comments: Omit<import('../types').CommentRecord, 'fetched_at'>[],
    customPrompt: string
  ): Promise<{ comment_id: number; text_en: string; text_zh: string }[]> {
    // 按树结构顺序获取前N条有文本内容的评论（包括嵌套评论）
    const maxComments = config.commentTranslation.maxComments;
    const commentsWithText = this.getCommentsInTreeOrder(comments, storyId, maxComments);

    if (commentsWithText.length === 0) {
      console.log(`[Scheduler] Story ${storyId} has no comments to translate`);
      return [];
    }

    console.log(`[Scheduler] Translating ${commentsWithText.length} comments for story ${storyId} (一次性发送)`);

    // Prepare items for batch translation - 一次性发送所有50条
    const items = commentsWithText.map(c => ({
      id: c.comment_id,
      text: c.text!,
    }));

    // 一次性翻译所有评论，不分批次
    const results = await translateCommentsBatch(items, customPrompt);

    if (results.length === 0) {
      console.log(`[Scheduler] No comment translations returned for story ${storyId}`);
      return [];
    }

    // Create a map of id -> translatedText
    const resultMap = new Map(results.map(r => [r.id, r.translatedText]));

    // 返回翻译结果，不在这里入库
    const translations = commentsWithText
      .filter(c => resultMap.has(c.comment_id))
      .map(c => ({
        comment_id: c.comment_id,
        text_en: c.text!,
        text_zh: resultMap.get(c.comment_id)!,
      }));

    console.log(`[Scheduler] Got ${translations.length} comment translations for story ${storyId}`);
    return translations;
  }

  /**
   * 按树结构遍历顺序获取前N条有文本内容的评论
   * 遍历顺序：深度优先，按时间排序
   * 
   * @param comments 扁平化的评论数组
   * @param storyId 故事ID（用于识别顶级评论）
   * @param limit 最大数量
   * @returns 前N条有文本内容的评论
   */
  private getCommentsInTreeOrder(
    comments: Omit<import('../types').CommentRecord, 'fetched_at'>[],
    storyId: number,
    limit: number
  ): Omit<import('../types').CommentRecord, 'fetched_at'>[] {
    // 构建评论映射和父子关系
    const commentMap = new Map(comments.map(c => [c.comment_id, c]));
    const childrenMap = new Map<number, number[]>();
    
    // 初始化 childrenMap
    childrenMap.set(storyId, []); // 顶级评论的父ID是storyId
    for (const comment of comments) {
      if (!childrenMap.has(comment.parent_id)) {
        childrenMap.set(comment.parent_id, []);
      }
      childrenMap.get(comment.parent_id)!.push(comment.comment_id);
    }
    
    // 对每个父节点的子评论按时间排序
    for (const [, children] of childrenMap) {
      children.sort((a, b) => {
        const commentA = commentMap.get(a);
        const commentB = commentMap.get(b);
        return (commentA?.time || 0) - (commentB?.time || 0);
      });
    }
    
    // 深度优先遍历，收集前N条有文本内容的评论
    const result: Omit<import('../types').CommentRecord, 'fetched_at'>[] = [];
    
    const traverse = (parentId: number) => {
      if (result.length >= limit) return;
      
      const children = childrenMap.get(parentId) || [];
      for (const childId of children) {
        if (result.length >= limit) return;
        
        const comment = commentMap.get(childId);
        if (comment) {
          // 只收集有文本内容且未删除的评论
          if (comment.text && comment.text.trim().length > 0 && !comment.deleted && !comment.dead) {
            result.push(comment);
          }
          // 继续遍历子评论
          traverse(childId);
        }
      }
    };
    
    // 从顶级评论开始遍历
    traverse(storyId);
    
    return result;
  }
}

// Singleton instance
let schedulerInstance: SchedulerService | null = null;

/**
 * Get the scheduler service singleton
 */
export function getSchedulerService(): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService();
  }
  return schedulerInstance;
}

// ============================================
// Comment Refresh Service
// ============================================

/**
 * 获取评论刷新配置
 */
function getCommentRefreshConfig() {
  return {
    enabled: config.commentRefresh.enabled,
    interval: config.commentRefresh.interval,
    storyLimit: config.commentRefresh.storyLimit,
    batchSize: config.commentRefresh.batchSize,
  };
}

/**
 * 评论刷新服务状态
 */
export interface CommentRefreshStatus {
  isRunning: boolean;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  storiesProcessed: number;
  commentsRefreshed: number;
  currentInterval?: number;
  currentStoryLimit?: number;
  currentBatchSize?: number;
}

/**
 * 评论刷新服务
 * 定时刷新最新文章的评论，处理新增评论并翻译
 */
export class CommentRefreshService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastRunAt: number | null = null;
  private nextRunAt: number | null = null;
  private storiesProcessed: number = 0;
  private commentsRefreshed: number = 0;

  private storyRepo: StoryRepository;
  private commentRepo: CommentRepository;
  private commentTranslationRepo: CommentTranslationRepository;
  private settingsRepo: SettingsRepository;

  constructor() {
    this.storyRepo = new StoryRepository();
    this.commentRepo = new CommentRepository();
    this.commentTranslationRepo = new CommentTranslationRepository();
    this.settingsRepo = new SettingsRepository();
  }

  /**
   * 启动评论刷新服务
   */
  async start(): Promise<void> {
    const refreshConfig = getCommentRefreshConfig();
    
    if (!refreshConfig.enabled) {
      console.log('[CommentRefresh] 评论刷新服务已禁用');
      return;
    }

    if (this.intervalId) {
      console.log('[CommentRefresh] 服务已在运行');
      return;
    }

    console.log(`[CommentRefresh] 启动服务: interval=${refreshConfig.interval / 1000}s, storyLimit=${refreshConfig.storyLimit}, batchSize=${refreshConfig.batchSize}`);

    // 首次运行延迟 30 秒，避免与主调度器冲突
    setTimeout(() => {
      this.runOnce().catch(err => {
        console.error('[CommentRefresh] 首次运行失败:', err);
      });
    }, 30000);

    this.nextRunAt = Date.now() + refreshConfig.interval;

    this.intervalId = setInterval(() => {
      this.runOnce().catch(err => {
        console.error('[CommentRefresh] 定时运行失败:', err);
      });
      this.nextRunAt = Date.now() + refreshConfig.interval;
    }, refreshConfig.interval);

    this.isRunning = true;
    console.log('[CommentRefresh] 服务启动成功');
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      this.nextRunAt = null;
      console.log('[CommentRefresh] 服务已停止');
    }
  }

  /**
   * 重启服务
   */
  restart(): void {
    console.log('[CommentRefresh] 重启服务...');
    this.stop();
    this.start();
  }

  /**
   * 执行一次评论刷新
   */
  async runOnce(): Promise<void> {
    const refreshConfig = getCommentRefreshConfig();
    
    if (!refreshConfig.enabled) {
      console.log('[CommentRefresh] 服务已禁用，跳过执行');
      return;
    }

    console.log('[CommentRefresh] 开始刷新评论...');
    const startTime = Date.now();

    try {
      // 获取最新的 N 篇文章（按 time 降序）
      const stories = await this.storyRepo.findLatest(refreshConfig.storyLimit);
      
      if (stories.length === 0) {
        console.log('[CommentRefresh] 没有文章需要刷新评论');
        this.lastRunAt = Date.now();
        return;
      }

      console.log(`[CommentRefresh] 找到 ${stories.length} 篇文章需要刷新评论`);

      // 获取自定义提示词
      const customPrompt = await this.settingsRepo.get('custom_prompt') || DEFAULT_PROMPT;

      // 分批处理
      const batchSize = refreshConfig.batchSize;
      let totalCommentsRefreshed = 0;
      let totalStoriesProcessed = 0;

      for (let i = 0; i < stories.length; i += batchSize) {
        const batch = stories.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(stories.length / batchSize);

        console.log(`[CommentRefresh] === 第 ${batchNum}/${totalBatches} 批：处理 ${batch.length} 篇文章 ===`);

        // 并发处理这一批文章
        const results = await Promise.allSettled(
          batch.map(story => this.refreshStoryComments(story, customPrompt))
        );

        // 统计结果
        for (const result of results) {
          if (result.status === 'fulfilled') {
            totalCommentsRefreshed += result.value;
            totalStoriesProcessed++;
          }
        }

        console.log(`[CommentRefresh] === 第 ${batchNum}/${totalBatches} 批完成 ===`);
      }

      this.storiesProcessed = totalStoriesProcessed;
      this.commentsRefreshed = totalCommentsRefreshed;
      this.lastRunAt = Date.now();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[CommentRefresh] 刷新完成: ${duration}s, 处理 ${totalStoriesProcessed} 篇文章, 刷新 ${totalCommentsRefreshed} 条评论`);

    } catch (error) {
      console.error('[CommentRefresh] 刷新失败:', error);
      throw error;
    }
  }

  /**
   * 刷新单篇文章的评论
   * @returns 新增/更新的评论数量
   */
  private async refreshStoryComments(story: { story_id: number; descendants?: number }, customPrompt: string): Promise<number> {
    try {
      // 从 HN API 获取最新的故事详情
      const storyDetails = await fetchStoryDetails(story.story_id);
      
      if (!storyDetails) {
        console.log(`[CommentRefresh] 无法获取文章 ${story.story_id} 的详情`);
        return 0;
      }

      const kids = (storyDetails as any).kids as number[] | undefined;
      if (!kids || kids.length === 0) {
        console.log(`[CommentRefresh] 文章 ${story.story_id} 没有评论`);
        return 0;
      }

      // 获取现有评论 ID
      const existingComments = await this.commentRepo.findByStoryId(story.story_id);
      const existingCommentIds = new Set(existingComments.map(c => c.comment_id));

      // 获取所有评论（包括新评论）
      const allComments = await fetchStoryComments(story.story_id, kids);
      
      if (allComments.length === 0) {
        return 0;
      }

      // 找出新评论（不在现有评论中的）
      const newComments = allComments.filter(c => !existingCommentIds.has(c.comment_id));
      
      // 找出需要更新的评论（已存在但可能有变化的）
      const updatedComments = allComments.filter(c => existingCommentIds.has(c.comment_id));

      console.log(`[CommentRefresh] 文章 ${story.story_id}: 总评论 ${allComments.length}, 新增 ${newComments.length}, 已存在 ${updatedComments.length}`);

      // 获取现有翻译
      const existingTranslations = await this.commentTranslationRepo.findByStoryId(story.story_id);
      const existingTranslationIds = new Set(existingTranslations.map(t => t.comment_id));

      // 找出需要翻译的新评论（有文本内容且未翻译）
      const commentsToTranslate = newComments.filter(c => 
        c.text && 
        c.text.trim().length > 0 && 
        !c.deleted && 
        !c.dead &&
        !existingTranslationIds.has(c.comment_id)
      );

      // 限制翻译数量
      const maxComments = config.commentTranslation.maxComments;
      const limitedCommentsToTranslate = commentsToTranslate.slice(0, maxComments);

      let translations: { comment_id: number; text_en: string; text_zh: string }[] = [];

      if (limitedCommentsToTranslate.length > 0) {
        console.log(`[CommentRefresh] 翻译 ${limitedCommentsToTranslate.length} 条新评论`);

        // 翻译新评论
        const items = limitedCommentsToTranslate.map(c => ({
          id: c.comment_id,
          text: c.text!,
        }));

        const results = await translateCommentsBatch(items, customPrompt);
        const resultMap = new Map(results.map(r => [r.id, r.translatedText]));

        translations = limitedCommentsToTranslate
          .filter(c => resultMap.has(c.comment_id))
          .map(c => ({
            comment_id: c.comment_id,
            text_en: c.text!,
            text_zh: resultMap.get(c.comment_id)!,
          }));
      }

      // 保存所有评论（新增 + 更新）
      if (allComments.length > 0) {
        await this.commentRepo.upsertMany(allComments);
      }

      // 保存翻译
      if (translations.length > 0) {
        await this.commentTranslationRepo.upsertMany(translations);
        console.log(`[CommentRefresh] 保存 ${translations.length} 条评论翻译`);
      }

      return newComments.length;

    } catch (error) {
      console.error(`[CommentRefresh] 刷新文章 ${story.story_id} 评论失败:`, error);
      return 0;
    }
  }

  /**
   * 获取服务状态
   */
  async getStatus(): Promise<CommentRefreshStatus> {
    const refreshConfig = getCommentRefreshConfig();
    return {
      isRunning: this.isRunning,
      enabled: refreshConfig.enabled,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      storiesProcessed: this.storiesProcessed,
      commentsRefreshed: this.commentsRefreshed,
    };
  }

  /**
   * 获取带配置的服务状态
   */
  async getStatusWithConfig(): Promise<CommentRefreshStatus> {
    const refreshConfig = getCommentRefreshConfig();
    return {
      isRunning: this.isRunning,
      enabled: refreshConfig.enabled,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      storiesProcessed: this.storiesProcessed,
      commentsRefreshed: this.commentsRefreshed,
      currentInterval: refreshConfig.interval,
      currentStoryLimit: refreshConfig.storyLimit,
      currentBatchSize: refreshConfig.batchSize,
    };
  }
}

// 评论刷新服务单例
let commentRefreshInstance: CommentRefreshService | null = null;

/**
 * 获取评论刷新服务单例
 */
export function getCommentRefreshService(): CommentRefreshService {
  if (!commentRefreshInstance) {
    commentRefreshInstance = new CommentRefreshService();
  }
  return commentRefreshInstance;
}
