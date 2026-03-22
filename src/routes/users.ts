import { Router } from 'express';
import auth   from '../middleware/auth';
import upload from '../middleware/upload';
import {
  register, login, googleLogin, forgotPassword,
  verifyForgotOtp, resetPassword, verifyTwoFactor,
  getAllUsers, getMe, updateMe, updatePassword as changePassword, uploadAvatar,
} from '../controllers/userController';

const router = Router();

router.post('/register',          register);
router.post('/login',             login);
router.post('/google-login',      googleLogin);
router.post('/forgot-password',   forgotPassword);
router.post('/verify-forgot-otp', verifyForgotOtp);
router.post('/reset-password',    resetPassword);
router.post('/verify-2fa',        verifyTwoFactor);
router.get('/',                   auth, getAllUsers);
router.get('/me',                 auth, getMe);
router.put('/me',                 auth, updateMe);
router.put('/me/password',        auth, changePassword);
router.post('/me/avatar',         auth, upload.single('file'), uploadAvatar);

export default router;
