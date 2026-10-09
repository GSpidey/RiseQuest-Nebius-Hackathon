const fs = require('fs/promises');
const path = require('path');
async function applyRetention(prisma, uploadsDir, now = Date.now()) {
  const cutoff = new Date(now - 30 * 86400000);
  await prisma.familyConsent.updateMany({ where: { status: { in: ['AWAITING_EMAIL', 'AWAITING_DOCUMENT', 'PENDING_REVIEW'] }, createdAt: { lt: cutoff } },
    data: { status: 'DENIED', document: null, emailTokenHash: null, reviewNote: 'Request expired after 30 days. You can start a new request.' } });
  await prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  // Replaced profile images and uploads interrupted before the profile update
  // are no longer referenced. Leave fresh files and unfamiliar legacy names.
  const root = path.resolve(uploadsDir);
  const images = await fs.readdir(root, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const entry of images) {
    if (!entry.isFile() || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/i.test(entry.name)) continue;
    const file = path.resolve(root, entry.name);
    if (path.dirname(file) !== root || (await fs.stat(file)).mtimeMs >= now - 86400000) continue;
    const references = await prisma.user.count({ where: { OR: [{ photoUrl: { endsWith: `/uploads/${entry.name}` } }, { bannerUrl: { endsWith: `/uploads/${entry.name}` } }] } });
    if (!references) await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  const directory = path.resolve(uploadsDir, 'tts');
  const files = await fs.readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const entry of files) {
    if (!entry.isFile() || !/^[a-f0-9]{64}\.mp3$/.test(entry.name)) continue;
    const file = path.resolve(directory, entry.name);
    if (path.dirname(file) !== directory) continue;
    const stat = await fs.stat(file);
    if (stat.mtimeMs < now - 86400000) await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
function startRetention(prisma, uploadsDir) {
  if (process.env.NODE_ENV === 'test') return;
  let busy = false;
  const run = async () => { if (busy) return; busy = true;
    try { await applyRetention(prisma, uploadsDir); } catch (_) { console.warn('RiseQuest retention cleanup will retry.'); }
    finally { busy = false; }
  };
  setInterval(run, 3600000).unref();
}
module.exports = { applyRetention, startRetention };
