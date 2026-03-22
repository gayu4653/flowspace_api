import { Router } from 'express';
import auth   from '../middleware/auth';
import upload from '../middleware/upload';
import { getDocuments, uploadDocument, updateDocument, deleteDocument, downloadDocument } from '../controllers/documentController';

const router = Router();

router.get('/',              auth, getDocuments);
router.post('/',             auth, upload.single('file'), uploadDocument);
router.put('/:id',           auth, updateDocument);
router.delete('/:id',        auth, deleteDocument);
router.get('/:id/download',  auth, downloadDocument);

export default router;
