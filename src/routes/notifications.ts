import { Router } from 'express';
import auth from '../middleware/auth';
import {
  getNotifications, getUnreadCount, debugNotifications,
  markRead, markAllRead, deleteNotification,
  getPreferences, updatePreferences,
} from '../controllers/notificationController';

const router = Router();

router.get('/debug',       auth, debugNotifications); // before /:id — dev diagnosis
router.get('/count',       auth, getUnreadCount);     // before /:id
router.get('/preferences', auth, getPreferences);     // before /:id
router.put('/preferences', auth, updatePreferences);
router.put('/read-all',    auth, markAllRead);        // before /:id
router.get('/',            auth, getNotifications);
router.put('/:id/read',    auth, markRead);
router.delete('/:id',      auth, deleteNotification);

export default router;
