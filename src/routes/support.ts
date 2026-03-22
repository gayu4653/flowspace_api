import { Router } from 'express';
import auth from '../middleware/auth';
import { getSupportMessages, createSupportMessage } from '../controllers/supportController';

const router = Router();

router.get('/',  auth, getSupportMessages);
router.post('/', auth, createSupportMessage);

export default router;
