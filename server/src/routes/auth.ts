import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import axios from 'axios';
import { prisma } from '../db';
import { env } from '../config/env';
import { AppError } from '../middleware/error';
import { generateTokens, verifyRefreshToken, generateTempToken, verifyTempToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { randomBytes } from 'crypto';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTwoFactorCodeEmail,
  sendSecurityNotification,
} from '../utils/email';

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

    // Check if user has Two-Factor Authentication enabled
    if (user.twoFactorEnabled) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorCode: code, twoFactorExpires: expires },
      });

      await sendTwoFactorCodeEmail(user.email, code);
      const tempToken = generateTempToken(user.id);

      return res.json({
        status: 'success',
        data: {
          requiresTwoFactor: true,
          email: user.email,
          tempToken,
        },
      });
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
        twoFactorEnabled: true,
        createdAt: true,
      },
    });

    res.json({ status: 'success', data: { user } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/verify
// ---------------------------------------------------------------------------
authRouter.post('/2fa/verify', async (req, res, next) => {
  try {
    const { tempToken, code } = z.object({
      tempToken: z.string(),
      code: z.string().min(6).max(6),
    }).parse(req.body);

    let payload;
    try {
      payload = verifyTempToken(tempToken);
    } catch {
      throw new AppError(401, 'Verification session expired. Please log in again.', 'TOKEN_EXPIRED');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    if (!user.twoFactorCode || !user.twoFactorExpires || user.twoFactorExpires < new Date()) {
      throw new AppError(400, 'Verification code expired. Please request a new one.', 'CODE_EXPIRED');
    }

    if (user.twoFactorCode !== code.trim()) {
      throw new AppError(400, 'Invalid verification code', 'INVALID_CODE');
    }

    // Clear 2FA code & update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCode: null,
        twoFactorExpires: null,
        lastLoginAt: new Date(),
      },
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
          twoFactorEnabled: user.twoFactorEnabled,
        },
        accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/resend
// ---------------------------------------------------------------------------
authRouter.post('/2fa/resend', async (req, res, next) => {
  try {
    const { tempToken } = z.object({ tempToken: z.string() }).parse(req.body);

    let payload;
    try {
      payload = verifyTempToken(tempToken);
    } catch {
      throw new AppError(401, 'Verification session expired. Please log in again.', 'TOKEN_EXPIRED');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorCode: code, twoFactorExpires: expires },
    });

    await sendTwoFactorCodeEmail(user.email, code);

    res.json({ status: 'success', message: 'Verification code resent successfully' });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/toggle (Enable/Disable 2FA)
// ---------------------------------------------------------------------------
authRouter.post('/2fa/toggle', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');

    const newStatus = !user.twoFactorEnabled;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: newStatus,
        twoFactorCode: null,
        twoFactorExpires: null,
      },
    });

    await sendSecurityNotification(
      user.email,
      newStatus ? 'Two-Factor Authentication Enabled' : 'Two-Factor Authentication Disabled',
      newStatus
        ? 'Two-Factor Authentication (2FA) was successfully enabled on your CodeSync account. You will now be prompted for a 6-digit email verification code when logging in.'
        : 'Two-Factor Authentication (2FA) was disabled on your CodeSync account.'
    );

    res.json({
      status: 'success',
      data: { twoFactorEnabled: newStatus },
      message: `Two-Factor Authentication ${newStatus ? 'enabled' : 'disabled'} successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/google
// ---------------------------------------------------------------------------
authRouter.get('/google', async (req, res, next) => {
  try {
    const redirectUri = env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      // Development / test Google Sign-in: instant verified sign-in
      const email = (req.query.email as string) || 'developer@codesync.dev';
      const displayName = (req.query.name as string) || 'Google Developer';

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            displayName,
            passwordHash: 'GOOGLE_OAUTH_USER',
            emailVerified: true,
            googleId: `google_dev_${Date.now()}`,
          },
        });
      } else if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: `google_dev_${Date.now()}`, emailVerified: true },
        });
      }

      const { accessToken, refreshToken } = generateTokens(user.id);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const userPayload = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
      };

      const userJson = JSON.stringify(userPayload);
      const targetUrl = `${env.FRONTEND_URL}/auth/google/callback?token=${accessToken}&user=${encodeURIComponent(userJson)}`;
      return res.redirect(targetUrl);
    }

    const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
      `client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline` +
      `&prompt=select_account`;

    res.redirect(googleAuthUrl);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/google/mock
// ---------------------------------------------------------------------------
authRouter.post('/google/mock', async (req, res, next) => {
  try {
    const { email, displayName } = req.body;
    if (!email) throw new AppError(400, 'Email is required');

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          displayName: displayName || email.split('@')[0],
          passwordHash: 'GOOGLE_OAUTH_USER',
          emailVerified: true,
          googleId: `google_mock_${Date.now()}`,
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: `google_mock_${Date.now()}`, emailVerified: true },
      });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userPayload = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
    };

    const userJson = JSON.stringify(userPayload);
    const targetUrl = `${env.FRONTEND_URL}/auth/google/callback?token=${accessToken}&user=${encodeURIComponent(userJson)}`;
    return res.redirect(targetUrl);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/google/callback
// ---------------------------------------------------------------------------
authRouter.get('/google/callback', async (req, res, next) => {
  try {
    const { code, error } = req.query;

    if (error || !code) {
      return res.status(400).send(`
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', message: '${error || 'Authentication denied'}' }, '*');
            window.close();
          } else {
            window.location.href = "${env.FRONTEND_URL}/auth/login?error=google_denied";
          }
        </script>
      `);
    }

    const redirectUri = env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const { access_token } = tokenRes.data;

    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const googleUser = profileRes.data;

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: googleUser.id },
          { email: googleUser.email },
        ],
      },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: googleUser.id,
            emailVerified: true,
            avatarUrl: user.avatarUrl || googleUser.picture,
          },
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          displayName: googleUser.name || googleUser.email.split('@')[0],
          googleId: googleUser.id,
          avatarUrl: googleUser.picture,
          emailVerified: true,
          passwordHash: 'GOOGLE_OAUTH_USER',
        },
      });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userJson = JSON.stringify({ id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified, avatarUrl: user.avatarUrl });
    const targetUrl = `${env.FRONTEND_URL}/auth/google/callback?token=${accessToken}&user=${encodeURIComponent(userJson)}`;

    return res.redirect(targetUrl);
  } catch (err: any) {
    console.error('[Google OAuth Error]', err.response?.data || err.message);
    return res.redirect(`${env.FRONTEND_URL}/auth/login?error=google_failed`);
  }
});
