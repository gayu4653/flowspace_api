import { Request, Response, NextFunction } from 'express';

const apiKeyMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!process.env.STATIC_API_KEY) { next(); return; }
  const key = req.headers['x-api-key'] as string | undefined;
  if (!key || key !== process.env.STATIC_API_KEY) {
    res.status(401).json({ success: false, message: 'Invalid or missing API key' });
    return;
  }
  next();
};

export default apiKeyMiddleware;
