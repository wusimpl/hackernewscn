/**
 * 数据迁移工具
 * 用于检测和清理旧版本的 localStorage 缓存
 */

const LEGACY_STORAGE_KEYS = [
  'hn-cn-title-cache',
  'hn-cn-article-cache',
  'hn-cn-custom-prompt'
];

/**
 * 检查是否存在旧版本的 localStorage 数据
 */
export const hasLegacyCache = (): boolean => {
  try {
    return LEGACY_STORAGE_KEYS.some(key => {
      const value = localStorage.getItem(key);
      return value !== null && value !== '';
    });
  } catch (error) {
    console.error('检查旧缓存失败:', error);
    return false;
  }
};

/**
 * 清除旧版本的 localStorage 数据
 */
export const clearLegacyCache = (): void => {
  try {
    LEGACY_STORAGE_KEYS.forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('已清除旧版本缓存');
  } catch (error) {
    console.error('清除旧缓存失败:', error);
  }
};

/**
 * 获取迁移状态标记
 */
export const getMigrationFlag = (): boolean => {
  try {
    return localStorage.getItem('hn-cn-migrated') === 'true';
  } catch (error) {
    return false;
  }
};

/**
 * 设置迁移状态标记
 */
export const setMigrationFlag = (): void => {
  try {
    localStorage.setItem('hn-cn-migrated', 'true');
  } catch (error) {
    console.error('设置迁移标记失败:', error);
  }
};
