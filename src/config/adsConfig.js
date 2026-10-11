// Public ad identifiers, not credentials. Production uses RiseQuest's real
// units; development and non-RN test environments retain Google's test units.
// Consent, age, Premium and placement gates apply to both configurations.
export const ADS_USE_TEST_UNITS = typeof __DEV__ === 'undefined' || __DEV__;
export const GOOGLE_AD_UNITS = Object.freeze({
  android: {
    banner: 'ca-app-pub-1287816657887096/9493760872',
    native: 'ca-app-pub-1287816657887096/2809856466',
    interstitial: 'ca-app-pub-1287816657887096/2153987594',
  },
  ios: {
    banner: 'ca-app-pub-1287816657887096/9882531277',
    native: 'ca-app-pub-1287816657887096/1795234252',
    interstitial: 'ca-app-pub-1287816657887096/9377871495',
  },
});
