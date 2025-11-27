import React, { useEffect, useState } from 'react';
import { fetchComments } from '../services/commentsService';
import { CommentTreeNode } from '../types';
import { CommentItem } from './CommentItem';

interface CommentsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: number;
  storyTitle: string;
  mode: 'overlay' | 'side-by-side';
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({
  isOpen,
  onClose,
  storyId,
  storyTitle,
  mode
}) => {
  const [comments, setComments] = useState<CommentTreeNode[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && storyId) {
      loadComments();
    }
  }, [isOpen, storyId]);

  const loadComments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchComments(storyId);
      setComments(result.comments);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载评论失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const isOverlay = mode === 'overlay';

  // Overlay mode: full screen overlay
  if (isOverlay) {
    return (
      <div 
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div 
          className="bg-[#1a1a1a] w-full max-w-2xl h-full sm:h-[90vh] shadow-2xl flex flex-col sm:rounded-lg overflow-hidden border border-[#333]"
          onClick={e => e.stopPropagation()}
        >
          <PanelHeader 
            title={storyTitle} 
            totalCount={totalCount} 
            onClose={onClose} 
          />
          <PanelContent 
            isLoading={isLoading} 
            error={error} 
            comments={comments} 
            onRetry={loadComments}
          />
        </div>
      </div>
    );
  }

  // Side-by-side mode: panel on the right
  return (
    <div className="bg-[#1a1a1a] w-full h-full flex flex-col border-l border-[#333]">
      <PanelHeader 
        title={storyTitle} 
        totalCount={totalCount} 
        onClose={onClose} 
      />
      <PanelContent 
        isLoading={isLoading} 
        error={error} 
        comments={comments} 
        onRetry={loadComments}
      />
    </div>
  );
};


// Header component for the comments panel
interface PanelHeaderProps {
  title: string;
  totalCount: number;
  onClose: () => void;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({ title, totalCount, onClose }) => (
  <div className="bg-[#1a1a1a] border-b border-[#333] px-4 py-3 flex justify-between items-center shrink-0">
    <div className="flex flex-col overflow-hidden mr-4">
      <h2 className="text-[#dcdcdc] font-bold text-base truncate leading-tight">
        评论
      </h2>
      <span className="text-[#828282] text-xs mt-0.5">
        {totalCount > 0 ? `${totalCount} 条评论` : '暂无评论'}
      </span>
    </div>
    <button 
      onClick={onClose} 
      className="text-[#828282] hover:text-white hover:bg-[#333] p-1.5 rounded-full transition-colors"
      aria-label="关闭评论"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
);

// Content component for the comments panel
interface PanelContentProps {
  isLoading: boolean;
  error: string | null;
  comments: CommentTreeNode[];
  onRetry: () => void;
}

const PanelContent: React.FC<PanelContentProps> = ({ isLoading, error, comments, onRetry }) => {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#828282] gap-4 p-8">
        <div className="w-10 h-10 border-2 border-[#333] border-t-[#ff6600] rounded-full animate-spin"></div>
        <p className="animate-pulse text-sm">加载评论中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#828282] gap-4 p-8">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm text-center">{error}</p>
        <button 
          onClick={onRetry}
          className="px-4 py-2 bg-[#ff6600] text-white rounded hover:bg-[#ff7722] transition-colors text-sm"
        >
          重试
        </button>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#828282] gap-2 p-8">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-sm">暂无评论</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#111] p-4">
      {comments.map(comment => (
        <CommentItem key={comment.id} comment={comment} depth={0} />
      ))}
    </div>
  );
};
