import { Router } from 'express';
import auth from '../middleware/auth';
import { getTags, createTag, updateTag, deleteTag } from '../controllers/tagController';

const router = Router();

router.get('/',       auth, getTags);
router.post('/',      auth, createTag);
router.put('/:id',    auth, updateTag);
router.delete('/:id', auth, deleteTag);

export default router;
