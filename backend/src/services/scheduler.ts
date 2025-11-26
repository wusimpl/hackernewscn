import fetch from 'node-fetch';
import { config } from '../config';
import { refreshTopStories, saveStoryToDatabase } from './hn';
import { translateTitlesBatch, translateArticle, DEFAULT_PROMPT } from './llm';
import { getQueueService } from './queue';
import { hashPrompt, setArticleTranslation, getArticleTranslation } from './cache';
import { TitleTranslationRepository, SettingsRepository, ArticleTranslationRepository } from '../db/repositories';
import { Story, StoryWithTranslation, SSEStoriesUpdatedEvent } from '../types';

/**
 * 获取当前调度器配置（优先从数据库读取）
 */
async function getSchedulerConfig(): Promise<{ interval: number; storyLimit: number }> {
  const settingsRepo = new SettingsRepository();
  
  const intervalSetting = await settingsRepo.get('scheduler_interval');
  const storyLimitSetting = await settingsRepo.get('scheduler_story_limit');

  return {
    interval: intervalSetting ? parseInt(intervalSetting, 10) : config.scheduler.interval,
    storyLimit: storyLimitSetting ? parseInt(storyLimitSetting, 10) : config.scheduler.storyLimit,
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
  private storiesFetched: number = 0;
  private titlesTranslated: number = 0;

  private titleTranslationRepo: TitleTranslationRepository;
  private settingsRepo: SettingsRepository;
  private articleTranslationRepo: ArticleTranslationRepository;

  constructor() {
    this.titleTranslationRepo = new TitleTranslationRepository();
    this.settingsRepo = new SettingsRepository();
    this.articleTranslationRepo = new ArticleTranslationRepository();
  }

  /**
   * Start the scheduler with periodic execution
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      console.log('[Scheduler] Already running');
      return;
    }

    const schedulerConfig = await getSchedulerConfig();
    console.log(`[Scheduler] Starting with interval: ${schedulerConfig.interval / 1000}s, storyLimit: ${schedulerConfig.storyLimit}`);

    // Run immediately on start
    this.runOnce().catch(err => {
      console.error('[Scheduler] Initial run failed:', err);
    });

    // Set up periodic execution
    this.intervalId = setInterval(() => {
      this.runOnce().catch(err => {
        console.error('[Scheduler] Scheduled run failed:', err);
      });
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
      const schedulerConfig = await getSchedulerConfig();
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

      // Step 6: Emit SSE event with fully translated stories (标题+文章都翻译完成)
      // 只推送完全翻译好的故事
      const fullyTranslatedStories = await this.getFullyTranslatedStories(stories, promptHash);
      if (fullyTranslatedStories.length > 0) {
        await this.emitStoriesUpdatedEvent(fullyTranslatedStories);
      }

    } catch (error) {
      console.error('[Scheduler] Error during fetch and translate cycle:', error);
      throw error;
    }
  }

  /**
   * Get current scheduler status
   */
  getStatus(): SchedulerStatus {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.intervalId ? Date.now() + config.scheduler.interval : null,
      storiesFetched: this.storiesFetched,
      titlesTranslated: this.titlesTranslated,
    };
  }

  /**
   * Get current scheduler status with config (async version)
   */
  async getStatusWithConfig(): Promise<SchedulerStatus> {
    const schedulerConfig = await getSchedulerConfig();
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.intervalId ? Date.now() + schedulerConfig.interval : null,
      storiesFetched: this.storiesFetched,
      titlesTranslated: this.titlesTranslated,
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
   * Emit SSE event with newly translated stories
   * Requirements: 5.1 - Push new stories to connected clients via SSE
   */
  private async emitStoriesUpdatedEvent(stories: StoryWithTranslation[]): Promise<void> {
    const queueService = getQueueService();
    
    const event: SSEStoriesUpdatedEvent = {
      type: 'stories.updated',
      stories,
      lastUpdatedAt: this.lastRunAt || Date.now(),
    };

    console.log(`[Scheduler] 准备推送 stories.updated 事件:`);
    console.log(`[Scheduler] - stories 数量: ${stories.length}`);
    console.log(`[Scheduler] - stories IDs: ${stories.map(s => s.id).join(', ')}`);
    console.log(`[Scheduler] - 第一个 story:`, JSON.stringify(stories[0], null, 2));
    console.log(`[Scheduler] - lastUpdatedAt: ${event.lastUpdatedAt}`);

    queueService.emitSSEEvent(event);
    console.log(`[Scheduler] Emitted stories.updated SSE event with ${stories.length} stories`);
  }

  /**
   * Get stories that are fully translated (title + article content)
   * Only returns stories where both title and article are translated
   */
  private async getFullyTranslatedStories(stories: Story[], promptHash: string): Promise<StoryWithTranslation[]> {
    const fullyTranslated: StoryWithTranslation[] = [];
    
    // Get all title translations
    const storyIds = stories.map(s => s.id);
    const titleTranslations = await this.titleTranslationRepo.findByIds(storyIds);
    const titleMap = new Map(
      titleTranslations
        .filter(t => t.prompt_hash === promptHash)
        .map(t => [t.story_id, t.title_zh])
    );

    for (const story of stories) {
      const translatedTitle = titleMap.get(story.id);
      
      // Must have translated title
      if (!translatedTitle) {
        continue;
      }

      // If story has URL, must have translated article
      if (story.url) {
        const articleTranslation = await this.articleTranslationRepo.findById(story.id);
        if (!articleTranslation || articleTranslation.status !== 'done') {
          continue;
        }
        
        fullyTranslated.push({
          id: story.id,
          title: story.title,
          by: story.by,
          score: story.score,
          time: story.time,
          url: story.url,
          descendants: story.descendants,
          translatedTitle,
          isTranslating: false,
          hasTranslatedArticle: true,
          articleStatus: 'done',
        });
      } else {
        // No URL (e.g., Ask HN), only need title translation
        fullyTranslated.push({
          id: story.id,
          title: story.title,
          by: story.by,
          score: story.score,
          time: story.time,
          url: story.url,
          descendants: story.descendants,
          translatedTitle,
          isTranslating: false,
          hasTranslatedArticle: false,
          articleStatus: undefined,
        });
      }
    }

    return fullyTranslated;
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

      // Translate article content
      const translatedMarkdown = await translateArticle(markdown, customPrompt);

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
        status: 'done'
      });

      // 文章翻译完成后，保存故事到数据库
      await saveStoryToDatabase(story);
      console.log(`[Scheduler] Story ${story.id} saved after article translation completed`);

      // Emit SSE event for article completion with full story info
      const queueService = getQueueService();
      const sseEvent = {
        type: 'article.done' as const,
        storyId: story.id,
        title: titleSnapshot,
        content: translatedMarkdown,
        originalUrl: story.url,
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
