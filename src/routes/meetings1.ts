import { Router } from 'express';
import auth from '../middleware/auth';
import {
  getMeetings, getMeetingById, createMeeting,
  updateMeeting, updateMeetingStatus, deleteMeeting,
  syncMeetingStatuses,
} from '../controllers/meetingController';

const router = Router();

router.post('/sync',       auth, syncMeetingStatuses); // before /:id
router.get('/',            auth, getMeetings);
router.post('/',           auth, createMeeting);
router.get('/:id',         auth, getMeetingById);
router.put('/:id',         auth, updateMeeting);
router.put('/:id/status',  auth, updateMeetingStatus);
router.delete('/:id',      auth, deleteMeeting);

export default router;
