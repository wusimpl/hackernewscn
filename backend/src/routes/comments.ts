import { Router, Request, Response, NextFunction } from 'express';
import { CommentRepository } from '../db/repositories';
import { ApiResponse, CommentRecord, CommentTreeNode } from '../types';
import { AppError, ErrorCode } from '../middleware/errorHandler';

const router = Router();

/**
 * Comments API response interface matching design spec
 */
interface CommentsResponse {
  storyId: number;
  comments: CommentTreeNode[];
  totalCount: number;
}

/**
 * Build a tree structure from flat comment list
 * Requirements: 4.2 - Return comments in a tree structure preserving parent-child relationships
 * 
 * @param comments - Flat list of comment records from database
 * @param storyId - The story ID (used as root parent)
 * @returns Array of root-level comment tree nodes
 */
export function buildCommentTree(comments: CommentRecord[], storyId: number): CommentTreeNode[] {
  // Create a map of comment_id to CommentTreeNode
  const nodeMap = new Map<number, CommentTreeNode>();
  
  // First pass: create all nodes
  for (const comment of comments) {
    const node: CommentTreeNode = {
      id: comment.comment_id,
      author: comment.author,
      text: comment.text,
      time: comment.time,
      deleted: comment.deleted === 1,
      dead: comment.dead === 1,
      children: [],
    };
    nodeMap.set(comment.comment_id, node);
  }
  
  // Second pass: build tree by linking children to parents
  const rootNodes: CommentTreeNode[] = [];
  
  for (const comment of comments) {
    const node = nodeMap.get(comment.comment_id)!;
    
    // If parent_id equals storyId, this is a root-level comment
    if (comment.parent_id === storyId) {
      rootNodes.push(node);
    } else {
      // Find parent node and add this as a child
      const parentNode = nodeMap.get(comment.parent_id);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // Orphaned comment (parent not found) - treat as root
        rootNodes.push(node);
      }
    }
  }
  
  // Sort root nodes and all children by time (oldest first)
  const sortByTime = (nodes: CommentTreeNode[]) => {
    nodes.sort((a, b) => a.time - b.time);
    for (const node of nodes) {
      if (node.children.length > 0) {
        sortByTime(node.children);
      }
    }
  };
  
  sortByTime(rootNodes);
  
  return rootNodes;
}

/**
 * GET /api/comments/:storyId
 * Get comments tree for a story
 * Requirements: 4.2, 4.3
 */
router.get('/:storyId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storyId = parseInt(req.params.storyId, 10);

    if (isNaN(storyId)) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '无效的故事ID', 400);
    }

    const commentRepo = new CommentRepository();
    const comments = await commentRepo.findByStoryId(storyId);

    // Build tree structure from flat list
    const commentTree = buildCommentTree(comments, storyId);

    // Requirements: 4.3 - Return empty array when story has no comments
    const response: CommentsResponse = {
      storyId,
      comments: commentTree,
      totalCount: comments.length,
    };

    res.json({
      success: true,
      data: response,
    } as ApiResponse<CommentsResponse>);

  } catch (error) {
    console.error('[Comments API] 获取评论错误:', error);
    next(error);
  }
});

export default router;
