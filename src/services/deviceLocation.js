import Geolocation from 'react-native-geolocation-service';
import {PermissionsAndroid, Platform} from 'react-native';
import {check, request, PERMISSIONS, RESULTS} from 'react-native-permissions';
import {createLocationClient} from './locationClient';

const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
const coarse = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
const permission = {
  async precise() {return Platform.OS !== 'android' || await PermissionsAndroid.check(fine);},
  async check() {
    if (Platform.OS === 'android') return (await PermissionsAndroid.check(fine)) || (await PermissionsAndroid.check(coarse));
    return (await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE)) === RESULTS.GRANTED;
  },
  async request() {
    if (Platform.OS === 'android') {
      // Android 12+ requires coarse and precise to be requested together.
      const result = await PermissionsAndroid.requestMultiple([coarse, fine]);
      return result[fine] === PermissionsAndroid.RESULTS.GRANTED || result[coarse] === PermissionsAndroid.RESULTS.GRANTED;
    }
    return (await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE)) === RESULTS.GRANTED;
  },
};
export const deviceLocation = createLocationClient({native: Geolocation, permission, platform: Platform.OS});
