import { Request, Response } from 'express';
import { cloudinary } from '../middleware/upload';

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }
    const fileUrl = (req.file as any).path; // Cloudinary URL

    res.status(201).json({
      success:      true,
      url:          fileUrl,
      relative_url: fileUrl,
      filename:     req.file.filename,
      originalname: req.file.originalname,
      mimetype:     req.file.mimetype,
      size:         req.file.size,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  try {
    // Expect public_id in params e.g. "flowspace/1234-filename"
    await cloudinary.uploader.destroy(req.params.filename, { resource_type: 'auto' });
    res.status(200).json({ success: true, message: 'File deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};