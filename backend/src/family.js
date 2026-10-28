const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');
const { sanitizeProfile, publicProfile } = require('./profilePolicy');
const { getTransporter, getSmtpConfigFromEnv } = require('./services/email');

const NOTICE_VERSION = '2026-09-25-v1';
const FAMILY_NOTICE = `RiseQuest parent notice (${NOTICE_VERSION})\n\n` +
  'Operator: GoldenEpic Solutions Inc. Contact: owner@example.invalid.\n' +
  'A child profile stores a nickname, age band, routines, quests, alarm activity and optional accessibility preferences on our privately operated backend. Do not provide a legal child name, address, school, medical diagnosis, or private contact details.\n' +
  'Parents can review, edit and delete these records in Family profiles. Withdrawing consent removes the child account and stops online access. Restricted-access recovery backups may temporarily retain deleted records under our published retention policy.\n' +
  'Children receive curated wellbeing suggestions, not external generative AI. Their profiles and community are private. No child conversations, conditions, sleep or mood information is used for advertising.\n' +
  'Optional advertising, if enabled separately by the parent, uses eligible Google child-directed, nonpersonalized ads; never Meta. Refusing ads does not prevent use. No advertising SDK requests occur before verified consent and a separate advertising choice.\n' +
  'We do not sell child information or disclose it for targeted advertising. Service providers process only what is necessary to operate the requested service.\n' +
  'To consent: verify your email, then sign and return this notice with the reference below, your full name, your account email and date. Declare that you are the parent or legal guardian and authorize the described collection and use. Do not include identity documents. A staff member must review it before a child profile can be created.\n' +
  'This app supports daily wellbeing. It is not diagnosis, treatment or an emergency service.';
const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function documentKey(secret) { return crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.from('risequest-consent-v1'), Buffer.from('signed-document'), 32); }
function sealDocument(bytes, secret, id) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', documentKey(secret), iv);
  cipher.setAAD(Buffer.from(id));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
function openDocument(bytes, secret, id) {
  const data = Buffer.from(bytes), decipher = crypto.createDecipheriv('aes-256-gcm', documentKey(secret), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}
function consentSummary(row) {
  return { id: row.id, status: row.status, noticeVersion: row.noticeVersion, createdAt: row.createdAt,
    emailVerified: Boolean(row.emailVerifiedAt), documentReceived: Boolean(row.documentHash),
    reviewedAt: row.reviewedAt, reviewNote: row.reviewNote, childId: row.child?.childId || null };
}
function childPreferences(input = {}, existing = {}) {
  // No diagnostic labels, freeform goals or personal identifiers in a child profile.
  const ageBand = ['under13', '13to15', '16to17'].includes(input.ageBand) ? input.ageBand : existing.ageBand || 'under13';
  const p = input.preferences || {};
  return { ...sanitizeProfile({ ageGroup: ageBand === 'under13' ? 'child' : 'teen', ageBand,
    supportEnabled: false, supportConditions: [], preferences: {
      reducedSensory: p.reducedSensory === true, captionsEnabled: p.captionsEnabled === true,
      dyslexiaFriendly: p.dyslexiaFriendly === true, analyticsOptIn: false, communityOptIn: false,
      communityTeenSafety: true, ttsMode: 'device', dataMinimization: true,
      goals: (Array.isArray(p.goals) ? p.goals : []).filter(v => ['wake_consistency', 'focus', 'sleep', 'routine'].includes(v)),
    } }, existing), managedByParent: true };
}
function registerFamilyRoutes(app, { prisma, requireAuth, requireAdmin, requireRole, secret }) {
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) {
    res.status(e.status || (e.code === 'P2002' ? 409 : 503)).json({ error: e.status ? e.message : 'Family service temporarily unavailable. Please retry.' });
  } };
  const writes = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => req.auth.userId, message: { error: 'Please wait before trying again.' } });
  const parent = async (req, res, next) => {
    try {
      const profile = await prisma.userProfile.findUnique({ where: { userId: req.auth.userId } });
      if (profile?.data?.ageGroup !== 'adult' || req.auth.provider === 'child') return res.status(403).json({ error: 'An adult parent account is required.' });
      next();
    } catch (_) { res.status(503).json({ error: 'Could not check parent account.' }); }
  };
  const ownedConsent = async (req, tx = prisma) => {
    const row = await tx.familyConsent.findUnique({ where: { id: req.params.id }, include: { child: true } });
    if (!row || row.parentId !== req.auth.userId) throw fail(404, 'Consent request not found.');
    return row;
  };
  const ownedChild = async req => {
    const child = await prisma.childAccount.findUnique({ where: { childId: req.params.childId }, include: { child: { include: { profile: true } }, consent: true } });
    if (!child || child.parentId !== req.auth.userId) throw fail(404, 'Child profile not found.');
    if (child.consent.status !== 'APPROVED' || child.consent.withdrawnAt) throw fail(403, 'Verified parental consent is required.');
    return child;
  };
  app.get('/api/family', requireAuth, parent, wrap(async (req, res) => {
    const [consents, children] = await Promise.all([
      prisma.familyConsent.findMany({ where: { parentId: req.auth.userId }, include: { child: true }, orderBy: { createdAt: 'desc' } }),
      prisma.childAccount.findMany({ where: { parentId: req.auth.userId }, include: { child: { include: { profile: true } } } }),
    ]);
    res.set('Cache-Control', 'no-store').json({ notice: FAMILY_NOTICE, noticeVersion: NOTICE_VERSION,
      consents: consents.map(consentSummary), children: children.map(r => ({ id: r.childId, nickname: r.child.name, adsConsent: r.adsConsent, profile: publicProfile(r.child.profile) })) });
  }));
  app.post('/api/family/consents', requireAuth, parent, writes, wrap(async (req, res) => {
    if (req.body.noticeVersion !== NOTICE_VERSION) throw fail(400, 'Read the current parent notice first.');
    if (await prisma.familyConsent.count({ where: { parentId: req.auth.userId, status: { notIn: ['DENIED', 'WITHDRAWN'] } } }) >= 10) throw fail(400, 'At most ten active family requests are supported.');
    const cfg = getSmtpConfigFromEnv(), transporter = getTransporter();
    if (!cfg.ok || !transporter) throw fail(503, 'Email verification is unavailable. No child information has been collected.');
    const token = crypto.randomBytes(12).toString('hex');
    const row = await prisma.familyConsent.create({ data: { parentId: req.auth.userId, noticeVersion: NOTICE_VERSION,
      emailTokenHash: digest(token), emailTokenExpiresAt: new Date(Date.now() + 24 * 3600000) } });
    try {
      await transporter.sendMail({ from: cfg.from, to: req.auth.userId, subject: 'RiseQuest parent consent request',
        text: `${FAMILY_NOTICE}\n\nReference: ${row.id}\nVerification code: ${token}\nCode expires in 24 hours. Enter it in More > Family profiles.\n\nPrint/sign or sign a copy of this notice, excluding the verification code. Upload a clear image in the app. Do not email child information. Ignore this message if you did not request it.` });
    } catch (_) {
      await prisma.familyConsent.update({ where: { id: row.id }, data: { status: 'DENIED', emailTokenHash: null, reviewNote: 'Email could not be sent; start a new request.' } });
      throw fail(503, 'Verification email could not be sent. Please retry later.');
    }
    res.status(201).json({ consent: consentSummary(row) });
  }));
  app.post('/api/family/consents/:id/verify-email', requireAuth, parent, writes, wrap(async (req, res) => {
    const row = await ownedConsent(req), token = String(req.body.code || '').trim();
    if (row.status !== 'AWAITING_EMAIL' || !row.emailTokenHash || new Date(row.emailTokenExpiresAt).getTime() <= Date.now() ||
      !crypto.timingSafeEqual(Buffer.from(digest(token)), Buffer.from(row.emailTokenHash))) throw fail(400, 'Invalid or expired verification code.');
    const updated = await prisma.familyConsent.updateMany({ where: { id: row.id, status: 'AWAITING_EMAIL', emailTokenHash: row.emailTokenHash },
      data: { status: 'AWAITING_DOCUMENT', emailVerifiedAt: new Date(), emailTokenHash: null } });
    if (!updated.count) throw fail(409, 'This verification was already used. Refresh the request.');
    res.json({ success: true });
  }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1, fields: 0 } }).single('file');
  app.post('/api/family/consents/:id/document', requireAuth, parent, writes, (req, res, next) => upload(req, res, e => {
    if (e) return res.status(400).json({ error: 'Upload one signed JPEG or PNG image under 6 MB.' }); next();
  }), wrap(async (req, res) => {
    const row = await ownedConsent(req);
    if (row.status !== 'AWAITING_DOCUMENT' || !row.emailVerifiedAt) throw fail(409, 'Verify your email before uploading the signed notice.');
    if (!req.file || !['image/jpeg', 'image/png'].includes(req.file.mimetype)) throw fail(400, 'Choose a signed JPEG or PNG image.');
    let bytes;
    try {
      const image = sharp(req.file.buffer, { limitInputPixels: 20000000 });
      if (!['jpeg', 'png'].includes((await image.metadata()).format)) throw Error();
      bytes = await image.rotate().resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    } catch (_) { throw fail(400, 'The signed image could not be decoded.'); }
    const changed = await prisma.familyConsent.updateMany({ where: { id: row.id, status: 'AWAITING_DOCUMENT' }, data: {
      document: sealDocument(bytes, secret, row.id), documentHash: digest(bytes), status: 'PENDING_REVIEW',
    } });
    if (!changed.count) throw fail(409, 'Request changed; refresh before uploading.');
    res.json({ success: true });
  }));
  app.post('/api/family/consents/:id/withdraw', requireAuth, parent, writes, wrap(async (req, res) => {
    await prisma.$transaction(async tx => {
      const row = await ownedConsent(req, tx);
      if (row.child) await tx.user.delete({ where: { id: row.child.childId } });
      await tx.familyConsent.update({ where: { id: row.id }, data: { status: 'WITHDRAWN', withdrawnAt: new Date(), document: null, emailTokenHash: null } });
    }, { isolationLevel: 'Serializable' });
    res.json({ success: true, message: 'Consent withdrawn and linked child account deleted.' });
  }));
  app.post('/api/family/children', requireAuth, parent, writes, wrap(async (req, res) => {
    const nickname = String(req.body.nickname || '').trim();
    if (!nickname || nickname.length > 40) throw fail(400, 'Use a nickname of 1–40 characters, not a full legal name.');
    const profile = childPreferences(req.body.profile);
    const child = await prisma.$transaction(async tx => {
      const consent = await tx.familyConsent.findUnique({ where: { id: String(req.body.consentId || '') }, include: { child: true } });
      if (!consent || consent.parentId !== req.auth.userId || consent.status !== 'APPROVED' || consent.withdrawnAt || consent.child) throw fail(403, 'An approved, unused consent request is required.');
      const id = `child:${crypto.randomUUID()}`;
      return tx.user.create({ data: { id, name: nickname, authProvider: 'child',
        profile: { create: { data: profile, completedAt: new Date() } },
        childAccount: { create: { parentId: req.auth.userId, consentId: consent.id } },
      }, include: { profile: true } });
    }, { isolationLevel: 'Serializable' });
    res.status(201).json({ child: { id: child.id, nickname: child.name, profile: publicProfile(child.profile) } });
  }));
  app.put('/api/family/children/:childId/preferences', requireAuth, parent, writes, wrap(async (req, res) => {
    const child = await ownedChild(req), current = child.child.profile;
    if (req.body.version !== current.version) throw fail(409, 'Preferences changed. Refresh and retry.');
    const data = childPreferences(req.body.profile, current.data);
    const changed = await prisma.userProfile.updateMany({ where: { userId: child.childId, version: current.version }, data: { data, version: { increment: 1 } } });
    if (!changed.count) throw fail(409, 'Preferences changed. Refresh and retry.');
    res.json({ success: true });
  }));
  app.get('/api/family/children/:childId/records', requireAuth, parent, wrap(async (req, res) => {
    const child = await ownedChild(req), userId = child.childId;
    const [quests, alarms, sleep] = await Promise.all([
      prisma.quest.findMany({ where: { userId } }), prisma.alarmEvent.findMany({ where: { userId }, take: 100, orderBy: { createdAt: 'desc' } }),
      prisma.sleepEntry.findMany({ where: { userId }, take: 100, orderBy: { createdAt: 'desc' } }),
    ]);
    res.set('Cache-Control', 'no-store').json({ profile: publicProfile(child.child.profile), quests, alarms, sleep });
  }));
  app.put('/api/family/children/:childId/advertising', requireAuth, parent, writes, wrap(async (req, res) => {
    const child = await ownedChild(req);
    if (typeof req.body.allowed !== 'boolean') throw fail(400, 'Choose whether to allow child-directed advertising.');
    await prisma.childAccount.update({ where: { childId: child.childId }, data: { adsConsent: req.body.allowed } });
    res.json({ success: true });
  }));
  app.post('/api/family/children/:childId/session', requireAuth, parent, writes, wrap(async (req, res) => {
    const child = await ownedChild(req);
    const token = jwt.sign({ sub: child.childId, provider: 'child', consentId: child.consentId }, secret, { algorithm: 'HS256', expiresIn: '4h' });
    res.json({ token, user: { id: child.childId, email: child.childId, displayName: child.child.name, role: 'USER', authProvider: 'child' } });
  }));
  app.delete('/api/family/children/:childId', requireAuth, parent, writes, wrap(async (req, res) => {
    const child = await ownedChild(req);
    await prisma.$transaction(async tx => {
      await tx.user.delete({ where: { id: child.childId } });
      await tx.familyConsent.update({ where: { id: child.consentId }, data: { status: 'WITHDRAWN', withdrawnAt: new Date(), document: null } });
    });
    res.json({ success: true });
  }));
  app.get('/api/admin/family/consents', requireAdmin, requireRole('ADMIN'), wrap(async (_req, res) => {
    const rows = await prisma.familyConsent.findMany({ where: { status: 'PENDING_REVIEW' }, take: 100, orderBy: { createdAt: 'asc' } });
    res.set('Cache-Control', 'no-store').json({ consents: rows.map(r => ({ ...consentSummary(r), parentId: r.parentId })), notice: FAMILY_NOTICE });
  }));
  app.get('/api/admin/family/consents/:id/document', requireAdmin, requireRole('ADMIN'), wrap(async (req, res) => {
    const row = await prisma.familyConsent.findUnique({ where: { id: req.params.id } });
    if (!row?.document || row.status !== 'PENDING_REVIEW') throw fail(404, 'Pending document not found.');
    const bytes = openDocument(row.document, secret, row.id);
    res.set('Cache-Control', 'no-store').json({ image: `data:image/jpeg;base64,${bytes.toString('base64')}`, sha256: row.documentHash });
  }));
  app.post('/api/admin/family/consents/:id/review', requireAdmin, requireRole('ADMIN'), wrap(async (req, res) => {
    const status = req.body.approve === true ? 'APPROVED' : 'DENIED';
    if (status === 'APPROVED' && !['signature', 'guardianDeclaration', 'emailMatches', 'referenceMatches', 'noticeMatches'].every(k => req.body.checks?.[k] === true)) throw fail(400, 'Review every required document check.');
    const note = String(req.body.note || '').trim();
    if (!note || note.length > 500) throw fail(400, 'Enter a review note without unnecessary personal information (1–500 characters).');
    await prisma.$transaction(async tx => {
      const row = await tx.familyConsent.findUnique({ where: { id: req.params.id } });
      if (!row || row.status !== 'PENDING_REVIEW' || !row.documentHash || !row.emailVerifiedAt) throw fail(409, 'Request is not ready for review.');
      if (row.parentId === req.auth.userId) throw fail(403, 'You cannot approve your own consent request.');
      const changed = await tx.familyConsent.updateMany({ where: { id: row.id, status: 'PENDING_REVIEW' }, data: {
        status, reviewedBy: req.auth.userId, reviewedAt: new Date(), reviewNote: note,
        // Minimize sensitive retention. Keep evidence hash/version and review audit.
        document: null,
      } });
      if (!changed.count) throw fail(409, 'Another reviewer already handled this request.');
      await tx.adminAuditLog.create({ data: { actorId: req.auth.userId, action: `family_consent_${status.toLowerCase()}`, targetUserId: row.parentId,
        metadata: { consentId: row.id, noticeVersion: row.noticeVersion, documentHash: row.documentHash,
          checks: Object.fromEntries(['signature', 'guardianDeclaration', 'emailMatches', 'referenceMatches', 'noticeMatches'].map(k => [k, req.body.checks?.[k] === true])) } } });
    });
    res.json({ success: true });
  }));
}
module.exports = { registerFamilyRoutes, childPreferences, sealDocument, openDocument, consentSummary, FAMILY_NOTICE, NOTICE_VERSION };
