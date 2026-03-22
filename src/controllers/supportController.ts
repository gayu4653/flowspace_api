import { Request, Response } from 'express';
import SupportMessage from '../models/SupportMessage';

export const getSupportMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter = req.user
      ? { $or: [{ user_id: req.user._id }, { emailid: req.user.emailid }] }
      : {};
    const data = await SupportMessage.find(filter).sort({ createdAt: -1 }).limit(50);
    res.status(200).json({ success: true, data });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const createSupportMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, emailid, subject, category, message } = req.body;
    if (!name || !emailid || !subject || !message) {
      res.status(400).json({ success: false, message: 'name, emailid, subject and message are required' });
      return;
    }
    const item = await SupportMessage.create({
      user_id:  req.user?._id ?? null,
      name,
      emailid:  emailid.toLowerCase(),
      subject,
      category: category ?? 'general',
      message,
    });
    res.status(201).json({ success: true, data: item, message: 'Support request submitted successfully' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
