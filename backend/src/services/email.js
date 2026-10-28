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

function passwordResetContent({ to, token, expiresAt }) {
  const resetUrl = new URL('/admin/reset.html', 'https://api.example.invalid');
  resetUrl.hash = new URLSearchParams({ email: to, token }).toString();
  const expires = expiresAt instanceof Date ? expiresAt.toISOString() : String(expiresAt || '');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  return {
    text: `You requested a password reset for RiseQuest.\n\nReset your password: ${resetUrl.href}\n\nThis link expires at: ${expires}\n\nYou can also enter this token in the RiseQuest app or reset page: ${token}\n\nYour RiseQuest password works in the app and, if you have administrator access, Admin Studio.\n\nIf you did not request this, ignore this email.`,
    html: `<h1>Reset your RiseQuest password</h1><p>You requested a password reset for RiseQuest.</p><p><a href="${escape(resetUrl.href)}" style="display:inline-block;padding:14px 22px;background:#21685e;color:#fff;border-radius:12px;text-decoration:none">Choose a new password</a></p><p>This link expires at ${escape(expires)}.</p><p>If the button does not open, copy this address into your browser:<br><a href="${escape(resetUrl.href)}">${escape(resetUrl.href)}</a></p><p>You can also enter this token in the RiseQuest app or reset page: <code>${escape(token)}</code></p><p>Your RiseQuest password works in the app and, if you have administrator access, Admin Studio.</p><p>If you did not request this, ignore this email.</p>`,
  };
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
  const content = passwordResetContent({ to, token, expiresAt });

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    ...content,
  });
}

module.exports = {
  getSmtpConfigFromEnv,
  getTransporter,
  sendPasswordResetEmail,
  passwordResetContent,
};
