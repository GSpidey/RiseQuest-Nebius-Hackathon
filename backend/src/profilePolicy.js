// Only preferences belong here. Roles, purchases, points and parent approvals
// are server-owned and must never be accepted from a mobile profile payload.
const { validCountry, requiresParent } = require('./agePolicy');
const choices = {
  ageGroup: ['child', 'teen', 'adult'],
  ageBand: ['under13', '13to15', '16to17', 'adult'],
  usageMode: ['standard', 'support'],
};
const preferenceChoices = {
  uiDensity: ['compact', 'standard', 'spacious'],
  colorContrast: ['standard', 'high'],
  notificationStyle: ['gentle', 'standard', 'assertive', 'motivational'],
  ttsMode: ['device', 'cloud'],
  communityVisibility: ['buddies', 'public'],
};
const preferenceBooleans = ['reducedSensory', 'captionsEnabled', 'ttsEnabled',
  'dyslexiaFriendly', 'dataMinimization', 'communityOptIn', 'communityTeenSafety', 'analyticsOptIn', 'optionalInlineAds'];
const invalid = message => Object.assign(new Error(message), { status: 400 });
function select(value, allowed, name) {
  if (!allowed.includes(value)) throw invalid(`Invalid ${name}`);
  return value;
}
function strings(value, name, allowed) {
  if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== 'string' || v.length > 100 || (allowed && !allowed.includes(v)))) throw invalid(`Invalid ${name}`);
  return [...new Set(value)];
}
function sanitizeProfile(input, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Invalid profile');
  const data = { ...existing, preferences: { analyticsOptIn: false, ...existing.preferences } };
  for (const [key, allowed] of Object.entries(choices)) {
    if (input[key] !== undefined) data[key] = select(input[key], allowed, key);
  }
  if (existing.ageGroup && existing.ageGroup !== 'adult' && data.ageGroup !== existing.ageGroup) {
    throw invalid('Age corrections require parent or support review');
  }
  if (existing.ageGroup !== 'adult' && existing.ageBand && data.ageBand !== existing.ageBand) {
    throw invalid('Age corrections require parent or support review');
  }
  if (input.supportEnabled !== undefined) {
    if (typeof input.supportEnabled !== 'boolean') throw invalid('Invalid supportEnabled');
    data.supportEnabled = input.supportEnabled;
  }
  if (input.supportConditions !== undefined) data.supportConditions = strings(input.supportConditions, 'supportConditions', ['adhd', 'add', 'bipolar', 'general']);
  if (input.countryCode !== undefined) {
    if (!validCountry(input.countryCode)) throw invalid('Select a country');
    if (existing.ageGroup !== 'adult' && existing.countryCode && existing.countryCode !== input.countryCode) throw invalid('A parent or support review is needed to correct the country for a minor.');
    data.countryCode = input.countryCode;
  }
  if (input.preferences !== undefined) {
    if (!input.preferences || typeof input.preferences !== 'object' || Array.isArray(input.preferences)) throw invalid('Invalid preferences');
    const p = input.preferences;
    for (const key of preferenceBooleans) {
      if (p[key] !== undefined) {
        if (typeof p[key] !== 'boolean') throw invalid(`Invalid ${key}`);
        data.preferences[key] = p[key];
      }
    }
    for (const [key, allowed] of Object.entries(preferenceChoices)) {
      if (p[key] !== undefined) data.preferences[key] = select(p[key], allowed, key);
    }
    for (const key of ['goals', 'focusAreas']) {
      if (p[key] !== undefined) data.preferences[key] = strings(p[key], key);
    }
    if (p.ttsVoice !== undefined) {
      if (p.ttsVoice !== null && (typeof p.ttsVoice !== 'string' || p.ttsVoice.length > 150)) throw invalid('Invalid voice');
      data.preferences.ttsVoice = p.ttsVoice;
    }
  }
  if (input.goals !== undefined) data.preferences.goals = strings(input.goals, 'goals');
  if (!data.supportEnabled) { data.supportConditions = []; data.usageMode = 'standard'; }
  else data.usageMode = 'support';
  // An ambiguous teen age is never presumed above the regional consent age.
  if (data.ageGroup === 'child') data.ageBand = 'under13';
  if (data.ageGroup === 'adult') data.ageBand = 'adult';
  if (data.ageGroup === 'teen' && !['13to15', '16to17'].includes(data.ageBand)) delete data.ageBand;
  if (data.ageGroup !== 'adult') {
    data.preferences.optionalInlineAds = false;
    data.preferences.communityTeenSafety = true;
    data.preferences.analyticsOptIn = false;
  }
  if (data.ageGroup === 'child') {
    data.preferences.communityOptIn = false;
    data.preferences.communityVisibility = 'buddies';
    data.preferences.ttsMode = 'device';
  }
  return data;
}
function publicProfile(row) {
  return row ? { ...row.data, version: row.version, onboardingCompleted: Boolean(row.completedAt), updatedAt: row.updatedAt } : null;
}
function registerProfileRoutes(app, { prisma, requireAuth }) {
  app.get('/api/me/preferences', requireAuth, async (req, res) => {
    try {
      res.json({ profile: publicProfile(await prisma.userProfile.findUnique({ where: { userId: req.auth.userId } })) });
    } catch (_) { res.status(503).json({ error: 'Preferences temporarily unavailable' }); }
  });
  app.put('/api/me/preferences', requireAuth, async (req, res) => {
    try {
      const current = await prisma.userProfile.findUnique({ where: { userId: req.auth.userId } });
      if (req.body.version !== (current?.version || 0)) return res.status(409).json({ error: 'Preferences changed on another device. Reload and try again.' });
      const data = sanitizeProfile(req.body.profile, current?.data);
      // Child setup is completed by the parent-consent workflow, never by a
      // boolean sent from the child app. No sensitive child answers are saved here.
      if (data.ageGroup === 'child' || (data.ageGroup === 'teen' && requiresParent(data.ageBand, data.countryCode))) return res.status(403).json({ error: 'A verified parent must manage this profile for this age and region', code: 'PARENT_REQUIRED' });
      const complete = req.body.complete === true;
      if (complete && !data.ageGroup) throw invalid('Select an age group');
      const saved = await prisma.$transaction(async tx => {
        if (!current) return tx.userProfile.create({ data: { userId: req.auth.userId, data, completedAt: complete ? new Date() : null } });
        const changed = await tx.userProfile.updateMany({ where: { userId: req.auth.userId, version: req.body.version }, data: {
          data, version: { increment: 1 }, ...(complete && !current.completedAt ? { completedAt: new Date() } : {}),
        } });
        if (!changed.count) throw Object.assign(new Error('Preferences changed. Reload and try again.'), { status: 409 });
        return tx.userProfile.findUnique({ where: { userId: req.auth.userId } });
      });
      res.json({ profile: publicProfile(saved) });
    } catch (error) {
      const status = error.code === 'P2002' ? 409 : error.status || 503;
      res.status(status).json({ error: error.status ? error.message : 'Could not save preferences. Please retry.' });
    }
  });
}
module.exports = { sanitizeProfile, publicProfile, registerProfileRoutes };
