import { Router } from 'express';
import auth   from '../middleware/auth';
import upload from '../middleware/upload';
import { uploadFile, deleteFile } from '../controllers/fileController';

const router = Router();

router.post('/upload',       auth, upload.single('file'), uploadFile);
router.delete('/:filename',  auth, deleteFile);

export default router;
