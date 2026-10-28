import {fetchWithTimeout} from './fetchWithTimeout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {deviceLocation} from './deviceLocation';
import { getBackendBaseUrl } from '../config/backendConfig';

export const GoogleLocationService = {
  async initialize() {
    try { return await deviceLocation.authorize(true); } catch (_) { return false; }
  },

  async getCurrentLocation({requestPermission = false,onCoordinates} = {}) {
    try {
      const location = await deviceLocation.current({requestPermission});
      const {latitude, longitude, accuracy} = location.coords;
      onCoordinates?.({latitude,longitude,accuracy,timestamp:location.timestamp||Date.now()});
      const address = await this.reverseGeocode(latitude, longitude);
      return {latitude, longitude, accuracy, address, timestamp: location.timestamp||Date.now(), source: address ? 'device_with_place' : 'device'};
    } catch (error) {
      console.warn('Location fetch failed', error);
      return {error: error?.message || 'Location unavailable. Check permission and try again.'};
    }
  },

  async watchLocation(onPosition, onError, options = {}) {
    try { return await deviceLocation.watch(onPosition, onError, options); }
    catch (error) {onError?.(error); return null;}
  },
  clearWatchLocation(id) {try {deviceLocation.clearWatch(id);} catch (_) {}},
  stopObserving() {try {deviceLocation.stopObserving();} catch (_) {}},

  // Google Geocoding API - Convert coordinates to address
  async reverseGeocode(latitude, longitude) {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetchWithTimeout(`${baseUrl}/api/geo/reverse?lat=${latitude}&lon=${longitude}`,{},10000);
      const data = await response.json();
      if (data?.error) return null;

      return {
        formatted_address: data.formattedAddress,
        locality: data.locality,
        administrative_area_level_1: data.administrativeAreaLevel1,
        country: data.country,
        postal_code: data.postalCode,
        place_id: data.placeId,
        attribution: data.attribution,
      };
    } catch (error) {
      console.error('Google Geocoding API error:', error);
      return null;
    }
  },

  // Forward geocoding - Convert address to coordinates
  async geocodeAddress(address) {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/geo/geocode?address=${encodeURIComponent(address)}`);
      const data = await response.json();
      if (data?.error) return null;
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        formatted_address: data.formattedAddress,
        place_id: data.placeId,
      };
    } catch (error) {
      console.error('Address geocoding error:', error);
      return null;
    }
  },

  // Search for places using Google Places API
  async searchPlaces(query, location = null) {
    try {
      const baseUrl = await getBackendBaseUrl();
      let url = `${baseUrl}/api/geo/places/textsearch?query=${encodeURIComponent(query)}`;
      if (location) {
        url += `&lat=${location.latitude}&lon=${location.longitude}&radius=50000`;
      }
      const response = await fetch(url);
      const data = await response.json();
      if (data?.error) return [];
      return (data.results || []).map(place => ({
        place_id: place.placeId,
        name: place.name,
        formatted_address: place.formattedAddress,
        latitude: place.latitude,
        longitude: place.longitude,
        rating: place.rating,
        types: place.types,
      }));
    } catch (error) {
      console.error('Places search error:', error);
      return [];
    }
  },

  // Get place details
  async getPlaceDetails(placeId) {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/geo/places/details?placeId=${encodeURIComponent(placeId)}`);
      const data = await response.json();
      if (data?.error) return null;
      return data.result || null;
    } catch (error) {
      console.error('Place details error:', error);
      return null;
    }
  },

  // Get nearby places
  async getNearbyPlaces(latitude, longitude, type = 'point_of_interest', radius = 5000) {
    try {
      const baseUrl = await getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/geo/places/nearby?lat=${latitude}&lon=${longitude}&type=${encodeURIComponent(type)}&radius=${radius}`);
      const data = await response.json();
      if (data?.error) return [];
      return (data.results || []).map(place => ({
          place_id: place.placeId,
          name: place.name,
          vicinity: place.vicinity,
          latitude: place.latitude,
          longitude: place.longitude,
          rating: place.rating,
          types: place.types,
          price_level: place.priceLevel,
        }));
    } catch (error) {
      console.error('Nearby places error:', error);
      return [];
    }
  },

  // Helper function to extract address components
  getAddressComponent(components, type) {
    const component = components.find(comp => comp.types.includes(type));
    return component ? component.long_name : '';
  },

  // Save favorite locations
  async saveFavoriteLocation(name, location, placeId = null) {
    try {
      const favorites = await this.getFavoriteLocations();
      const newFavorite = {
        id: Date.now().toString(),
        name,
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address || location.formatted_address,
        place_id: placeId,
        created_at: Date.now(),
      };

      favorites.push(newFavorite);
      await AsyncStorage.setItem('favorite_locations', JSON.stringify(favorites));
      
      console.log('📍 Favorite location saved:', name);
      return newFavorite;
    } catch (error) {
      console.error('Error saving favorite location:', error);
      throw error;
    }
  },

  // Get favorite locations
  async getFavoriteLocations() {
    try {
      const favorites = await AsyncStorage.getItem('favorite_locations');
      return favorites ? JSON.parse(favorites) : [];
    } catch (error) {
      console.error('Error getting favorite locations:', error);
      return [];
    }
  },

  // Delete favorite location
  async deleteFavoriteLocation(id) {
    try {
      const favorites = await this.getFavoriteLocations();
      const updatedFavorites = favorites.filter(fav => fav.id !== id);
      await AsyncStorage.setItem('favorite_locations', JSON.stringify(updatedFavorites));
      
      console.log('🗑️ Favorite location deleted');
    } catch (error) {
      console.error('Error deleting favorite location:', error);
      throw error;
    }
  },

  // Calculate distance between two points
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  },

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  },

  // Check if user is within a specific location
  async checkLocationProximity(targetLocation, radiusKm = 1) {
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
        distance,
        currentLocation,
        targetLocation,
        distanceText: this.formatDistance(distance),
      };
    } catch (error) {
      console.error('Location proximity check error:', error);
      return { inRange: false, error: 'Location check failed' };
    }
  },

  // Format distance for display
  formatDistance(distanceKm) {
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m`;
    } else {
      return `${distanceKm.toFixed(1)}km`;
    }
  },

  // Get location-based recommendations
  async getLocationRecommendations() {
    try {
      const currentLocation = await this.getCurrentLocation();
      if (currentLocation.error) return [];

      // Get nearby points of interest
      const nearby = await this.getNearbyPlaces(
        currentLocation.latitude,
        currentLocation.longitude,
        'point_of_interest',
        10000
      );

      return nearby.slice(0, 10); // Return top 10 recommendations
    } catch (error) {
      console.error('Error getting location recommendations:', error);
      return [];
    }
  },
};

