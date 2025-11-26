# Requirements Document

## Introduction

本文档定义了 HackerNewsCN 项目的架构重构需求，将当前的混合架构重构为清晰的生产者-消费者模式。

当前问题：
- 前端既要处理数据展示，又要触发翻译任务，逻辑耦合
- 后端 API 在请求时同步执行翻译，响应时间不可控
- 翻译逻辑分散在多个地方，难以维护

目标架构：
- **生产者（后端调度器）**：定时抓取 HN 文章，自动翻译，存入数据库
- **消费者（前端）**：纯粹的数据请求，展示已翻译的内容

## Glossary

- **Scheduler（调度器）**：后端定时任务服务，负责定期抓取和翻译文章
- **Story（故事）**：HackerNews 上的一篇文章/帖子
- **Title Translation（标题翻译）**：将英文标题翻译为中文
- **Article Translation（文章翻译）**：将文章全文翻译为中文
- **Translation Cache（翻译缓存）**：存储在数据库中的翻译结果

## Requirements

### Requirement 1: 后端调度器自动抓取和翻译

**User Story:** As a user, I want the system to automatically fetch and translate HN articles in the background, so that I can immediately see translated content without waiting.

#### Acceptance Criteria

1. WHEN the scheduler starts THEN the system SHALL immediately fetch the top 30 HN stories and queue them for title translation
2. WHEN the scheduler runs at the configured interval (default 5 minutes) THEN the system SHALL fetch new stories and translate their titles
3. WHEN a story is fetched THEN the system SHALL check if a title translation exists in the database before translating
4. WHEN a title translation does not exist THEN the system SHALL queue the title for translation
5. WHEN a title translation is completed THEN the system SHALL store the result in the database with the prompt hash

### Requirement 2: 前端纯数据请求

**User Story:** As a frontend developer, I want the API to return pre-translated data, so that the frontend code is simple and focused on display.

#### Acceptance Criteria

1. WHEN the frontend requests stories THEN the backend SHALL return stories with their translated titles from the database
2. WHEN a story has no translated title THEN the backend SHALL return the original English title
3. WHEN the frontend requests an article THEN the backend SHALL return the cached translation if available
4. WHEN the frontend requests an article that is not translated THEN the backend SHALL return a status indicating the article is not yet translated
5. THE frontend SHALL NOT trigger any translation tasks directly

### Requirement 3: 文章翻译按需触发

**User Story:** As a user, I want to request article translation for specific stories, so that I can read full articles in Chinese.

#### Acceptance Criteria

1. WHEN a user clicks on a story without a translated article THEN the frontend SHALL send a translation request to the backend
2. WHEN the backend receives an article translation request THEN the system SHALL queue the article for translation
3. WHEN an article translation is completed THEN the system SHALL store the result in the database
4. WHEN an article translation is completed THEN the system SHALL notify connected clients via SSE
5. WHEN a user clicks on a story with a translated article THEN the frontend SHALL display the cached translation immediately

### Requirement 4: 翻译状态可见性

**User Story:** As a user, I want to see which articles have been translated, so that I know which ones I can read immediately.

#### Acceptance Criteria

1. WHEN displaying a story list THEN the system SHALL show a "已翻译" badge for stories with completed article translations
2. WHEN an article is being translated THEN the system SHALL show a "翻译中..." indicator
3. WHEN an article translation fails THEN the system SHALL show an error notification to the user

### Requirement 5: SSE 实时推送

**User Story:** As a user, I want to see new stories and translations appear automatically, so that I don't need to manually refresh the page.

#### Acceptance Criteria

1. WHEN the scheduler completes translating new stories THEN the system SHALL push the new stories to connected clients via SSE
2. WHEN an article translation is completed THEN the system SHALL push the completion event to connected clients via SSE
3. THE frontend SHALL NOT have a manual refresh button for stories
4. WHEN displaying the header THEN the system SHALL show the timestamp of the last translated story from the backend
5. WHEN a new story is pushed via SSE THEN the frontend SHALL automatically add it to the story list

### Requirement 6: 配置和管理

**User Story:** As an administrator, I want to configure the scheduler behavior, so that I can control resource usage.

#### Acceptance Criteria

1. THE system SHALL support configuring the scheduler interval via environment variable
2. THE system SHALL support configuring the number of stories to fetch per interval
3. THE system SHALL support configuring the translation concurrency limit
4. WHEN the custom prompt is updated THEN the system SHALL invalidate affected title translations
