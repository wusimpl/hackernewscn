# HackerNews CN

一个使用 AI 技术将 Hacker News 内容翻译成中文的全栈 Web 应用。


## 网站体验地址，你也可以自己部署
[HackerNewsCN](https://hackernewscn.wusimpl.fun/)

## 技术栈

### 后端
- **运行时**: Node.js
- **语言**: TypeScript
- **框架**: Express
- **数据库**: SQL.js (SQLite)

### 前端
- **框架**: React 19
- **语言**: TypeScript
- **构建工具**: Vite

## 核心功能

- 自动抓取 HackerNews 热门内容
- LLM 智能翻译 (标题、正文、摘要和评论)
- 本地数据库缓存
- 实时翻译进度推送
- 收藏夹与阅读历史
- 文章 AI 对话
- 管理员设置面板


## 快速开始

### 环境准备

1. 复制配置文件:
```bash
cp backend/.env.example backend/.env
cp backend/data/llm-config.json.example backend/data/llm-config.json
cp backend/data/prompts-config.json.example backend/data/prompts-config.json
```

2. 配置环境变量 (backend/.env):
```env
PORT=3000
ADMIN_TOKEN=your-admin-token
```

3. 配置 LLM 服务 (backend/data/llm-config.json):
```json
{
  "default_provider": "Deepseek V3",
  "providers": [
    {
      "name": "Deepseek V3",
      "api_base": "https://api.deepseek.com/v1",
      "model": "deepseek-chat",
      "api_key": "your-api-key-here"
    }
  ]
}
```

### 安装依赖

根目录安装:
```bash
npm install
```

分别安装前后端依赖:
```bash
cd backend && npm install
cd frontend && npm install
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

## 许可证

MIT
