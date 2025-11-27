-- 数据库版本表
CREATE TABLE IF NOT EXISTS db_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- HackerNews 原始新闻数据表
CREATE TABLE IF NOT EXISTS stories (
  story_id INTEGER PRIMARY KEY,
  title_en TEXT NOT NULL,
  by TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  time INTEGER NOT NULL,
  url TEXT,
  descendants INTEGER DEFAULT 0,
  fetched_at INTEGER NOT NULL
);

-- 按时间排序索引
CREATE INDEX IF NOT EXISTS idx_stories_time ON stories(time DESC);

-- 标题翻译缓存表
CREATE TABLE IF NOT EXISTS title_translations (
  story_id INTEGER PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (story_id) REFERENCES stories(story_id) ON DELETE CASCADE
);

-- 提示词哈希索引(支持提示词变更后缓存失效查询)
CREATE INDEX IF NOT EXISTS idx_title_translations_prompt_hash ON title_translations(prompt_hash);

-- 文章翻译缓存表
-- status: blocked 表示因法律原因(如 HTTP 451)无法获取内容，永久跳过
CREATE TABLE IF NOT EXISTS article_translations (
  story_id INTEGER PRIMARY KEY,
  title_snapshot TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  original_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'done', 'error', 'blocked')),
  error_message TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (story_id) REFERENCES stories(story_id) ON DELETE CASCADE
);

-- 状态索引(用于查询所有已完成的翻译)
CREATE INDEX IF NOT EXISTS idx_article_translations_status ON article_translations(status);

-- 翻译任务队列表
CREATE TABLE IF NOT EXISTS translation_jobs (
  job_id TEXT PRIMARY KEY,
  story_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('title', 'article')),
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'done', 'error')),
  progress INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (story_id) REFERENCES stories(story_id) ON DELETE CASCADE
);

-- 任务状态索引(用于查询进行中的任务)
CREATE INDEX IF NOT EXISTS idx_translation_jobs_status ON translation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_translation_jobs_story ON translation_jobs(story_id);

-- 系统设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 插入默认设置
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('custom_prompt', '', strftime('%s', 'now')),
  ('self_hosted', 'true', strftime('%s', 'now'));

-- 调度器状态表
CREATE TABLE IF NOT EXISTS scheduler_status (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_run_at INTEGER,
  stories_fetched INTEGER DEFAULT 0,
  titles_translated INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- 插入默认调度器状态
INSERT OR IGNORE INTO scheduler_status (id, last_run_at, stories_fetched, titles_translated, updated_at)
VALUES (1, NULL, 0, 0, strftime('%s', 'now'));

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
  comment_id INTEGER PRIMARY KEY,
  story_id INTEGER NOT NULL,
  parent_id INTEGER NOT NULL,
  author TEXT,
  text TEXT,
  time INTEGER NOT NULL,
  kids TEXT DEFAULT '[]',
  deleted INTEGER DEFAULT 0,
  dead INTEGER DEFAULT 0,
  fetched_at INTEGER NOT NULL,
  FOREIGN KEY (story_id) REFERENCES stories(story_id) ON DELETE CASCADE
);

-- 索引：按文章查询评论
CREATE INDEX IF NOT EXISTS idx_comments_story_id ON comments(story_id);

-- 索引：按父评论查询子评论
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);

-- 插入初始版本号
INSERT OR IGNORE INTO db_version (version, applied_at) VALUES (1, strftime('%s', 'now'));
