const { canRegister, requiresParent, validCountry, COUNTRIES } = require('../src/agePolicy');
const { providerAllowed } = require('../src/services/coachingContext');
const { adPolicy } = require('../src/adPolicy');
test('region inventory has 249 distinct ISO entries', () => {
  expect(COUNTRIES).toHaveLength(249); expect(new Set(COUNTRIES.map(c => c.code)).size).toBe(249);
  expect(validCountry('ZZ')).toBe(false);
});
test.each(['US', 'GB', 'DE', 'IN', undefined])('under-13 always needs a parent in %s', country => {
  expect(requiresParent('under13', country)).toBe(true); expect(canRegister('under13', country)).toBe(false);
});
test('neutral age bands use conservative regional thresholds', () => {
  expect(canRegister('13to15', 'US')).toBe(true);
  expect(canRegister('13to15', 'DE')).toBe(false);
  expect(canRegister('16to17', 'DE')).toBe(true);
  expect(canRegister('16to17', 'IN')).toBe(false);
  expect(canRegister('adult', 'IN')).toBe(true);
  expect(canRegister('adult', null)).toBe(false);
});
test('unknown country and parent-managed teens never reach external AI', () => {
  const teen = { ageBand: '16to17', ageGroup: 'teen' };
  expect(providerAllowed(teen)).toBe(false);
  expect(providerAllowed({ ...teen, countryCode: 'IN' })).toBe(false);
  expect(providerAllowed({ ...teen, countryCode: 'US' })).toBe(true);
  expect(providerAllowed({ ...teen, countryCode: 'US', managedByParent: true })).toBe(false);
});
test('below-threshold independent profiles cannot request ads without parent approval', () => {
  expect(adPolicy({ completedAt: new Date(), data: { ageBand: '13to15', countryCode: 'DE' } }, []).eligible).toBe(false);
  const policy = adPolicy({ completedAt: new Date(), data: { ageBand: '13to15', countryCode: 'US' } }, []);
  expect(policy.eligible).toBe(true); expect(policy.personalized).toBe(false); expect(policy.networks).toEqual(['google']);
});
