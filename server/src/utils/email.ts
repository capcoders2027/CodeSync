import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: (env.SMTP_USER && env.SMTP_PASS) ? {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  } : undefined,
});

export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = `${env.FRONTEND_URL}/auth/verify?token=${token}`;
  
  if (!env.SMTP_USER || !env.SMTP_PASS || env.SMTP_HOST.includes('ethereal')) {
    console.log(`[Email Mock] Verification email for ${email}. URL: ${verificationUrl}`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: email,
      subject: 'CodeSync - Verify your email',
      html: `
        <h2>Welcome to CodeSync!</h2>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
      `,
    });

    if (env.SMTP_HOST.includes('ethereal')) {
      console.log(`[Email] Verification email sent to ${email}. Preview: ${nodemailer.getTestMessageUrl(info)}`);
    }
  } catch (error) {
    console.error(`[Email Error] Failed to send verification email to ${email}.`);
    console.error(`[Email Mock] Verification URL: ${verificationUrl}`);
  }
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetUrl = `${env.FRONTEND_URL}/auth/reset-password?token=${token}`;
  
  if (!env.SMTP_USER || !env.SMTP_PASS || env.SMTP_HOST.includes('ethereal')) {
    console.log(`[Email Mock] Password reset email for ${email}. URL: ${resetUrl}`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: email,
      subject: 'CodeSync - Password Reset',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to set a new password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    if (env.SMTP_HOST.includes('ethereal')) {
      console.log(`[Email] Password reset email sent to ${email}. Preview: ${nodemailer.getTestMessageUrl(info)}`);
    }
  } catch (error) {
    console.error(`[Email Error] Failed to send password reset email to ${email}.`);
    console.error(`[Email Mock] Password Reset URL: ${resetUrl}`);
  }
};

export const sendProjectInvitationEmail = async (
  email: string,
  projectName: string,
  inviterName: string,
  projectId: string,
  role: string,
  isNewUser: boolean = false
) => {
  const targetUrl = isNewUser
    ? `${env.FRONTEND_URL}/auth/register?email=${encodeURIComponent(email)}`
    : `${env.FRONTEND_URL}/projects/${projectId}`;

  if (!env.SMTP_USER || !env.SMTP_PASS || env.SMTP_HOST.includes('ethereal')) {
    console.log(`[Email Mock] Project invitation for ${email}. URL: ${targetUrl}`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to: email,
      subject: `CodeSync - Invitation to collaborate on "${projectName}"`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #334155; border-radius: 8px; background-color: #0f172a; color: #f8fafc;">
          <h2 style="color: #38bdf8; margin-top: 0;">You've been invited to CodeSync!</h2>
          <p style="font-size: 16px; line-height: 1.5; color: #cbd5e1;">
            <strong>${inviterName}</strong> has invited you to collaborate on <strong>${projectName}</strong> as a <strong>${role === 'team_lead' ? 'Team Lead' : 'Member'}</strong>.
          </p>
          <div style="margin: 28px 0;">
            <a href="${targetUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 6px; font-weight: 600; text-decoration: none; display: inline-block;">
              ${isNewUser ? 'Create Account & Join Project' : 'Open Project in CodeSync'}
            </a>
          </div>
          <p style="font-size: 13px; color: #64748b;">
            Link: <a href="${targetUrl}" style="color: #38bdf8;">${targetUrl}</a>
          </p>
        </div>
      `,
    });

    if (env.SMTP_HOST.includes('ethereal')) {
      console.log(`[Email] Project invitation sent to ${email}. Preview: ${nodemailer.getTestMessageUrl(info)}`);
    } else {
      console.log(`[Email] Project invitation sent to ${email}`);
    }
  } catch (error) {
    console.error(`[Email Error] Failed to send project invitation email to ${email}.`);
    console.log(`[Email Mock] Project Invitation URL for ${email}: ${targetUrl}`);
  }
};

