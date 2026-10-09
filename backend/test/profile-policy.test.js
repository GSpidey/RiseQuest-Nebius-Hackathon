const { sanitizeProfile } = require('../src/profilePolicy');
const { providerAllowed, preferencesContext, loadCoachingContext, safePersonality, curatedReply } = require('../src/services/coachingContext');
test('rejects privileged fields, preserves opt-out and supports clearing answers', () => {
  const saved = sanitizeProfile({ ageGroup: 'adult', supportEnabled: false, supportConditions: ['adhd'], role: 'SUPERADMIN', subscription: { tier: 'pro' }, preferences: { analyticsOptIn: false, goals: [] } });
  expect(saved.role).toBeUndefined(); expect(saved.subscription).toBeUndefined();
  expect(saved.supportConditions).toEqual([]); expect(saved.preferences.goals).toEqual([]);
  expect(saved.preferences.analyticsOptIn).toBe(false);
});
test.each([null, [], { ageGroup: 'admin' }, { preferences: { analyticsOptIn: 'false' } }, { supportConditions: ['unrecognized'] }, { goals: [123] }])('invalid profile is rejected: %j', value => {
  expect(() => sanitizeProfile(value)).toThrow();
});
test('partial preference edits preserve other answers', () => {
  expect(sanitizeProfile({ preferences: { reducedSensory: true } }, { ageGroup: 'adult', preferences: { goals: ['sleep'], analyticsOptIn: false } }).preferences).toEqual({ reducedSensory: true, goals: ['sleep'], analyticsOptIn: false });
});
test('a client cannot age-up a child to bypass safeguards', () => {
  expect(() => sanitizeProfile({ ageBand: '16to17' }, { ageGroup: 'teen', ageBand: '13to15' })).toThrow();
  expect(() => sanitizeProfile({ ageGroup: 'adult' }, { ageGroup: 'child' })).toThrow();
  const child = sanitizeProfile({ ageGroup: 'child', ageBand: 'adult', preferences: { ttsMode: 'cloud', communityOptIn: true, analyticsOptIn: true } });
  expect(child.ageBand).toBe('under13'); expect(child.preferences.ttsMode).toBe('device'); expect(child.preferences.communityOptIn).toBe(false);
});
test.each([null, {}, { ageGroup: 'child' }, { ageGroup: 'teen' }, { ageGroup: 'teen', ageBand: '13to15' }])('no external AI for child/unknown consent age: %j', profile => {
  expect(providerAllowed(profile)).toBe(false);
});
test('age-eligible context translates accommodations and excludes identity/condition labels', () => {
  const context = preferencesContext({ ageGroup: 'adult', email: 'private@example.invalid', supportEnabled: true, supportConditions: ['adhd', 'bipolar'], preferences: { goals: ['focus'] } });
  expect(context.support).toHaveLength(2);
  expect(JSON.stringify(context)).not.toMatch(/private@|adhd|bipolar/);
});
test('data-minimization omits support details and activity', async () => {
  const prisma = { userProfile: { findUnique: jest.fn().mockResolvedValue({ data: { ageGroup: 'adult', preferences: { dataMinimization: true }, supportEnabled: true, supportConditions: ['adhd'] } }) } };
  const result = await loadCoachingContext(prisma, 'owner', { activity: true });
  expect(result.context.support).toBeUndefined(); expect(result.context.recordedActivity).toBeUndefined();
});
test('teen tone stays respectful and curated guidance makes no invented claims', () => {
  expect(safePersonality({ ageGroup: 'teen' }, 'rude')).toBe('gentle');
  expect(curatedReply('help me focus')).toContain('Curated');
  expect(curatedReply('help')).not.toMatch(/improved|changed|8%/);
  expect(curatedReply('hurt myself')).toContain('emergency');
});
