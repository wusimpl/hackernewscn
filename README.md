# HackerNews CN

一个使用 AI 技术将 Hacker News 内容翻译成中文的 Web 应用。

## 背景

Hacker News 是全球最流行的科技新闻聚合平台,但内容以英文为主。本项目通过结合 Hacker News API 和大语言模型(LLM),实现了新闻标题和文章内容的自动翻译,让中文用户能够流畅阅读最新的科技资讯。

## 主要功能

- **实时获取** - 从 Hacker News 官方 API 获取热门新闻列表
- **智能翻译** - 使用 LLM 将标题和文章翻译成中文
- **本地缓存** - 已翻译的内容保存在本地,支持离线阅读
- **背景翻译** - 点击文章后自动在后台翻译,不阻塞界面
- **自定义提示词** - 支持自定义 AI 翻译风格(自托管模式)

## 技术
- OpenAI 兼容 API - LLM 翻译服务（默认翻译提示词来自[宝玉](https://x.com/dotey)）
- Hacker News API - 新闻数据源
- Jina AI - 网页内容提取

## 快速开始

### 环境配置

复制环境变量模板:

```bash
cp .env.template .env
```

编辑 `.env` 文件,配置 LLM 服务:

```env
LLM_API_KEY=your-api-key-here
LLM_BASE_URL=https://your-service/v1
LLM_MODEL=your-model-name
VITE_SELF_HOSTED=true
```

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 生产构建

```bash
npm run build
```

## 部署模式

项目支持两种部署模式:

- **自托管模式** (`VITE_SELF_HOSTED=true`) - 显示设置面板,用户可自定义 API 配置和翻译提示词
- **云托管模式** (`VITE_SELF_HOSTED=false`) - 隐藏配置界面,适合公共服务部署

## 性能优化

- 批量翻译标题,减少 API 调用次数
- 智能缓存,避免重复翻译
- 分页加载,每页显示 30 条新闻
- 背景翻译,不阻塞用户交互

## 许可证

MIT
