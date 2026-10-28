const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fail = message => Object.assign(new Error(message), { status: 400 });
async function completePasswordReset(prisma, { email, token, password }) {
  email = String(email || '').trim().toLowerCase();
  token = String(token || '').trim();
  password = String(password || '');
  if (!email.includes('@') || !token) throw fail('Email and reset token are required');
  if (password.length < 8 || Buffer.byteLength(password) > 72) throw fail('Use a password of at least 8 characters and at most 72 bytes.');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: email } });
    if (!user || user.disabledAt) throw fail('Invalid or expired reset token');
    const consumed = await tx.passwordResetToken.updateMany({
      where: { userId: email, tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw fail('Invalid or expired reset token');
    await tx.user.update({ where: { id: email }, data: { passwordHash, authProvider: 'password' } });
    await tx.passwordResetToken.updateMany({ where: { userId: email, usedAt: null }, data: { usedAt: new Date() } });
    return user;
  });
}
module.exports = { completePasswordReset };
