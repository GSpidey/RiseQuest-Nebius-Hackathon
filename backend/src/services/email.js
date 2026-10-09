const nodemailer = require('nodemailer');

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

function getSmtpConfigFromEnv() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 0) || 0;
  const secure = parseBoolean(process.env.SMTP_SECURE, false);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || '').trim();

  const ok = Boolean(host && port && from);
  return {
    ok,
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
}

let cachedTransporter = null;
let cachedKey = '';

function getTransporter() {
  const cfg = getSmtpConfigFromEnv();
  if (!cfg.ok) return null;

  const key = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user ? 'auth' : 'noauth'}`;
  if (cachedTransporter && cachedKey === key) return cachedTransporter;

  const auth = cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined;
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth,
  });
  cachedKey = key;
  return cachedTransporter;
}

async function sendPasswordResetEmail({ to, token, expiresAt }) {
  const cfg = getSmtpConfigFromEnv();
  const transporter = getTransporter();
  if (!cfg.ok || !transporter) {
    const err = new Error('SMTP not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const subject = String(process.env.PASSWORD_RESET_EMAIL_SUBJECT || 'RiseQuest password reset');
  const expires = expiresAt instanceof Date ? expiresAt.toISOString() : String(expiresAt || '');

  const text =
    `You requested a password reset for RiseQuest.\n\n` +
    `Reset token: ${token}\n` +
    `This token expires at: ${expires}\n\n` +
    `Open the RiseQuest app → Login → Forgot password, then paste the token and choose a new password.\n\n` +
    `If you didn't request this, you can ignore this email.`;

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    text,
  });
}

module.exports = {
  getSmtpConfigFromEnv,
  getTransporter,
  sendPasswordResetEmail,
};
