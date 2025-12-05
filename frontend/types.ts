export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export type ArticleStatus = 'queued' | 'running' | 'done' | 'error';

export interface TranslationJobStatus {
  status: ArticleStatus;
  jobId?: string;
  progress?: number;
  updatedAt?: number;
}

export interface HnStoryRaw {
  id: number;
  title: string;
  by: string;
  score: number;
  time: number;
  descendants?: number;
  url?: string;
  type: string;
}

export interface Story {
  id: number;
  title: string;
  by: string;
  score: number;
  time: number;
  url?: string;
  descendants?: number;
  type?: string;
  translatedTitle?: string;
  isTranslating?: boolean;
  hasTranslatedArticle?: boolean;
  articleStatus?: ArticleStatus;
  isArticleTranslating?: boolean;
  isNew?: boolean;
  isRead?: boolean; // 用户是否在应用内阅读过此文章
  hnRank?: number; // 在 HN Top Stories 中的排名位置 (0-based)
}

export interface StoriesResponseData {
  stories: Story[];
  lastUpdatedAt: number | null;
  untranslatedCount?: number; // Load More 时返回的未翻译文章数量
}

export type StoriesApiResponse = ApiResponse<StoriesResponseData>;

export interface ArticleTranslationRecord {
  story_id: number;
  title_snapshot: string;
  content_markdown: string;
  original_url: string;
  status: ArticleStatus;
  error_message?: string;
  tldr?: string;
  updated_at?: number;
}

export interface TranslateArticleResponseData {
  message: string;
  jobId?: string;
  status?: ArticleStatus;
  article?: ArticleTranslationRecord;
}

export type ArticleListResponse = ApiResponse<ArticleTranslationRecord[]>;
export type TranslateArticleResponse = ApiResponse<TranslateArticleResponseData>;
export type ArticleCacheActionResponse = ApiResponse<{ message: string }>;

export interface CachedArticle {
  id: number;
  title: string;
  content: string;
  originalUrl?: string;
  timestamp: number;
  tldr?: string;
}

export interface PromptResponseData {
  prompt: string;
  isDefault: boolean;
}

export interface PromptUpdateResponseData {
  message: string;
  prompt?: string;
}

export type PromptResponse = ApiResponse<PromptResponseData>;
export type PromptUpdateResponse = ApiResponse<PromptUpdateResponseData>;

// 提示词类型
export type PromptType = 'article' | 'tldr' | 'comment';

// 单个提示词配置
export interface PromptConfig {
  name: string;
  description: string;
  prompt: string;
}

// 完整的提示词配置
export interface PromptsConfig {
  article: PromptConfig;
  tldr: PromptConfig;
  comment: PromptConfig;
}

// 获取所有提示词的响应
export interface PromptsResponseData {
  prompts: PromptsConfig;
  defaults: {
    article: string;
    tldr: string;
    comment: string;
  };
}

// 更新提示词的响应
export interface PromptsUpdateResponseData {
  message: string;
  prompts: PromptsConfig;
}

export enum LoadingState {
  IDLE = 'IDLE',
  LOADING_STORIES = 'LOADING_STORIES',
  TRANSLATING = 'TRANSLATING',
  ERROR = 'ERROR'
}

// Comment types for the comments feature
export interface CommentTreeNode {
  id: number;
  author: string | null;
  text: string | null;
  translatedText?: string | null;
  time: number;
  deleted: boolean;
  dead: boolean;
  children: CommentTreeNode[];
}

export interface CommentsData {
  storyId: number;
  comments: CommentTreeNode[];
  totalCount: number;
}

export type CommentsApiResponse = ApiResponse<CommentsData>;
