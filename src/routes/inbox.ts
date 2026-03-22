import { Router } from 'express';
import auth from '../middleware/auth';
import {
  getInbox, getUnreadCount, debugInbox, getThread,
  getMessageById, composeMessage, replyToMessage,
  markRead, markAllRead, toggleStar,
  archiveMessage, unarchiveMessage, deleteMessage,
  searchMessages,
} from '../controllers/inboxController';

const router = Router();

// Static routes FIRST (before /:id)
router.get('/debug',          auth, debugInbox);
router.get('/count',          auth, getUnreadCount);
router.get('/search',         auth, searchMessages);
router.put('/read-all',       auth, markAllRead);
router.post('/compose',       auth, composeMessage);   // NEW — send by email address
router.post('/reply',         auth, replyToMessage);   // reply within thread

// Thread
router.get('/thread/:threadId', auth, getThread);

// Main list (folder param: inbox|sent|starred|archived|trash|unread)
router.get('/',               auth, getInbox);

// Per-message operations
router.get('/:id',            auth, getMessageById);
router.put('/:id/read',       auth, markRead);
router.put('/:id/star',       auth, toggleStar);        // NEW
router.put('/:id/archive',    auth, archiveMessage);
router.put('/:id/unarchive',  auth, unarchiveMessage);  // NEW
router.delete('/:id',         auth, deleteMessage);     // trash first, then permanent

export default router;
