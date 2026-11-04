import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { env } from '../config/env';
import { AppError } from '../middleware/error';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { randomBytes } from 'crypto';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';

export const authRouter = Router();

// Validation Schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(50),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password, displayName } = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email } });
    let user;

    if (existingUser) {
      if (existingUser.passwordHash === 'INVITED_USER_PENDING') {
        // User was previously invited - complete account registration
        const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
        const verificationToken = randomBytes(32).toString('hex');

        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            displayName,
            passwordHash,
            verificationToken,
          },
        });

        // Auto-accept any pending invitations for this user
        await prisma.projectMember.updateMany({
          where: { userId: user.id, invitationStatus: 'pending' },
          data: { invitationStatus: 'accepted', joinedAt: new Date() },
        });
      } else {
        throw new AppError(409, 'Email already in use', 'EMAIL_IN_USE');
      }
    } else {
      const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
      const verificationToken = randomBytes(32).toString('hex');

      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          verificationToken,
        },
      });
    }

    await sendVerificationEmail(user.email, user.verificationToken || '');

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Set HTTP-only cookie for refresh token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
        },
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = generateTokens(user.id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          avatarUrl: user.avatarUrl,
        },
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new AppError(401, 'No refresh token provided', 'NO_REFRESH_TOKEN');
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      
      if (!user) {
        throw new AppError(401, 'User no longer exists', 'USER_NOT_FOUND');
      }

      const tokens = generateTokens(user.id);

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        status: 'success',
        data: { accessToken: tokens.accessToken },
      });
    } catch (e) {
      throw new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
authRouter.post('/logout', (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ status: 'success', message: 'Logged out successfully' });
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify
// ---------------------------------------------------------------------------
authRouter.post('/verify', async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body);

    const user = await prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new AppError(400, 'Invalid verification token', 'INVALID_TOKEN');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
      },
    });

    res.json({ status: 'success', message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
authRouter.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    
    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ status: 'success', message: 'If an account with that email exists, we sent a password reset link.' });
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpires },
    });

    await sendPasswordResetEmail(user.email, resetToken);

    res.json({ status: 'success', message: 'If an account with that email exists, we sent a password reset link.' });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = z.object({
      token: z.string(),
      newPassword: z.string().min(8),
    }).parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new AppError(400, 'Invalid or expired password reset token', 'INVALID_TOKEN');
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    res.json({ status: 'success', message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerified: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    res.json({ status: 'success', data: { user } });
  } catch (error) {
    next(error);
  }
});
