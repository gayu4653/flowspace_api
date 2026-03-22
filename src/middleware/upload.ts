import multer, { FileFilterCallback } from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { Request } from 'express';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (_req: any, file: any) => ({
    folder: 'flowspace',
    resource_type: 'auto',
    public_id: `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`,
  }),
});

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);

const upload = multer({
  storage,
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    ALLOWED_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`File type ${file.mimetype} not allowed`));
  },
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE ?? '52428800') },
});

export { cloudinary };
export default upload;