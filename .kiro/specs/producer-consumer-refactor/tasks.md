# Implementation Plan

## Phase 1: Backend Scheduler Service

- [x] 1. Create Scheduler Service





  - [x] 1.1 Create `backend/src/services/scheduler.ts` with SchedulerService class


    - Implement `start()`, `stop()`, `runOnce()`, `getStatus()` methods
    - Use `setInterval` for periodic execution
    - Support configuration via environment variables
    - _Requirements: 1.1, 1.2, 6.1, 6.2_
  - [ ]* 1.2 Write property test for cache-before-translate
    - **Property 1: Cache-before-translate invariant**
    - **Validates: Requirements 1.3, 1.4**
  - [x] 1.3 Implement title translation queueing logic


    - Check existing translations before queueing
    - Use prompt hash for cache validation
    - _Requirements: 1.3, 1.4, 1.5_
  - [ ]* 1.4 Write property test for translation persistence
    - **Property 2: Translation persistence**
    - **Validates: Requirements 1.5, 2.1**

- [x] 2. Add Scheduler Status Table





  - [x] 2.1 Update `backend/src/db/schema.sql` with scheduler_status table


    - Add last_run_at, stories_fetched, titles_translated fields
    - _Requirements: 5.4_
  - [x] 2.2 Create SchedulerStatusRepository in `backend/src/db/repositories/`


    - Implement getStatus(), updateStatus() methods
    - _Requirements: 5.4_

- [x] 3. Integrate Scheduler into Server





  - [x] 3.1 Update `backend/src/server.ts` to start scheduler on server startup


    - Initialize scheduler after database init
    - Add graceful shutdown handling
    - _Requirements: 1.1_
  - [x] 3.2 Add scheduler configuration to `backend/src/config.ts`


    - SCHEDULER_INTERVAL (default 5 minutes)
    - SCHEDULER_STORY_LIMIT (default 30)
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 4. Checkpoint - Ensure scheduler works





  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: Simplify Backend APIs
-

- [x] 5. Simplify Stories API




  - [x] 5.1 Update `backend/src/routes/stories.ts`


    - Remove inline translation logic
    - Return pre-translated data from database
    - Add lastUpdatedAt field to response
    - _Requirements: 2.1, 2.2, 5.4_
  - [ ]* 5.2 Write property test for fallback to original title
    - **Property 3: Fallback to original title**
    - **Validates: Requirements 2.2**
-

- [x] 6. Simplify Articles API




  - [x] 6.1 Update `backend/src/routes/articles.ts`


    - GET /:storyId returns cached translation or status
    - POST /:storyId/translate only queues task, doesn't wait
    - _Requirements: 2.3, 2.4, 3.2_
  - [ ]* 6.2 Write property test for article cache retrieval
    - **Property 4: Article cache retrieval**
    - **Validates: Requirements 2.3, 3.5**
  - [ ]* 6.3 Write property test for article translation queueing
    - **Property 5: Article translation queueing**
    - **Validates: Requirements 3.2**

- [x] 7. Enhance SSE Events




  - [x] 7.1 Update `backend/src/routes/events.ts`


    - Add stories.updated event type
    - Include lastUpdatedAt in events
    - _Requirements: 5.1, 5.2_
  - [x] 7.2 Update scheduler to emit SSE events after translation batch


    - Emit stories.updated with newly translated stories
    - _Requirements: 5.1_
  - [ ]* 7.3 Write property test for SSE notification on completion
    - **Property 6: SSE notification on completion**
    - **Validates: Requirements 3.4, 5.1, 5.2**
- [x] 8. Checkpoint - Ensure APIs work





- [ ] 8. Checkpoint - Ensure APIs work

  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Simplify Frontend
- [x] 9. Simplify Frontend App State




- [ ] 9. Simplify Frontend App State

  - [x] 9.1 Update `frontend/App.tsx`


    - Remove refreshData function and refresh button handler
    - Remove title translation logic
    - Simplify initial data loading to just fetch stories
    - _Requirements: 2.5, 5.3_
  - [x] 9.2 Update Header component


    - Remove refresh button
    - Display lastUpdatedAt from backend
    - _Requirements: 5.3, 5.4_

- [x] 10. Update SSE Event Handling





  - [x] 10.1 Update SSE listener in `frontend/App.tsx`


    - Handle stories.updated event to update story list
    - Update lastUpdatedAt when receiving events
    - _Requirements: 5.5_
  - [ ]* 10.2 Write property test for SSE story list update
    - **Property 9: SSE story list update**
    - **Validates: Requirements 5.5**

- [x] 11. Simplify Article Click Handler





  - [x] 11.1 Update handleArticleClick in `frontend/App.tsx`



    - Check local cache first
    - If hasTranslatedArticle, fetch from API
    - If not translated, request translation and show loading
    - _Requirements: 3.1, 3.5_
  - [ ]* 11.2 Write property test for translation status indicator
    - **Property 7: Translation status indicator**
    - **Validates: Requirements 4.1**


- [x] 12. Clean Up Unused Code




  - [x] 12.1 Remove unused imports and functions from frontend


    - Remove translateTitlesBatch related code
    - Remove manual refresh related code
    - _Requirements: 2.5_

  - [x] 12.2 Update frontend services

    - Simplify hnService.ts to only fetch stories
    - Remove title translation service calls
    - _Requirements: 2.5_



- [-] 13. Checkpoint - Ensure frontend works


  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: Prompt Change Handling

- [ ] 14. Implement Prompt Change Invalidation
  - [ ] 14.1 Update settings API to trigger re-translation
    - When prompt changes, invalidate old translations
    - Scheduler will re-translate on next run
    - _Requirements: 6.4_
  - [ ]* 14.2 Write property test for prompt change invalidation
    - **Property 8: Prompt change invalidation**
    - **Validates: Requirements 6.4**

- [ ] 15. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
