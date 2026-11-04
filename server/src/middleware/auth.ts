import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from './error';
import { prisma } from '../db';

// Extend Express Request to hold the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
      };
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(401, 'Unauthorized: Missing or invalid token', 'UNAUTHORIZED');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true }
    });

    if (!user) {
      throw new AppError(401, 'Unauthorized: User no longer exists', 'USER_NOT_FOUND');
    }

    req.user = { id: user.id };
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError(401, 'Unauthorized: Invalid or expired token', 'INVALID_TOKEN'));
    }
  }
};
