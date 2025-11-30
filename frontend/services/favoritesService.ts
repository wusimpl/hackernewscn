import { Story } from '../types';

const FAVORITES_KEY = 'hn_favorites';

export interface FavoriteItem {
  story: Story;
  savedAt: number;
}

// 获取所有收藏
export const getFavorites = (): FavoriteItem[] => {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// 检查是否已收藏
export const isFavorited = (storyId: number): boolean => {
  const favorites = getFavorites();
  return favorites.some(item => item.story.id === storyId);
};

// 添加收藏
export const addFavorite = (story: Story): void => {
  const favorites = getFavorites();
  if (!favorites.some(item => item.story.id === story.id)) {
    favorites.unshift({ story, savedAt: Date.now() });
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }
};

// 移除收藏
export const removeFavorite = (storyId: number): void => {
  const favorites = getFavorites();
  const filtered = favorites.filter(item => item.story.id !== storyId);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(filtered));
};

// 切换收藏状态
export const toggleFavorite = (story: Story): boolean => {
  if (isFavorited(story.id)) {
    removeFavorite(story.id);
    return false;
  } else {
    addFavorite(story);
    return true;
  }
};
