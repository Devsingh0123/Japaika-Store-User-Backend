import nodemailer from 'nodemailer';
import env from '../config/env.js';

let smtpTransporter = null;

function getSmtpTransporter() {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: env.email.smtp.host,
      port: env.email.smtp.port,
      secure: env.email.smtp.secure,
      auth:
        env.email.smtp.user || env.email.smtp.pass
          ? {
              user: env.email.smtp.user,
              pass: env.email.smtp.pass,
            }
          : undefined,
    });
  }
  return smtpTransporter;
}

function buildOtpEmailContent({ otp, expiresInMinutes }) {
  const subject = `${otp} is your Japaika verification code`;
  const text = [
    `Your Japaika verification code is: ${otp}`,
    '',
    `This code expires in ${expiresInMinutes} minutes and can only be used once.`,
    'If you did not request this code, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="margin: 0 0 12px; font-size: 20px; color: #111827;">Japaika Verification Code</h2>
      <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5;">Use the verification code below to sign in to your Japaika account:</p>
      <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #111827;">
        ${otp}
      </div>
      <p style="margin: 0 0 8px; font-size: 13px; color: #4b5563;">This code expires in ${expiresInMinutes} minutes and can only be used once.</p>
      <p style="margin: 0; font-size: 13px; color: #6b7280;">If you did not request this code, you can safely ignore this email.</p>
    </div>
  `.trim();

  return { subject, text, html };
}

export async function sendOtpEmail({ to, otp, expiresInMinutes = env.otp.expiryMinutes }) {
  const { subject, text, html } = buildOtpEmailContent({ otp, expiresInMinutes });

  if (env.email.transport === 'console') {
    if (env.isProd) {
      throw new Error('Console email transport is prohibited in production.');
    }
    if (!env.isTest) {
      console.info(`[EMAIL:CONSOLE] To: ${to} | Subject: ${subject} | OTP: ${otp}`);
    }
    return { delivered: true, transport: 'console' };
  }

  const transporter = getSmtpTransporter();
  const info = await transporter.sendMail({
    from: env.email.from,
    to,
    subject,
    text,
    html,
  });

  return { delivered: true, transport: 'smtp', messageId: info.messageId };
}

export default {
  sendOtpEmail,
};
