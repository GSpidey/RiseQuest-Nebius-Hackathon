import { Platform, Linking } from 'react-native';
import { getBackendBaseUrl } from './backendConfig';

export const APPLE_STANDARD_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export async function legalUrl(page) {
  if (page === 'eula' && Platform.OS === 'ios') return APPLE_STANDARD_EULA;
  return `${await getBackendBaseUrl()}/legal/${page === 'eula' ? 'terms' : page}`;
}
export async function openLegalPage(page) {
  return Linking.openURL(await legalUrl(page));
}
