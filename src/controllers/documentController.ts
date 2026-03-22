import { Request, Response } from 'express';
import { cloudinary } from '../middleware/upload';
import DocumentModel from '../models/Document';
import Workspace from '../models/Workspace';

const detectType = (mimetype: string, filename: string): string => {
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('word') || /\.docx?$/i.test(filename)) return 'doc';
  if (mimetype.includes('sheet') || mimetype.includes('excel') || /\.xlsx?$|\.csv$/i.test(filename)) return 'sheet';
  if (mimetype.startsWith('image/')) return 'image';
  return 'other';
};

const formatSize = (bytes: number): string =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;

export const getDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = { status: 'active' };
    if (req.query.workspace_id) {
      filter.workspace_id = req.query.workspace_id;
    } else {
      const ws = await Workspace.findOne({ $or: [{ owner_id: req.user!._id }, { 'members.user_id': req.user!._id }] });
      if (ws) filter.workspace_id = ws._id; else filter.uploaded_by = req.user!._id;
    }
    if (req.query.type && req.query.type !== 'All') filter.file_type = req.query.type;
    if (req.query.search) filter.name = { $regex: req.query.search, $options: 'i' };
    const docs = await DocumentModel.find(filter).populate('uploaded_by', 'name profile_photo').sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: docs });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }
    const { name, tags } = req.body;

    // Use the Cloudinary URL returned by multer-storage-cloudinary
    const fileUrl    = (req.file as any).path;          // Cloudinary secure_url
    const publicId   = (req.file as any).filename;      // Cloudinary public_id
    const fileType   = detectType(req.file.mimetype, req.file.originalname);
    const fileSize   = formatSize(req.file.size);
    const parsedTags: string[] = tags ? JSON.parse(tags) : ['Uploaded'];

    const ws = await Workspace.findOne({ $or: [{ owner_id: req.user!._id }, { 'members.user_id': req.user!._id }] });
    const doc = await DocumentModel.create({
      name:         name ?? req.file.originalname,
      file_url:     fileUrl,
      filename:     publicId,
      file_type:    fileType,
      file_size:    fileSize,
      uploaded_by:  req.user!._id,
      workspace_id: ws?._id ?? null,
      tags:         parsedTags,
    });
    const populated = await doc.populate('uploaded_by', 'name profile_photo');
    res.status(201).json({ success: true, data: populated, url: fileUrl });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updateDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, tags } = req.body;
    const doc = await DocumentModel.findOneAndUpdate(
      { _id: req.params.id, uploaded_by: req.user!._id },
      { ...(name && { name }), ...(tags && { tags }) },
      { new: true },
    ).populate('uploaded_by', 'name profile_photo');
    if (!doc) { res.status(404).json({ success: false, message: 'Document not found' }); return; }
    res.status(200).json({ success: true, data: doc });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await DocumentModel.findOneAndUpdate(
      { _id: req.params.id, uploaded_by: req.user!._id },
      { status: 'delete' },
      { new: true },
    );
    if (!doc) { res.status(404).json({ success: false, message: 'Document not found' }); return; }

    // Delete from Cloudinary using the stored public_id (filename field)
    if (doc.filename) {
      await cloudinary.uploader.destroy(doc.filename, { resource_type: 'auto' }).catch(() => {});
    }

    res.status(200).json({ success: true, message: 'Document deleted' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const downloadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await DocumentModel.findOne({ _id: req.params.id, status: 'active' });
    if (!doc) { res.status(404).json({ success: false, message: 'Document not found' }); return; }

    // Redirect to the Cloudinary URL — no local disk needed
    if (!doc.file_url) { res.status(404).json({ success: false, message: 'File URL not found' }); return; }
    res.redirect(doc.file_url);
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
