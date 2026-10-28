// Backend API for RiseQuest (Stripe + Quests)

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { profileUpload } = require('./src/profileUpload');
const crypto = require('crypto');
const { getPrisma } = require('./src/prisma');
const { registerProfileRoutes } = require('./src/profilePolicy');
const { SAFETY_PROMPT, safePersonality, loadCoachingContext, curatedReply } = require('./src/services/coachingContext');
const { authentication, ownRequest, ownQuest, pointPurchase, subscriptionMetadata, walletTransaction, validPurchasedPoints } = require('./src/security');
const { generateSubtasks } = require('./src/services/aiSubtasks');
const { canRegister } = require('./src/agePolicy');
const { checkAiSafety } = require('./src/services/aiSafety');
const { getCurrentWeather } = require('./src/services/weather');
const { reverseGeocode, placesAutocomplete, geocodeAddress, placesTextSearch, placeDetails, nearbyPlaces } = require('./src/services/googleGeo');
const { sendPasswordResetEmail, getSmtpConfigFromEnv } = require('./src/services/email');

const { rewardFor, spendFor } = require('./src/walletPolicy');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  // Stripe endpoints will fail fast with a clearer error if STRIPE_SECRET_KEY is missing.
  console.warn('[RiseQuest Backend] STRIPE_SECRET_KEY is not set. Stripe endpoints will not work.');
}
const stripe = require('stripe')(stripeSecretKey || '');

const jwtSecret = process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('Set AUTH_JWT_SECRET to your own random secret of at least 32 characters');
}

const app = express();
require('./src/legalPages').registerLegalPages(app);

try {
  const smtpCfg = getSmtpConfigFromEnv();
  if (!smtpCfg.ok) {
    console.warn('[RiseQuest Backend] SMTP is not configured. Password reset emails will NOT be delivered until SMTP_* env vars are set.');
  }
} catch (_) {
  // ignore
}

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));

// Middleware
const corsOriginsEnv = process.env.CORS_ORIGINS;
const corsAllowAll = !corsOriginsEnv || corsOriginsEnv.trim() === '*' || corsOriginsEnv.trim() === '';
const corsAllowList = corsAllowAll
  ? []
  : corsOriginsEnv.split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // React Native often sends no Origin header.
    if (!origin) return callback(null, true);
    if (corsAllowAll) return callback(null, true);
    if (corsAllowList.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));

// Rate limiting
const { apiRateOptions, rateMessage } = require('./src/ratePolicy');
const limiter = rateLimit(apiRateOptions(jwtSecret));
app.use('/api/', limiter);
const privateRateKey = req => crypto.createHmac('sha256', jwtSecret).update(String(req.ip || 'unknown')).digest('hex');
const sensitiveLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, keyGenerator: privateRateKey, standardHeaders: true, legacyHeaders: false, message: rateMessage });
app.use('/api/auth', sensitiveLimit);
const providerLimit = rateLimit({ windowMs: 60 * 1000, max: 20, keyGenerator: req => req.auth?.userId || privateRateKey(req), standardHeaders: true, legacyHeaders: false, message: rateMessage });

// Webhook endpoint (raw body needed for signature verification)
app.use('/webhook', express.raw({ type: 'application/json' }));

// JSON parser for other endpoints
app.use(express.json());

// Serve uploaded profile media
const uploadsDir = path.join(__dirname, 'uploads');
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (_) {
  // ignore
}
app.get('/uploads/tts/:filename', async (req, res) => {
  try {
    const access = jwt.verify(String(req.query.access || ''), jwtSecret, { algorithms: ['HS256'] });
    if (access.purpose !== 'tts' || access.file !== req.params.filename || !/^[a-f0-9]{64}\.mp3$/.test(access.file)) return res.sendStatus(403);
    const user = await prisma.user.findUnique({ where: { id: access.sub } });
    if (!user || user.disabledAt) return res.sendStatus(403);
    res.set('Cache-Control', 'private, no-store');
    return res.sendFile(path.join(uploadsDir, 'tts', access.file));
  } catch (_) { return res.sendStatus(403); }
});
app.use('/uploads/tts', (_req, res) => res.sendStatus(403));
app.use('/uploads', express.static(uploadsDir));

const ttsDir = path.join(uploadsDir, 'tts');
try {
  fs.mkdirSync(ttsDir, { recursive: true });
} catch (_) {
  // ignore
}

const uploadProfile = profileUpload(uploadsDir);

function publicBaseUrl(req) {
  const env = String(process.env.PUBLIC_BASE_URL || '').trim();
  if (env) return env.replace(/\/+$/, '');
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${host}`;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

async function synthesizeAzureTtsMp3({ text, voiceName }) {
  const key = String(process.env.AZURE_SPEECH_KEY || '').trim();
  const region = String(process.env.AZURE_SPEECH_REGION || process.env.AZURE_REGION || '').trim();
  if (!key || !region) {
    throw new Error('Azure TTS not configured');
  }

  const safeText = String(text || '').trim();
  if (!safeText) throw new Error('Missing text');

  const voice = String(voiceName || process.env.AZURE_SPEECH_VOICE || process.env.AZURE_VOICE || 'en-US-JennyNeural').trim();
  const ssml = `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voice.replace(/"/g, '')}">${safeText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</voice>
</speak>`;

  const resp = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
      'User-Agent': 'risequest-backend',
    },
    body: ssml,
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Azure TTS error (${resp.status}): ${txt}`);
  }

  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function generateGeminiText({ system, user, temperature }) {
  const apiKey = String(process.env.GOOGLE_AI_KEY || process.env.GOOGLE_AI_STUDIO_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Gemini not configured');

  const model = String(process.env.GOOGLE_AI_TEXT_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemText = String(system || '').trim();
  const userText = String(user || '').trim();
  const joined = systemText ? `${systemText}\n\nUser: ${userText}` : userText;

  const resp = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: joined }] }],
      generationConfig: {
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        maxOutputTokens: 256,
      },
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`AI provider unavailable (${resp.status})`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned non-JSON');
  }

  const out = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  if (!out) throw new Error('Gemini returned empty text');
  return out;
}

const prisma = getPrisma();

async function ensureAdminBootstrap() {
  const rawEmail = process.env.RISEQUEST_ADMIN_EMAIL;
  const rawPassword = process.env.RISEQUEST_ADMIN_PASSWORD;
  const forceReset = String(process.env.RISEQUEST_ADMIN_FORCE_RESET || '').trim().toLowerCase() === 'true';

  const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
  const password = rawPassword ? String(rawPassword) : '';

  if (!email || !password) {
    return;
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.create({
        data: {
          id: email,
          name: 'Admin',
          passwordHash,
          authProvider: 'password',
          role: 'SUPERADMIN',
        },
      });
      console.log('[RiseQuest Backend] Bootstrapped admin user:', email);
      return;
    }

    if (!existing.passwordHash || forceReset) {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: email },
        data: {
          passwordHash,
          authProvider: 'password',
          role: 'SUPERADMIN',
        },
      });
      console.log('[RiseQuest Backend] Admin password initialized/reset for:', email);
      return;
    }

    if (String(existing.role || '') !== 'SUPERADMIN') {
      await prisma.user.update({
        where: { id: email },
        data: {
          role: 'SUPERADMIN',
        },
      });
      console.log('[RiseQuest Backend] Admin role enforced for:', email);
    }
  } catch (e) {
    console.warn('[RiseQuest Backend] Admin bootstrap failed:', e?.message || e);
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header) return null;
  const value = String(header);
  if (!value.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim();
}

const requireAuth = authentication(prisma, jwtSecret);
registerProfileRoutes(app, { prisma, requireAuth });
require('./src/appleAuth').registerAppleAuth(app, { prisma, requireAuth, issueAuthToken, secret: jwtSecret });
require('./src/goldenAuth').registerGoldenAuth(app, { prisma, requireAuth, issueAuthToken, secret: jwtSecret });
require('./src/storeBilling').registerStoreBilling(app, { prisma, requireAuth, secret: jwtSecret });
require('./src/accountDeletion').registerAccountDeletion(app, { prisma, requireAuth, stripe, secret: jwtSecret, uploadsDir });
require('./src/retention').startRetention(prisma, uploadsDir);
require('./src/storeReconciliation').startStoreReconciliation(prisma, jwtSecret);
require('./src/adPolicy').registerAdPolicy(app, { prisma, requireAuth });
function checkoutKey(req, res, next) {
  const key = String(req.get('Idempotency-Key') || '');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key)) return res.status(400).json({ error: 'A checkout idempotency key is required' });
  req.stripeOptions = { idempotencyKey: sha256Hex(req.auth.userId + '|' + req.path + '|' + key) };
  next();
}

app.use(['/api/ai', '/api/tts', '/api/coach/chat', '/api/support', '/api/me/avatar', '/api/me/banner', '/api/stripe', '/api/create-payment-intent', '/api/create-subscription'], requireAuth, providerLimit);

function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (!['STAFF', 'ADMIN', 'SUPERADMIN'].includes(String(req.auth.role || '').toUpperCase())) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

const ROLE_RANK = {
  USER: 0,
  STAFF: 1,
  ADMIN: 2,
  SUPERADMIN: 3,
};

function roleAtLeast(role, minRole) {
  const a = ROLE_RANK[String(role || 'USER').toUpperCase()] ?? 0;
  const b = ROLE_RANK[String(minRole || 'USER').toUpperCase()] ?? 0;
  return a >= b;
}

function requireRole(minRole) {
  return (req, res, next) => {
    const role = String(req.auth?.role || 'USER').toUpperCase();
    if (!roleAtLeast(role, minRole)) {
      return res.status(403).json({ error: 'Insufficient privileges' });
    }
    return next();
  };
}

require('./src/family').registerFamilyRoutes(app, { prisma, requireAuth, requireAdmin, requireRole, secret: jwtSecret });
require('./src/cosmetics').registerCosmetics(app, { prisma, requireAuth, requireAdmin, requireRole });
require('./src/cosmeticSounds').registerCosmeticSounds(app, requireAuth);
require('./src/themeStudio').registerThemeStudio(app, { prisma, requireAdmin, requireRole, uploadsDir });
require('./src/adminConsole').registerAdminConsole(app, { prisma, requireAdmin, requireRole, sendPasswordResetEmail });
require('./src/profileCards').registerProfileCards(app, { prisma, requireAuth });
require('./src/welcome').registerWelcome(app, { prisma, requireAuth, entitlements: require('./src/storeBilling').entitlements });
require('./src/progression').registerProgression(app, {prisma,requireAuth});

async function writeAdminAudit({ actorId, action, targetUserId = null, metadata = {} }) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: String(actorId).toLowerCase(),
        action: String(action || 'unknown'),
        targetUserId: targetUserId ? String(targetUserId).toLowerCase() : null,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      },
    });
  } catch (e) {
    console.warn('[AdminAudit] Failed to write audit log:', e?.message || e);
  }
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (resp) => {
        let body = '';
        resp.on('data', (chunk) => (body += chunk));
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) {
              resolve(parsed);
            } else {
              const message = parsed?.error_description || parsed?.error || `HTTP ${resp.statusCode}`;
              reject(new Error(message));
            }
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', (err) => reject(err));
  });
}

function allowedGoogleAudiences() {
  const hardcoded = [
    // Web client id in android/app/google-services.json (client_type 3)
    '628709146989-df1prq7ube4v3383tg8gfe4ha3asrtb6.apps.googleusercontent.com',
  ];
  const envIds = [process.env.GOOGLE_WEB_CLIENT_ID, process.env.GOOGLE_CLIENT_ID].filter(Boolean);
  return new Set([...hardcoded, ...envIds]);
}

async function verifyGoogleIdToken(idToken) {
  const token = String(idToken || '').trim();
  if (!token) throw new Error('Missing idToken');
  const info = await httpsGetJson(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);

  const aud = String(info?.aud || '');
  const allowed = allowedGoogleAudiences();
  if (!aud || !allowed.has(aud)) {
    throw new Error('Google token audience mismatch');
  }

  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info?.iss) ||
      Number(info?.exp) <= Date.now() / 1000 || !info?.sub ||
      ![true, 'true'].includes(info?.email_verified)) throw new Error('Invalid Google identity');
  const email = String(info?.email || '').trim().toLowerCase();
  if (!email) throw new Error('Google token missing email');
  return {
    email,
    name: info?.name ? String(info.name) : null,
    picture: info?.picture ? String(info.picture) : null,
  };
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function issueAuthToken(userId, provider) {
  return jwt.sign(
    { sub: userId, provider: provider || 'password' },
    jwtSecret,
    { expiresIn: '30d' }
  );
}

async function ensureUser(userId, { name, photoUrl } = {}) {
  if (!userId) throw new Error('Missing userId');
  return prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, name: name || null, photoUrl: photoUrl || null },
    update: { name: name || undefined, photoUrl: photoUrl || undefined },
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/version', (req, res) => {
  res.json({
    name: 'risequest-backend',
    env: process.env.NODE_ENV || 'development',
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    dbConfigured: Boolean(process.env.DATABASE_URL),
    smtpConfigured: Boolean(getSmtpConfigFromEnv()?.ok),
    timestamp: new Date().toISOString(),
  });
});

// Mobile runtime config (keeps secrets off the device)
app.get('/api/mobile-config', (req, res) => {
  res.json({
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    backendBaseUrlHint: process.env.PUBLIC_BASE_URL || null,
    features: {
      weather: true,
      geocoding: Boolean(process.env.GOOGLE_MAPS_API_KEY),
      questAi: Boolean(process.env.OPENAI_API_KEY),
      payments: Boolean(process.env.STRIPE_SECRET_KEY),
    },
    timestamp: new Date().toISOString(),
  });
});

// Support tickets (user-facing)
app.post('/api/support/tickets', requireAuth, async (req, res) => {
  try {
    const actor = String(req.auth?.userId || '').trim().toLowerCase();
    if (!actor) return res.status(401).json({ error: 'Unauthorized' });

    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    const metadata = req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};

    if (!subject || subject.length < 3) return res.status(400).json({ error: 'Subject is required' });
    if (!message || message.length < 3) return res.status(400).json({ error: 'Message is required' });

    const user = await prisma.user.findUnique({ where: { id: actor } });
    if (user?.disabledAt) return res.status(403).json({ error: 'Account disabled' });

    const created = await prisma.supportTicket.create({
      data: {
        userId: actor,
        userEmail: actor,
        subject,
        message,
        metadata,
      },
    });

    return res.status(201).json({
      success: true,
      ticket: {
        id: created.id,
        status: created.status,
        subject: created.subject,
        createdAt: created.createdAt,
      },
    });
  } catch (e) {
    console.error('Support ticket create error:', e);
    return res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

// Admin API (RBAC)
app.get('/api/admin/overview', requireAdmin, requireRole('STAFF'), async (req, res) => {
  try {
    const [usersTotal, usersDisabled, adminsTotal, ticketsOpen, ticketsAll, subsTotal] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { disabledAt: { not: null } } }),
      prisma.user.count({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPERADMIN'] } } }),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.supportTicket.count(),
      prisma.subscription.count(),
    ]);

    return res.json({
      success: true,
      overview: {
        usersTotal,
        usersDisabled,
        adminsTotal,
        supportTicketsOpen: ticketsOpen,
        supportTicketsTotal: ticketsAll,
        subscriptionsTotal: subsTotal,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Admin overview error:', e);
    return res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

app.get('/api/admin/users', requireAdmin, requireRole('ADMIN'), async (req, res) => {
  try {
    const q = String(req.query.query || '').trim().toLowerCase();
    const limitRaw = Number(req.query.limit || 30);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 30));
    const cursor = req.query.cursor ? String(req.query.cursor) : null; // cursor is user id

    const where = q
      ? {
          OR: [
            { id: { contains: q } },
            { name: { contains: q, mode: 'insensitive' } },
            { phoneNumber: { contains: q } },
          ],
        }
      : {};

    const rows = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        authProvider: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const nextCursor = rows.length ? rows[rows.length - 1].id : null;
    return res.json({ success: true, users: rows, nextCursor });
  } catch (e) {
    console.error('Admin users list error:', e);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

app.get('/api/admin/users/:id', requireAdmin, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        authProvider: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ success: true, user });
  } catch (e) {
    console.error('Admin user detail error:', e);
    return res.status(500).json({ error: 'Failed to load user' });
  }
});

app.get('/api/admin/support/tickets', requireAdmin, requireRole('STAFF'), async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).trim().toUpperCase() : null;
    const take = Math.max(1, Math.min(100, Number(req.query.limit || 50) || 50));
    const where = status && ['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status) ? { status } : {};

    const rows = await prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        userId: true,
        userEmail: true,
        subject: true,
        message: true,
        status: true,
        assignedTo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return res.json({ success: true, tickets: rows });
  } catch (e) {
    console.error('Admin tickets list error:', e);
    return res.status(500).json({ error: 'Failed to list tickets' });
  }
});

app.patch('/api/admin/support/tickets/:id', requireAdmin, requireRole('STAFF'), async (req, res) => {
  try {
    const actorId = String(req.auth?.userId || '').toLowerCase();
    const id = String(req.params.id || '').trim();
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const status = body.status != null ? String(body.status).trim().toUpperCase() : null;
    const assignedTo = body.assignedTo != null ? String(body.assignedTo).trim().toLowerCase() : null;

    const data = {};
    if (status) {
      if (!['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
      data.status = status;
    }
    if (body.assignedTo != null) {
      data.assignedTo = assignedTo || null;
    }

    if (!Object.keys(data).length) return res.status(400).json({ error: 'No changes provided' });

    const updated = await prisma.supportTicket.update({
      where: { id },
      data,
      select: {
        id: true,
        userId: true,
        userEmail: true,
        subject: true,
        message: true,
        status: true,
        assignedTo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await writeAdminAudit({ actorId, action: 'TICKET_UPDATE', targetUserId: updated.userId || null, metadata: { ticketId: id, changes: data } });
    return res.json({ success: true, ticket: updated });
  } catch (e) {
    console.error('Admin ticket update error:', e);
    return res.status(500).json({ error: 'Failed to update ticket' });
  }
});

app.get('/api/admin/payments/subscriptions', requireAdmin, requireRole('ADMIN'), async (req, res) => {
  try {
    const userId = req.query.userId ? String(req.query.userId).trim().toLowerCase() : '';
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const subs = await prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ success: true, subscriptions: subs });
  } catch (e) {
    console.error('Admin subscriptions error:', e);
    return res.status(500).json({ error: 'Failed to load subscriptions' });
  }
});

app.get('/api/admin/audit', requireAdmin, requireRole('ADMIN'), async (req, res) => {
  try {
    const take = Math.max(1, Math.min(200, Number(req.query.limit || 100) || 100));
    const rows = await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        actorId: true,
        action: true,
        targetUserId: true,
        metadata: true,
        createdAt: true,
      },
    });
    return res.json({ success: true, audit: rows });
  } catch (e) {
    console.error('Admin audit error:', e);
    return res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

// Auth (email/password)
app.post('/api/auth/signup', async (req, res) => {
  try {
    const ageBand = req.body.ageBand;
    if (!canRegister(ageBand, req.body.countryCode)) return res.status(400).json({ error: 'Select your age and country. Where parent management applies, ask a parent to use Family profiles.', code: 'AGE_SCREEN_REQUIRED' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const phoneNumberRaw = req.body.phoneNumber != null ? String(req.body.phoneNumber) : '';
    const phoneNumber = phoneNumberRaw.trim().replace(/[\s\-()]/g, '') || null;
    const password = String(req.body.password || '');
    const displayName = String(req.body.displayName || '').trim();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { id: email } });
    if (existing && existing.disabledAt) {
      return res.status(403).json({ error: 'Account disabled' });
    }
    if (existing && existing.passwordHash) {
      return res.status(409).json({ error: 'Account already exists' });
    }
    if (existing && !existing.passwordHash) {
      return res.status(409).json({ error: 'Account exists. Please sign in with Google.' });
    }

    if (phoneNumber) {
      const existingPhone = await prisma.user.findUnique({ where: { phoneNumber } });
      if (existingPhone) {
        return res.status(409).json({ error: 'Phone number is already in use' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await prisma.user.create({
      data: {
        id: email,
        name: displayName || null,
        phoneNumber,
        passwordHash,
        authProvider: 'password',
        profile: { create: { data: { ageBand, countryCode: req.body.countryCode, ageGroup: ageBand === 'adult' ? 'adult' : 'teen', preferences: { analyticsOptIn: false } } } },
      },
    });

    const token = issueAuthToken(created.id, 'password');
    res.status(201).json({
      token,
      user: {
        id: created.id,
        email: created.id,
        displayName: created.name || 'RiseQuest User',
        phoneNumber: created.phoneNumber || null,
        role: created.role || 'USER',
        disabledAt: created.disabledAt || null,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Forgot password (email-only). Always returns success to avoid account enumeration.
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.json({ success: true });
    }

    const user = await prisma.user.findUnique({ where: { id: email } });
    if (!user) {
      return res.json({ success: true });
    }

    // Create one-time token (30 min)
    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Best-effort cleanup of expired tokens to keep table small
    try {
      await prisma.passwordResetToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
    } catch (_) {
      // ignore
    }

    await prisma.passwordResetToken.create({
      data: {
        userId: email,
        tokenHash,
        expiresAt,
      },
    });

    const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

    // Deliver token via email for real users.
    try {
      await sendPasswordResetEmail({
        to: email,
        token,
        expiresAt,
      });
    } catch (e) {
      // Never reveal whether an account exists; still return success.
      console.warn('[PasswordReset] Email delivery failed.');
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.json({ success: true });
  }
});

// Reset password using token
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const user = await require('./src/passwordRecovery').completePasswordReset(prisma, req.body);
    const email = user.id;

    const tokenJwt = issueAuthToken(email, 'password');
    return res.json({
      success: true,
      token: tokenJwt,
      user: {
        id: email,
        email,
        displayName: user.name || 'RiseQuest User',
        phoneNumber: user.phoneNumber || null,
      },
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('Reset password error:', error.code || error.name);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const identifierRaw = req.body.identifier != null ? String(req.body.identifier) : String(req.body.email || '');
    const identifier = identifierRaw.trim();
    const password = String(req.body.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email/phone and password are required' });
    }

    const isEmail = identifier.includes('@');
    const phoneCandidate = identifier.replace(/[\s\-()]/g, '');
    const emailCandidate = identifier.toLowerCase();

    const user = isEmail
      ? await prisma.user.findUnique({ where: { id: emailCandidate } })
      : await prisma.user.findUnique({ where: { phoneNumber: phoneCandidate } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.disabledAt) {
      return res.status(403).json({ error: 'Account disabled' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = issueAuthToken(user.id, user.authProvider || 'password');
    res.json({
      token,
      user: {
        id: user.id,
        email: user.id,
        displayName: user.name || 'RiseQuest User',
        phoneNumber: user.phoneNumber || null,
        role: user.role || 'USER',
        disabledAt: user.disabledAt || null,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Auth (Google Sign-In)
app.post('/api/auth/google', async (req, res) => {
  try {
    const idToken = String(req.body.idToken || '').trim();
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const { email, name, picture } = await verifyGoogleIdToken(idToken);
    const existingAccount = await prisma.user.findUnique({ where: { id: email } });
    if (existingAccount?.disabledAt) return res.status(403).json({ error: 'Account disabled' });
    const ageBand = req.body.ageBand;
    if (!existingAccount && !canRegister(ageBand, req.body.countryCode)) return res.status(400).json({ error: 'Select your age and country before registration. A parent may need to create your profile.', code: 'AGE_SCREEN_REQUIRED' });

    const user = await prisma.user.upsert({
      where: { id: email },
      create: {
        id: email,
        name: name || null,
        photoUrl: picture || null,
        authProvider: 'google',
        profile: { create: { data: { ageBand, countryCode: req.body.countryCode, ageGroup: ageBand === 'adult' ? 'adult' : 'teen', preferences: { analyticsOptIn: false } } } },
      },
      update: {
        name: name || undefined,
        photoUrl: picture || undefined,
        authProvider: 'google',
      },
    });

    const token = issueAuthToken(user.id, 'google');
    res.json({
      token,
      user: {
        id: user.id,
        email: user.id,
        displayName: user.name || 'RiseQuest User',
        phoneNumber: user.phoneNumber || null,
        photoUrl: user.photoUrl || null,
        bannerUrl: user.bannerUrl || null,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: error.message || 'Google authentication failed' });
  }
});

// Current user profile
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: {
        id: user.id,
        email: user.id,
        displayName: user.name || 'RiseQuest User',
        phoneNumber: user.phoneNumber || null,
        photoUrl: user.photoUrl || null,
        bannerUrl: user.bannerUrl || null,
        authProvider: user.authProvider || null,
        role: user.role,
        hasPassword: Boolean(user.passwordHash),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Update current user profile (basic fields only)
app.put('/api/me', requireAuth, async (req, res) => {
  try {
    const displayNameRaw = req.body.displayName != null ? String(req.body.displayName) : null;
    const phoneRaw = req.body.phoneNumber != null ? String(req.body.phoneNumber) : null;
    const photoRaw = req.body.photoUrl != null ? String(req.body.photoUrl) : null;

    const displayName = displayNameRaw != null ? displayNameRaw.trim() : null;
    const phoneNumber = phoneRaw != null ? phoneRaw.trim().replace(/[\s\-()]/g, '') : null;
    const photoUrl = photoRaw != null ? photoRaw.trim() : null;

    const updated = await prisma.user.update({
      where: { id: req.auth.userId },
      data: {
        name: displayName != null && displayName !== '' ? displayName : undefined,
        phoneNumber: phoneRaw != null ? (phoneNumber || null) : undefined,
        photoUrl: photoRaw != null ? (photoUrl || null) : undefined,
      },
    });

    res.json({
      user: {
        id: updated.id,
        email: updated.id,
        displayName: updated.name || 'RiseQuest User',
        phoneNumber: updated.phoneNumber || null,
        photoUrl: updated.photoUrl || null,
        bannerUrl: updated.bannerUrl || null,
        authProvider: updated.authProvider || null,
        hasPassword: Boolean(updated.passwordHash),
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error('Me update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload avatar image (stored on server, URL saved to DB)
app.post('/api/me/avatar', requireAuth, uploadProfile, async (req, res) => {
  try {
    if (!req.file?.filename) return res.status(400).json({ error: 'Missing file' });
    const url = `${publicBaseUrl(req)}/uploads/${encodeURIComponent(req.file.filename)}`;
    const updated = await prisma.user.update({
      where: { id: req.auth.userId },
      data: { photoUrl: url },
    });
    res.json({ success: true, photoUrl: updated.photoUrl || url, url: updated.photoUrl || url });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Upload banner image (stored on server, URL saved to DB)
app.post('/api/me/banner', requireAuth, uploadProfile, async (req, res) => {
  try {
    if (!req.file?.filename) return res.status(400).json({ error: 'Missing file' });
    const url = `${publicBaseUrl(req)}/uploads/${encodeURIComponent(req.file.filename)}`;
    const updated = await prisma.user.update({
      where: { id: req.auth.userId },
      data: { bannerUrl: url },
    });
    res.json({ success: true, bannerUrl: updated.bannerUrl || url, url: updated.bannerUrl || url });
  } catch (error) {
    console.error('Banner upload error:', error);
    res.status(500).json({ error: 'Failed to upload banner' });
  }
});

// Set or change password for the authenticated user
app.post('/api/auth/set-password', requireAuth, async (req, res) => {
  try {
    const password = String(req.body.password || '');
    const currentPassword = req.body.currentPassword != null ? String(req.body.currentPassword) : null;

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.auth.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        authProvider: user.authProvider || 'google',
      },
    });

    res.json({
      success: true,
      user: {
        id: updated.id,
        email: updated.id,
        displayName: updated.name || 'RiseQuest User',
        phoneNumber: updated.phoneNumber || null,
        photoUrl: updated.photoUrl || null,
        authProvider: updated.authProvider || null,
        hasPassword: Boolean(updated.passwordHash),
      },
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

function normalizeCommunityUserId(value) {
  return String(value || '').trim().toLowerCase();
}

function coerceVisibility(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'PUBLIC') return 'PUBLIC';
  return 'BUDDIES';
}

function canonicalPair(a, b) {
  const left = normalizeCommunityUserId(a);
  const right = normalizeCommunityUserId(b);
  if (!left || !right) return null;
  return left < right ? [left, right] : [right, left];
}

async function getOrCreateCommunitySettings(userId) {
  const id = normalizeCommunityUserId(userId);
  if (!id) throw new Error('Missing userId');
  return prisma.communitySettings.upsert({
    where: { userId: id },
    create: { userId: id, optIn: false, visibility: 'BUDDIES', teenSafety: false },
    update: {},
  });
}

async function getBlockedUserIds(userId) {
  const id = normalizeCommunityUserId(userId);
  const blocks = await prisma.communityBlock.findMany({
    where: {
      OR: [{ blockerId: id }, { blockedId: id }],
    },
    select: { blockerId: true, blockedId: true },
  });

  const blocked = new Set();
  for (const b of blocks) {
    if (b.blockerId === id) blocked.add(b.blockedId);
    if (b.blockedId === id) blocked.add(b.blockerId);
  }
  return blocked;
}

async function isBlockedBetween(a, b) {
  const left = normalizeCommunityUserId(a);
  const right = normalizeCommunityUserId(b);
  if (!left || !right) return false;
  const match = await prisma.communityBlock.findFirst({
    where: {
      OR: [
        { blockerId: left, blockedId: right },
        { blockerId: right, blockedId: left },
      ],
    },
    select: { blockerId: true },
  });
  return Boolean(match);
}

async function assertCommunityEnabled(req, res) {
  const userId = req.auth?.userId;
  const settings = await getOrCreateCommunitySettings(userId);
  if (!settings.optIn) {
    res.status(403).json({ error: 'Community features are disabled for this account' });
    return null;
  }
  return settings;
}

// === Community API ===

app.get('/api/community/settings', requireAuth, async (req, res) => {
  try {
    const settings = await getOrCreateCommunitySettings(req.auth.userId);
    res.json({
      settings: {
        optIn: Boolean(settings.optIn),
        visibility: String(settings.visibility || 'BUDDIES'),
        teenSafety: Boolean(settings.teenSafety),
      },
    });
  } catch (error) {
    console.error('Community settings get error:', error);
    res.status(500).json({ error: 'Failed to load community settings' });
  }
});

app.put('/api/community/settings', requireAuth, async (req, res) => {
  try {
    const userId = normalizeCommunityUserId(req.auth.userId);
    const optIn = req.body.optIn != null ? Boolean(req.body.optIn) : undefined;
    const teenSafety = req.body.teenSafety != null ? Boolean(req.body.teenSafety) : undefined;
    const requestedVisibility = req.body.visibility != null ? coerceVisibility(req.body.visibility) : undefined;

    const nextTeenSafety = teenSafety === true;
    const nextVisibility = nextTeenSafety
      ? 'BUDDIES'
      : (requestedVisibility || undefined);

    const updated = await prisma.communitySettings.upsert({
      where: { userId },
      create: {
        userId,
        optIn: optIn ?? false,
        teenSafety: teenSafety ?? false,
        visibility: nextVisibility || 'BUDDIES',
      },
      update: {
        optIn,
        teenSafety,
        visibility: nextVisibility,
      },
    });

    res.json({
      settings: {
        optIn: Boolean(updated.optIn),
        visibility: String(updated.visibility || 'BUDDIES'),
        teenSafety: Boolean(updated.teenSafety),
      },
    });
  } catch (error) {
    console.error('Community settings update error:', error);
    res.status(500).json({ error: 'Failed to update community settings' });
  }
});

app.get('/api/community/users/search', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ users: [] });

    const userId = normalizeCommunityUserId(req.auth.userId);
    const blocked = await getBlockedUserIds(userId);

    const qNorm = q.toLowerCase();
    const isEmail = qNorm.includes('@');
    const where = isEmail
      ? { id: qNorm }
      : { name: { contains: q, mode: 'insensitive' } };

    const users = await prisma.user.findMany({
      where: {
        ...where,
        id: { not: userId, notIn: Array.from(blocked) },
      },
      select: { id: true, name: true, photoUrl: true },
      take: 10,
    });

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.id,
        displayName: u.name || 'RiseQuest User',
        photoUrl: u.photoUrl || null,
      })),
    });
  } catch (error) {
    console.error('Community user search error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

app.get('/api/community/buddies', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const blocked = await getBlockedUserIds(userId);

    const buddies = await prisma.communityBuddy.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: { select: { id: true, name: true, photoUrl: true } },
        userB: { select: { id: true, name: true, photoUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const results = buddies
      .map(b => {
        const other = b.userAId === userId ? b.userB : b.userA;
        return {
          buddyId: other.id,
          email: other.id,
          displayName: other.name || 'RiseQuest User',
          photoUrl: other.photoUrl || null,
        };
      })
      .filter(b => !blocked.has(b.buddyId));

    res.json({ buddies: results });
  } catch (error) {
    console.error('Community buddies list error:', error);
    res.status(500).json({ error: 'Failed to load buddies' });
  }
});

app.get('/api/community/buddies/requests', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const pending = await prisma.communityBuddy.findMany({
      where: {
        status: 'PENDING',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        requestedBy: { select: { id: true, name: true, photoUrl: true } },
        userA: { select: { id: true } },
        userB: { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const incoming = [];
    const outgoing = [];
    for (const r of pending) {
      const isIncoming = r.requestedById !== userId;
      const otherId = r.userAId === userId ? r.userBId : r.userAId;
      const entry = {
        id: r.id,
        otherUserId: otherId,
        requestedById: r.requestedById,
        requestedBy: {
          id: r.requestedBy.id,
          email: r.requestedBy.id,
          displayName: r.requestedBy.name || 'RiseQuest User',
          photoUrl: r.requestedBy.photoUrl || null,
        },
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
      if (isIncoming) incoming.push(entry);
      else outgoing.push(entry);
    }

    res.json({ incoming, outgoing });
  } catch (error) {
    console.error('Community buddy requests error:', error);
    res.status(500).json({ error: 'Failed to load buddy requests' });
  }
});

app.post('/api/community/buddies/request', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const me = normalizeCommunityUserId(req.auth.userId);
    const target = normalizeCommunityUserId(req.body.userId || req.body.email);
    if (!target) return res.status(400).json({ error: 'userId is required' });
    if (target === me) return res.status(400).json({ error: 'Cannot add yourself' });

    const exists = await prisma.user.findUnique({ where: { id: target }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: 'User not found' });
    if (await isBlockedBetween(me, target)) return res.status(403).json({ error: 'This user is not available' });

    const pair = canonicalPair(me, target);
    const [userAId, userBId] = pair;

    const record = await prisma.communityBuddy.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId, requestedById: me, status: 'PENDING' },
      update: {
        status: 'PENDING',
        requestedById: me,
      },
    });

    res.status(201).json({ request: { id: record.id, status: record.status } });
  } catch (error) {
    console.error('Community buddy request create error:', error);
    res.status(500).json({ error: 'Failed to send buddy request' });
  }
});

app.post('/api/community/buddies/respond', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const requestId = String(req.body.requestId || '').trim();
    const action = String(req.body.action || '').trim().toLowerCase();
    if (!requestId) return res.status(400).json({ error: 'requestId is required' });
    if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

    const request = await prisma.communityBuddy.findUnique({ where: { id: requestId } });
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: 'Request is not pending' });
    if (request.userAId !== userId && request.userBId !== userId) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (request.requestedById === userId) {
      return res.status(400).json({ error: 'You cannot accept your own request' });
    }

    const updated = await prisma.communityBuddy.update({
      where: { id: requestId },
      data: { status: action === 'accept' ? 'ACCEPTED' : 'DECLINED' },
    });

    res.json({ buddy: { id: updated.id, status: updated.status } });
  } catch (error) {
    console.error('Community buddy respond error:', error);
    res.status(500).json({ error: 'Failed to respond to request' });
  }
});

app.get('/api/community/groups', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const topic = String(req.query.topic || '').trim();
    const q = String(req.query.q || '').trim();

    const memberships = await prisma.communityGroupMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { groupId: true },
    });
    const memberGroupIds = memberships.map(m => m.groupId);

    const groups = await prisma.communityGroup.findMany({
      where: {
        AND: [
          topic ? { topic: { equals: topic } } : {},
          q ? { name: { contains: q, mode: 'insensitive' } } : {},
          {
            OR: [
              { isPublic: true },
              { id: { in: memberGroupIds.length ? memberGroupIds : ['__none__'] } },
            ],
          },
        ],
      },
      include: { _count: { select: { members: true } } },
      orderBy: [{ topic: 'asc' }, { name: 'asc' }],
      take: 50,
    });

    res.json({
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        topic: g.topic,
        isPublic: g.isPublic,
        memberCount: g._count.members,
        isMember: memberGroupIds.includes(g.id),
      })),
    });
  } catch (error) {
    console.error('Community groups list error:', error);
    res.status(500).json({ error: 'Failed to load groups' });
  }
});

app.post('/api/community/groups', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const name = String(req.body.name || '').trim();
    const topic = String(req.body.topic || '').trim();
    const isPublic = req.body.isPublic != null ? Boolean(req.body.isPublic) : true;
    if (!name || name.length < 3) return res.status(400).json({ error: 'Group name is too short' });
    if (!topic || topic.length < 2) return res.status(400).json({ error: 'Group topic is required' });

    const created = await prisma.communityGroup.create({
      data: {
        name,
        topic,
        isPublic,
        createdById: userId,
        members: {
          create: [{ userId, role: 'OWNER', status: 'ACTIVE' }],
        },
      },
      select: { id: true, name: true, topic: true, isPublic: true },
    });

    res.status(201).json({ group: created });
  } catch (error) {
    console.error('Community group create error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.post('/api/community/groups/:id/join', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const groupId = String(req.params.id || '').trim();
    if (!groupId) return res.status(400).json({ error: 'Missing groupId' });

    const group = await prisma.communityGroup.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!group.isPublic) {
      return res.status(403).json({ error: 'This group is invite-only' });
    }

    await prisma.communityGroupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, role: 'MEMBER', status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Community group join error:', error);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

app.post('/api/community/groups/:id/leave', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const groupId = String(req.params.id || '').trim();
    if (!groupId) return res.status(400).json({ error: 'Missing groupId' });

    await prisma.communityGroupMember.updateMany({
      where: { groupId, userId },
      data: { status: 'LEFT' },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Community group leave error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

app.get('/api/community/feed', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const scope = String(req.query.scope || 'all').trim().toLowerCase();
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const take = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

    const blocked = await getBlockedUserIds(userId);

    const buddyRows = await prisma.communityBuddy.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { userAId: true, userBId: true },
    });
    const buddyIds = buddyRows
      .map(r => (r.userAId === userId ? r.userBId : r.userAId))
      .filter(id => id && !blocked.has(id));

    const baseWhere = {
      groupId: null,
      authorId: { notIn: Array.from(blocked) },
    };

    let where = baseWhere;
    if (scope === 'public') {
      where = { ...baseWhere, visibility: 'PUBLIC' };
    } else if (scope === 'buddies') {
      where = {
        ...baseWhere,
        authorId: { in: [userId, ...buddyIds] },
        visibility: { in: ['BUDDIES', 'PUBLIC'] },
      };
    } else {
      where = {
        ...baseWhere,
        OR: [
          { visibility: 'PUBLIC' },
          { authorId: { in: [userId, ...buddyIds] }, visibility: { in: ['BUDDIES', 'PUBLIC'] } },
        ],
      };
    }

    const posts = await prisma.communityPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: { id: true, name: true, photoUrl: true } },
        _count: { select: { reactions: true, comments: true } },
        reactions: { where: { userId }, select: { emoji: true } },
      },
    });

    const hasMore = posts.length > take;
    const page = hasMore ? posts.slice(0, take) : posts;
    const nextCursor = hasMore ? page[page.length - 1]?.id : null;

    res.json({
      posts: page.map(p => ({
        id: p.id,
        type: p.type,
        content: p.content,
        visibility: p.visibility,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        author: {
          id: p.author.id,
          email: p.author.id,
          displayName: p.author.name || 'RiseQuest User',
          photoUrl: p.author.photoUrl || null,
        },
        counts: {
          reactions: p._count.reactions,
          comments: p._count.comments,
        },
        myReactions: p.reactions.map(r => r.emoji),
      })),
      nextCursor,
    });
  } catch (error) {
    console.error('Community feed error:', error);
    res.status(500).json({ error: 'Failed to load feed' });
  }
});

app.get('/api/community/groups/:id/feed', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const groupId = String(req.params.id || '').trim();
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const take = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    if (!groupId) return res.status(400).json({ error: 'Missing groupId' });

    const group = await prisma.communityGroup.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!group.isPublic) {
      const member = await prisma.communityGroupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
      if (!member || member.status !== 'ACTIVE') {
        return res.status(403).json({ error: 'Not a member of this group' });
      }
    }

    const blocked = await getBlockedUserIds(userId);

    const posts = await prisma.communityPost.findMany({
      where: { groupId, visibility: 'GROUP', authorId: { notIn: Array.from(blocked) } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: { id: true, name: true, photoUrl: true } },
        _count: { select: { reactions: true, comments: true } },
        reactions: { where: { userId }, select: { emoji: true } },
      },
    });

    const hasMore = posts.length > take;
    const page = hasMore ? posts.slice(0, take) : posts;
    const nextCursor = hasMore ? page[page.length - 1]?.id : null;

    res.json({
      group: { id: group.id, name: group.name, topic: group.topic, isPublic: group.isPublic },
      posts: page.map(p => ({
        id: p.id,
        type: p.type,
        content: p.content,
        visibility: p.visibility,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        author: {
          id: p.author.id,
          email: p.author.id,
          displayName: p.author.name || 'RiseQuest User',
          photoUrl: p.author.photoUrl || null,
        },
        counts: { reactions: p._count.reactions, comments: p._count.comments },
        myReactions: p.reactions.map(r => r.emoji),
      })),
      nextCursor,
    });
  } catch (error) {
    console.error('Community group feed error:', error);
    res.status(500).json({ error: 'Failed to load group feed' });
  }
});

app.post('/api/community/posts', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const content = String(req.body.content || '').trim();
    const type = String(req.body.type || 'POST').trim().toUpperCase();
    const groupId = req.body.groupId ? String(req.body.groupId).trim() : null;
    const requestedVisibility = req.body.visibility != null ? String(req.body.visibility).trim().toUpperCase() : null;

    if (!content || content.length < 1) return res.status(400).json({ error: 'Post content is required' });
    if (content.length > 800) return res.status(400).json({ error: 'Post is too long' });

    let visibility = 'BUDDIES';
    if (groupId) {
      visibility = 'GROUP';
      const group = await prisma.communityGroup.findUnique({ where: { id: groupId } });
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const member = await prisma.communityGroupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
      if (!member || member.status !== 'ACTIVE') return res.status(403).json({ error: 'Join the group to post' });
    } else {
      const globalVisibility = coerceVisibility(settings.visibility);
      const postVisibility = requestedVisibility === 'PUBLIC' ? 'PUBLIC' : 'BUDDIES';
      visibility = settings.teenSafety ? 'BUDDIES' : (postVisibility === 'PUBLIC' && globalVisibility === 'PUBLIC' ? 'PUBLIC' : 'BUDDIES');
    }

    const created = await prisma.communityPost.create({
      data: {
        authorId: userId,
        groupId,
        visibility,
        type,
        content,
      },
      include: {
        author: { select: { id: true, name: true, photoUrl: true } },
        _count: { select: { reactions: true, comments: true } },
      },
    });

    res.status(201).json({
      post: {
        id: created.id,
        type: created.type,
        content: created.content,
        visibility: created.visibility,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        author: {
          id: created.author.id,
          email: created.author.id,
          displayName: created.author.name || 'RiseQuest User',
          photoUrl: created.author.photoUrl || null,
        },
        counts: { reactions: created._count.reactions, comments: created._count.comments },
        myReactions: [],
      },
    });
  } catch (error) {
    console.error('Community create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.delete('/api/community/posts/:id', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const postId = String(req.params.id || '').trim();
    if (!postId) return res.status(400).json({ error: 'Missing postId' });

    const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== userId) return res.status(403).json({ error: 'Not allowed' });

    await prisma.communityPost.delete({ where: { id: postId } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Community delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

app.get('/api/community/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const postId = String(req.params.id || '').trim();
    if (!postId) return res.status(400).json({ error: 'Missing postId' });

    const blocked = await getBlockedUserIds(userId);
    const comments = await prisma.communityPostComment.findMany({
      where: { postId, authorId: { notIn: Array.from(blocked) } },
      include: { author: { select: { id: true, name: true, photoUrl: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    res.json({
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        author: {
          id: c.author.id,
          email: c.author.id,
          displayName: c.author.name || 'RiseQuest User',
          photoUrl: c.author.photoUrl || null,
        },
      })),
    });
  } catch (error) {
    console.error('Community comments list error:', error);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

app.post('/api/community/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const postId = String(req.params.id || '').trim();
    const content = String(req.body.content || '').trim();
    if (!postId) return res.status(400).json({ error: 'Missing postId' });
    if (!content) return res.status(400).json({ error: 'Comment cannot be empty' });
    if (content.length > 400) return res.status(400).json({ error: 'Comment is too long' });

    const created = await prisma.communityPostComment.create({
      data: { postId, authorId: userId, content },
      include: { author: { select: { id: true, name: true, photoUrl: true } } },
    });

    res.status(201).json({
      comment: {
        id: created.id,
        content: created.content,
        createdAt: created.createdAt,
        author: {
          id: created.author.id,
          email: created.author.id,
          displayName: created.author.name || 'RiseQuest User',
          photoUrl: created.author.photoUrl || null,
        },
      },
    });
  } catch (error) {
    console.error('Community comment create error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

app.post('/api/community/posts/:id/react', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const postId = String(req.params.id || '').trim();
    const emoji = String(req.body.emoji || '').trim();
    if (!postId) return res.status(400).json({ error: 'Missing postId' });
    if (!emoji || emoji.length > 16) return res.status(400).json({ error: 'Invalid emoji' });

    await prisma.communityPostReaction.upsert({
      where: { postId_userId_emoji: { postId, userId, emoji } },
      create: { postId, userId, emoji },
      update: {},
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Community react error:', error);
    res.status(500).json({ error: 'Failed to react' });
  }
});

app.post('/api/community/posts/:id/unreact', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const postId = String(req.params.id || '').trim();
    const emoji = String(req.body.emoji || '').trim();
    if (!postId) return res.status(400).json({ error: 'Missing postId' });
    if (!emoji || emoji.length > 16) return res.status(400).json({ error: 'Invalid emoji' });

    await prisma.communityPostReaction.deleteMany({ where: { postId, userId, emoji } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Community unreact error:', error);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

app.get('/api/community/blocks', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const blocks = await prisma.communityBlock.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: { id: true, name: true, photoUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      blocks: blocks.map(b => ({
        userId: b.blocked.id,
        email: b.blocked.id,
        displayName: b.blocked.name || 'RiseQuest User',
        photoUrl: b.blocked.photoUrl || null,
        createdAt: b.createdAt,
      })),
    });
  } catch (error) {
    console.error('Community blocks list error:', error);
    res.status(500).json({ error: 'Failed to load blocks' });
  }
});

app.post('/api/community/block', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const target = normalizeCommunityUserId(req.body.userId || req.body.email);
    if (!target) return res.status(400).json({ error: 'userId is required' });
    if (target === userId) return res.status(400).json({ error: 'Cannot block yourself' });

    await prisma.communityBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: target } },
      create: { blockerId: userId, blockedId: target },
      update: {},
    });

    // Also disable buddy relationship if present.
    const pair = canonicalPair(userId, target);
    if (pair) {
      await prisma.communityBuddy.updateMany({
        where: { userAId: pair[0], userBId: pair[1] },
        data: { status: 'DECLINED' },
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Community block error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

app.post('/api/community/unblock', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const target = normalizeCommunityUserId(req.body.userId || req.body.email);
    if (!target) return res.status(400).json({ error: 'userId is required' });

    await prisma.communityBlock.deleteMany({ where: { blockerId: userId, blockedId: target } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Community unblock error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

app.post('/api/community/report', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;

    const userId = normalizeCommunityUserId(req.auth.userId);
    const targetType = String(req.body.targetType || '').trim().toUpperCase();
    const targetId = String(req.body.targetId || '').trim();
    const reason = String(req.body.reason || '').trim();
    const details = req.body.details != null ? String(req.body.details).trim() : null;

    if (!targetType || !targetId || !reason) {
      return res.status(400).json({ error: 'targetType, targetId, and reason are required' });
    }

    const created = await prisma.communityReport.create({
      data: {
        reporterId: userId,
        targetType,
        targetId,
        reason,
        details: details || null,
        status: 'OPEN',
      },
      select: { id: true, status: true, createdAt: true },
    });

    res.status(201).json({ report: created });
  } catch (error) {
    console.error('Community report error:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

app.post('/api/community/threads/direct', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const otherId = normalizeCommunityUserId(req.body.userId || req.body.email);
    if (!otherId) return res.status(400).json({ error: 'userId is required' });
    if (otherId === userId) return res.status(400).json({ error: 'Invalid userId' });
    if (await isBlockedBetween(userId, otherId)) return res.status(403).json({ error: 'This user is not available' });

    const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) return res.status(404).json({ error: 'User not found' });

    const pair = canonicalPair(userId, otherId);
    const directKey = `${pair[0]}|${pair[1]}`;

    const thread = await prisma.communityMessageThread.upsert({
      where: { directKey },
      create: {
        directKey,
        kind: 'DIRECT',
        members: {
          create: [{ userId }, { userId: otherId }],
        },
      },
      update: {},
      include: {
        members: { include: { user: { select: { id: true, name: true, photoUrl: true } } } },
      },
    });

    res.status(201).json({
      thread: {
        id: thread.id,
        kind: thread.kind,
        members: thread.members.map(m => ({
          id: m.user.id,
          email: m.user.id,
          displayName: m.user.name || 'RiseQuest User',
          photoUrl: m.user.photoUrl || null,
        })),
      },
    });
  } catch (error) {
    console.error('Community direct thread error:', error);
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

app.get('/api/community/threads', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const blocked = await getBlockedUserIds(userId);

    const threads = await prisma.communityMessageThread.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, photoUrl: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      threads: threads
        .map(t => {
          const other = t.members.map(m => m.user).find(u => u.id !== userId) || null;
          if (other && blocked.has(other.id)) return null;
          return {
            id: t.id,
            kind: t.kind,
            otherUser: other ? {
              id: other.id,
              email: other.id,
              displayName: other.name || 'RiseQuest User',
              photoUrl: other.photoUrl || null,
            } : null,
            lastMessage: t.messages[0] ? { content: t.messages[0].content, createdAt: t.messages[0].createdAt } : null,
          };
        })
        .filter(Boolean),
    });
  } catch (error) {
    console.error('Community threads list error:', error);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

app.get('/api/community/threads/:id/messages', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const threadId = String(req.params.id || '').trim();
    if (!threadId) return res.status(400).json({ error: 'Missing threadId' });

    const member = await prisma.communityThreadMember.findUnique({ where: { threadId_userId: { threadId, userId } } });
    if (!member) return res.status(403).json({ error: 'Not a member of this thread' });

    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const take = Math.min(Math.max(Number(req.query.limit || 30), 1), 100);

    const msgs = await prisma.communityMessage.findMany({
      where: { threadId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { sender: { select: { id: true, name: true, photoUrl: true } } },
    });

    const hasMore = msgs.length > take;
    const page = hasMore ? msgs.slice(0, take) : msgs;
    const nextCursor = hasMore ? page[page.length - 1]?.id : null;

    // Return in chronological order for UI
    const ordered = [...page].reverse();

    res.json({
      messages: ordered.map(m => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
        sender: {
          id: m.sender.id,
          email: m.sender.id,
          displayName: m.sender.name || 'RiseQuest User',
          photoUrl: m.sender.photoUrl || null,
        },
      })),
      nextCursor,
    });
  } catch (error) {
    console.error('Community messages list error:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.post('/api/community/threads/:id/messages', requireAuth, async (req, res) => {
  try {
    const settings = await assertCommunityEnabled(req, res);
    if (!settings) return;
    const userId = normalizeCommunityUserId(req.auth.userId);
    const threadId = String(req.params.id || '').trim();
    const content = String(req.body.content || '').trim();
    if (!threadId) return res.status(400).json({ error: 'Missing threadId' });
    if (!content) return res.status(400).json({ error: 'Message cannot be empty' });
    if (content.length > 800) return res.status(400).json({ error: 'Message is too long' });

    const member = await prisma.communityThreadMember.findUnique({ where: { threadId_userId: { threadId, userId } } });
    if (!member) return res.status(403).json({ error: 'Not a member of this thread' });

    const created = await prisma.communityMessage.create({
      data: { threadId, senderId: userId, content },
      include: { sender: { select: { id: true, name: true, photoUrl: true } } },
    });

    res.status(201).json({
      message: {
        id: created.id,
        content: created.content,
        createdAt: created.createdAt,
        sender: {
          id: created.sender.id,
          email: created.sender.id,
          displayName: created.sender.name || 'RiseQuest User',
          photoUrl: created.sender.photoUrl || null,
        },
      },
    });
  } catch (error) {
    console.error('Community message send error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Weather
app.get('/api/weather/current', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const units = String(req.query.units || 'metric');
    if (!Number.isFinite(lat) || Math.abs(lat)>90 || !Number.isFinite(lon) || Math.abs(lon)>180 || req.query.lat==null || req.query.lon==null) {
      return res.status(400).json({ error: 'Missing/invalid query params: lat, lon' });
    }
    const data = await getCurrentWeather({ lat, lon, units });

    res.json(data);
  } catch (error) {
    console.error('[Weather]', error.name);
    res.status(503).json({ error: 'Weather could not refresh. Please try again shortly.' });
  }
});

// Existing wake-up API, with safety checks and atomic, idempotent point debits.
require('./src/services/wakeupMessage').registerWakeupRoute(app, { prisma, requireAuth, generateGeminiText });
require('./src/services/alarmSpeech').registerAlarmSpeech(app, { prisma, requireAuth, uploadsDir });

// TTS: synthesize speech audio with server-side caching (cross-user)
// NOTE: This is OPTIONAL. If not configured, clients should fall back to on-device TTS.
app.post('/api/tts/speak', requireAuth, async (req, res) => {
  try {
    const coaching = await loadCoachingContext(prisma, req.auth.userId);
    if (!coaching.externalAllowed) return res.status(403).json({ error: 'Use the device voice for this age group', code: 'DEVICE_VOICE_REQUIRED' });
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Missing text' });
    if (text.length > 400) return res.status(400).json({ error: 'Text too long' });

    const voice =
      String(req.body?.voice || '').trim() ||
      String(process.env.AZURE_SPEECH_VOICE || process.env.AZURE_VOICE || '').trim() ||
      'en-US-JennyNeural';
    const cacheKey = sha256Hex(`v2|${req.auth.userId}|${voice}|${text}`);
    const filename = `${cacheKey}.mp3`;
    const absPath = path.join(ttsDir, filename);
    const access = jwt.sign({ sub: req.auth.userId, purpose: 'tts', file: filename }, jwtSecret, { expiresIn: '15m' });

    if (fs.existsSync(absPath)) {
      return res.json({
        success: true,
        cached: true,
        url: `${publicBaseUrl(req)}/uploads/tts/${filename}?access=${encodeURIComponent(access)}`,
        voice,
      });
    }

    const audio = await synthesizeAzureTtsMp3({ text, voiceName: voice });
    fs.writeFileSync(absPath, audio);

    res.json({
      success: true,
      cached: false,
      url: `${publicBaseUrl(req)}/uploads/tts/${filename}?access=${encodeURIComponent(access)}`,
      voice,
    });
  } catch (error) {
    console.error('TTS speak error:', error);
    const msg = String(error?.message || 'Failed to synthesize TTS');
    if (msg.toLowerCase().includes('not configured')) {
      return res.status(501).json({ error: 'Server TTS not configured' });
    }
    res.status(500).json({ error: 'Failed to synthesize TTS' });
  }
});

// Alarm events: store events for real analytics
app.post('/api/events/alarm', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const type = String(req.body?.type || '').trim().toLowerCase();
    const alarmId = req.body?.alarmId != null ? String(req.body.alarmId).trim() : null;
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};

    const allowed = new Set(['triggered', 'dismiss', 'snooze', 'challenge', 'challenge_completed']);
    if (!allowed.has(type)) return res.status(400).json({ error: 'Invalid type' });

    await prisma.alarmEvent.create({
      data: {
        userId,
        alarmId: alarmId || null,
        type,
        metadata,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Alarm event error:', error);
    res.status(500).json({ error: 'Failed to store alarm event' });
  }
});

app.get('/api/events/alarm/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const days = Math.max(1, Math.min(90, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.alarmEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const counts = rows.reduce(
      (acc, r) => {
        acc.total += 1;
        acc.byType[r.type] = (acc.byType[r.type] || 0) + 1;
        return acc;
      },
      { total: 0, byType: {} }
    );

    const triggered = Number(counts.byType.triggered || 0);
    const dismiss = Number(counts.byType.dismiss || 0);
    const successRate = triggered > 0 ? Math.round((dismiss / triggered) * 100) : 0;

    res.json({
      success: true,
      days,
      totalEvents: counts.total,
      byType: counts.byType,
      wakeUpSuccess: successRate,
    });
  } catch (error) {
    console.error('Alarm summary error:', error);
    res.status(500).json({ error: 'Failed to build summary' });
  }
});

app.get('/api/events/alarm/daily', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const days = Math.max(1, Math.min(90, Number(req.query.days || 7)));

    // Build an ordered list of date keys (UTC) so the client can render stable charts.
    const today = new Date();
    const dateKeys = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - i);
      dateKeys.push(d.toISOString().slice(0, 10));
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.alarmEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });

    const byDay = new Map();
    dateKeys.forEach((k) => {
      byDay.set(k, { date: k, triggered: 0, dismiss: 0, snooze: 0, challenge: 0 });
    });

    for (const r of rows) {
      const key = r.createdAt.toISOString().slice(0, 10);
      if (!byDay.has(key)) continue;
      const bucket = byDay.get(key);
      if (bucket[r.type] == null) bucket[r.type] = 0;
      bucket[r.type] += 1;
    }

    const series = dateKeys.map((k) => {
      const bucket = byDay.get(k) || { date: k, triggered: 0, dismiss: 0, snooze: 0, challenge: 0 };
      const triggered = Number(bucket.triggered || 0);
      const dismiss = Number(bucket.dismiss || 0);
      const successRate = triggered > 0 ? Math.round((dismiss / triggered) * 100) : 0;
      return { ...bucket, successRate };
    });

    res.json({ success: true, days, series });
  } catch (error) {
    console.error('Alarm daily error:', error);
    res.status(500).json({ error: 'Failed to build daily series' });
  }
});

// Sleep: store entries for real sleep analytics
function dateKeyUtc(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

app.get('/api/sleep/entries', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.sleepEntry.findMany({
      where: { userId, wakeAt: { gte: since } },
      orderBy: { wakeAt: 'asc' },
      take: 2000,
    });

    res.json({
      success: true,
      days,
      entries: rows.map((r) => ({
        id: r.id,
        dateKey: r.dateKey,
        bedtimeAt: r.bedtimeAt,
        wakeAt: r.wakeAt,
        durationMinutes: r.durationMinutes,
        sleepQuality: r.sleepQuality,
        notes: r.notes,
        source: r.source,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Sleep entries list error:', error);
    res.status(500).json({ error: 'Failed to load sleep entries' });
  }
});

app.post('/api/sleep/entries', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const bedtimeAt = new Date(req.body?.bedtimeAt);
    const wakeAt = new Date(req.body?.wakeAt);
    if (!Number.isFinite(bedtimeAt.getTime()) || !Number.isFinite(wakeAt.getTime())) {
      return res.status(400).json({ error: 'Invalid bedtimeAt/wakeAt' });
    }
    if (wakeAt <= bedtimeAt) {
      return res.status(400).json({ error: 'wakeAt must be after bedtimeAt' });
    }
    const durationMinutes = Math.max(1, Math.round((wakeAt.getTime() - bedtimeAt.getTime()) / 60000));
    if (durationMinutes > 24 * 60) {
      return res.status(400).json({ error: 'Duration too long' });
    }

    const sleepQuality = Math.max(0, Math.min(100, Number(req.body?.sleepQuality ?? 0)));
    const notes = req.body?.notes != null ? String(req.body.notes).slice(0, 1000) : null;
    const sourceRaw = String(req.body?.source || 'manual').trim().toLowerCase();
    const sourceAllowed = new Set(['manual', 'alarm', 'wearable']);
    const source = sourceAllowed.has(sourceRaw) ? sourceRaw : 'manual';

    // Ensure user exists for FK safety (for token-based IDs)
    await prisma.user.upsert({ where: { id: userId }, create: { id: userId, name: null, photoUrl: null }, update: {} });

    // Idempotency for non-manual sources (sync should overwrite the day's data instead of duplicating it).
    const dateKey = dateKeyUtc(wakeAt);
    const created = await walletTransaction(prisma,userId,async tx=>{
    if (source !== 'manual') {
      await tx.sleepEntry.deleteMany({ where: { userId, dateKey, source } });
    }

    return tx.sleepEntry.create({
      data: {
        userId,
        dateKey,
        bedtimeAt,
        wakeAt,
        durationMinutes,
        sleepQuality: Math.round(sleepQuality),
        notes,
        source,
      },
    });

    });

    res.status(201).json({ success: true, entry: created });
  } catch (error) {
    console.error('Sleep entry create error:', error);
    res.status(500).json({ error: 'Failed to create sleep entry' });
  }
});

app.put('/api/sleep/entries/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const existing = await prisma.sleepEntry.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Not found' });

    const bedtimeAt = req.body?.bedtimeAt != null ? new Date(req.body.bedtimeAt) : null;
    const wakeAt = req.body?.wakeAt != null ? new Date(req.body.wakeAt) : null;
    const nextBed = bedtimeAt && Number.isFinite(bedtimeAt.getTime()) ? bedtimeAt : existing.bedtimeAt;
    const nextWake = wakeAt && Number.isFinite(wakeAt.getTime()) ? wakeAt : existing.wakeAt;
    if (nextWake <= nextBed) return res.status(400).json({ error: 'wakeAt must be after bedtimeAt' });
    const durationMinutes = Math.max(1, Math.round((nextWake.getTime() - nextBed.getTime()) / 60000));

    const sleepQuality = req.body?.sleepQuality != null ? Math.max(0, Math.min(100, Number(req.body.sleepQuality))) : existing.sleepQuality;
    const notes = req.body?.notes != null ? String(req.body.notes).slice(0, 1000) : existing.notes;

    const updated = await prisma.sleepEntry.update({
      where: { id },
      data: {
        bedtimeAt: nextBed,
        wakeAt: nextWake,
        durationMinutes,
        sleepQuality: Math.round(sleepQuality),
        notes,
        dateKey: dateKeyUtc(nextWake),
      },
    });

    res.json({ success: true, entry: updated });
  } catch (error) {
    console.error('Sleep entry update error:', error);
    res.status(500).json({ error: 'Failed to update sleep entry' });
  }
});

app.delete('/api/sleep/entries/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const existing = await prisma.sleepEntry.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Not found' });
    await prisma.sleepEntry.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Sleep entry delete error:', error);
    res.status(500).json({ error: 'Failed to delete sleep entry' });
  }
});

app.get('/api/sleep/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await prisma.sleepEntry.findMany({
      where: { userId, wakeAt: { gte: since } },
      orderBy: { wakeAt: 'asc' },
      take: 2000,
    });

    if (!rows.length) {
      return res.json({ success: true, days, count: 0, avgDurationHours: 0, avgQuality: 0, consistencyScore: 0, series: [] });
    }

    const avgDurationHours = rows.reduce((sum, r) => sum + (r.durationMinutes || 0), 0) / rows.length / 60;
    const avgQuality = rows.reduce((sum, r) => sum + (r.sleepQuality || 0), 0) / rows.length;

    const bedtimes = rows.map((r) => {
      const d = new Date(r.bedtimeAt);
      return d.getUTCHours() + d.getUTCMinutes() / 60;
    });
    const avgBed = bedtimes.reduce((s, v) => s + v, 0) / bedtimes.length;
    const variance = bedtimes.reduce((s, v) => s + Math.pow(v - avgBed, 2), 0) / bedtimes.length;
    const std = Math.sqrt(variance);
    const consistencyScore = Math.max(0, Math.min(100, Math.round(100 - std * 10)));

    const series = rows.slice(-90).map((r) => ({
      dateKey: r.dateKey,
      durationHours: Math.round(((r.durationMinutes || 0) / 60) * 10) / 10,
      sleepQuality: r.sleepQuality,
    }));

    res.json({
      success: true,
      days,
      count: rows.length,
      avgDurationHours: Math.round(avgDurationHours * 10) / 10,
      avgQuality: Math.round(avgQuality),
      consistencyScore,
      series,
    });
  } catch (error) {
    console.error('Sleep summary error:', error);
    res.status(500).json({ error: 'Failed to build sleep summary' });
  }
});

// Coach chat: real backend + persistence
app.get('/api/coach/chat/history', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const rows = await prisma.coachChatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    res.json({
      success: true,
      messages: rows.map(r => ({
        id: r.id,
        role: r.role,
        content: r.content,
        personality: r.personality,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Coach history error:', error);
    res.status(500).json({ error: 'Failed to load coach history' });
  }
});

app.post('/api/coach/chat', requireAuth, async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    const userId = req.auth.userId;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Missing message' });
    if (message.length > 1200) return res.status(400).json({ error: 'Message too long' });
    const coaching = await loadCoachingContext(prisma, userId, { activity: true });
    if (!coaching.externalAllowed) return res.json({ success: true, reply: curatedReply(message), provider: 'curated' });
    const inputSafety = await checkAiSafety(message, coaching);
    if (!inputSafety.allowed) return res.json({ success: true, reply: inputSafety.reply, provider: 'curated' });


    const personality = String(req.body?.personality || 'motivational').trim().toLowerCase();
    const allowed = new Set(['motivational', 'gentle', 'scientific', 'friendly', 'professional', 'strict', 'rude', 'fun']);
    const resolved = safePersonality(coaching.profile, allowed.has(personality) ? personality : 'motivational');

    await prisma.coachChatMessage.create({
      data: { userId, role: 'user', personality: resolved, content: message },
    });

    const recent = await prisma.coachChatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    const history = [...recent].reverse().map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 900),
    }));

    const generated = await require('./src/services/coachGeneration').generateCoachReply({ coaching, history, personality: resolved });
    if (generated.kind === 'unavailable') return res.status(502).json({ error: 'Live coaching is temporarily unavailable. Your message was saved; please try again.' });
    const reply = generated.kind === 'generated' ? generated.value : generated.reply || curatedReply(message);
    const provider = generated.kind === 'generated' ? generated.provider : 'curated';

    const saved = await prisma.coachChatMessage.create({
      data: { userId, role: 'assistant', personality: resolved, content: reply },
    });

    res.json({ success: true, reply, messageId: saved.id, provider });
  } catch (error) {
    console.warn('Coach request could not complete.');
    res.status(error.status || 503).json({ error: 'Live coaching is temporarily unavailable. Try again or use a prepared routine.' });
  }
});

// Geocoding + Places (server-side key)
app.get('/api/geo/reverse', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || Math.abs(lat)>90 || !Number.isFinite(lon) || Math.abs(lon)>180 || req.query.lat==null || req.query.lon==null) {
      return res.status(400).json({ error: 'Missing/invalid query params: lat, lon' });
    }
    const data = await reverseGeocode({ lat, lon });
    res.json(data);
  } catch (error) {
    console.error('Reverse geocode error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/geo/places-autocomplete', async (req, res) => {
  try {
    const input = String(req.query.input || '').trim();
    if (!input) return res.status(400).json({ error: 'Missing query param: input' });
    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lon = req.query.lon != null ? Number(req.query.lon) : null;
    const data = await placesAutocomplete({ input, lat, lon });
    res.json(data);
  } catch (error) {
    console.error('Places autocomplete error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/geo/geocode', async (req, res) => {
  try {
    const address = String(req.query.address || '').trim();
    if (!address) return res.status(400).json({ error: 'Missing query param: address' });
    const data = await geocodeAddress({ address });
    res.json(data);
  } catch (error) {
    console.error('Geocode address error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/geo/places/textsearch', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Missing query param: query' });
    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lon = req.query.lon != null ? Number(req.query.lon) : null;
    const radius = req.query.radius != null ? Number(req.query.radius) : 50000;
    const data = await placesTextSearch({ query, lat, lon, radius });
    res.json(data);
  } catch (error) {
    console.error('Places textsearch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/geo/places/details', async (req, res) => {
  try {
    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) return res.status(400).json({ error: 'Missing query param: placeId' });
    const fields = req.query.fields != null ? String(req.query.fields) : null;
    const data = await placeDetails({ placeId, fields });
    res.json(data);
  } catch (error) {
    console.error('Place details error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/geo/places/nearby', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || Math.abs(lat)>90 || !Number.isFinite(lon) || Math.abs(lon)>180 || req.query.lat==null || req.query.lon==null) {
      return res.status(400).json({ error: 'Missing/invalid query params: lat, lon' });
    }
    const type = req.query.type != null ? String(req.query.type) : 'point_of_interest';
    const radius = req.query.radius != null ? Number(req.query.radius) : 5000;
    const data = await nearbyPlaces({ lat, lon, type, radius });
    res.json(data);
  } catch (error) {
    console.error('Nearby places error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Quest API Endpoints

// POST /api/quests - Create a new quest with AI-generated subtasks
app.post('/api/quests', requireAuth, ownRequest, async (req, res) => {
  try {
    const { title, description, difficulty, category, userId, tags, reminderEnabled, reminderTime, userName, userPhotoUrl } = req.body;

    if (!title || !description || !userId) {
      return res.status(400).json({ error: 'Missing required fields: title, description, userId' });
    }

    if (typeof title !== 'string' || title.trim().length > 200 || typeof description !== 'string' || description.length > 4000 ||
        (difficulty && !['easy', 'medium', 'hard'].includes(difficulty)) || (category && (typeof category !== 'string' || category.length > 80)) ||
        (reminderTime && !Number.isFinite(new Date(reminderTime).getTime()))) {
      return res.status(400).json({ error: 'Check the quest title, description, difficulty and reminder time.' });
    }

    const { subtasks, source } = await generateSubtasks({
      coaching: await loadCoachingContext(prisma, req.auth.userId),
      title,
      description,
      difficulty: difficulty || 'medium',
      category: category || 'general',
    });

    const estimatedTotalMinutes = subtasks.reduce((total, task) => total + (task.estimatedMinutes || 0), 0);

    const created = await prisma.quest.create({
      data: {
        userId,
        title,
        description,
        breakdownSource: source,
        difficulty: difficulty || 'medium',
        category: category || 'general',
        status: 'active',
        progress: 0,
        totalSteps: subtasks.length,
        currentStep: 0,
        estimatedTotalMinutes,
        tags: Array.isArray(tags) ? tags : [],
        reminderEnabled: Boolean(reminderEnabled),
        reminderTime: reminderTime ? new Date(reminderTime) : null,
        subtasks: {
          create: subtasks.map(s => ({
            title: s.title,
            description: s.description || '',
            order: s.order,
            completed: false,
            estimatedMinutes: s.estimatedMinutes || 30,
            difficulty: s.difficulty || (difficulty || 'medium'),
          })),
        },
      },
      include: { subtasks: { orderBy: { order: 'asc' } } },
    });

    res.status(201).json({
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      completedAt: created.completedAt ? created.completedAt.toISOString() : null,
      reminderTime: created.reminderTime ? created.reminderTime.toISOString() : null,
      subtasks: created.subtasks.map(st => ({
        ...st,
        createdAt: st.createdAt.toISOString(),
        updatedAt: st.updatedAt.toISOString(),
        completedAt: st.completedAt ? st.completedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    console.error('Error creating quest:', error);
    res.status(500).json({ error: 'Failed to create quest' });
  }
});

// GET /api/quests/:id - Get a specific quest
app.get('/api/quests/:id', requireAuth, ownQuest(prisma), (req, res) => {
  prisma.quest.findUnique({
    where: { id: req.params.id },
    include: { subtasks: { orderBy: { order: 'asc' } } },
  }).then(quest => {
    if (!quest) return res.status(404).json({ error: 'Quest not found' });
    res.json({
      ...quest,
      createdAt: quest.createdAt.toISOString(),
      updatedAt: quest.updatedAt.toISOString(),
      completedAt: quest.completedAt ? quest.completedAt.toISOString() : null,
      reminderTime: quest.reminderTime ? quest.reminderTime.toISOString() : null,
      subtasks: quest.subtasks.map(st => ({
        ...st,
        createdAt: st.createdAt.toISOString(),
        updatedAt: st.updatedAt.toISOString(),
        completedAt: st.completedAt ? st.completedAt.toISOString() : null,
      })),
    });
  }).catch(error => {
    console.error('Error fetching quest:', error);
    res.status(500).json({ error: 'Failed to fetch quest' });
  });
});

// GET /api/users/:userId/quests - Get all quests for a user
app.get('/api/users/:userId/quests', requireAuth, ownRequest, (req, res) => {
  (async () => {
    try {
      const userId = req.params.userId;
      const status = req.query.status ? String(req.query.status) : null;

      const quests = await prisma.quest.findMany({
        where: {
          userId,
          ...(status ? { status } : {}),
        },
        include: { subtasks: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });

      res.json(quests.map(q => ({
        ...q,
        createdAt: q.createdAt.toISOString(),
        updatedAt: q.updatedAt.toISOString(),
        completedAt: q.completedAt ? q.completedAt.toISOString() : null,
        reminderTime: q.reminderTime ? q.reminderTime.toISOString() : null,
        subtasks: q.subtasks.map(st => ({
          ...st,
          createdAt: st.createdAt.toISOString(),
          updatedAt: st.updatedAt.toISOString(),
          completedAt: st.completedAt ? st.completedAt.toISOString() : null,
        })),
      })));
    } catch (error) {
      console.error('Error fetching user quests:', error);
      res.status(500).json({ error: 'Failed to fetch quests' });
    }
  })();
});

// GET /api/users/:userId/quest-stats
app.get('/api/users/:userId/quest-stats', requireAuth, ownRequest, async (req, res) => {
  try {
    const userId = req.params.userId;
    const [activeQuests, completedQuests, allQuests] = await Promise.all([
      prisma.quest.count({ where: { userId, status: 'active' } }),
      prisma.quest.count({ where: { userId, status: 'completed' } }),
      prisma.quest.count({ where: { userId } }),
    ]);
    res.json({ activeQuests, completedQuests, totalQuests: allQuests });
  } catch (error) {
    console.error('Quest stats error:', error);
    res.status(500).json({ error: 'Failed to fetch quest stats' });
  }
});

// PATCH /api/quests/:id/subtasks/:subtaskId - Toggle subtask completion
app.patch('/api/quests/:id/subtasks/:subtaskId', requireAuth, ownQuest(prisma), async (req, res) => {
  try {
    const {lock,changeQuest}=require('./src/companionSupport');
    const updatedQuest=await lock(prisma,req.auth.userId,tx=>changeQuest(tx,req.auth.userId,{
      operation:'step_complete',id:req.params.id,stepId:req.params.subtaskId,completed:req.body.completed,
    }));

    res.json({
      ...updatedQuest,
      createdAt: updatedQuest.createdAt.toISOString(),
      updatedAt: updatedQuest.updatedAt.toISOString(),
      completedAt: updatedQuest.completedAt ? updatedQuest.completedAt.toISOString() : null,
      reminderTime: updatedQuest.reminderTime ? updatedQuest.reminderTime.toISOString() : null,
      subtasks: updatedQuest.subtasks.map(st => ({
        ...st,
        createdAt: st.createdAt.toISOString(),
        updatedAt: st.updatedAt.toISOString(),
        completedAt: st.completedAt ? st.completedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    console.error('Quest progress error:', error);
    res.status(500).json({ error: 'Failed to update quest progress' });
  }
});

// DELETE /api/quests/:id
app.delete('/api/quests/:id', requireAuth, ownQuest(prisma), async (req, res) => {
  try {
    const {lock,changeQuest}=require('./src/companionSupport');
    await lock(prisma,req.auth.userId,tx=>changeQuest(tx,req.auth.userId,{operation:'quest_delete',id:req.params.id}));
    res.json({ success: true });
  } catch (error) {
    console.error('Quest delete error:', error);
    res.status(500).json({ error: 'Failed to delete quest' });
  }
});

// Create subscription
app.post('/api/create-subscription', requireAuth, ownRequest, checkoutKey, subscriptionMetadata, async (req, res) => {
  try {
    const { priceId, customerEmail, metadata } = req.body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY)' });
    }

    if (!priceId || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields: priceId, customerEmail' });
    }

    const allowedPriceIds = new Set([
      process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      process.env.STRIPE_PRICE_PREMIUM_YEARLY,
      process.env.STRIPE_PRICE_FAMILY_MONTHLY,
      process.env.STRIPE_PRICE_FAMILY_YEARLY,
    ].filter(Boolean));

    if (allowedPriceIds.size === 0) {
      return res.status(500).json({ error: 'Pricing is not configured (missing STRIPE_PRICE_* env vars)' });
    }

    if (!allowedPriceIds.has(priceId)) {
      return res.status(400).json({ error: 'Invalid price ID' });
    }

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customerEmail,
        metadata: {
          app: 'RiseQuest',
          ...metadata,
        },
      });
    }

    // Persist user + stripe customer mapping
    const userId = metadata?.userId || customerEmail;
    await ensureUser(userId);
    await prisma.stripeCustomer.upsert({
      where: { userId },
      create: { userId, stripeCustomerId: customer.id },
      update: { stripeCustomerId: customer.id },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        app: 'RiseQuest',
        customerEmail,
        userId,
        ...metadata,
      },
    }, req.stripeOptions);

    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        userId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        priceId,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
      update: {
        status: subscription.status,
        priceId,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
    });

    res.json({
      id: subscription.id,
      customer_id: customer.id,
      latest_invoice: subscription.latest_invoice,
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create subscription PaymentSheet payload (customer + ephemeral key + PaymentIntent client secret)
app.post('/api/stripe/subscription/payment-sheet', requireAuth, ownRequest, checkoutKey, subscriptionMetadata, async (req, res) => {
  try {
    const { priceId, customerEmail, metadata, userId: explicitUserId } = req.body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY)' });
    }

    if (!priceId || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields: priceId, customerEmail' });
    }

    const allowedPriceIds = new Set([
      process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      process.env.STRIPE_PRICE_PREMIUM_YEARLY,
      process.env.STRIPE_PRICE_FAMILY_MONTHLY,
      process.env.STRIPE_PRICE_FAMILY_YEARLY,
    ].filter(Boolean));

    if (allowedPriceIds.size === 0) {
      return res.status(500).json({ error: 'Pricing is not configured (missing STRIPE_PRICE_* env vars)' });
    }

    if (!allowedPriceIds.has(priceId)) {
      return res.status(400).json({ error: 'Invalid price ID' });
    }

    // Create or retrieve customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customerEmail,
        metadata: {
          app: 'RiseQuest',
          ...metadata,
        },
      });
    }

    const userId = explicitUserId || metadata?.userId || customerEmail;
    await ensureUser(userId);
    await prisma.stripeCustomer.upsert({
      where: { userId },
      create: { userId, stripeCustomerId: customer.id },
      update: { stripeCustomerId: customer.id },
    });

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2024-06-20' }
    );

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        app: 'RiseQuest',
        customerEmail,
        userId,
        ...metadata,
      },
    }, req.stripeOptions);

    const paymentIntent = subscription.latest_invoice?.payment_intent;
    const clientSecret = paymentIntent?.client_secret;
    if (!clientSecret) {
      return res.status(500).json({ error: 'Failed to create subscription payment intent' });
    }

    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        userId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        priceId,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
      update: {
        status: subscription.status,
        priceId,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
    });

    res.json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      ephemeralKey: ephemeralKey.secret,
      paymentIntentClientSecret: clientSecret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    });
  } catch (error) {
    console.error('Subscription PaymentSheet error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create payment intent for one-time purchases
app.post('/api/create-payment-intent', requireAuth, ownRequest, checkoutKey, pointPurchase, async (req, res) => {
  try {
    const { amount, currency, description, metadata } = req.body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY)' });
    }

    if (!amount || !currency) {
      return res.status(400).json({ error: 'Missing required fields: amount, currency' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      description,
      metadata: {
        app: 'RiseQuest',
        ...metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    }, req.stripeOptions);

    res.json({
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create one-time PaymentSheet payload (customer + ephemeral key + PaymentIntent client secret)
app.post('/api/stripe/payment-intent/payment-sheet', requireAuth, ownRequest, checkoutKey, pointPurchase, async (req, res) => {
  try {
    const { amount, currency, description, customerEmail, metadata, userId: explicitUserId } = req.body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY)' });
    }

    if (!amount || !currency) {
      return res.status(400).json({ error: 'Missing required fields: amount, currency' });
    }

    let customer = null;
    if (customerEmail) {
      const existingCustomers = await stripe.customers.list({ email: customerEmail, limit: 1 });
      customer = existingCustomers.data[0] || await stripe.customers.create({
        email: customerEmail,
        metadata: { app: 'RiseQuest', ...metadata },
      });
    }

    const userId = explicitUserId || metadata?.userId || customerEmail || null;
    if (userId) {
      await ensureUser(userId);
      if (customer?.id) {
        await prisma.stripeCustomer.upsert({
          where: { userId },
          create: { userId, stripeCustomerId: customer.id },
          update: { stripeCustomerId: customer.id },
        });
      }
    }

    const ephemeralKey = customer
      ? await stripe.ephemeralKeys.create(
          { customer: customer.id },
          { apiVersion: '2024-06-20' }
        )
      : null;

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      description,
      customer: customer?.id,
      metadata: {
        app: 'RiseQuest',
        userId: userId || undefined,
        ...metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    }, req.stripeOptions);

    await prisma.paymentIntent.upsert({
      where: { stripePaymentIntentId: paymentIntent.id },
      create: {
        userId: userId || null,
        stripePaymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        type: String(metadata?.type || 'unknown'),
        metadata: metadata || {},
      },
      update: {
        status: paymentIntent.status,
        metadata: metadata || {},
      },
    });

    res.json({
      paymentIntentId: paymentIntent.id,
      customerId: customer?.id || null,
      ephemeralKey: ephemeralKey?.secret || null,
      paymentIntentClientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    });
  } catch (error) {
    console.error('PaymentSheet PaymentIntent error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Wallet: get RisePoints balance (server-side, primarily for purchased points)
app.get('/api/wallet/balance', requireAuth, ownRequest, async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'Missing query param: userId' });
    await ensureUser(userId);

    const balance = await prisma.risePointsBalance.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    });

    res.json({ userId, balance: balance.balance, updatedAt: balance.updatedAt.toISOString() });
  } catch (error) {
    console.error('Wallet balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Wallet: claim RisePoints after successful Stripe PaymentIntent (no webhook required)
app.post('/api/wallet/claim-rise-points', requireAuth, ownRequest, async (req, res) => {
  try {
    const { userId, paymentIntentId } = req.body;
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY)' });
    }
    if (!userId || !paymentIntentId) {
      return res.status(400).json({ error: 'Missing required fields: userId, paymentIntentId' });
    }
    await ensureUser(userId);

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: `PaymentIntent not succeeded (status=${pi.status})` });
    }

    if (!validPurchasedPoints(pi, req.auth.userId)) return res.status(403).json({ error: 'Payment does not match this account and package' });
    const points = Number(pi.metadata.risePoints);
    if (!Number.isFinite(points) || points <= 0) {
      return res.status(400).json({ error: 'PaymentIntent missing risePoints metadata' });
    }

    // Idempotent credit using unique constraint on stripe_payment_intent_id
    await walletTransaction(prisma, userId, async (tx) => {
      await tx.risePointsTransaction.create({
        data: {
          userId,
          delta: points,
          reason: 'rise_points_purchase',
          stripePaymentIntentId: paymentIntentId,
        },
      });

      const existing = await tx.risePointsBalance.findUnique({ where: { userId } });
      if (existing) {
        await tx.risePointsBalance.update({ where: { userId }, data: { balance: existing.balance + points } });
      } else {
        await tx.risePointsBalance.create({ data: { userId, balance: points } });
      }
    });

    const balance = await prisma.risePointsBalance.findUnique({ where: { userId } });
    res.json({ success: true, userId, balance: balance?.balance || 0 });
  } catch (error) {
    // Prisma unique violation means already claimed
    if (String(error?.code) === 'P2002') {
      const userId = String(req.body?.userId || '').trim();
      const balance = userId ? await prisma.risePointsBalance.findUnique({ where: { userId } }) : null;
      return res.json({ success: true, alreadyClaimed: true, userId, balance: balance?.balance || 0 });
    }
    console.error('Claim RisePoints error:', error);
    res.status(500).json({ error: error.message });
  }
});

const rechargeService = require('./src/recharge');
rechargeService.registerRecharge(app, { prisma, requireAuth, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  stripe: new (require('stripe-recharge'))(stripeSecretKey || 'unconfigured', { apiVersion: '2026-08-26.dahlia', timeout: 10000, maxNetworkRetries: 0 }) });
require('./src/services/assistant').registerAssistant(app, { prisma, requireAuth });
require('./src/services/companionVoice').registerCompanionVoice(app, { prisma, requireAuth, uploadsDir });
require('./src/companions').registerCompanions(app, { prisma, requireAuth });

require('./src/services/readerVoice').registerReaderVoice(app, { prisma, requireAuth, uploadsDir });
require('./src/companionSupport').registerSupport(app, { prisma, requireAuth });

// Wallet: award/spend gamified RisePoints (server-side ledger)
app.post('/api/wallet/award', requireAuth, ownRequest, async (req, res) => {
  const userId = req.auth.userId;
  try {
    const result = await walletTransaction(prisma, userId, tx =>
      require('./src/walletPolicy').awardReward(tx, userId, String(req.body.reason || ''), req.body.metadata));
    res.json({ success: true, userId, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/wallet/spend', requireAuth, ownRequest, async (req, res) => {
  const userId = req.auth.userId;
  try {
    const { amount, reason } = spendFor(req.body);
    const key = String(req.body.idempotencyKey || '');
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key)) return res.status(400).json({ error: 'A purchase idempotency key is required' });
    const id = 'spend_' + sha256Hex(userId + '|' + key);
    const result = await walletTransaction(prisma, userId, async tx => {
      const previous = await tx.risePointsTransaction.findUnique({ where: { id } });
      if (previous && (previous.delta !== -amount || previous.reason !== reason)) throw new Error('Purchase key was already used for different items');
      const existing = await tx.risePointsBalance.findUnique({ where: { userId } });
      if (previous) return { ok: true, balance: existing?.balance || 0 };
      const { recoverPurchases, ownedIds, grant } = require('./src/cosmetics');
      const { byId, expand } = require('./src/cosmeticCatalog');
      await recoverPurchases(tx, userId);
      const owned = new Set(await ownedIds(tx, userId));
      const itemIds = req.body.metadata.itemIds;
      if (expand(itemIds).some(item => owned.has(item))) throw new Error('An item is already in your collection. Update the app to see adjusted bundle prices.');
      const contents = itemIds.flatMap(item => byId[item]?.items || [item]);
      if (new Set(contents).size !== contents.length) throw new Error('Your cart contains overlapping bundle items.');
      if (!existing || existing.balance < amount) return { ok: false, balance: existing?.balance || 0 };
      await tx.risePointsTransaction.create({ data: { id, userId, delta: -amount, reason, metadata: { cosmeticsVersion: 2 } } });
      await grant(tx, userId, expand(itemIds), 'purchase', id);
      const updated = await tx.risePointsBalance.update({ where: { userId }, data: { balance: { decrement: amount } } });
      return { ok: true, balance: updated.balance };
    });
    if (!result.ok) return res.status(400).json({ error: 'Insufficient balance', balance: result.balance });
    res.json({ success: true, userId, balance: result.balance });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/wallet/transactions', requireAuth, ownRequest, async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim();
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    if (!userId) return res.status(400).json({ error: 'Missing query param: userId' });
    await ensureUser(userId);

    const rows = await prisma.risePointsTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(rows.map(r => ({
      id: r.id,
      userId: r.userId,
      amount: r.delta,
      type: r.delta >= 0 ? 'EARN' : 'SPEND',
      brandedDescription: r.reason,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (error) {
    console.error('Wallet transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pricing configuration
app.get('/api/pricing-config', async (req, res) => {
  try {
    const { PLANS, POINT_PACKS_V2, STRIPE_POINT_PRICES } = require('./src/economy');
    const config = { economyVersion: 2, rewardDailyCap: 20, subscriptions: {}, risepoints: {} };
    for (const [plan, reference] of Object.entries(PLANS)) {
      const key = plan.startsWith('family') ? plan.toUpperCase() : `PREMIUM_${plan.toUpperCase()}`;
      const priceId = process.env[`STRIPE_PRICE_${key}`];
      if (!priceId) continue;
      const price = await stripe.prices.retrieve(priceId);
      if (!price.active || price.type !== 'recurring') continue;
      config.subscriptions[plan] = { priceId, amount: price.unit_amount / 100, currency: price.currency,
        allowance: reference.grant, referenceUsd: reference.cents / 100 };
    }
    for (const [pack, value] of Object.entries(POINT_PACKS_V2)) {
      config.risepoints[pack] = { priceId: STRIPE_POINT_PRICES[pack], amount: value.cents / 100, points: value.points, name: value.name, currency: 'usd' };
    }

    res.json(config);
  } catch (error) {
    console.error('Pricing config error:', error);
    res.status(500).json({ error: 'Failed to fetch pricing configuration' });
  }
});

// Cancel subscription
app.post('/api/cancel-subscription', requireAuth, ownRequest, async (req, res) => {
  try {
    const { subscriptionId } = req.body;

    const owned = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: String(subscriptionId || '') } });
    if (!owned || owned.userId !== req.auth.userId) return res.status(404).json({ error: 'Subscription not found' });
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({
      id: subscription.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_end: subscription.current_period_end,
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Stripe webhook handler
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).send('Webhook is not configured (missing STRIPE_WEBHOOK_SECRET)');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
  if (await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } })) return res.json({ received: true, duplicate: true });
  // Handle the event
  switch (event.type) {
    case 'customer.subscription.created':
      console.log('Subscription created:', event.id);
      // Handle new subscription
      await handleSubscriptionCreated(event.data.object);
      break;

    case 'customer.subscription.updated':
      console.log('Subscription updated:', event.id);
      // Handle subscription changes
      await handleSubscriptionUpdated(event.data.object);
      break;

    case 'customer.subscription.deleted':
      console.log('Subscription deleted:', event.id);
      // Handle subscription cancellation
      await handleSubscriptionDeleted(event.data.object);
      break;

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      if (invoice.subscription) await handleSubscriptionUpdated(await stripe.subscriptions.retrieve(invoice.subscription));
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      if (charge.metadata?.type === 'rp_recharge') await rechargeService.refund(prisma, charge);
      if (charge.refunded && charge.invoice) {
        const invoice = await stripe.invoices.retrieve(charge.invoice);
        if (invoice.subscription) {
          const subscription = await prisma.subscription.findUnique({where:{stripeSubscriptionId:invoice.subscription}});
          if(subscription) await walletTransaction(prisma,subscription.userId,tx=>require('./src/economy').revokeSubscriptionGrant(tx,subscription.userId,'stripe',invoice.id));
        }
      }
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object;
      if (invoice.paid && invoice.amount_paid > 0 && invoice.subscription && !invoice.lines?.has_more) {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        await handleSubscriptionUpdated(sub);
        const linked = await prisma.subscription.findUnique({where:{stripeSubscriptionId:sub.id}});
        const userId = linked?.userId;
        const prices = { monthly: 'STRIPE_PRICE_PREMIUM_MONTHLY', yearly: 'STRIPE_PRICE_PREMIUM_YEARLY',
          family_monthly: 'STRIPE_PRICE_FAMILY_MONTHLY', family_yearly: 'STRIPE_PRICE_FAMILY_YEARLY' };
        const line = invoice.lines?.data?.find(row => row.type === 'subscription' && !row.proration);
        const plan = Object.entries(prices).find(([, key]) => process.env[key] && process.env[key] === line?.price?.id)?.[0];
        if (userId && plan && await prisma.user.findUnique({ where: { id: userId } })) {
          await walletTransaction(prisma, userId, tx => require('./src/economy').grantSubscription(tx, userId,
            { store: 'stripe', period: invoice.id, plan, paid: true, purchasedAt: new Date(invoice.created * 1000) }));
        }
      }
      break;
    }
    case 'payment_intent.succeeded':
      console.log('Payment succeeded:', event.id);
      // Handle successful one-time payment
      if (!await rechargeService.settle(prisma, event.data.object)) await handlePaymentSucceeded(event.data.object);
      break;

    case 'payment_intent.requires_action':
    case 'payment_intent.canceled':
      await rechargeService.settle(prisma, event.data.object);
      break;

    case 'payment_intent.payment_failed':
      console.log('Payment failed:', event.id);
      // Handle failed payment
      if (!await rechargeService.settle(prisma, event.data.object)) await handlePaymentFailed(event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  await prisma.stripeWebhookEvent.upsert({ where: { id: event.id }, create: { id: event.id, type: event.type }, update: {} });
  res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing failed:', event.id, error?.code || 'database_error');
    res.status(500).json({ error: 'Webhook processing failed; retry required' });
  }
});

// Webhook handler functions
async function handleSubscriptionCreated(subscription) {
  console.log('New subscription created:', subscription.id);
  try {
    const userId = subscription.metadata?.userId || subscription.metadata?.customerEmail || null;
    if (!userId) return;
    const owner = await prisma.user.findUnique({ where: { id: userId } });
    if (!owner || owner.disabledAt) return;
    const customer = await prisma.stripeCustomer.findUnique({ where: { userId } });
    if (!customer || customer.stripeCustomerId !== subscription.customer) return;

    const priceId = subscription.items?.data?.[0]?.price?.id || null;
    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        userId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        priceId,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
      update: {
        status: subscription.status,
        priceId,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
    });
  } catch (e) {
    throw e;
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log('Subscription updated:', subscription.id);
  try {
    const userId = subscription.metadata?.userId || subscription.metadata?.customerEmail || null;
    if (!userId) return;
    const owner = await prisma.user.findUnique({ where: { id: userId } });
    if (!owner || owner.disabledAt) return;
    const customer = await prisma.stripeCustomer.findUnique({ where: { userId } });
    if (!customer || customer.stripeCustomerId !== subscription.customer) return;
    const priceId = subscription.items?.data?.[0]?.price?.id || null;
    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        userId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        priceId,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
      update: {
        status: subscription.status,
        priceId,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      },
    });
  } catch (e) {
    throw e;
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('Subscription cancelled:', subscription.id);
  try {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: 'canceled', cancelAtPeriodEnd: true },
    });
  } catch (e) {
    throw e;
  }
}

async function handlePaymentSucceeded(paymentIntent) {
  console.log('Payment succeeded:', paymentIntent.id);
  
  // For RisePoints purchases, you might want to:
  // 1. Add points to user's account in your database
  // 2. Send confirmation email
  // 3. Trigger any bonus point events
  
  if (paymentIntent.metadata?.type === 'risepoints') {
    console.log('RisePoints purchase completed');
    try {
      const userId = paymentIntent.metadata?.userId;
      const points = Number(paymentIntent.metadata?.risePoints || paymentIntent.metadata?.points || 0);
      if (!userId || !validPurchasedPoints(paymentIntent, userId)) return;

      const owner = await prisma.user.findUnique({ where: { id: userId } });
      if (!owner || owner.disabledAt) return;
      const stored = await prisma.paymentIntent.findUnique({ where: { stripePaymentIntentId: paymentIntent.id } });
      if (stored && stored.userId !== userId) return;
      await walletTransaction(prisma, userId, async (tx) => {
        await tx.risePointsTransaction.create({
          data: {
            userId,
            delta: points,
            reason: 'rise_points_purchase',
            stripePaymentIntentId: paymentIntent.id,
          },
        });

        const existing = await tx.risePointsBalance.findUnique({ where: { userId } });
        if (existing) {
          await tx.risePointsBalance.update({ where: { userId }, data: { balance: existing.balance + points } });
        } else {
          await tx.risePointsBalance.create({ data: { userId, balance: points } });
        }
      });
    } catch (e) {
      if (String(e?.code) === 'P2002') return;
      throw e;
    }
  }
}

async function handlePaymentFailed(paymentIntent) {
  console.log('Payment failed:', paymentIntent.id);
  
  // Send payment failure notification
  // Retry logic if needed
}

// Analytics endpoint
app.get('/api/analytics', requireAdmin, requireRole('ADMIN'), async (req, res) => {
  try {
    // Get subscription analytics from Stripe
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: 'active',
    });

    const analytics = {
      totalActiveSubscriptions: subscriptions.data.length,
      monthlyRevenue: 0,
      yearlyRevenue: 0,
    };

    // Calculate revenue
    subscriptions.data.forEach(sub => {
      const price = sub.items.data[0].price;
      if (price.recurring?.interval === 'month') {
        analytics.monthlyRevenue += price.unit_amount / 100;
      } else if (price.recurring?.interval === 'year') {
        analytics.yearlyRevenue += price.unit_amount / 100;
      }
    });

    res.json(analytics);
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`RiseQuest API server running on port ${PORT}`);
    ensureAdminBootstrap().catch(() => {});
  });
}

module.exports = app;

