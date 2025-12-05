// HackerNews 故事类型
export interface Story {
  id: number;
  title: string;
  by: string;
  score: number;
  time: number;
  url?: string;
  descendants?: number;
}

// 数据库中的故事记录
export interface StoryRecord {
  story_id: number;
  title_en: string;
  by: string;
  score: number;
  time: number;
  url?: string;
  descendants?: number;
  fetched_at: number;
}

// 标题翻译记录
export interface TitleTranslation {
  story_id: number;
  title_en: string;
  title_zh: string;
  prompt_hash: string;
  updated_at: number;
}

// 文章翻译状态
// blocked: 因法律原因(如 451 错误)无法获取内容，永久跳过
export type ArticleStatus = 'queued' | 'running' | 'done' | 'error' | 'blocked';

// 文章翻译记录
export interface ArticleTranslation {
  story_id: number;
  title_snapshot: string;
  content_markdown: string;
  original_url: string;
  status: ArticleStatus;
  error_message?: string;
  tldr?: string;
  updated_at: number;
}

// 翻译任务类型
export type TranslationJobType = 'title' | 'article';

// 翻译任务记录
export interface TranslationJob {
  job_id: string;
  story_id: number;
  type: TranslationJobType;
  status: ArticleStatus;
  progress?: number;
  created_at: number;
  updated_at: number;
}

// 设置记录
export interface Setting {
  key: string;
  value: string;
  updated_at: number;
}

// 调度器状态记录
export interface SchedulerStatusRecord {
  id: number;
  last_run_at: number | null;
  stories_fetched: number;
  titles_translated: number;
  updated_at: number;
}

// API 响应格式
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// 带翻译的故事
export interface StoryWithTranslation extends Story {
  translatedTitle?: string;
  isTranslating?: boolean;
  hasTranslatedArticle?: boolean;
  articleStatus?: ArticleStatus;
  hnRank?: number; // 在 HN Top Stories 中的排名位置 (0-based)
}

// SSE 事件类型
export type SSEEventType = 'article.done' | 'article.error' | 'title.done';

// Base SSE event interface
export interface SSEEventBase {
  type: SSEEventType;
}

// Article-related SSE events
export interface SSEArticleEvent extends SSEEventBase {
  type: 'article.done' | 'article.error' | 'title.done';
  storyId: number;
  title?: string;
  content?: string;
  originalUrl?: string;
  tldr?: string;
  error?: string;
  errorMessage?: string;
  // 完整的 story 信息，用于前端合并到列表
  story?: StoryWithTranslation;
}

// Union type for all SSE events
export type SSEEvent = SSEArticleEvent;

// Comment types
export interface Comment {
  id: number;
  storyId: number;
  parentId: number;
  author: string | null;
  text: string | null;
  time: number;
  kids: number[];
  deleted: boolean;
  dead: boolean;
}

// Database comment record
export interface CommentRecord {
  comment_id: number;
  story_id: number;
  parent_id: number;
  author: string | null;
  text: string | null;
  time: number;
  kids: string; // JSON array string
  deleted: number; // SQLite boolean (0 or 1)
  dead: number; // SQLite boolean (0 or 1)
  fetched_at: number;
}

// Comment tree node for API response
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

// LLM Provider 配置
export interface LLMProvider {
  name: string;
  api_base: string;
  model: string;
  api_key: string;
  description?: string;
  is_thinking_model?: boolean; // 是否为推理模型（返回内容包含 <think></think> 思维链）
}

// LLM 配置文件结构
export interface LLMConfig {
  default_provider: string;
  providers: LLMProvider[];
}
