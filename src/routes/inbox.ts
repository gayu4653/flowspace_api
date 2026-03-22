import { Router } from 'express';
import auth from '../middleware/auth';
import {
  getInbox, getUnreadCount, debugInbox, getMessageById,
  markRead, markAllRead, archiveMessage, deleteMessage, sendReply,
} from '../controllers/inboxController';

const router = Router();

router.get('/debug',       auth, debugInbox);        // before /:id — dev diagnosis
router.get('/count',       auth, getUnreadCount);    // before /:id
router.post('/reply',      auth, sendReply);
router.put('/read-all',    auth, markAllRead);       // before /:id
router.get('/',            auth, getInbox);
router.get('/:id',         auth, getMessageById);
router.put('/:id/read',    auth, markRead);
router.put('/:id/archive', auth, archiveMessage);
router.delete('/:id',      auth, deleteMessage);

export default router;
