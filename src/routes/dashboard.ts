import { Router } from 'express';
import auth from '../middleware/auth';
import { getStats, getVelocity, getActivity, getBookmarks } from '../controllers/dashboardController';

const router = Router();

router.get('/stats',     auth, getStats);
router.get('/velocity',  auth, getVelocity);
router.get('/activity',  auth, getActivity);
router.get('/bookmarks', auth, getBookmarks);

export default router;
