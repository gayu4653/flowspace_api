import { Router } from 'express';
import auth from '../middleware/auth';
import {
  getWorkspace, getAllWorkspaces, createWorkspace, updateWorkspace,
  getMembers, inviteMember, updateMemberRole, removeMember,
} from '../controllers/workspaceController';

const router = Router();

router.get('/all',                auth, getAllWorkspaces);   // must be before '/'
router.get('/',                   auth, getWorkspace);
router.post('/',                  auth, createWorkspace);
router.put('/',                   auth, updateWorkspace);
router.get('/members',            auth, getMembers);
router.post('/invite',            auth, inviteMember);
router.put('/members/:userId',    auth, updateMemberRole);
router.delete('/members/:userId', auth, removeMember);

export default router;
