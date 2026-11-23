import nodemailer from 'nodemailer';

let smtpTransporter = null;

export function getEmailConfig(raw = process.env) {
  const isProd = raw.NODE_ENV === 'production';
  const host = (raw.SMTP_HOST || '').trim();
  const port = Number(raw.SMTP_PORT || 587);
  const transport = host ? 'smtp' : 'console';

  if (isProd && !host) {
    throw new Error('SMTP_HOST is required in production.');
  }

  return {
    isProd,
    isTest: raw.NODE_ENV === 'test',
    transport,
    from: raw.EMAIL_FROM || 'Japaika <no-reply@japaika.example>',
    smtp: {
      host,
      port,
      secure: port === 465,
      user: raw.SMTP_USER || '',
      pass: raw.SMTP_PASS || '',
    },
  };
}

function getSmtpTransporter(smtp) {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user || smtp.pass ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
  }
  return smtpTransporter;
}

function buildOtpEmail({ otp, expiresInMinutes }) {
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
      <p style="margin: 0 0 16px; font-size: 15px;">Use the verification code below to sign in to your Japaika account:</p>
      <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #111827;">
        ${otp}
      </div>
      <p style="margin: 0 0 8px; font-size: 13px; color: #4b5563;">This code expires in ${expiresInMinutes} minutes and can only be used once.</p>
      <p style="margin: 0; font-size: 13px; color: #6b7280;">If you did not request this code, you can safely ignore this email.</p>
    </div>
  `.trim();

  return { subject, text, html };
}

const emailService = {
  async sendOtpEmail({ to, otp, expiresInMinutes = 10 }) {
    const config = getEmailConfig();
    const { subject, text, html } = buildOtpEmail({ otp, expiresInMinutes });

    if (config.transport === 'console') {
      if (!config.isTest) {
        console.info(`[EMAIL:CONSOLE] To: ${to} | Subject: ${subject} | OTP: ${otp}`);
      }
      return { delivered: true, transport: 'console' };
    }

    const info = await getSmtpTransporter(config.smtp).sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
    });

    return { delivered: true, transport: 'smtp', messageId: info.messageId };
  },
};

export default emailService;
