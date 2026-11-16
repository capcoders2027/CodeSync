import nodemailer from 'nodemailer';
import { env } from '../config/env';

// Singleton transporter instance
let dynamicTransporter: nodemailer.Transporter | null = null;
let isEthereal = false;

/**
 * Returns an active nodemailer transporter with strict socket timeouts
 * so cloud hosts (Render) never hang if outbound SMTP ports are blocked.
 */
async function getTransporter(): Promise<nodemailer.Transporter> {
  if (dynamicTransporter) return dynamicTransporter;

  if (env.SMTP_USER && env.SMTP_PASS && !env.SMTP_HOST.includes('ethereal')) {
    const cleanPass = env.SMTP_PASS.replace(/\s+/g, '');
    const isGmail = env.SMTP_HOST.includes('gmail');
    dynamicTransporter = isGmail
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: env.SMTP_USER,
            pass: cleanPass,
          },
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 5000,
        } as any)
      : nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: {
            user: env.SMTP_USER,
            pass: cleanPass,
          },
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 5000,
        });
    isEthereal = false;
    console.log(`[Email] Nodemailer configured for ${isGmail ? 'Gmail' : env.SMTP_HOST}:${env.SMTP_PORT} (${env.SMTP_USER})`);
    return dynamicTransporter;
  }

  // Fallback: automatically create an Ethereal test account for dev
  try {
    console.log('[Email] Connecting to Ethereal Mail service for email delivery...');
    const testAccount = await nodemailer.createTestAccount();
    dynamicTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });
    isEthereal = true;
    console.log(`[Email] Ethereal live test mail account active: ${testAccount.user}`);
    return dynamicTransporter;
  } catch (err) {
    console.warn('[Email] Could not create Ethereal account, falling back to direct SMTP host', err);
    dynamicTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });
    return dynamicTransporter;
  }
}

function logEmailDelivery(info: any, to: string, subject: string) {
  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log('\n======================================================================');
  console.log(`📧 [EMAIL DELIVERED]`);
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Msg ID:  ${info?.messageId || info?.id || 'delivered'}`);
  if (previewUrl) {
    console.log(`🔗 VIEW LIVE DELIVERED EMAIL IN BROWSER:\n   ${previewUrl}`);
  }
  console.log('======================================================================\n');
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

/**
 * Universal email dispatcher:
 * 1. Checks for Brevo REST API (HTTPS port 443 - bypasses cloud SMTP port blocks).
 * 2. Checks for Resend REST API (HTTPS port 443).
 * 3. Falls back to Nodemailer SMTP (with 5000ms timeout) so requests never hang.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const { to, subject, html, replyTo } = opts;
  const fromAddress = opts.from || `"CodeSync" <${env.EMAIL_FROM}>`;

  // 1. Brevo HTTPS API (Port 443)
  const brevoKey = (process.env.BREVO_API_KEY || (env as any).BREVO_API_KEY || '').trim();
  if (brevoKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'CodeSync', email: env.EMAIL_FROM },
          to: [{ email: to }],
          replyTo: replyTo ? { email: replyTo } : undefined,
          subject,
          htmlContent: html,
        }),
      });

      if (res.ok) {
        const body: any = await res.json();
        console.log(`[Email] Brevo HTTPS delivered to ${to} (id: ${body.messageId})`);
        return true;
      } else {
        const errText = await res.text();
        console.warn(`[Email Warning] Brevo API status ${res.status}:`, errText);
      }
    } catch (err: any) {
      console.warn(`[Email Warning] Brevo HTTPS dispatch failed:`, err.message);
    }
  }

  // 2. Resend HTTPS API (Port 443)
  const resendKey = (process.env.RESEND_API_KEY || env.RESEND_API_KEY || '').trim();
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress.includes('<') ? fromAddress : `CodeSync <${fromAddress}>`,
          to: [to],
          reply_to: replyTo,
          subject,
          html,
        }),
      });

      if (res.ok) {
        const body: any = await res.json();
        console.log(`[Email] Resend HTTPS delivered to ${to} (id: ${body.id})`);
        return true;
      } else {
        const errText = await res.text();
        console.warn(`[Email Warning] Resend API status ${res.status}:`, errText);
      }
    } catch (err: any) {
      console.warn(`[Email Warning] Resend HTTPS dispatch failed:`, err.message);
    }
  }

  // 3. Nodemailer SMTP (Gmail or custom host) with 5s timeout
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: fromAddress,
      replyTo,
      to,
      subject,
      html,
    });
    logEmailDelivery(info, to, subject);
    return true;
  } catch (error: any) {
    console.error(`[Email Warning] Nodemailer SMTP delivery to ${to} failed:`, error.message || error);
    if (error.code === 'ETIMEDOUT' || error.command === 'CONN') {
      console.warn('[Email Notice] SMTP timeout detected. Render Free Web Services block outbound TCP ports 25, 465, and 587. For production email on Render Free Tier, add a BREVO_API_KEY or RESEND_API_KEY in Render environment variables.');
    }
    return false;
  }
}

export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = `${env.FRONTEND_URL}/auth/verify?token=${token}`;

  await sendEmail({
    from: `"CodeSync Security" <${env.EMAIL_FROM}>`,
    to: email,
    subject: 'CodeSync - Verify your email address',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background-color: #0b0f17; color: #e2e8f0; border-radius: 12px; border: 1px solid #1e293b;">
        <div style="margin-bottom: 24px; text-align: center;">
          <span style="font-size: 24px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px;">CodeSync</span>
        </div>
        <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 12px; text-align: center;">Verify your email address</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; text-align: center; margin-bottom: 28px;">
          Thanks for getting started with CodeSync! Please confirm your email address to activate your account and start collaborating in real time.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${verificationUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 15px; text-decoration: none; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 20px;">
          If the button above does not work, copy and paste this link into your browser:<br/>
          <a href="${verificationUrl}" style="color: #38bdf8; word-break: break-all;">${verificationUrl}</a>
        </p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetUrl = `${env.FRONTEND_URL}/auth/reset-password?token=${token}`;

  await sendEmail({
    from: `"CodeSync Security" <${env.EMAIL_FROM}>`,
    to: email,
    subject: 'CodeSync - Password Reset Request',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background-color: #0b0f17; color: #e2e8f0; border-radius: 12px; border: 1px solid #1e293b;">
        <div style="margin-bottom: 24px; text-align: center;">
          <span style="font-size: 24px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px;">CodeSync</span>
        </div>
        <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 12px; text-align: center;">Password Reset Request</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; text-align: center; margin-bottom: 28px;">
          We received a request to reset your password. Click the button below to choose a new password. This link is valid for 1 hour.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${resetUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 15px; text-decoration: none; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 20px;">
          If you did not request a password reset, you can safely ignore this email.<br/>
          Direct link: <a href="${resetUrl}" style="color: #38bdf8; word-break: break-all;">${resetUrl}</a>
        </p>
      </div>
    `,
  });
};

export interface ProjectInvitationOptions {
  email: string;
  projectName: string;
  projectDescription?: string | null;
  projectLanguage?: string;
  inviterName: string;
  inviterEmail?: string;
  projectId: string;
  role: string;
  permissions?: Record<string, boolean>;
  isNewUser?: boolean;
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  team_lead: 'Team Lead',
  developer: 'Developer',
  tester: 'QA Tester',
  member: 'Team Member',
  viewer: 'Viewer (Read Only)',
};

const PERMISSION_LABELS: Record<string, string> = {
  can_edit_files: 'Edit & Create Project Files',
  can_delete_files: 'Delete Files & Directories',
  can_execute_code: 'Run Code & Access Interactive Terminal',
  can_trigger_analysis: 'Trigger SonarQube & ML Defect Analysis',
  can_view_analysis: 'View Quality Metrics & Defect Reports',
  can_create_versions: 'Create Snapshots & Version History',
  can_manage_members: 'Invite & Manage Team Members',
  can_delete_project: 'Delete Project & Administrative Controls',
};

export const sendProjectInvitationEmail = async (options: ProjectInvitationOptions) => {
  const {
    email,
    projectName,
    projectDescription,
    projectLanguage = 'Python',
    inviterName,
    inviterEmail,
    projectId,
    role,
    permissions = {},
    isNewUser = false,
  } = options;

  const targetUrl = isNewUser
    ? `${env.FRONTEND_URL}/auth/register?email=${encodeURIComponent(email)}`
    : `${env.FRONTEND_URL}/projects/${projectId}`;

  const roleName = ROLE_DISPLAY_NAMES[role] || role;

  const privilegesEntries = Object.entries(permissions);
  const privilegesHtml = privilegesEntries.length > 0
    ? privilegesEntries.map(([key, granted]) => {
        const label = PERMISSION_LABELS[key] || key.replace(/_/g, ' ');
        const badgeColor = granted ? '#10b981' : '#64748b';
        const icon = granted ? '✓' : '✗';
        const textStyle = granted ? 'color: #e2e8f0; font-weight: 500;' : 'color: #64748b; text-decoration: line-through;';
        return `
          <div style="display: flex; align-items: center; margin-bottom: 8px; font-size: 13px;">
            <span style="display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; background-color: ${granted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)'}; color: ${badgeColor}; font-weight: 700; margin-right: 10px; font-size: 11px;">
              ${icon}
            </span>
            <span style="${textStyle}">${label}</span>
          </div>
        `;
      }).join('')
    : `
      <div style="color: #94a3b8; font-size: 13px;">Standard ${roleName} access to project files and features.</div>
    `;

  const fromHeader = `"${inviterName} (Team Lead) via CodeSync" <${env.EMAIL_FROM}>`;
  const replyToHeader = inviterEmail || env.EMAIL_FROM;

  await sendEmail({
    from: fromHeader,
    replyTo: replyToHeader,
    to: email,
    subject: `Project Invitation: ${inviterName} invited you to join "${projectName}" as ${roleName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background-color: #0b0f17; color: #f1f5f9; border-radius: 12px; border: 1px solid #1e293b; overflow: hidden;">
        
        <!-- Header Bar -->
        <div style="padding: 24px 32px; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); border-bottom: 1px solid #1e293b;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 22px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px;">CodeSync</span>
            <span style="font-size: 12px; background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 4px 10px; border-radius: 20px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Project Invite</span>
          </div>
          <h2 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 16px 0 6px 0;">You've been invited to collaborate!</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">
            Team Lead <strong>${inviterName}</strong> ${inviterEmail ? `(${inviterEmail})` : ''} has added you to their team workspace.
          </p>
        </div>

        <div style="padding: 32px;">
          
          <!-- Project Details Card -->
          <div style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px;">
              <span style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">Project Details</span>
              <span style="background-color: #0284c7; color: #ffffff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">${projectLanguage}</span>
            </div>
            <div style="font-size: 18px; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">
              ${projectName}
            </div>
            ${projectDescription ? `<p style="font-size: 14px; color: #94a3b8; margin: 0 0 10px 0; line-height: 1.5;">${projectDescription}</p>` : ''}
            <div style="font-size: 13px; color: #64748b;">
              Team Lead: <span style="color: #cbd5e1; font-weight: 500;">${inviterName}</span> ${inviterEmail ? `<span style="color: #38bdf8;">&lt;${inviterEmail}&gt;</span>` : ''}
            </div>
          </div>

          <!-- Role & Privileges Card -->
          <div style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 28px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid #1e293b; padding-bottom: 10px;">
              <span style="font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">Your Role & Privileges</span>
              <span style="background-color: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 4px;">${roleName}</span>
            </div>
            <div style="margin-bottom: 14px;">
              ${privilegesHtml}
            </div>
          </div>

          <!-- Call to Action -->
          <div style="text-align: center; margin-bottom: 28px;">
            <a href="${targetUrl}" style="background-color: #0284c7; color: #ffffff; padding: 14px 36px; border-radius: 8px; font-weight: 700; font-size: 15px; text-decoration: none; display: inline-block; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);">
              ${isNewUser ? 'Accept Invite & Create Account' : 'Open Project in CodeSync'}
            </a>
          </div>

          <!-- Direct URL Fallback -->
          <div style="border-top: 1px solid #1e293b; padding-top: 18px; font-size: 12px; color: #64748b; line-height: 1.5;">
            If you have any questions, you can reply directly to this email to reach <strong>${inviterName}</strong> at <a href="mailto:${inviterEmail || 'team-lead@codesync.dev'}" style="color: #38bdf8;">${inviterEmail || 'team-lead@codesync.dev'}</a>.<br/><br/>
            Direct Link: <a href="${targetUrl}" style="color: #38bdf8; word-break: break-all;">${targetUrl}</a>
          </div>

        </div>
      </div>
    `,
  });
};

export const sendTwoFactorCodeEmail = async (email: string, code: string) => {
  await sendEmail({
    from: `"CodeSync Security" <${env.EMAIL_FROM}>`,
    to: email,
    subject: `CodeSync - Your 2FA Verification Code: ${code}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background-color: #0b0f17; color: #e2e8f0; border-radius: 12px; border: 1px solid #1e293b; text-align: center;">
        <div style="margin-bottom: 20px;">
          <span style="font-size: 24px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px;">CodeSync</span>
        </div>
        <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 12px;">Two-Factor Authentication Code</h2>
        <p style="font-size: 15px; color: #94a3b8; margin-bottom: 24px;">
          Use the 6-digit verification code below to complete your login. This code is valid for <strong>10 minutes</strong>.
        </p>
        <div style="display: inline-block; background-color: #1e293b; border: 2px solid #0284c7; padding: 16px 36px; border-radius: 8px; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #38bdf8; font-family: monospace; margin-bottom: 24px;">
          ${code}
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 20px; margin-top: 16px;">
          If you did not attempt to sign in to your CodeSync account, someone may be attempting to access your account. Please change your password immediately.
        </p>
      </div>
    `,
  });
};

export const sendSecurityNotification = async (email: string, title: string, message: string) => {
  await sendEmail({
    from: `"CodeSync Security" <${env.EMAIL_FROM}>`,
    to: email,
    subject: `CodeSync Security Alert: ${title}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background-color: #0b0f17; color: #e2e8f0; border-radius: 12px; border: 1px solid #1e293b;">
        <div style="margin-bottom: 20px; text-align: center;">
          <span style="font-size: 24px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px;">CodeSync</span>
        </div>
        <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin-top: 0; margin-bottom: 12px;">${title}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px;">
          ${message}
        </p>
        <div style="background-color: #1e293b; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #cbd5e1; margin-bottom: 24px;">
          If you authorized this change, you don't need to do anything. If you didn't initiate this action, please secure your account immediately.
        </div>
      </div>
    `,
  });
};
