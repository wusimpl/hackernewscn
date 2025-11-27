import { API_BASE_URL } from '../config';
import { CommentsApiResponse, CommentsData } from '../types';

const COMMENTS_ENDPOINT = `${API_BASE_URL}/comments`;

export interface FetchCommentsResult {
  comments: CommentsData['comments'];
  totalCount: number;
}

/**
 * Fetches comments for a story from the backend API.
 * Returns the comment tree structure and total count.
 * 
 * @param storyId - The HN story ID to fetch comments for
 * @returns Promise with comments tree and total count
 * @throws Error if the API request fails or returns an error
 */
export const fetchComments = async (storyId: number): Promise<FetchCommentsResult> => {
  const url = `${COMMENTS_ENDPOINT}/${storyId}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Comments API network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      // No comments found for this story - return empty result
      return { comments: [], totalCount: 0 };
    }
    throw new Error(`Comments API request failed: ${response.status}`);
  }

  const payload = await response.json() as CommentsApiResponse;
  if (!payload.success || !payload.data) {
    const message = payload.error?.message || 'Comments API returned an empty response';
    throw new Error(message);
  }

  return {
    comments: payload.data.comments,
    totalCount: payload.data.totalCount
  };
};
