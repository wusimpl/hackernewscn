import fetch from 'node-fetch';
import { getCurrentProvider } from './llmConfig';
import {
  getPrompt,
  getDefaultPrompt,
  DEFAULT_ARTICLE_PROMPT,
  DEFAULT_TLDR_PROMPT,
  DEFAULT_COMMENT_PROMPT,
  PromptType
} from './promptsConfig';

// 向后兼容：导出默认提示词常量
export const DEFAULT_PROMPT = DEFAULT_ARTICLE_PROMPT;
export { DEFAULT_TLDR_PROMPT, DEFAULT_COMMENT_PROMPT, PromptType, getDefaultPrompt };

interface Message {
  role: string;
  content: string;
}

interface TranslationResult {
  id: number;
  translatedTitle: string;
}

/**
 * 获取当前 LLM 配置（优先使用 JSON 配置，回退到 .env）
 */
function getLLMSettings(): { apiKey: string; baseUrl: string; model: string; isThinkingModel: boolean } | null {
  // 优先从 JSON 配置获取
  const provider = getCurrentProvider();
  if (provider && provider.api_key) {
    return {
      apiKey: provider.api_key,
      baseUrl: provider.api_base,
      model: provider.model,
      isThinkingModel: provider.is_thinking_model ?? false
    };
  }
  // 没有配置的 LLM 提供商
  return null;
}

/**
 * 移除推理模型返回内容中的思维链 <think>...</think>
 */
function stripThinkingContent(content: string): string {
  // 匹配 <think>...</think> 标签及其内容（支持多行）
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
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
  const llmSettings = getLLMSettings();

  if (!llmSettings) {
    console.warn('[LLM Service] No LLM provider configured');
    return null;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmSettings.apiKey}`
      };

      const body: any = {
        model: llmSettings.model,
        messages: messages,
        temperature: 0.3, // 较低温度以获得更确定性的翻译
      };

      if (jsonMode) {
        body.response_format = { type: "json_object" };
      }

      const response = await fetch(`${llmSettings.baseUrl}/chat/completions`, {
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
      let responseContent = data.choices?.[0]?.message?.content || null;

      // 如果是推理模型，移除思维链内容
      if (responseContent && llmSettings.isThinkingModel) {
        responseContent = stripThinkingContent(responseContent);
      }

      return responseContent;

    } catch (error) {
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
  customPrompt?: string
): Promise<TranslationResult[]> => {
  const promptToUse = customPrompt ?? getPrompt('article');
  if (items.length === 0) return [];

  const startTime = Date.now();
  console.log(`[LLM Service] 开始批量翻译 ${items.length} 个标题`);

  const systemPrompt = `${promptToUse}

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
}`;

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
 * @param storyId 文章ID(可选，用于日志)
 * @returns 翻译后的 Markdown 内容
 */
export const translateArticle = async (
  markdownContent: string,
  customPrompt?: string,
  storyId?: number
): Promise<string> => {
  const promptToUse = customPrompt ?? getPrompt('article');
  if (!markdownContent) return "";

  const startTime = Date.now();
  console.log(`  [LLM Service] 准备翻译文章, storyId: ${storyId ?? 'unknown'}, 内容长度: ${markdownContent.length}字符`);

  // 详细版提示词
  const systemPromptVerbose = `${promptToUse}

---------------------------------------------------
TASK: Translate the following English Markdown content into Chinese Markdown.

⚠️ CRITICAL - OUTPUT FORMAT:
- Start your response DIRECTLY with the translated article content.
- Do NOT include ANY preamble, introduction, or meta-commentary such as:
  ❌ "好的，这是翻译后的结果..."
  ❌ "以下是翻译内容..."
  ❌ "我已经按照要求..."
- Do NOT include ANY closing remarks or summary about what you did.
- Your ENTIRE response should be ONLY the translated article itself.

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
1. Output ONLY the clean, translated Chinese Markdown of the article body WITH images embedded.
2. Your output should contain ZERO website navigation, ads, or other noise.
3. Do NOT wrap output in markdown code blocks.
4. Preserve Markdown formatting (headers, bold, italic) within the article.
5. Preserve links that are PART OF the article content (inline references, citations).
6. Translate the article title as well.`;

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

/**
 * 生成文章 TLDR 摘要
 * @param markdownContent 原始 Markdown 内容（英文）
 * @param customPrompt 自定义提示词(可选)
 * @param storyId 文章ID(可选，用于日志)
 * @returns 中文 TLDR 摘要
 */
export const generateTLDR = async (
  markdownContent: string,
  customPrompt?: string,
  storyId?: number
): Promise<string> => {
  if (!markdownContent) return "";

  const promptToUse = customPrompt ?? getPrompt('tldr');

  const startTime = Date.now();
  console.log(`  [LLM Service] 准备生成TLDR, storyId: ${storyId ?? 'unknown'}, 内容长度: ${markdownContent.length}字符`);

  const apiStartTime = Date.now();
  const content = await callLLM([
    { role: "system", content: promptToUse },
    { role: "user", content: markdownContent }
  ], false);
  const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(2);

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`  [LLM Service] TLDR生成完成, storyId: ${storyId ?? 'unknown'}, API调用耗时: ${apiDuration}秒, 总耗时: ${totalDuration}秒`);

  return content || "";
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
  customPrompt?: string
): Promise<CommentTranslationResult[]> => {
  if (items.length === 0) return [];

  const promptToUse = customPrompt ?? getPrompt('comment');

  const startTime = Date.now();
  console.log(`[LLM Service] 开始批量翻译 ${items.length} 条评论`);

  const systemPrompt = `${promptToUse}

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
    { "id": 123, "translatedText": "<p>这不就是重复造轮子吗，还造得更烂。</p>" }
  ]
}`;

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
