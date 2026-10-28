import {deviceLocation} from '../services/deviceLocation';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LocationService = {
  async requestLocationPermission() {
    try { return await deviceLocation.authorize(true); } catch (_) { return false; }
  },

  async getCurrentLocation() {
    try {
      const position = await deviceLocation.current({requestPermission: true});
      return {...position.coords, address: {name: 'Current Location'}, timestamp: Date.now()};
    } catch (error) {
      console.warn('Location fetch failed', error);
      return {error: 'Location unavailable. Check permission and try again.'};
    }
  },

  async saveLocationProfile(name, location) {
    try {
      const profiles = await this.getLocationProfiles();
      const newProfile = {
        id: Date.now().toString(),
        name,
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
        createdAt: Date.now(),
      };

      profiles.push(newProfile);
      await AsyncStorage.setItem('locationProfiles', JSON.stringify(profiles));
      return newProfile;
    } catch (error) {
      console.error('Save location profile error:', error);
      throw error;
    }
  },

  async getLocationProfiles() {
    try {
      const profiles = await AsyncStorage.getItem('locationProfiles');
      return profiles ? JSON.parse(profiles) : [];
    } catch (error) {
      console.error('Get location profiles error:', error);
      return [];
    }
  },

  async deleteLocationProfile(id) {
    try {
      const profiles = await this.getLocationProfiles();
      const filteredProfiles = profiles.filter(profile => profile.id !== id);
      await AsyncStorage.setItem('locationProfiles', JSON.stringify(filteredProfiles));
    } catch (error) {
      console.error('Delete location profile error:', error);
      throw error;
    }
  },

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
  },

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  },

  async checkLocationContext(targetLocation, radiusKm = 1) {
    try {
      const currentLocation = await this.getCurrentLocation();
      if (currentLocation.error) {
        return { inRange: false, error: currentLocation.error };
      }

      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        targetLocation.latitude,
        targetLocation.longitude
      );

      return {
        inRange: distance <= radiusKm,
        distance: distance,
        currentLocation: currentLocation,
        targetLocation: targetLocation,
      };
    } catch (error) {
      console.error('Location context check error:', error);
      return { inRange: false, error: 'Location check failed' };
    }
  },

  getLocationBasedAlarmSettings(context) {
    if (!context.inRange) {
      return {
        volumeMultiplier: 1.5, // Louder when away from home
        snoozeLimits: 2, // Fewer snoozes when traveling
        challengeDifficulty: 'hard', // Harder challenges when not at home
        message: `🌍 You're away from your usual location! Time to wake up and explore!`,
      };
    }

    return {
      volumeMultiplier: 1.0, // Normal volume at familiar location
      snoozeLimits: 3, // Standard snoozes at home
      challengeDifficulty: 'normal', // Normal difficulty at home
      message: `🏠 Good morning at home! Ready to start your day?`,
    };
  },

  async getLocationProfiles() {
    try {
      const profiles = await AsyncStorage.getItem('locationProfiles');
      return profiles ? JSON.parse(profiles) : [
        {
          id: 'default-home',
          name: '🏠 Home',
          latitude: null,
          longitude: null,
          address: { name: 'Set your home location' },
          isDefault: true,
        },
        {
          id: 'default-work',
          name: '🏢 Work',
          latitude: null,
          longitude: null,
          address: { name: 'Set your work location' },
          isDefault: true,
        },
        {
          id: 'default-travel',
          name: '✈️ Travel Mode',
          latitude: null,
          longitude: null,
          address: { name: 'Use current location when traveling' },
          isDefault: true,
        },
      ];
    } catch (error) {
      console.error('Get location profiles error:', error);
      return [];
    }
  },

  getLocationEmoji(locationName) {
    const emojiMap = {
      home: '🏠',
      work: '🏢',
      office: '🏢',
      hotel: '🏨',
      travel: '✈️',
      gym: '💪',
      school: '🎓',
      university: '🎓',
      hospital: '🏥',
      airport: '✈️',
      mall: '🛒',
      restaurant: '🍽️',
      cafe: '☕',
      park: '🌳',
      beach: '🏖️',
      mountain: '⛰️',
    };

    const lowercaseName = locationName.toLowerCase();
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (lowercaseName.includes(key)) {
        return emoji;
      }
    }
    return '📍';
  },

  formatLocationName(address) {
    if (!address || typeof address !== 'object') {
      return 'Unknown Location';
    }

    if (address.name && address.name !== 'Set your home location' && address.name !== 'Set your work location') {
      return address.name;
    }

    const parts = [];
    if (address.streetNumber && address.street) {
      parts.push(`${address.streetNumber} ${address.street}`);
    } else if (address.street) {
      parts.push(address.street);
    }
    
    if (address.district || address.subregion) {
      parts.push(address.district || address.subregion);
    }
    
    if (address.city) {
      parts.push(address.city);
    }

    return parts.length > 0 ? parts.join(', ') : 'Current Location';
  },
};
