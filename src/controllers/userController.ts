import { Request, Response } from 'express';
import jwt    from 'jsonwebtoken';
import path   from 'path';
import fs     from 'fs';
import https  from 'https';
import User   from '../models/User';
import { generateToken, generateTempToken, decodeGoogleCredential } from '../utils/auth';
import { cloudinary } from '../middleware/upload';

const DEFAULT_INVITE_PASSWORD = process.env.DEFAULT_USER_PASSWORD ?? '123456';
const DEFAULT_OTP             = process.env.DEFAULT_OTP           ?? '123456';
const OTP_BYPASS              = process.env.OTP_BYPASS === 'true';

const buildAuthResponse = (user: any) => ({
  success: true,
  token:   generateToken(String(user._id)),
  user: {
    _id:         String(user._id),
    name:        user.name,
    emailid:     user.emailid,
    role:        user.role,
    profile_photo: user.profile_photo ?? null,
    title:       user.title ?? '',
    timezone:    user.timezone ?? '',
    language:    user.language ?? 'en',
    two_factor_enabled: user.two_factor_enabled ?? false,
  },
});

// Download a remote image URL and save it to the uploads folder.
// Returns the local relative path e.g. /uploads/google_<userId>.jpg
// or null if download fails.
const downloadGoogleAvatar = async (imageUrl: string, userId: string): Promise<string | null> => {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: 'flowspace/avatars',
      public_id: `google_${userId}`,
      overwrite: true,
    });
    return result.secure_url;
  } catch {
    return null;
  }
};

// ── Auth controllers ──────────────────────────────────────────────────────────

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, emailid, password, role, profile_photo } = req.body;
    if (!name || !emailid || !password) { res.status(400).json({ success: false, message: 'name, emailid and password are required' }); return; }
    const exists = await User.findOne({ emailid: emailid.toLowerCase() });
    if (exists) { res.status(409).json({ success: false, message: 'Email already registered' }); return; }
    const user = await User.create({ name, emailid: emailid.toLowerCase(), password, role: role ?? 'user', profile_photo: profile_photo ?? null, email_verified: true });
    res.status(201).json(buildAuthResponse(user));
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { emailid, password } = req.body;
    if (!emailid || !password) { res.status(400).json({ success: false, message: 'emailid and password are required' }); return; }
    const user = await User.findOne({ emailid: emailid.toLowerCase() });
    if (!user || !(await user.matchPassword(password))) { res.status(401).json({ success: false, message: 'Invalid email or password' }); return; }
    if (user.two_factor_enabled) {
      user.two_factor_code = DEFAULT_OTP;
      await user.save();
      res.status(200).json({ success: true, requiresTwoFactor: true, tempToken: generateTempToken({ id: String(user._id) }), message: OTP_BYPASS ? `Use default OTP ${DEFAULT_OTP}` : 'Two-factor code sent' });
      return;
    }
    res.status(200).json(buildAuthResponse(user));
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential, profile } = req.body;
    const decoded = decodeGoogleCredential(credential) ?? profile;
    if (!decoded?.email) { res.status(400).json({ success: false, message: 'Valid Google profile is required' }); return; }

    let user = await User.findOne({ emailid: String(decoded.email).toLowerCase() });

    if (!user) {
      // New user — download avatar from Google and save locally
      let localPhoto: string | null = null;
      if (decoded.picture) {
        // We need a temporary ID to name the file; use email hash
        const tmpId = Buffer.from(decoded.email).toString('hex').slice(0, 12);
        localPhoto = await downloadGoogleAvatar(decoded.picture, tmpId);
      }

      user = await User.create({
        name:          decoded.name ?? decoded.given_name ?? decoded.email.split('@')[0],
        emailid:       String(decoded.email).toLowerCase(),
        password:      DEFAULT_INVITE_PASSWORD,
        profile_photo: localPhoto ?? decoded.picture ?? null,
        google_id:     decoded.sub ?? null,
        auth_provider: 'google',
        email_verified: true,
      });

      // If we got a local photo and used a temp id, rename to real user id
      if (localPhoto) {
        const ext        = path.extname(localPhoto);
        const oldPath    = path.join(process.cwd(), localPhoto);
        const newFile    = `google_${String(user._id)}${ext}`;
        const newPath    = path.join(process.cwd(), 'uploads', newFile);
        const newUrl     = `/uploads/${newFile}`;
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
          user.profile_photo = newUrl;
          await user.save();
        }
      }
    } else {
      // Existing user — update google id, and download avatar if they don't have a local one yet
      let changed = false;
      if (!user.google_id && decoded.sub) { user.google_id = decoded.sub; changed = true; }
      if (user.auth_provider !== 'google') { user.auth_provider = 'google'; changed = true; }

      // Only update photo if they have no local photo (local uploads take priority over Google URLs)
      const hasLocalPhoto = user.profile_photo?.startsWith('/uploads/');
      if (!user.profile_photo && decoded.picture) {
        const localPhoto = await downloadGoogleAvatar(decoded.picture, String(user._id));
        if (localPhoto) { user.profile_photo = localPhoto; changed = true; }
        else            { user.profile_photo = decoded.picture; changed = true; }
      } else if (!hasLocalPhoto && decoded.picture && user.profile_photo !== decoded.picture) {
        // They have a Google URL but not a local file — download it
        const localPhoto = await downloadGoogleAvatar(decoded.picture, String(user._id));
        if (localPhoto) { user.profile_photo = localPhoto; changed = true; }
      }

      if (changed) await user.save();
    }

    res.status(200).json(buildAuthResponse(user));
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { emailid } = req.body;
    if (!emailid) { res.status(400).json({ success: false, message: 'emailid is required' }); return; }
    const user = await User.findOne({ emailid: emailid.toLowerCase() });
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
    user.reset_otp = DEFAULT_OTP;
    user.reset_otp_expires_at = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    res.status(200).json({ success: true, message: OTP_BYPASS ? `Reset OTP is ${DEFAULT_OTP}` : 'Reset OTP generated', otpBypass: OTP_BYPASS });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const verifyForgotOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { emailid, otp } = req.body;
    const user = await User.findOne({ emailid: String(emailid ?? '').toLowerCase() });
    if (!user || !user.reset_otp) { res.status(400).json({ success: false, message: 'No reset request found' }); return; }
    if (user.reset_otp_expires_at && user.reset_otp_expires_at < new Date()) { res.status(400).json({ success: false, message: 'OTP expired' }); return; }
    if (String(otp) !== String(user.reset_otp)) { res.status(400).json({ success: false, message: 'Invalid OTP' }); return; }
    res.status(200).json({ success: true, tempToken: generateTempToken({ id: String(user._id), purpose: 'password-reset' }) });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tempToken, newPassword } = req.body;
    if (!tempToken || !newPassword) { res.status(400).json({ success: false, message: 'tempToken and newPassword are required' }); return; }
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET as string) as any;
    if (!decoded?.temp) { res.status(400).json({ success: false, message: 'Invalid temp token' }); return; }
    const user = await User.findById(decoded.id);
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
    user.password = newPassword; user.reset_otp = null; user.reset_otp_expires_at = null;
    await user.save();
    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch { res.status(400).json({ success: false, message: 'Invalid or expired temp token' }); }
};

export const verifyTwoFactor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tempToken, otp } = req.body;
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET as string) as any;
    if (!decoded?.temp) { res.status(400).json({ success: false, message: 'Invalid temp token' }); return; }
    const user = await User.findById(decoded.id);
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
    if (String(otp) !== String(user.two_factor_code ?? DEFAULT_OTP)) { res.status(400).json({ success: false, message: 'Invalid OTP' }); return; }
    res.status(200).json(buildAuthResponse(user));
  } catch { res.status(400).json({ success: false, message: 'Invalid or expired temp token' }); }
};

export const getAllUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: users });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try { res.status(200).json({ success: true, data: req.user }); }
  catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updateMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, title, timezone, language, two_factor_enabled } = req.body;
    const updates: Record<string, any> = {};
    if (name)                             updates.name = name;
    if (title !== undefined)              updates.title = title;
    if (timezone)                         updates.timezone = timezone;
    if (language)                         updates.language = language;
    if (two_factor_enabled !== undefined) updates.two_factor_enabled = two_factor_enabled;
    const user = await User.findByIdAndUpdate(req.user!._id, updates, { new: true }).select('-password');
    res.status(200).json({ success: true, data: user });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updatePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) { res.status(400).json({ success: false, message: 'Both passwords are required' }); return; }
    const user = await User.findById(req.user!._id);
    if (!user || !(await user.matchPassword(currentPassword))) { res.status(401).json({ success: false, message: 'Current password is incorrect' }); return; }
    user.password = newPassword;
    await user.save();
    res.status(200).json({ success: true, message: 'Password updated' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    // Delete old Cloudinary avatar if it exists
    const oldUser = await User.findById(req.user!._id);
    if (oldUser?.profile_photo?.includes('cloudinary.com')) {
      // Extract public_id from URL
      const parts = oldUser.profile_photo.split('/');
      const publicId = parts.slice(-2).join('/').replace(/\.[^/.]+$/, '');
      await cloudinary.uploader.destroy(publicId).catch(() => {});
    }

    const fileUrl = (req.file as any).path; // Cloudinary URL
    const user = await User.findByIdAndUpdate(
      req.user!._id,
      { profile_photo: fileUrl },
      { new: true }
    ).select('-password');

    res.status(200).json({ success: true, data: user, url: fileUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};