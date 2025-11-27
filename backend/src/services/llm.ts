import fetch from 'node-fetch';
import { config } from '../config';

// 默认提示词(与前端保持一致)
export const DEFAULT_PROMPT = `将英文文本重写成通俗流畅、引人入胜的简体中文。

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
- Context Engineering -> 上下文工程`;

interface Message {
  role: string;
  content: string;
}

interface TranslationResult {
  id: number;
  translatedTitle: string;
}

/**
 * 调用 OpenAI 兼容的 Chat Completions API
 * @param messages 消息数组
 * @param jsonMode 是否启用 JSON 模式
 * @param retries 最大重试次数
 * @returns 返回的内容或 null
 */
async function callLLM(
  messages: Message[],
  jsonMode: boolean = false,
  retries: number = 3
): Promise<string | null> {
  if (!config.llm.apiKey) {
    console.warn('[LLM Service] No API Key configured');
    return null;
  }

  let lastError: any = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.llm.apiKey}`
      };

      const body: any = {
        model: config.llm.model,
        messages: messages,
        temperature: 0.3, // 较低温度以获得更确定性的翻译
      };

      if (jsonMode) {
        body.response_format = { type: "json_object" };
      }

      const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LLM Service] API Error (${response.status}):`, errorText);

        // 如果是客户端错误(4xx),不重试
        if (response.status >= 400 && response.status < 500) {
          return null;
        }

        // 服务端错误(5xx)则重试
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || null;

    } catch (error) {
      lastError = error;
      console.error(`[LLM Service] Attempt ${attempt}/${retries} failed:`, error);

      // 指数退避
      if (attempt < retries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
        console.log(`[LLM Service] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[LLM Service] All ${retries} attempts failed`);
  return null;
}

/**
 * 批量翻译标题
 * @param items 要翻译的标题数组 { id, title }
 * @param customPrompt 自定义提示词(可选)
 * @returns 翻译结果数组 { id, translatedTitle }
 */
export const translateTitlesBatch = async (
  items: { id: number; title: string }[],
  customPrompt: string = DEFAULT_PROMPT
): Promise<TranslationResult[]> => {
  if (items.length === 0) return [];

  const startTime = Date.now();
  console.log(`[LLM Service] 开始批量翻译 ${items.length} 个标题`);

  const systemPrompt = `
    ${customPrompt}

    ---------------------------------------------------
    TASK: Translate the headlines provided by the user.

    CRITICAL OUTPUT INSTRUCTIONS:
    1. You MUST return valid JSON only.
    2. The root object MUST have a property "translations" which is an array.
    3. Each item in the array must contain:
       - "id": The original number ID.
       - "translatedTitle": The Chinese translation.

    Example JSON structure:
    {
      "translations": [
        { "id": 123, "translatedTitle": "中文标题..." }
      ]
    }
  `;

  const userPrompt = JSON.stringify(items);

  const apiStartTime = Date.now();
  const content = await callLLM([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], true);
  const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(2);
  console.log(`  [LLM Service] API调用耗时: ${apiDuration}秒`);

  if (!content) {
    console.log(`[LLM Service] API返回空内容`);
    return [];
  }

  try {
    const parseStartTime = Date.now();

    // 清理可能存在的 markdown 代码块标记
    let cleanedContent = content.trim();

    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.slice(7);
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.slice(3);
    }

    if (cleanedContent.endsWith('```')) {
      cleanedContent = cleanedContent.slice(0, -3);
    }

    cleanedContent = cleanedContent.trim();

    const parsed = JSON.parse(cleanedContent) as any;
    const parseDuration = ((Date.now() - parseStartTime) / 1000).toFixed(2);
    console.log(`  [LLM Service] JSON解析耗时: ${parseDuration}秒`);

    // 支持两种格式: { translations: [...] } 或直接 [...]
    let result: TranslationResult[] = [];
    if (parsed.translations && Array.isArray(parsed.translations)) {
      result = parsed.translations;
    } else if (Array.isArray(parsed)) {
      result = parsed;
    } else {
      console.warn('[LLM Service] Unexpected JSON format:', parsed);
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[LLM Service] 完成 ${result.length}/${items.length} 个标题, 总耗时: ${totalDuration}秒`);

    return result;

  } catch (error) {
    const errorDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[LLM Service] 解析失败, 耗时: ${errorDuration}秒, 错误:`, error);
    console.error('[LLM Service] Original content:', content);
    return [];
  }
};

/**
 * 翻译完整的 Markdown 文章
 * @param markdownContent 原始 Markdown 内容
 * @param customPrompt 自定义提示词(可选)
 * @returns 翻译后的 Markdown 内容
 */
export const translateArticle = async (
  markdownContent: string,
  customPrompt: string = DEFAULT_PROMPT
): Promise<string> => {
  if (!markdownContent) return "";

  const startTime = Date.now();
  console.log(`  [LLM Service] 准备翻译文章, 内容长度: ${markdownContent.length}字符`);

  // 精简版提示词
  const systemPrompt = `
    ${customPrompt}

    ---------------------------------------------------
    TASK: Extract and translate the article from raw webpage content.

    The input contains website noise (navigation, sidebars, ads, footers, etc.) mixed with the actual article.
    
    You MUST:
    1. Identify the main article body (headline + coherent paragraphs).
    2. DISCARD all non-article content - do NOT include any noise in your output.
    3. Translate only the article into Chinese Markdown.
    4. Preserve article formatting (headers, bold, links, images).
    5. Do NOT wrap output in code blocks.
  `;

  // 详细版提示词
  const systemPromptVerbose = `
    ${customPrompt}
  
    ---------------------------------------------------
    TASK: Translate the following English Markdown content into Chinese Markdown.
  
    STEP 1 - CONTENT EXTRACTION (Critical):
    The input is raw scraped webpage content that contains BOTH the article AND website noise.
    You MUST first mentally identify the following noise elements:
    - Navigation menus (e.g., "Home | About | Contact | Login")
    - Site headers/footers with repeated branding
    - Sidebar content (categories, tags, archives, popular posts)
    - Social sharing buttons ("Share on Twitter", "Follow us")
    - Advertisement blocks and sponsored content
    - Cookie/privacy notices
    - "Related articles", "You might also like" sections
    - Comment sections or "Leave a reply" forms
    - Newsletter signup prompts
  
    ⚠️ DO NOT translate these noise elements.
    ⚠️ DO NOT include them in your output AT ALL - not even in their original English form.
  
    Only extract and translate the MAIN ARTICLE BODY - typically identified by:
    - A clear headline/title
    - Coherent paragraphs forming a complete narrative
    - Author byline and publication date (if present)
  
    STEP 2 - TRANSLATION OUTPUT:
    1. Output ONLY the clean, translated Chinese Markdown of the article body.
    2. Your output should contain ZERO website navigation, ads, or other noise.
    3. Do NOT wrap output in markdown code blocks.
    4. Preserve Markdown formatting (headers, bold, italic, images) within the article.
    5. Preserve links that are PART OF the article content (inline references, citations).
    6. Translate the article title as well.
  `;

  const apiStartTime = Date.now();
  const content = await callLLM([
    { role: "system", content: systemPromptVerbose },
    { role: "user", content: markdownContent }
  ], false);
  const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(2);

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`  [LLM Service] API调用耗时: ${apiDuration}秒, 总耗时: ${totalDuration}秒`);

  return content || "Translation generation failed.";
};

interface CommentTranslationResult {
  id: number;
  translatedText: string;
}

/**
 * 批量翻译评论
 * @param items 要翻译的评论数组 { id, text }
 * @param customPrompt 自定义提示词(可选)
 * @returns 翻译结果数组 { id, translatedText }
 */
export const translateCommentsBatch = async (
  items: { id: number; text: string }[],
  customPrompt: string = DEFAULT_PROMPT
): Promise<CommentTranslationResult[]> => {
  if (items.length === 0) return [];

  const startTime = Date.now();
  console.log(`[LLM Service] 开始批量翻译 ${items.length} 条评论`);

  const systemPrompt = `
    ${customPrompt}

    ---------------------------------------------------
    TASK: Translate the HackerNews comments provided by the user.

    CRITICAL OUTPUT INSTRUCTIONS:
    1. You MUST return valid JSON only.
    2. The root object MUST have a property "translations" which is an array.
    3. Each item in the array must contain:
       - "id": The original number ID.
       - "translatedText": The Chinese translation of the comment.
    4. Comments may contain HTML tags (like <p>, <a>, <code>, <pre>, <i>). Preserve these HTML tags exactly as they are, only translate the text content within them.
    5. Preserve any code snippets, URLs, and technical terms.

    Example JSON structure:
    {
      "translations": [
        { "id": 123, "translatedText": "<p>这是翻译后的评论...</p>" }
      ]
    }
  `;

  const userPrompt = JSON.stringify(items);

  const apiStartTime = Date.now();
  const content = await callLLM([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ], true);
  const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(2);
  console.log(`  [LLM Service] 评论翻译API调用耗时: ${apiDuration}秒`);

  if (!content) {
    console.log(`[LLM Service] 评论翻译API返回空内容`);
    return [];
  }

  try {
    // 清理可能存在的 markdown 代码块标记
    let cleanedContent = content.trim();

    if (cleanedContent.startsWith('```json')) {
      cleanedContent = cleanedContent.slice(7);
    } else if (cleanedContent.startsWith('```')) {
      cleanedContent = cleanedContent.slice(3);
    }

    if (cleanedContent.endsWith('```')) {
      cleanedContent = cleanedContent.slice(0, -3);
    }

    cleanedContent = cleanedContent.trim();

    const parsed = JSON.parse(cleanedContent) as any;

    // 支持两种格式: { translations: [...] } 或直接 [...]
    let result: CommentTranslationResult[] = [];
    if (parsed.translations && Array.isArray(parsed.translations)) {
      result = parsed.translations;
    } else if (Array.isArray(parsed)) {
      result = parsed;
    } else {
      console.warn('[LLM Service] 评论翻译返回格式异常:', parsed);
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[LLM Service] 完成 ${result.length}/${items.length} 条评论翻译, 总耗时: ${totalDuration}秒`);

    return result;

  } catch (error) {
    const errorDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[LLM Service] 评论翻译解析失败, 耗时: ${errorDuration}秒, 错误:`, error);
    console.error('[LLM Service] Original content:', content);
    return [];
  }
};
