import React, { useState } from 'react';
import { CommentTreeNode } from '../types';

interface CommentItemProps {
  comment: CommentTreeNode;
  depth: number;
}

// Convert Unix timestamp to relative time string
const timeAgo = (timestamp: number): string => {
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

// Count total replies in a comment tree
const countReplies = (comment: CommentTreeNode): number => {
  if (!comment.children || comment.children.length === 0) return 0;
  return comment.children.reduce((sum, child) => sum + 1 + countReplies(child), 0);
};

// Maximum indentation depth to prevent excessive nesting
const MAX_INDENT_DEPTH = 4;
const INDENT_PX = 16; // pixels per indent level

export const CommentItem: React.FC<CommentItemProps> = ({ comment, depth }) => {
  const isDeepNested = depth >= MAX_INDENT_DEPTH;
  // Deep nested comments are collapsed by default
  const [isCollapsed, setIsCollapsed] = useState(isDeepNested);
  
  // Calculate indentation - cap at MAX_INDENT_DEPTH to prevent excessive nesting
  const indentLevel = Math.min(depth, MAX_INDENT_DEPTH);
  const indentPx = indentLevel * INDENT_PX;

  const hasTranslation = !!comment.translatedText;
  const hasChildren = comment.children && comment.children.length > 0;
  const replyCount = hasChildren ? countReplies(comment) : 0;

  // Handle deleted or dead comments
  if (comment.deleted || comment.dead) {
    return (
      <div style={{ paddingLeft: `${indentPx}px` }}>
        <div className="py-2 border-l-2 border-[#333] pl-3 mb-2">
          <p className="text-[#666] text-sm italic">
            {comment.deleted ? '[评论已删除]' : '[评论不可用]'}
          </p>
        </div>
        {/* Still render children if any */}
        {hasChildren && !isCollapsed && (
          <div>
            {comment.children!.map(child => (
              <CommentItem key={child.id} comment={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: `${indentPx}px` }}>
      <div className="py-2 border-l-2 border-[#444] pl-3 mb-2 hover:border-[#ff6600] transition-colors">
        {/* Comment header: author and time */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[#ff6600] text-sm font-medium">
            {comment.author || '匿名'}
          </span>
          <span className="text-[#666] text-xs">
            {timeAgo(comment.time)}
          </span>
          {/* Show deep reply indicator */}
          {isDeepNested && (
            <span className="text-[#555] text-xs bg-[#222] px-1.5 py-0.5 rounded">
              深层回复
            </span>
          )}
        </div>
        
        {/* Translated text - displayed first when available */}
        {hasTranslation && (
          <div 
            className="text-[#e0e0e0] text-sm leading-relaxed comment-content
              [&_a]:text-[#ff6600] [&_a]:no-underline hover:[&_a]:underline
              [&_code]:text-[#ff9933] [&_code]:bg-[#222] [&_code]:px-1 [&_code]:rounded
              [&_pre]:bg-[#222] [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2
              [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: comment.translatedText! }}
          />
        )}

        {/* Original text - always displayed below translation (dimmed when translation exists) */}
        {comment.text && (
          <div 
            className={`text-sm leading-relaxed comment-content
              [&_code]:bg-[#222] [&_code]:px-1 [&_code]:rounded
              [&_pre]:bg-[#222] [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2
              [&_p]:my-1
              ${hasTranslation 
                ? 'text-[#666] text-xs mt-1 [&_a]:text-[#666] [&_a]:no-underline hover:[&_a]:underline [&_code]:text-[#888]' 
                : 'text-[#c0c0c0] [&_a]:text-[#ff6600] [&_a]:no-underline hover:[&_a]:underline [&_code]:text-[#ff9933]'}`}
            dangerouslySetInnerHTML={{ __html: comment.text }}
          />
        )}

        {/* Collapse/Expand button for comments with children */}
        {hasChildren && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="mt-2 text-xs text-[#666] hover:text-[#ff6600] transition-colors flex items-center gap-1"
          >
            <span className="text-[#888]">{isCollapsed ? '▶' : '▼'}</span>
            {isCollapsed 
              ? `展开 ${replyCount} 条回复` 
              : '收起回复'}
          </button>
        )}
      </div>

      {/* Render children recursively - only when not collapsed */}
      {hasChildren && !isCollapsed && (
        <div>
          {comment.children!.map(child => (
            <CommentItem key={child.id} comment={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};
