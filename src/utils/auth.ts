import jwt from 'jsonwebtoken';

const secret = (): string => process.env.JWT_SECRET as string;

export const generateToken = (id: string, extra: Record<string, unknown> = {}): string =>
  jwt.sign({ id, ...extra }, secret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as string,
  });

export const generateTempToken = (payload: Record<string, unknown> = {}): string =>
  jwt.sign({ ...payload, temp: true }, secret(), { expiresIn: '15m' });

export const decodeGoogleCredential = (credential: string): Record<string, any> | null => {
  if (!credential || typeof credential !== 'string' || credential.split('.').length < 2) return null;
  try {
    const payload    = credential.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
};
