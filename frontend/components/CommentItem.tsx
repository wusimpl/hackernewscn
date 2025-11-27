import React from 'react';
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

// Maximum indentation depth to prevent excessive nesting
const MAX_INDENT_DEPTH = 8;

export const CommentItem: React.FC<CommentItemProps> = ({ comment, depth }) => {
  // Calculate indentation - cap at MAX_INDENT_DEPTH to prevent excessive nesting
  const indentLevel = Math.min(depth, MAX_INDENT_DEPTH);
  const indentPx = indentLevel * 20; // 20px per level for better spacing

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
        {comment.children && comment.children.length > 0 && (
          <div>
            {comment.children.map(child => (
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
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[#ff6600] text-sm font-medium">
            {comment.author || '匿名'}
          </span>
          <span className="text-[#666] text-xs">
            {timeAgo(comment.time)}
          </span>
        </div>
        
        {/* Comment text - render HTML safely */}
        {comment.text && (
          <div 
            className="text-[#c0c0c0] text-sm leading-relaxed comment-content
              [&_a]:text-[#ff6600] [&_a]:no-underline hover:[&_a]:underline
              [&_code]:text-[#ff9933] [&_code]:bg-[#222] [&_code]:px-1 [&_code]:rounded
              [&_pre]:bg-[#222] [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2
              [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: comment.text }}
          />
        )}
      </div>

      {/* Render children recursively */}
      {comment.children && comment.children.length > 0 && (
        <div>
          {comment.children.map(child => (
            <CommentItem key={child.id} comment={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};
