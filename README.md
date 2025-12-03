# HackerNews CN

一个使用 AI 技术将 Hacker News 内容翻译成中文的全栈 Web 应用。


## 技术栈

### 后端
- **运行时**: Node.js
- **语言**: TypeScript
- **框架**: Express
- **数据库**: SQL.js (SQLite)
- **特色**:
  - 定时调度器自动抓取 HackerNews
  - LLM 翻译服务 (OpenAI 兼容 API)
  - 任务队列管理
  - SSE 实时事件推送

### 前端
- **框架**: React 19
- **语言**: TypeScript
- **构建工具**: Vite
- **UI 组件**: 自定义 React 组件
- **Markdown**: react-markdown

## 核心功能

- 自动抓取 HackerNews 热门内容
- LLM 智能翻译 (标题、正文和评论)
- 本地数据库缓存
- 实时翻译进度推送
- 管理员设置面板

## 快速开始

### 环境准备

1. 复制环境配置:
```bash
cp backend/.env.example backend/.env
```

2. 配置环境变量 (backend/.env):
```env
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-3.5-turbo
ADMIN_TOKEN=your-admin-token
PORT=3000
```

### 安装依赖

根目录安装:
```bash
npm install
```

分别安装前后端依赖:
```bash
npm run dev:backend
npm run dev:frontend
```

### 开发模式

同时启动前后端:
```bash
npm run dev:all
```

分别启动:
```bash
npm run dev:backend  # 后端端口 3000
npm run dev:frontend # 前端端口 5173
```

### 生产构建

```bash
npm run build
npm start  # 启动生产服务器
```

## 数据库

项目使用 SQL.js (SQLite) 存储:

- stories - 新闻数据
- title_translations - 标题翻译缓存
- article_translations - 文章翻译缓存
- jobs - 翻译任务队列
- settings - 系统设置
- scheduler_status - 调度器状态

## 架构特点

1. **前后端分离**: 独立开发和部署
2. **数据库**: 轻量级 SQLite，无需额外数据库服务
3. **实时通信**: Server-Sent Events 推送翻译进度
4. **任务队列**: 后台异步翻译任务
5. **缓存策略**: 多层缓存减少 API 调用
6. **配置灵活**: 支持环境变量和设置面板

## 许可证

MIT
