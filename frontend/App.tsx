import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { StoryItem } from './components/StoryItem';
import { ReaderModal } from './components/ReaderModal';
import { NotificationToast } from './components/NotificationToast';
import { ErrorToast } from './components/ErrorToast';
import { TranslatingToast } from './components/TranslatingToast';
import { fetchStories, fetchMoreStories } from './services/hnService';
import { getArticleCache, getArticle } from './services/cacheService';
import { Story, LoadingState, CachedArticle } from './types';
import { useServerCache } from './config';
import { hasLegacyCache, clearLegacyCache, getMigrationFlag, setMigrationFlag } from './utils/migration';

// Constants
const INITIAL_ITEMS = 20;
const LOAD_MORE_ITEMS = 10;
const READ_STORIES_KEY = 'hn_read_stories';

// 已读状态持久化
const getReadStories = (): Set<number> => {
  try {
    const stored = localStorage.getItem(READ_STORIES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveReadStory = (storyId: number) => {
  try {
    const readStories = getReadStories();
    readStories.add(storyId);
    // 只保留最近 500 条记录
    const arr = Array.from(readStories).slice(-500);
    localStorage.setItem(READ_STORIES_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
};

const App: React.FC = () => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Article Translation Cache
  const [articleCache, setArticleCache] = useState<Record<number, CachedArticle>>({});

  // Notification State
  const [notification, setNotification] = useState<{ storyId: number, title: string } | null>(null);

  // Error Notification State
  const [errorNotification, setErrorNotification] = useState<{ title: string, errorCode?: number, errorMessage: string } | null>(null);

  // Translating Notification State (for Load More)
  const [translatingCount, setTranslatingCount] = useState<number | null>(null);

  // Reader Modal State
  const [readerOpen, setReaderOpen] = useState(false);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [readerContent, setReaderContent] = useState<string>("");
  const [readerStatus, setReaderStatus] = useState<string>("");
  const [readerLoading, setReaderLoading] = useState(false);
  const [isCacheReady, setIsCacheReady] = useState(false);

  // SSE connection ref
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load Saved Data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // 检查是否需要数据迁移
        if (useServerCache && !getMigrationFlag() && hasLegacyCache()) {
          const shouldMigrate = confirm(
            '检测到旧版本的本地缓存数据。\n\n' +
            '新版本已切换到服务端缓存，所有用户可以共享翻译结果。\n' +
            '是否清除本地缓存数据？\n\n' +
            '（点击"确定"清除，点击"取消"保留但不再使用）'
          );
          
          if (shouldMigrate) {
            clearLegacyCache();
            console.log('已清除旧版本本地缓存');
          }
          
          setMigrationFlag();
        }

        // Load article cache from backend
        const cacheRecords = await getArticleCache();
        // Convert ArticleTranslationRecord[] to Record<number, CachedArticle>
        const cacheMap: Record<number, CachedArticle> = {};
        cacheRecords
          .filter(record => record.status === 'done')
          .forEach(record => {
            cacheMap[record.story_id] = {
              id: record.story_id,
              title: record.title_snapshot,
              content: record.content_markdown,
              originalUrl: record.original_url,
              timestamp: record.updated_at || Date.now()
            };
          });
        setArticleCache(cacheMap);
      } catch (error) {
        console.error("Failed to load initial data from backend:", error);
      } finally {
        setIsCacheReady(true);
      }
    };

    loadInitialData();
  }, []);

  // SSE 实时通知监听
  useEffect(() => {
    if (!isCacheReady) return;

    // 建立 SSE 连接
    const connectSSE = () => {
      try {
        const eventSource = new EventSource(`${import.meta.env.VITE_API_BASE_URL || '/api'}/events`);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          console.log('[SSE] 连接已建立');
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // 处理连接确认
            if (data.type === 'connected') {
              console.log('[SSE] 连接确认');
              return;
            }

            // 处理故事列表更新事件 (调度器完成翻译后推送)
            if (data.type === 'stories.updated') {
              console.log('[SSE] 收到故事更新事件:', data);
              
              const { stories: newStories, lastUpdatedAt: newLastUpdatedAt } = data;
              
              console.log('[SSE] newStories:', newStories);
              console.log('[SSE] newStories 是数组?', Array.isArray(newStories));
              console.log('[SSE] newStories 长度:', newStories?.length);
              
              if (newStories && Array.isArray(newStories)) {
                // 更新故事列表 - 合并新故事到现有列表
                setStories(prev => {
                  console.log('[SSE] 当前 stories 数量:', prev.length);
                  console.log('[SSE] 当前 stories IDs:', prev.map(s => s.id));
                  
                  const existingIds = new Set(prev.map(s => s.id));
                  console.log('[SSE] existingIds:', [...existingIds]);
                  
                  const updatedStories = prev.map(s => {
                    const updated = newStories.find((ns: Story) => ns.id === s.id);
                    if (updated) {
                      console.log('[SSE] 更新已存在的故事:', s.id, updated);
                    }
                    return updated ? { ...s, ...updated } : s;
                  });
                  
                  // 添加新故事到列表开头，标记为 isNew，并应用已读状态
                  const readSet = getReadStories();
                  const brandNewStories = newStories
                    .filter((ns: Story) => !existingIds.has(ns.id))
                    .map((ns: Story) => ({ ...ns, isNew: true, isRead: readSet.has(ns.id) }));
                  
                  console.log('[SSE] 新故事数量:', brandNewStories.length);
                  console.log('[SSE] 新故事 IDs:', brandNewStories.map(s => s.id));
                  console.log('[SSE] 新故事详情:', brandNewStories);
                  
                  const result = [...brandNewStories, ...updatedStories];
                  console.log('[SSE] 合并后 stories 数量:', result.length);
                  
                  return result;
                });
              } else {
                console.log('[SSE] newStories 无效，跳过更新');
              }
              
              if (newLastUpdatedAt) {
                setLastUpdatedAt(newLastUpdatedAt);
              }
            }

            // 处理文章翻译完成事件
            if (data.type === 'article.done') {
              // console.log('[SSE] 收到文章翻译完成事件:', data);
              
              const { storyId, title, content, originalUrl, story: newStory } = data;
              
              // 更新缓存
              const newCacheItem: CachedArticle = {
                id: storyId,
                title: title,
                content: content,
                originalUrl: originalUrl,
                timestamp: Date.now()
              };
              
              setArticleCache(prev => ({
                ...prev,
                [storyId]: newCacheItem
              }));

              // 更新 stories 状态
              setStories(prev => {
                const existingIndex = prev.findIndex(s => s.id === storyId);
                
                if (existingIndex >= 0) {
                  // 故事已存在，更新状态
                  return prev.map(s =>
                    s.id === storyId 
                      ? { ...s, isArticleTranslating: false, hasTranslatedArticle: true }
                      : s
                  );
                } else if (newStory) {
                  // 故事不存在，按 hnRank 插入到正确位置
                  const storyToAdd: Story = { ...newStory, isNew: true };
                  const newList = [...prev];
                  
                  // 找到正确的插入位置（按 hnRank 排序）
                  if (storyToAdd.hnRank !== undefined) {
                    const insertIndex = newList.findIndex(s => 
                      s.hnRank !== undefined && s.hnRank > storyToAdd.hnRank!
                    );
                    if (insertIndex >= 0) {
                      newList.splice(insertIndex, 0, storyToAdd);
                    } else {
                      // 没找到更大的 hnRank，添加到末尾
                      newList.push(storyToAdd);
                    }
                  } else {
                    // 没有 hnRank，添加到开头
                    newList.unshift(storyToAdd);
                  }
                  
                  console.log('[SSE] 新故事已插入列表:', storyId, 'hnRank:', storyToAdd.hnRank);
                  return newList;
                }
                
                return prev;
              });

              // If reader is open and waiting for this article, update content
              setActiveStory(prev => {
                if (prev && prev.id === storyId) {
                  setReaderContent(content);
                  setReaderLoading(false);
                }
                return prev;
              });

              // 显示通知
              setNotification({
                storyId: storyId,
                title: title
              });
            }

            // 处理文章翻译失败事件
            if (data.type === 'article.error') {
              console.log('[SSE] 收到文章翻译失败事件:', data);
              
              const { storyId, title, errorMessage } = data;

              // 移除翻译中标记
              setStories(prev => prev.map(s =>
                s.id === storyId 
                  ? { ...s, isArticleTranslating: false }
                  : s
              ));

              // If reader is open and waiting for this article, close it
              setActiveStory(prev => {
                if (prev && prev.id === storyId) {
                  setReaderLoading(false);
                  setReaderOpen(false);
                }
                return prev;
              });

              // 显示错误通知
              setErrorNotification({
                title: title,
                errorMessage: errorMessage || '翻译失败'
              });
            }

          } catch (error) {
            console.error('[SSE] 解析事件数据失败:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('[SSE] 连接错误:', error);
          eventSource.close();
          eventSourceRef.current = null;
          
          // 5秒后尝试重连
          setTimeout(() => {
            console.log('[SSE] 尝试重新连接...');
            connectSSE();
          }, 5000);
        };

      } catch (error) {
        console.error('[SSE] 创建连接失败:', error);
      }
    };

    connectSSE();

    // 清理函数
    return () => {
      if (eventSourceRef.current) {
        console.log('[SSE] 关闭连接');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isCacheReady]);

  // Sync cache with stories to update UI indicators
  // Only set hasTranslatedArticle to true if local cache has it, don't override server state
  useEffect(() => {
    setStories(prev => prev.map(s => ({
      ...s,
      // Keep true if already true (from server) or if local cache has it
      hasTranslatedArticle: s.hasTranslatedArticle || !!articleCache[s.id]
    })));
  }, [articleCache]);

  const loadMore = async () => {
    if (loadingState === LoadingState.LOADING_STORIES) return;
    
    setLoadingState(LoadingState.LOADING_STORIES);
    try {
      // 使用最后一个故事的 hnRank + 1 作为 cursor
      // 这样可以正确加载 HN 排名中更靠后的故事
      const lastStory = stories[stories.length - 1];
      const cursor = lastStory?.hnRank !== undefined ? lastStory.hnRank + 1 : stories.length;
      const result = await fetchMoreStories(cursor, LOAD_MORE_ITEMS);
      
      if (result.stories.length > 0) {
        // 过滤掉已存在的故事，避免重复
        const existingIds = new Set(stories.map(s => s.id));
        const readStories = getReadStories();
        const newStories = result.stories
          .filter(s => !existingIds.has(s.id))
          .map(s => ({ ...s, isRead: readStories.has(s.id) }));
        setStories(prev => [...prev, ...newStories]);
      }

      // 如果有未翻译的文章，显示提示
      if (result.untranslatedCount > 0) {
        setTranslatingCount(result.untranslatedCount);
      }
    } catch (error) {
      console.error("Failed to load more stories", error);
    } finally {
      setLoadingState(LoadingState.IDLE);
    }
  };

  // --- Article Reading Logic ---

  // Click Handler - 点击文章时获取已翻译的内容
  const handleArticleClick = async (story: Story) => {
    // 标记为已读
    if (!story.isRead) {
      saveReadStory(story.id);
      setStories(prev => prev.map(s => 
        s.id === story.id ? { ...s, isRead: true, isNew: false } : s
      ));
    } else if (story.isNew) {
      // 移除 isNew 标记
      setStories(prev => prev.map(s => 
        s.id === story.id ? { ...s, isNew: false } : s
      ));
    }

    // Step 1: Check local cache first - display immediately if available
    if (articleCache[story.id]) {
      openReader(story, articleCache[story.id].content);
      return;
    }

    // Step 2: If server has translated article, fetch from API
    if (story.hasTranslatedArticle) {
      setActiveStory(story);
      setReaderOpen(true);
      setReaderLoading(true);
      setReaderStatus("正在加载翻译内容...");

      try {
        const article = await getArticle(story.id);
        if (article && article.status === 'done') {
          // Update local cache for future access
          const newCacheItem: CachedArticle = {
            id: article.story_id,
            title: article.title_snapshot,
            content: article.content_markdown,
            originalUrl: article.original_url,
            timestamp: article.updated_at || Date.now()
          };
          setArticleCache(prev => ({ ...prev, [story.id]: newCacheItem }));
          setReaderContent(article.content_markdown);
          setReaderLoading(false);
          return;
        }
      } catch (error) {
        console.error("Failed to fetch article from server:", error);
        setReaderLoading(false);
        setReaderOpen(false);
        setErrorNotification({
          title: story.translatedTitle || story.title,
          errorMessage: '加载翻译内容失败，请重试。'
        });
        return;
      }
    }

    // Step 3: Article not yet translated - show message
    setErrorNotification({
      title: story.translatedTitle || story.title,
      errorMessage: '该文章尚未翻译，请稍后再试。'
    });
  };

  // 3. Open Reader
  const openReader = (story: Story, content?: string) => {
    setActiveStory(story);
    setReaderOpen(true);

    if (content) {
      setReaderContent(content);
      setReaderLoading(false);
    } else if (articleCache[story.id]) {
      // Fallback check
      setReaderContent(articleCache[story.id].content);
      setReaderLoading(false);
    } else {
      // Fallback for direct read (shouldn't really happen in this new flow, but safe to keep)
      setReaderLoading(true);
      setReaderStatus("Content not ready. Please wait...");
    }
  };

  // 4. Handle Notification Click
  const handleNotificationClick = () => {
    if (notification) {
      // Find the story object (it might be in the current list, or we construct a dummy one)
      const storyInList = stories.find(s => s.id === notification.storyId);
      const cachedItem = articleCache[notification.storyId];

      if (cachedItem) {
        const storyObj: Story = storyInList || {
          id: cachedItem.id,
          title: cachedItem.title,
          by: 'unknown',
          score: 0,
          time: Math.floor(cachedItem.timestamp / 1000),
          descendants: 0,
          url: cachedItem.originalUrl,
          type: 'story',
          isTranslating: false
        };
        openReader(storyObj, cachedItem.content);
      }
      setNotification(null);
    }
  };

  // Initial data loading - just fetch stories once when cache is ready
  useEffect(() => {
    if (!isCacheReady) return;

    const loadInitialStories = async () => {
      setLoadingState(LoadingState.LOADING_STORIES);
      try {
        const result = await fetchStories({ cursor: 0, limit: INITIAL_ITEMS });
        // 应用已读状态
        const readStories = getReadStories();
        const storiesWithReadState = result.stories.map(s => ({
          ...s,
          isRead: readStories.has(s.id)
        }));
        setStories(storiesWithReadState);
        setLastUpdatedAt(result.lastUpdatedAt);
      } catch (error) {
        console.error("Failed to load stories", error);
        setLoadingState(LoadingState.ERROR);
      } finally {
        setLoadingState(LoadingState.IDLE);
      }
    };

    loadInitialStories();
  }, [isCacheReady]);

  return (
    <div className="min-h-screen pb-10 font-sans">
      <Header
        isLoading={loadingState === LoadingState.LOADING_STORIES}
        lastUpdatedAt={lastUpdatedAt}
      />

      <ReaderModal
        isOpen={readerOpen}
        onClose={() => setReaderOpen(false)}
        title={activeStory?.translatedTitle || activeStory?.title || "Reader"}
        originalUrl={activeStory?.url}
        content={readerContent}
        isLoading={readerLoading}
        statusMessage={readerStatus}
        storyId={activeStory?.id}
        commentCount={activeStory?.descendants}
      />

      {notification && (
        <NotificationToast
          storyId={notification.storyId}
          title={notification.title}
          onClick={handleNotificationClick}
          onClose={() => setNotification(null)}
        />
      )}

      {errorNotification && (
        <ErrorToast
          title={errorNotification.title}
          errorCode={errorNotification.errorCode}
          errorMessage={errorNotification.errorMessage}
          onClose={() => setErrorNotification(null)}
        />
      )}

      {translatingCount !== null && translatingCount > 0 && (
        <TranslatingToast
          count={translatingCount}
          onClose={() => setTranslatingCount(null)}
        />
      )}

      <main className="max-w-5xl mx-auto sm:my-4 bg-[#1a1a1a] sm:bg-[#1a1a1a]">
        {loadingState === LoadingState.ERROR && (
          <div className="text-red-500 p-4 text-center">
            加载新闻失败，请检查网络连接。
          </div>
        )}

        <div className="bg-[#1a1a1a]">
          {stories.map((story, idx) => (
            <StoryItem
              key={`${story.id}-${idx}`}
              story={story}
              index={idx + 1}
              onRead={handleArticleClick}
            />
          ))}
        </div>

        {stories.length > 0 && (
          <div className="px-4 py-6 ml-8 sm:ml-10">
            <button
              onClick={loadMore}
              disabled={loadingState === LoadingState.LOADING_STORIES}
              className="text-[#dcdcdc] font-bold text-sm sm:text-base hover:text-[#ff6600] transition-colors"
            >
              {loadingState === LoadingState.LOADING_STORIES ? '加载中...' : '更多'}
            </button>
          </div>
        )}

        {stories.length === 0 && loadingState === LoadingState.LOADING_STORIES && (
          <div className="p-10 text-center text-[#828282]">
            正在加载热门新闻...
          </div>
        )}

        <footer className="mt-8 border-t border-[#ff6600] py-4 text-center">
          <p className="text-xs text-[#828282]">
            由 Hacker News API 和 LLM 驱动
          </p>
        </footer>
      </main>
    </div>
  );
};

export default App;
