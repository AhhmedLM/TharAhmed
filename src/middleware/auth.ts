import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { timingSafeEqual } from 'crypto';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  isAdmin?: boolean;
}

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function verifyFirebaseBearer(authHeader?: string): Promise<DecodedIdToken | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  return adminAuth.verifyIdToken(token);
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  try {
    const decodedToken = await verifyFirebaseBearer(authHeader);
    if (!decodedToken) {
      res.status(401).json({ error: 'Unauthorized: Missing token' });
      return;
    }
    if (decodedToken.email_verified !== true) {
      res.status(403).json({ error: 'Forbidden: Email verification required' });
      return;
    }
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const configuredSecret = process.env.ADMIN_SECRET?.trim() ?? '';
  const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const providedKey = typeof req.headers['x-admin-key'] === 'string'
    ? req.headers['x-admin-key'].trim()
    : '';

  if (configuredSecret && providedKey && safeEqualString(providedKey, configuredSecret)) {
    req.isAdmin = true;
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decodedToken = await verifyFirebaseBearer(authHeader);
      if (
        decodedToken &&
        decodedToken.email_verified === true &&
        configuredAdminEmail &&
        (decodedToken.email ?? '').toLowerCase() === configuredAdminEmail
      ) {
        req.user = decodedToken;
        req.isAdmin = true;
        next();
        return;
      }
    } catch {
      // Fall through to dev check or 403
    }
  }

  const isDevLocal =
    process.env.NODE_ENV !== 'production' &&
    !configuredSecret &&
    (req.hostname === 'localhost' ||
      req.hostname === '127.0.0.1' ||
      req.ip === '127.0.0.1' ||
      req.ip === '::1' ||
      req.ip === '::ffff:127.0.0.1');

  if (isDevLocal) {
    req.isAdmin = true;
    next();
    return;
  }

  res.status(403).json({ error: 'Forbidden: Admin privileges required' });
};
