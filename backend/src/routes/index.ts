import { Router } from 'express';
import storiesRouter from './stories';
import translationsRouter from './translations';
import articlesRouter from './articles';
import settingsRouter from './settings';
import eventsRouter from './events';
import adminRouter from './admin';
import commentsRouter from './comments';
import chatRouter from './chat';

const router = Router();

// 挂载各个路由模块
router.use('/stories', storiesRouter);
router.use('/translations', translationsRouter);
router.use('/articles', articlesRouter);
router.use('/settings', settingsRouter);
router.use('/events', eventsRouter);
router.use('/admin', adminRouter);
router.use('/comments', commentsRouter);
router.use('/chat', chatRouter);

export default router;
