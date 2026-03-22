import { Router } from 'express';
import auth from '../middleware/auth';
import { getBoards, createBoard, reorderBoards, updateBoard, deleteBoard } from '../controllers/boardController';

const router = Router();

router.get('/',        auth, getBoards);
router.post('/',       auth, createBoard);
router.put('/reorder', auth, reorderBoards);  // must be before /:id
router.put('/:id',     auth, updateBoard);
router.delete('/:id',  auth, deleteBoard);

export default router;
