import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }
    const fileUrl = `/uploads/${req.file.filename}`;
    const fullUrl = `${req.protocol}://${req.get('host')}${fileUrl}`;
    res.status(201).json({
      success:      true,
      url:          fullUrl,
      relative_url: fileUrl,
      filename:     req.file.filename,
      originalname: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
    });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const filePath = path.join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', req.params.filename);
    if (!fs.existsSync(filePath)) { res.status(404).json({ success: false, message: 'File not found' }); return; }
    fs.unlinkSync(filePath);
    res.status(200).json({ success: true, message: 'File deleted' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
