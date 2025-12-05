import * as fs from 'fs';
import * as path from 'path';

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

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, '../../data/prompts-config.json');

// 默认提示词配置
const DEFAULT_PROMPTS: PromptsConfig = {
  article: {
    name: "文章翻译",
    description: "用于翻译文章标题和正文内容",
    prompt: `将英文文本重写成通俗流畅、引人入胜的简体中文。

核心要求:

- 读者与风格: 面向对AI和科技感兴趣的普通读者。风格要像讲故事,清晰易懂,而不是写学术论文。
- 准确第一: 核心事实、数据和逻辑必须与原文完全一致。
- 行文流畅: 优先使用地道的中文语序。将英文长句拆解为更自然的中文短句。
- 术语标准: 专业术语使用行业公认的标准翻译(如 \`overfitting\` -> \`过拟合\`)。第一次出现时,在译文后用括号加注英文原文。
- 保留格式: 保持原文的标题、粗体、斜体、图片等Markdown格式。

常用词汇:
- AI Agent -> AI 智能体
- LLM -> 大语言模型
- Vibe Coding -> 凭感觉编程
- the Bitter Lesson -> 苦涩的教训
- Context Engineering -> 上下文工程`
  },
  tldr: {
    name: "TLDR 摘要",
    description: "用于生成文章的简短中文摘要",
    prompt: `你是一个专业的文章摘要助手。请根据用户提供的英文文章内容，生成一个简洁的中文摘要（TLDR）。

要求：
1. 摘要必须用简体中文撰写
2. 控制在 2-4 句话，100-200 字以内
3. 提炼文章的核心观点和关键信息
4. 语言要通俗易懂，避免过于学术化
5. 如果文章涉及技术概念，用简单的语言解释
6. 直接输出摘要内容，不要加任何前缀如"摘要："或"TLDR："

输出格式示例：
这篇文章讨论了 AI 在软件开发中的应用。作者认为，虽然 AI 工具能提高编码效率，但开发者仍需保持批判性思维。文章还提到了几个实际案例，展示了 AI 辅助编程的优势和局限性。`
  },
  comment: {
    name: "评论翻译",
    description: "用于翻译 Hacker News 评论内容",
    prompt: `您是一位专业的翻译助手，您的任务是将内容准确、自然、且富有感染力地翻译成目标语言。
您尤其擅长捕捉原文的情感和语气，并将其自然地融入到译文中。

请将用户提供的英文文本翻译成中文。 您的输出必须仅包含译文本身，请勿包含任何前言、解释或其他非译文内容。

翻译要求 (请严格遵守):
    语言风格: 地道的中文母语者日常口语风格，译文 自然流畅，避免书面语和机器翻译痕迹。
    语气情感: 略微非正式的语气，充分传达原文用户的 热情和真诚的赞赏 之情。
    表达技巧: 巧妙融入地道的中文俗语和口语化表达 (例如 "压榨"、"忍痛割爱" 等风格)，使译文生动活泼，贴近真实对话。
    翻译策略: 避免生硬字面直译，理解原文核心意思和情感，用自然流畅中文 重新组织表达 (神形兼备)。
**专有名词处理:** 对于英文原文中的 **产品名称、软件名称、技术术语、模型名称、品牌名称、代码标识符或特定英文缩写** 等专有名词（例如 "Cursor", "Gemini-2.5-pro-exp", "VS Code", "API", "GPT-4"），**必须保留其原始英文形式，不进行翻译**。请将这些英文术语自然地嵌入到流畅的中文译文中。 * **重要示例:** 如果原文是 "Add Gemini-2.5-pro-exp to Cursor"，一个好的翻译应该是像 "快把 Gemini-2.5-pro-exp 加到 Cursor 里试试！" 或 "推荐将 Gemini-2.5-pro-exp 集成到 Cursor 中"，**绝不能** 翻译 "Cursor" 或 "Gemini-2.5-pro-exp"。
    译文目标: 高度自然地道的中文口语译文，如同真诚用户热情推荐，而非机器翻译。`
  }
};

// 内存缓存
let cachedConfig: PromptsConfig | null = null;

/**
 * 读取提示词配置
 */
export function getPromptsConfig(): PromptsConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const config = JSON.parse(content) as PromptsConfig;
      // 合并默认值，确保所有字段都存在
      cachedConfig = {
        article: { ...DEFAULT_PROMPTS.article, ...config.article },
        tldr: { ...DEFAULT_PROMPTS.tldr, ...config.tldr },
        comment: { ...DEFAULT_PROMPTS.comment, ...config.comment }
      };
      return cachedConfig;
    }
  } catch (error) {
    console.error('[PromptsConfig] 读取配置文件失败:', error);
  }

  cachedConfig = DEFAULT_PROMPTS;
  return cachedConfig;
}

/**
 * 获取指定类型的提示词
 */
export function getPrompt(type: PromptType): string {
  const config = getPromptsConfig();
  return config[type]?.prompt || DEFAULT_PROMPTS[type].prompt;
}

/**
 * 获取指定类型的默认提示词
 */
export function getDefaultPrompt(type: PromptType): string {
  return DEFAULT_PROMPTS[type].prompt;
}

/**
 * 更新提示词配置
 */
export function updatePromptsConfig(config: Partial<PromptsConfig>): PromptsConfig {
  const currentConfig = getPromptsConfig();
  
  const newConfig: PromptsConfig = {
    article: config.article ? { ...currentConfig.article, ...config.article } : currentConfig.article,
    tldr: config.tldr ? { ...currentConfig.tldr, ...config.tldr } : currentConfig.tldr,
    comment: config.comment ? { ...currentConfig.comment, ...config.comment } : currentConfig.comment
  };

  try {
    // 确保目录存在
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
    cachedConfig = newConfig;
    console.log('[PromptsConfig] 配置已保存');
  } catch (error) {
    console.error('[PromptsConfig] 保存配置文件失败:', error);
    throw error;
  }

  return newConfig;
}

/**
 * 更新单个提示词
 */
export function updatePrompt(type: PromptType, prompt: string): PromptsConfig {
  return updatePromptsConfig({
    [type]: { prompt }
  });
}

/**
 * 重置为默认配置
 */
export function resetPromptsConfig(): PromptsConfig {
  cachedConfig = null;
  return updatePromptsConfig(DEFAULT_PROMPTS);
}

/**
 * 清除缓存（用于测试或强制重新加载）
 */
export function clearCache(): void {
  cachedConfig = null;
}

// 导出默认提示词常量（向后兼容）
export const DEFAULT_ARTICLE_PROMPT = DEFAULT_PROMPTS.article.prompt;
export const DEFAULT_TLDR_PROMPT = DEFAULT_PROMPTS.tldr.prompt;
export const DEFAULT_COMMENT_PROMPT = DEFAULT_PROMPTS.comment.prompt;
