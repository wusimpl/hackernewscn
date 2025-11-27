import React, { useState } from 'react';
import { Story } from '../types';
import { CommentsPanel } from './CommentsPanel';

interface StoryItemProps {
  story: Story;
  index: number;
  onRead: (story: Story) => void;
}

const timeAgo = (timestamp: number) => {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " 年前";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " 月前";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " 天前";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " 小时前";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " 分钟前";
  return Math.floor(seconds) + " 秒前";
};

const getDomain = (url?: string) => {
  if (!url) return '';
  try {
    const domain = new URL(url).hostname;
    return `(${domain.replace('www.', '')})`;
  } catch (e) {
    return '';
  }
};

export const StoryItem: React.FC<StoryItemProps> = ({ story, index, onRead }) => {
  const [showComments, setShowComments] = useState(false);

  // Handle main click
  const handleClick = (e: React.MouseEvent) => {
    if (story.url) {
      e.preventDefault();
      // If already processing, do nothing or show toast
      if (story.isArticleTranslating) return;
      onRead(story);
    }
  };

  // Handle comments button click
  const handleCommentsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowComments(true);
  };

  // Handle closing comments panel
  const handleCloseComments = () => {
    setShowComments(false);
  };

  return (
    <div className="flex gap-2 py-2 px-2 sm:px-4 hover:bg-[#242424] transition-colors group">
      {/* Index and Vote */}
      <div className="flex flex-col items-end min-w-[30px] sm:min-w-[40px] pt-1">
        <span className="text-[#828282] text-sm font-mono">{index}.</span>
        <div className="w-0 h-0 
          border-l-[4px] border-l-transparent
          border-r-[4px] border-r-transparent
          border-b-[8px] border-b-[#828282]
          mt-1 cursor-pointer hover:border-b-[#a0a0a0]"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col">
          {/* Main Title */}
          <div className="flex items-baseline flex-wrap gap-x-2">
            <span
              onClick={handleClick}
              className={`
                font-medium text-[15px] sm:text-[16px] leading-snug 
                hover:text-white cursor-pointer
                ${story.isRead ? 'text-[#828282]' : 'text-[#dcdcdc]'}
              `}
            >
              {story.translatedTitle || story.title}
            </span>
            <span className="text-[#666] text-xs sm:text-sm truncate">
              {getDomain(story.url)}
            </span>

            {story.isNew && (
              <span className="text-[10px] uppercase bg-[#ff6600] text-black px-1 rounded font-bold">
                New
              </span>
            )}

            {story.isArticleTranslating && (
              <span className="flex items-center gap-1 text-[#ff6600] text-xs animate-pulse">
                <div className="w-2 h-2 rounded-full bg-[#ff6600]"></div>
                翻译中...
              </span>
            )}

            {/* Direct external link icon */}
            {story.url && (
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-[#828282] hover:text-[#ff6600] text-xs hover:underline ml-1"
                title="Open original link"
                onClick={(e) => e.stopPropagation()}
              >
                [原文 ↗]
              </a>
            )}
          </div>

          {/* Sub Title */}
          {story.translatedTitle && (
            <div className="text-[#666] text-xs sm:text-sm mt-0.5 font-light">
              {story.title}
            </div>
          )}

          {/* Metadata */}
          <div className="text-[#828282] text-xs mt-1.5 flex flex-wrap gap-x-1">
            <span>{story.score} 分</span>
            <span>作者 {story.by}</span>
            <span>{timeAgo(story.time)}</span>
            <span>|</span>
            <button
              onClick={handleCommentsClick}
              className="hover:underline hover:text-[#ff6600] transition-colors cursor-pointer bg-transparent border-none p-0 text-[#828282] text-xs"
            >
              {story.descendants || 0} 评论
            </button>

            {story.isTranslating && (
              <span className="ml-2 text-[#ff6600] animate-pulse">
                翻译标题中...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Comments Panel */}
      <CommentsPanel
        isOpen={showComments}
        onClose={handleCloseComments}
        storyId={story.id}
        storyTitle={story.translatedTitle || story.title}
        mode="overlay"
      />
    </div>
  );
};