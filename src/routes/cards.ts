import { Router } from 'express';
import auth   from '../middleware/auth';
import upload from '../middleware/upload';
import {
  getCards, getCardById, getCardActivity, getMyWork,
  createCard, updateCard, deleteCard,
  archiveCard, toggleBookmark,
  addComment, deleteComment, reorderCards,
  addAttachment, removeAttachment,
} from '../controllers/cardController';

const router = Router();

router.get('/mywork',                           auth, getMyWork);          // before /:id
router.get('/',                                 auth, getCards);
router.post('/',                                auth, createCard);
router.put('/reorder',                          auth, reorderCards);       // before /:id
router.get('/:id',                              auth, getCardById);
router.put('/:id',                              auth, updateCard);
router.delete('/:id',                           auth, deleteCard);
router.put('/:id/archive',                      auth, archiveCard);
router.put('/:id/bookmark',                     auth, toggleBookmark);
router.post('/:id/comments',                    auth, addComment);
router.delete('/:id/comments/:commentId',       auth, deleteComment);
router.post('/:id/attachments',                 auth, upload.single('file'), addAttachment);
router.delete('/:id/attachments/:attachmentId', auth, removeAttachment);
router.get('/:id/activity',                     auth, getCardActivity);    // after /:id actions

export default router;
