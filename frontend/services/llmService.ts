/**
 * LLM Service - Contains shared constants for LLM-related functionality.
 * 
 * Note: Title translation is now handled by the backend scheduler.
 * This file only exports the DEFAULT_PROMPT constant used by the settings UI.
 */

export const DEFAULT_PROMPT = `请将以下英文文本，重写成通俗流畅、引人入胜的简体中文。

核心要求：

- 读者与风格：面向对AI感兴趣的普通读者。风格要像讲故事，清晰易懂，而不是写学术论文。
- 准确第一：核心事实、数据和逻辑必须与原文完全一致。
- 行文流畅：优先使用地道的中文语序。将英文长句拆解为更自然的中文短句。
- 术语标准：专业术语使用行业公认的标准翻译（如\`overfitting\` -> \`过拟合\`）。第一次出现时，在译文后用括号加注英文原文。
- 保留格式：保持原文的标题、粗体、斜体、图片等Markdown格式。

常用词汇：
- AI Agent -> AI 智能体
- LLM -> 大语言模型
- Vibe Coding -> 凭感觉编程
- the Bitter Lesson -> 苦涩的教训
- Context Engineering -> 上下文工程`;
