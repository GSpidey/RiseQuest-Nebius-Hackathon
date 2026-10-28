import ModalHeading from './ModalHeading';
import Modal, { AppAlert as Alert } from './AppModal';
import KeyboardSurface from './KeyboardSurface';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { sunrise } from './SunriseUI';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, TextInput, Dimensions, Platform } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { GoogleLocationService } from '../services/GoogleLocationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../config/backendConfig';
import RNCalendarEvents from 'react-native-calendar-events';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const hashSeed = (str) => {
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
};

const pickDaily = (items, seed, max = 3) => {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  if (arr.length <= max) return arr;
  let h = hashSeed(seed);
  const out = [];
  const used = new Set();
  while (out.length < max && used.size < arr.length) {
    const idx = h % arr.length;
    if (!used.has(idx)) {
      used.add(idx);
      out.push(arr[idx]);
    }
    h = (h * 1103515245 + 12345) >>> 0;
  }
  return out;
};

const { width } = Dimensions.get('window');

/**
 * Location & Smart Features Component
 * Location-aware alarms, travel mode, and smart recommendations
 */
export const LocationSmartFeatures = ({ userProfile, onUpdateProfile, alarms, onUpdateAlarms, onNavigate }) => {
  const [locationProfiles, setLocationProfiles] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [lastFixAt, setLastFixAt] = useState(null);
  const lastSuccessRef=useRef(0), requestRef=useRef(0), aliveRef=useRef(true);
  const [clock,setClock]=useState(Date.now());
  useEffect(()=>{aliveRef.current=true;const tick=setInterval(()=>setClock(Date.now()),30000);return()=>{aliveRef.current=false;requestRef.current++;clearInterval(tick);};},[]);
  const [recentLocationEvents, setRecentLocationEvents] = useState([]);
  const [detectedProfile, setDetectedProfile] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showTravelModal, setShowTravelModal] = useState(false);
  const [newLocationForm, setNewLocationForm] = useState({
    name: '',
    address: '',
    type: 'home',
    adjustments: {
      timeOffset: 0,
      volumeAdjustment: 0,
      brightnessAdjustment: 0,
    },
  });
  const [travelMode, setTravelMode] = useState({
    enabled: false,
    destination: '',
    timeZone: '',
    arrivalDate: '',
  });
  const [smartRecommendations, setSmartRecommendations] = useState([]);
  const [recommendationsStatus, setRecommendationsStatus] = useState('idle'); // idle | loading | ready

  const watchIdRef = useRef(null);
  const watchGeneration = useRef(0);
  const lastGeocodeRef = useRef({ at: 0, latitude: null, longitude: null });
  const lastRecsRef = useRef({ at: 0, key: '' });

  const locationTypes = [
    { id: 'home', name: 'Home', icon: '🏠', description: 'Your primary residence' },
    { id: 'work', name: 'Work', icon: '🏢', description: 'Office or workplace' },
    { id: 'hotel', name: 'Hotel', icon: '🏨', description: 'Temporary accommodation' },
    { id: 'family', name: 'Family', icon: '👨‍👩‍👧‍👦', description: 'Family or friends house' },
    { id: 'vacation', name: 'Vacation', icon: '🏖️', description: 'Vacation or leisure location' },
    { id: 'other', name: 'Other', icon: '📍', description: 'Custom location' },
  ];

  useEffect(() => {
    loadLocationProfiles();
    getCurrentLocation();
    loadLastKnownLocation();
    loadRecentLocationEvents();

    // Ensure the user sees something immediately.
    setTimeout(() => {
      generateSmartRecommendations().catch(() => {});
    }, 0);
  }, []);

  useEffect(() => {
    // Start/stop live tracking
    if (trackingEnabled) {
      startLiveTracking();
    } else {
      stopLiveTracking();
    }

    return () => {
      stopLiveTracking();
    };
  }, [trackingEnabled]);

  useEffect(() => {
    // If the currently stored profile no longer exists, clear it so it doesn't look hardcoded.
    const activeId = userProfile?.currentLocationProfile?.id;
    if (!activeId) return;
    const exists = locationProfiles.some((p) => p?.id === activeId);
    if (exists) return;
    if (typeof onUpdateProfile === 'function') {
      onUpdateProfile({ ...userProfile, currentLocationProfile: null });
    }
  }, [locationProfiles]);

  useEffect(() => {
    if (!currentLocation) return;
    maybeGenerateSmartRecommendations();
  }, [currentLocation]);

  useEffect(() => {
    if (currentLocation && locationProfiles.length > 0) {
      detectCurrentLocationProfile();
    }
  }, [currentLocation, locationProfiles]);

  const checkLocationPermissions = async () => {
    try {
      const granted = await GoogleLocationService.initialize();
      if (!granted) {
        Alert.alert(
          'Location Permission',
          'Location permission is needed for location-aware alarms.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Settings', onPress: () => GoogleLocationService.initialize() }
          ]
        );
      }
    } catch (error) {
      console.error('Error checking location permissions:', error);
    }
  };

  const getCurrentLocation = async () => {
    if(locationBusy)return;
    const requestedAt=Date.now(), request=++requestRef.current;
    let timedOut=false;
    const watchdog=setTimeout(()=>{if(!aliveRef.current||request!==requestRef.current)return;timedOut=true;setLocationBusy(false);if(lastSuccessRef.current<requestedAt)setLocationError('No location fix yet. In flight mode or indoors, a signal may be unavailable. Try again when you have a clearer signal.');},25000);
    setLocationBusy(true);
    setLocationError(null);
    try {
      const location = await GoogleLocationService.getCurrentLocation({requestPermission:true,onCoordinates:fix=>{if(!aliveRef.current||request!==requestRef.current||timedOut)return;setLocationBusy(false);lastSuccessRef.current=Date.now();setCurrentLocation({coords:{latitude:fix.latitude,longitude:fix.longitude},accuracy:fix.accuracy,address:null});setLastFixAt(fix.timestamp);setLocationError(null);void AsyncStorage.setItem('risequest_last_location_fix',JSON.stringify({coords:{latitude:fix.latitude,longitude:fix.longitude},accuracy:fix.accuracy,address:null,at:fix.timestamp})).catch(()=>{});}});
      if(!aliveRef.current||request!==requestRef.current||timedOut)return;
      if (location?.error) {
        throw new Error(location.error);
      }

      const address = location?.address || {};
      const nextCurrent = {
        coords: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        accuracy: location.accuracy,
        address: {
          streetNumber: '',
          street: address.formatted_address || '',
          city: address.locality || '',
          region: address.administrative_area_level_1 || '',
          postalCode: address.postal_code || '', attribution: address.attribution || null,
        },
      };

      if(lastSuccessRef.current<=requestedAt||!lastSuccessRef.current){setCurrentLocation(nextCurrent);setLastFixAt(location.timestamp||Date.now());}
      else setCurrentLocation(prev=>prev&&Math.abs(prev.coords.latitude-nextCurrent.coords.latitude)<.002&&Math.abs(prev.coords.longitude-nextCurrent.coords.longitude)<.002?{...prev,address:nextCurrent.address}:prev);
      try {
        await AsyncStorage.setItem(
          'risequest_last_location_fix',
          JSON.stringify({
            coords: nextCurrent.coords,
            accuracy: nextCurrent.accuracy,
            address: nextCurrent.address,
            at: location.timestamp || Date.now(),
          })
        );
      } catch (_) {
        // ignore
      }

    } catch (error) {
      console.error('Error getting current location:', error);
      if(aliveRef.current&&request===requestRef.current&&lastSuccessRef.current<requestedAt)setLocationError('No location fix yet. Check location permission and try again when you have a clearer signal. Flight mode can affect availability.');
    }
    finally {
      clearTimeout(watchdog);
      if(aliveRef.current&&request===requestRef.current)setLocationBusy(false);
    }
  };

  const loadLastKnownLocation = async () => {
    try {
      const raw = await AsyncStorage.getItem('risequest_last_location_fix');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Number.isFinite(parsed?.coords?.latitude) || !Number.isFinite(parsed?.coords?.longitude) || Date.now()-parsed.at>24*3600000) return;

      setCurrentLocation((prev) => {
        if (Number.isFinite(prev?.coords?.latitude) && Number.isFinite(prev?.coords?.longitude)) return prev;
        return {
          coords: parsed.coords,
          accuracy: parsed.accuracy,
          address: parsed.address || null,
        };
      });
      if (!lastSuccessRef.current && typeof parsed?.at === 'number') {
        setLastFixAt(parsed.at);
      }
    } catch (_) {
      // ignore
    }
  };

  const startLiveTracking = async () => {
    stopLiveTracking();
    const generation = watchGeneration.current;
    try {
      const granted = await GoogleLocationService.initialize();
      if (!granted || generation !== watchGeneration.current) return;
      setLocationError(null);

      const watchId = await GoogleLocationService.watchLocation(
        async (position) => {
          if (generation !== watchGeneration.current) return;
          const coords = position?.coords;
          const latitude = coords?.latitude;
          const longitude = coords?.longitude;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

          const accuracy = coords?.accuracy;
          const at = Date.now();
          lastSuccessRef.current=at;
          setLastFixAt(at);
          setLocationError(null);

          setCurrentLocation((prev) => ({
            coords: { latitude, longitude },
            accuracy: accuracy ?? prev?.accuracy ?? null,
            address: prev?.coords&&calculateDistance(latitude,longitude,prev.coords.latitude,prev.coords.longitude)<.25 ? prev.address : null,
          }));

          try {
            await AsyncStorage.setItem(
              'risequest_last_location_fix',
              JSON.stringify({
                coords: { latitude, longitude },
                accuracy: accuracy ?? null,
                address: null,
                at,
              })
            );
          } catch (_) {
            // ignore
          }

          // Lightweight geocode throttling: every 5 minutes or after moving ~250m.
          const last = lastGeocodeRef.current || { at: 0, latitude: null, longitude: null };
          const movedKm =
            Number.isFinite(last.latitude) && Number.isFinite(last.longitude)
              ? calculateDistance(latitude, longitude, last.latitude, last.longitude)
              : Infinity;
          const shouldGeocode = movedKm > 0.25 || at - (last.at || 0) > 5 * 60 * 1000;
          if (!shouldGeocode) return;

          lastGeocodeRef.current = { at, latitude, longitude };
          const address = await GoogleLocationService.reverseGeocode(latitude, longitude);
          if (!address || generation !== watchGeneration.current) return;
          setCurrentLocation((prev) => {
            if (!prev?.coords || Math.abs(prev.coords.latitude-latitude)>.002 || Math.abs(prev.coords.longitude-longitude)>.002) return prev;
            return {
              ...prev,
              address: {
                streetNumber: '',
                street: address.formatted_address || '',
                city: address.locality || '',
                region: address.administrative_area_level_1 || '',
                postalCode: address.postal_code || '', attribution: address.attribution || null,
              },
            };
          });
        },
        (error) => {
          if (generation !== watchGeneration.current) return;
          const msg = 'Live location unavailable. Check permission and try again.';
          if(Date.now()-lastSuccessRef.current>120000)setLocationError(msg);
        }
      );
      if (generation !== watchGeneration.current) GoogleLocationService.clearWatchLocation(watchId);
      else watchIdRef.current = watchId;
    } catch (e) {
      setLocationError(e?.message ? String(e.message) : 'Live location unavailable');
    }
  };

  const stopLiveTracking = () => {
    watchGeneration.current += 1;
    const id = watchIdRef.current;
    watchIdRef.current = null;
    if (id != null) {
      GoogleLocationService.clearWatchLocation(id);
      GoogleLocationService.stopObserving();
    }
  };

  const loadLocationProfiles = async () => {
    try {
      const profiles = await AsyncStorage.getItem('locationProfiles');
      if (profiles) {
        setLocationProfiles(JSON.parse(profiles));
      } else {
        // Create default home profile
        const defaultProfile = {
          id: 'home_default',
          name: 'Home',
          type: 'home',
          address: 'Current Location',
          coordinates: null,
          adjustments: {
            timeOffset: 0,
            volumeAdjustment: 0,
            brightnessAdjustment: 0,
          },
          isDefault: true,
        };
        setLocationProfiles([defaultProfile]);
        await AsyncStorage.setItem('locationProfiles', JSON.stringify([defaultProfile]));
      }
    } catch (error) {
      console.error('Error loading location profiles:', error);
    }
  };

  const detectCurrentLocationProfile = () => {
    if (!currentLocation?.coords || locationProfiles.length === 0) return;

    const candidates = locationProfiles
      .filter((p) => p?.coordinates?.latitude != null && p?.coordinates?.longitude != null)
      .map((p) => {
        const distanceKm = calculateDistance(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
          p.coordinates.latitude,
          p.coordinates.longitude
        );
        return { profile: p, distanceKm };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const nearest = candidates[0] || null;
    if (!nearest) {
      setDetectedProfile(null);
      return;
    }

    const accuracyM = typeof currentLocation?.accuracy === 'number' ? currentLocation.accuracy : null;
    const radiusFromAccuracyKm = accuracyM != null ? Math.min(2, Math.max(0.35, (accuracyM / 1000) * 4)) : 0.5;
    const matchRadiusKm = radiusFromAccuracyKm;

    if (nearest.distanceKm <= matchRadiusKm) {
      const nextProfile = nearest.profile;
      setDetectedProfile(nextProfile);
      if (nextProfile?.id && nextProfile.id !== userProfile?.currentLocationProfile?.id) {
        updateCurrentLocationProfile(nextProfile);
      }
    } else {
      setDetectedProfile(null);
    }
  };

  const loadRecentLocationEvents = async () => {
    try {
      const raw = await AsyncStorage.getItem('risequest_location_events');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setRecentLocationEvents(parsed.slice(0, 8));
      }
    } catch (_) {
      // ignore
    }
  };

  const pushRecentLocationEvent = async (profile) => {
    try {
      const evt = {
        id: `${Date.now()}_${String(profile?.id || 'profile')}`,
        name: String(profile?.name || 'Location'),
        type: String(profile?.type || 'other'),
        at: Date.now(),
      };
      setRecentLocationEvents((prev) => {
        const next = [evt, ...(Array.isArray(prev) ? prev : [])].slice(0, 8);
        AsyncStorage.setItem('risequest_location_events', JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch (_) {
      // ignore
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
  };

  const updateCurrentLocationProfile = (profile, { silent = false } = {}) => {
    const updatedProfile = {
      ...userProfile,
      currentLocationProfile: profile,
    };
    if (typeof onUpdateProfile === 'function') {
      onUpdateProfile(updatedProfile);
    }

    pushRecentLocationEvent(profile);


  };

  const distanceToProfileKm = (profile) => {
    if (!currentLocation?.coords || !profile?.coordinates) return null;
    const { latitude, longitude } = currentLocation.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (!Number.isFinite(profile.coordinates.latitude) || !Number.isFinite(profile.coordinates.longitude)) return null;
    return calculateDistance(latitude, longitude, profile.coordinates.latitude, profile.coordinates.longitude);
  };

  const formatDistance = (km) => {
    if (km == null || !Number.isFinite(km)) return null;
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  const formatTimeShort = (t) => {
    try {
      if (!t) return null;
      const d = new Date(t);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  const setProfileToCurrentLocation = (profile) => {
    if (!Number.isFinite(currentLocation?.coords?.latitude) || !Number.isFinite(currentLocation?.coords?.longitude)) {
      Alert.alert('Location', 'Get your current location first.');
      return;
    }

    Alert.alert(
      'Set profile location',
      `Set “${profile.name}” to your current GPS position?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set here',
          onPress: async () => {
            const updated = locationProfiles.map((p) => {
              if (p.id !== profile.id) return p;
              return {
                ...p,
                coordinates: {
                  latitude: currentLocation.coords.latitude,
                  longitude: currentLocation.coords.longitude,
                },
                address: currentLocation?.address?.street || p.address,
              };
            });

            setLocationProfiles(updated);
            try {
              await AsyncStorage.setItem('locationProfiles', JSON.stringify(updated));
            } catch (_) {
              // ignore
            }

            // If this profile is active, refresh it in user profile so the UI stays consistent.
            if (userProfile?.currentLocationProfile?.id === profile.id) {
              const next = updated.find((p) => p.id === profile.id);
              if (next) updateCurrentLocationProfile(next, { silent: true });
            }
          },
        },
      ]
    );
  };

  const maybeGenerateSmartRecommendations = async () => {
    const lat = currentLocation?.coords?.latitude;
    const lon = currentLocation?.coords?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const key = `${Math.round(lat * 1000) / 1000},${Math.round(lon * 1000) / 1000}`;
    const now = Date.now();
    const last = lastRecsRef.current || { at: 0, key: '' };
    if (last.key === key && now - last.at < 60 * 1000) return;
    lastRecsRef.current = { at: now, key };
    await generateSmartRecommendations();
  };

  const isWetWeather = (description) => {
    const d = String(description || '').toLowerCase();
    return d.includes('rain') || d.includes('drizzle') || d.includes('thunderstorm') || d.includes('snow');
  };

  const formatLocalTime = (iso) => {
    try {
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return null;
      return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  const generateSmartRecommendations = async () => {
    setRecommendationsStatus('loading');
    const recommendations = [];

    // Always have at least a couple of helpful items so the screen isn't empty.
    recommendations.push({
      id: 'base_refresh',
      type: 'location',
      icon: '📡',
      title: 'Refresh your location',
      description: 'Pull a fresh GPS fix to improve profile detection and weather-based suggestions.',
      action: 'Refresh',
    });

    recommendations.push({
      id: 'base_profiles',
      type: 'location',
      icon: '🏠',
      title: 'Set up Home / Work',
      description: 'Add key locations and tap “Set here” to make RiseQuest auto-detect where you are.',
      action: 'Add',
    });

    const conditions = Array.isArray(userProfile?.supportConditions) ? userProfile.supportConditions : [];
    const has = (c) => conditions.includes(c);

    // Condition-based pool (rotates daily so it feels alive but not spammy)
    const pool = [];
    if (has('adhd')) {
      pool.push({
        id: 'cond_adhd_focus',
        type: 'habit',
        icon: '🎯',
        title: 'ADHD focus boost',
        description: 'Try a 10–15 minute focus sprint after waking up. Keep the first task tiny and clear.',
        action: 'Try Today',
      });
      pool.push({
        id: 'cond_adhd_snooze',
        type: 'habit',
        icon: '⏰',
        title: 'Reduce snooze friction',
        description: 'Set a single “must wake” alarm with challenge mode on, then keep the rest gentle.',
        action: 'Review Alarms',
      });
    }

    if (has('anxiety')) {
      pool.push({
        id: 'cond_anxiety_soft',
        type: 'habit',
        icon: '🌿',
        title: 'Calmer mornings',
        description: 'Use a gentle tone + slower volume curve and a reassuring wake-up message.',
        action: 'Tune Alarm',
      });
    }

    if (has('bipolar')) {
      pool.push({
        id: 'cond_bipolar_routine',
        type: 'habit',
        icon: '🗓️',
        title: 'Consistency helps',
        description: 'Aim for a steady wake time and avoid big weekday/weekend swings when possible.',
        action: 'Plan',
      });
    }

    if (has('autism')) {
      pool.push({
        id: 'cond_autism_sensory',
        type: 'habit',
        icon: '🫧',
        title: 'Reduce sensory load',
        description: 'Keep the wake flow predictable: same tone, same steps, fewer sudden changes.',
        action: 'Simplify',
      });
    }

    const daily = pickDaily(pool, `${userProfile?.email || 'guest'}:${todayKey()}:loc`, 2);
    daily.forEach((r) => recommendations.push(r));

    // Location-driven nudges (real GPS)
    try {
      const accuracyM = typeof currentLocation?.accuracy === 'number' ? currentLocation.accuracy : null;
      if (accuracyM != null && accuracyM > 200) {
        recommendations.push({
          id: 'loc_accuracy',
          type: 'location',
          icon: '🛰️',
          title: 'Improve location accuracy',
          description: `Your GPS accuracy is about ±${Math.round(accuracyM)}m. Turn on High accuracy and refresh to get better profile detection.`,
          action: 'Refresh',
        });
      }

      const profilesNeedingSetup = locationProfiles.filter((p) => p?.isDefault && !p?.coordinates);
      if (profilesNeedingSetup.length) {
        const names = profilesNeedingSetup.slice(0, 2).map((p) => String(p?.name || 'Profile')).join(' / ');
        recommendations.push({
          id: 'loc_setup_profiles',
          type: 'location',
          icon: '📍',
          title: 'Set your key locations',
          description: `Set ${names} using “Set here” so RiseQuest can auto-detect where you are and personalize wake-ups.`,
          action: 'Set here',
        });
      }

      const active = userProfile?.currentLocationProfile;
      if (active?.adjustments && (active.adjustments.timeOffset || active.adjustments.volumeAdjustment)) {
        recommendations.push({
          id: 'loc_active_adjustments',
          type: 'location',
          icon: '⚙️',
          title: 'Active location adjustments',
          description: `${active.name} adjustments: time ${active.adjustments.timeOffset > 0 ? '+' : ''}${active.adjustments.timeOffset} min, volume ${active.adjustments.volumeAdjustment > 0 ? '+' : ''}${active.adjustments.volumeAdjustment}%`,
          action: 'Details',
        });
      }
    } catch (_) {
      // ignore
    }

    // Weather (real)
    try {
      if (currentLocation?.coords?.latitude != null && currentLocation?.coords?.longitude != null) {
        const baseUrl = await getBackendBaseUrl();
        const { latitude, longitude } = currentLocation.coords;
        const resp = await fetch(`${baseUrl}/api/weather/current?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&units=metric`);
        if (resp.ok) {
          const weather = await resp.json();
          const desc = weather?.description;
          const temp = weather?.temperature;
          const city = weather?.city;

          if (isWetWeather(desc)) {
            recommendations.push({
              id: 'weather_now',
              type: 'weather',
              icon: '🌧️',
              title: 'Wet weather right now',
              description: `${city ? `${city}: ` : ''}${desc || 'Rain'}${typeof temp === 'number' ? ` • ${temp}°C` : ''}. Consider setting an earlier alarm.`,
              action: 'Set Alarm',
            });
          }
        }
      }
    } catch (error) {
      console.warn('Weather recommendations unavailable:', error?.message || error);
    }

    // Calendar (real) — optional, requires permission
    try {
      if (Platform.OS !== 'web') {
        let perm = await RNCalendarEvents.checkPermissions();
        if (perm !== 'authorized') {
          perm = await RNCalendarEvents.requestPermissions();
        }

        if (perm === 'authorized') {
          const now = new Date();
          const tomorrowStart = new Date(now);
          tomorrowStart.setDate(now.getDate() + 1);
          tomorrowStart.setHours(0, 0, 0, 0);

          const tomorrowEnd = new Date(tomorrowStart);
          tomorrowEnd.setHours(12, 0, 0, 0);

          const events = await RNCalendarEvents.fetchAllEvents(tomorrowStart.toISOString(), tomorrowEnd.toISOString());
          const list = Array.isArray(events) ? events : [];
          const first = list
            .filter((e) => e?.startDate)
            .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];

          if (first) {
            const when = formatLocalTime(first.startDate);
            const title = String(first.title || 'Calendar event');
            const startDate = new Date(first.startDate);
            const hour = startDate.getHours();

            if (Number.isFinite(hour) && hour < 9) {
              recommendations.push({
                id: 'calendar_early',
                type: 'calendar',
                icon: '📅',
                title: 'Early event tomorrow',
                description: `${title}${when ? ` at ${when}` : ''}. Consider setting an earlier alarm.`,
                action: 'Set Alarm',
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn('Calendar recommendations unavailable:', error?.message || error);
    }

    // Persist a lightweight "last generated" marker so the list feels stable.
    try {
      await AsyncStorage.setItem('risequest_smart_recs_last', `${todayKey()}`);
    } catch (_) {
      // ignore
    }

    setSmartRecommendations(recommendations);
    setRecommendationsStatus('ready');
  };

  const LocationProfileModal = () => (
    <Modal visible={showLocationModal} animationType="slide" onRequestClose={() => setShowLocationModal(false)}>
      <SafeAreaProvider><SafeAreaView style={styles.modalContainer}><KeyboardSurface>
      <LinearGradient colors={[sunrise.background, sunrise.orangeTint]} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View style={{flex:1,paddingTop:8}}><ModalHeading compact title='📍 Add Location Profile' icon="star"/></View>
          <TouchableOpacity onPress={() => setShowLocationModal(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Location Name</Text>
            <TextInput
              style={styles.formInput}
              value={newLocationForm.name}
              onChangeText={(text) => setNewLocationForm(prev => ({ ...prev, name: text }))}
              placeholder="e.g., Home, Office, Hotel"
              placeholderTextColor={sunrise.muted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Location Type</Text>
            <View style={styles.typeGrid}>
              {locationTypes.map(type => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeOption,
                    newLocationForm.type === type.id && styles.typeOptionSelected
                  ]}
                  onPress={() => setNewLocationForm(prev => ({ ...prev, type: type.id }))}
                >
                  <Text style={styles.typeIcon}>{type.icon}</Text>
                  <Text style={styles.typeName}>{type.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Address</Text>
            <TextInput
              style={styles.formInput}
              value={newLocationForm.address}
              onChangeText={(text) => setNewLocationForm(prev => ({ ...prev, address: text }))}
              placeholder="Enter address or use current location"
              placeholderTextColor={sunrise.muted}
              multiline
            />
            <TouchableOpacity
              style={styles.currentLocationButton}
              onPress={useCurrentLocation}
            >
              <Text style={styles.currentLocationText}>📍 Use Current Location</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Alarm Adjustments</Text>
            
            <View style={styles.adjustmentItem}>
              <Text style={styles.adjustmentLabel}>Time Offset (minutes)</Text>
              <View style={styles.adjustmentControls}>
                <TouchableOpacity
                  style={styles.adjustmentButton}
                  onPress={() => adjustTimeOffset(-5)}
                >
                  <Text style={styles.adjustmentButtonText}>-5</Text>
                </TouchableOpacity>
                <Text style={styles.adjustmentValue}>
                  {newLocationForm.adjustments.timeOffset > 0 ? '+' : ''}{newLocationForm.adjustments.timeOffset}
                </Text>
                <TouchableOpacity
                  style={styles.adjustmentButton}
                  onPress={() => adjustTimeOffset(5)}
                >
                  <Text style={styles.adjustmentButtonText}>+5</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.adjustmentItem}>
              <Text style={styles.adjustmentLabel}>Volume Adjustment</Text>
              <View style={styles.adjustmentControls}>
                <TouchableOpacity
                  style={styles.adjustmentButton}
                  onPress={() => adjustVolume(-10)}
                >
                  <Text style={styles.adjustmentButtonText}>-10%</Text>
                </TouchableOpacity>
                <Text style={styles.adjustmentValue}>
                  {newLocationForm.adjustments.volumeAdjustment > 0 ? '+' : ''}{newLocationForm.adjustments.volumeAdjustment}%
                </Text>
                <TouchableOpacity
                  style={styles.adjustmentButton}
                  onPress={() => adjustVolume(10)}
                >
                  <Text style={styles.adjustmentButtonText}>+10%</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveLocationProfile}
            >
              <Text style={styles.saveButtonText}>Save Location</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
      </KeyboardSurface></SafeAreaView></SafeAreaProvider>
    </Modal>
  );

  const TravelModeModal = () => (
    <Modal visible={showTravelModal} animationType="slide" onRequestClose={() => setShowTravelModal(false)}>
      <SafeAreaProvider><SafeAreaView style={styles.modalContainer}><KeyboardSurface>
      <LinearGradient colors={[sunrise.background, sunrise.orangeTint]} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View style={{flex:1,paddingTop:8}}><ModalHeading compact title='✈️ Travel Mode Setup' icon="star"/></View>
          <TouchableOpacity onPress={() => setShowTravelModal(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Destination</Text>
            <TextInput
              style={styles.formInput}
              value={travelMode.destination}
              onChangeText={(text) => setTravelMode(prev => ({ ...prev, destination: text }))}
              placeholder="e.g., New York, London, Tokyo"
              placeholderTextColor={sunrise.muted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Time Zone</Text>
            <TextInput
              style={styles.formInput}
              value={travelMode.timeZone}
              onChangeText={(text) => setTravelMode(prev => ({ ...prev, timeZone: text }))}
              placeholder="e.g., EST, GMT+1, PST"
              placeholderTextColor={sunrise.muted}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Arrival Date</Text>
            <TextInput
              style={styles.formInput}
              value={travelMode.arrivalDate}
              onChangeText={(text) => setTravelMode(prev => ({ ...prev, arrivalDate: text }))}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={sunrise.muted}
            />
          </View>

          <View style={styles.travelFeatures}>
            <Text style={styles.featuresTitle}>Travel Features</Text>
            <View style={styles.featureItem}>
              <Text style={styles.featureText}>🕐 Automatic time zone adjustment</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureText}>✈️ Jet lag recovery recommendations</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureText}>🌍 Local weather integration</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureText}>🛏️ Hotel-friendly alarm settings</Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={enableTravelMode}
            >
              <Text style={styles.saveButtonText}>Enable Travel Mode</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
      </KeyboardSurface></SafeAreaView></SafeAreaProvider>
    </Modal>
  );

  const useCurrentLocation = async () => {
    if (currentLocation && currentLocation.address) {
      const addressString = [
        currentLocation.address.streetNumber,
        currentLocation.address.street,
        currentLocation.address.city,
        currentLocation.address.region
      ].filter(Boolean).join(', ');
      
      setNewLocationForm(prev => ({
        ...prev,
        address: addressString,
        coordinates: currentLocation.coords,
      }));
    } else {
      Alert.alert('Location Error', 'Unable to get current location. Please try again.');
    }
  };

  const adjustTimeOffset = (minutes) => {
    setNewLocationForm(prev => ({
      ...prev,
      adjustments: {
        ...prev.adjustments,
        timeOffset: Math.max(-60, Math.min(60, prev.adjustments.timeOffset + minutes))
      }
    }));
  };

  const adjustVolume = (percentage) => {
    setNewLocationForm(prev => ({
      ...prev,
      adjustments: {
        ...prev.adjustments,
        volumeAdjustment: Math.max(-50, Math.min(50, prev.adjustments.volumeAdjustment + percentage))
      }
    }));
  };

  const saveLocationProfile = async () => {
    if (!newLocationForm.name.trim()) {
      Alert.alert('Error', 'Please enter a location name');
      return;
    }

    try {
      const newProfile = {
        id: `location_${Date.now()}`,
        ...newLocationForm,
        createdAt: new Date().toISOString(),
      };

      const updatedProfiles = [...locationProfiles, newProfile];
      setLocationProfiles(updatedProfiles);
      await AsyncStorage.setItem('locationProfiles', JSON.stringify(updatedProfiles));
      
      setShowLocationModal(false);
      setNewLocationForm({
        name: '',
        address: '',
        type: 'home',
        adjustments: {
          timeOffset: 0,
          volumeAdjustment: 0,
          brightnessAdjustment: 0,
        },
      });

      Alert.alert('Success', 'Location profile saved successfully!');
    } catch (error) {
      console.error('Error saving location profile:', error);
      Alert.alert('Error', 'Failed to save location profile');
    }
  };

  const enableTravelMode = () => {
    if (!travelMode.destination.trim()) {
      Alert.alert('Error', 'Please enter a destination');
      return;
    }

    const updatedTravelMode = { ...travelMode, enabled: true };
    setTravelMode(updatedTravelMode);
    setShowTravelModal(false);

    Alert.alert(
      '✈️ Travel Mode Enabled',
      `Your alarms will be adjusted for travel to ${travelMode.destination}. Jet lag recovery features are now active.`,
      [{ text: 'OK' }]
    );
  };

  const deleteLocationProfile = async (profileId) => {
    Alert.alert(
      'Delete Location',
      'Are you sure you want to delete this location profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedProfiles = locationProfiles.filter(p => p.id !== profileId);
              setLocationProfiles(updatedProfiles);
              await AsyncStorage.setItem('locationProfiles', JSON.stringify(updatedProfiles));

              // If the deleted profile was active, clear it.
              if (userProfile?.currentLocationProfile?.id === profileId && typeof onUpdateProfile === 'function') {
                onUpdateProfile({ ...userProfile, currentLocationProfile: null });
              }

              // If it was currently detected, clear that too.
              if (detectedProfile?.id === profileId) {
                setDetectedProfile(null);
              }
            } catch (error) {
              console.error('Error deleting location profile:', error);
            }
          }
        }
      ]
    );
  };

  const applyRecommendation = (recommendation) => {
    const action = String(recommendation?.action || '').trim();
    const id = String(recommendation?.id || '').trim();

    // Local actions
    if (id === 'base_refresh' || action === 'Refresh') {
      getCurrentLocation();
      return;
    }

    if (id === 'base_profiles' || action === 'Add') {
      setShowLocationModal(true);
      return;
    }

    // Navigation actions
    const nav = typeof onNavigate === 'function' ? onNavigate : null;
    if (nav) {
      if (action === 'Review Alarms' || action === 'Set Alarm' || action === 'Edit Alarm') {
        nav('alarms');
        return;
      }
      if (action === 'Tune Alarm') {
        nav('advanced-alarms');
        return;
      }
      if (action === 'Plan') {
        nav('quests');
        return;
      }
    }

    switch (recommendation.type) {
      case 'weather':
        Alert.alert(
          'Weather Insight',
          'This recommendation is based on real current weather data. Set an alarm if you need extra time.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'OK' },
          ]
        );
        break;
      case 'calendar':
        Alert.alert(
          'Calendar Insight',
          'This recommendation is based on your device calendar. Set an earlier alarm if needed.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'OK' },
          ]
        );
        break;
      case 'location':
        Alert.alert(
          'Location Insight',
          String(recommendation?.description || 'This suggestion is based on your current GPS position.'),
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Refresh location', onPress: () => getCurrentLocation() },
          ]
        );
        break;
      default:
        Alert.alert('Recommendation', String(recommendation?.description || '')); 
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[sunrise.background, sunrise.orangeTint]} style={styles.header}>
        <Text style={styles.headerTitle}>📍 Location & Smart Features</Text>
        <Text style={styles.headerSubtitle}>Location-aware alarms and intelligent recommendations</Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Current Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Current Location</Text>
          <View style={styles.locationCard}>
            <Text style={styles.locationName}>
              {currentLocation?.address?.city || currentLocation?.address?.region || 'Current Location'}
            </Text>
            <Text style={styles.locationAddress}>
              {(currentLocation?.address?.street || currentLocation?.address?.city) ? [
                currentLocation.address.street,
                currentLocation.address.city
              ].filter(Boolean).join(', ') : currentLocation?.coords ? 'Coordinates ready · place name unavailable' : locationBusy ? 'Finding your location…' : 'Tap Refresh Location to begin'}
            </Text>

            <Text style={[styles.locationMetaText, { marginBottom: 6 }]}>
              {detectedProfile?.name ? `Detected profile: ${detectedProfile.name}` : 'Detected profile: none'}
            </Text>

            <View style={styles.locationMetaRow}>
              <View style={styles.locationMetaLeft}>
                <Text style={styles.locationMetaText}>
                  {typeof currentLocation?.accuracy === 'number' ? `Accuracy ±${Math.round(currentLocation.accuracy)}m` : currentLocation?.coords ? 'Saved coordinates' : 'No coordinates yet'}
                  {lastFixAt ? ` • ${formatTimeShort(lastFixAt)}` : ''}
                </Text>
                {currentLocation?.coords ? (
                  <Text style={styles.locationMetaText}>
                    {currentLocation.coords.latitude.toFixed(5)}, {currentLocation.coords.longitude.toFixed(5)}
                  </Text>
                ) : null}
              </View>

              <View style={styles.trackingRow}>
                <Text style={styles.trackingLabel}>{!trackingEnabled?'Live updates off':lastSuccessRef.current&&clock-lastSuccessRef.current<120000?'Live location':currentLocation?.coords?'Last known location':'Waiting for a signal'}</Text>
                <Switch value={trackingEnabled} onValueChange={setTrackingEnabled} />
              </View>
            </View>

            {currentLocation?.address?.attribution&&<Text style={{fontSize:10,color:'#777'}}>{currentLocation.address.attribution}</Text>}
            {locationError ? (
              <Text style={[styles.locationAddress, { marginTop: 8, opacity: 0.9 }]}>
                {locationError}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.refreshButton}
              onPress={getCurrentLocation}
              disabled={locationBusy}
            >
              <Text style={styles.refreshButtonText}>{locationBusy ? 'Finding your location…' : '🔄 Refresh Location'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Location Profiles */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🏠 Location Profiles</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowLocationModal(true)}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {locationProfiles.map(profile => (
            <View key={profile.id} style={styles.profileCard}>
              <View style={styles.profileHeader}>
                <Text style={styles.profileIcon}>
                  {locationTypes.find(t => t.id === profile.type)?.icon || '📍'}
                </Text>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{profile.name}</Text>
                  <Text style={styles.profileType}>
                    {locationTypes.find(t => t.id === profile.type)?.name || 'Custom'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteLocationProfile(profile.id)}
                >
                  <Text style={styles.deleteButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles.profileAddress}>{profile.address}</Text>

              <View style={styles.profileMetaRow}>
                <Text style={styles.profileMetaText}>
                  {profile?.coordinates
                    ? `Distance: ${formatDistance(distanceToProfileKm(profile)) || '—'}`
                    : 'Distance: set this location'}
                </Text>
                <TouchableOpacity
                  style={styles.profileSetButton}
                  onPress={() => setProfileToCurrentLocation(profile)}
                  disabled={!currentLocation?.coords}
                >
                  <Text style={styles.profileSetButtonText}>📍 Set here</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.adjustmentSummary}>
                <Text style={styles.adjustmentText}>
                  Time: {profile.adjustments.timeOffset > 0 ? '+' : ''}{profile.adjustments.timeOffset}min
                </Text>
                <Text style={styles.adjustmentText}>
                  Volume: {profile.adjustments.volumeAdjustment > 0 ? '+' : ''}{profile.adjustments.volumeAdjustment}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Recent location activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧭 Recent Location Activity</Text>
          {recentLocationEvents.length === 0 ? (
            <Text style={styles.recommendationsEmpty}>No location activity yet. Move around with Live tracking on.</Text>
          ) : (
            recentLocationEvents.map((e) => (
              <View key={e.id} style={styles.eventRow}>
                <Text style={styles.eventText}>
                  {locationTypes.find((t) => t.id === e.type)?.icon || '📍'} {e.name}
                </Text>
                <Text style={styles.eventTime}>{formatTimeShort(e.at) || ''}</Text>
              </View>
            ))
          )}
        </View>

        {/* Travel Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✈️ Travel Mode</Text>
          <View style={styles.travelCard}>
            <View style={styles.travelHeader}>
              <View style={styles.travelInfo}>
                <Text style={styles.travelStatus}>
                  {travelMode.enabled ? 'Active' : 'Inactive'}
                </Text>
                {travelMode.enabled && (
                  <Text style={styles.travelDestination}>
                    Traveling to {travelMode.destination}
                  </Text>
                )}
              </View>
              <Switch
                value={travelMode.enabled}
                onValueChange={(value) => {
                  if (value) {
                    setShowTravelModal(true);
                  } else {
                    setTravelMode(prev => ({ ...prev, enabled: false }));
                  }
                }}
              />
            </View>
            
            {!travelMode.enabled && (
              <TouchableOpacity
                style={styles.travelSetupButton}
                onPress={() => setShowTravelModal(true)}
              >
                <Text style={styles.travelSetupText}>Set Up Travel Mode</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Smart Recommendations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 Smart Recommendations</Text>
          {recommendationsStatus === 'loading' && (
            <Text style={styles.recommendationsEmpty}>Loading recommendations…</Text>
          )}
          {recommendationsStatus !== 'loading' && smartRecommendations.length === 0 && (
            <Text style={styles.recommendationsEmpty}>
              No recommendations right now. Enable Weather and Calendar permissions to get smarter suggestions.
            </Text>
          )}
          {smartRecommendations.map(recommendation => (
            <TouchableOpacity
              key={recommendation.id}
              style={styles.recommendationCard}
              onPress={() => applyRecommendation(recommendation)}
              activeOpacity={0.9}
            >
              <Text style={styles.recommendationIcon}>{recommendation.icon}</Text>
              <View style={styles.recommendationContent}>
                <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
                <Text style={styles.recommendationDescription}>
                  {recommendation.description}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {LocationProfileModal()}
      {TravelModeModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: sunrise.background,
  },
  header: {
    padding: 20,
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  headerSubtitle: {
    fontSize: 16,
    color: sunrise.muted,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  section: {
    margin: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  addButton: {
    backgroundColor: sunrise.orangeTint,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  addButtonText: {
    color: sunrise.ink,
    fontSize: 14,
    fontWeight: '600',
  },

  // Location Card Styles
  locationCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  locationAddress: {
    fontSize: 14,
    color: sunrise.muted,
    marginTop: 4,
  },
  refreshButton: {
    backgroundColor: sunrise.background,
    padding: 10,
    borderRadius: 8,
    marginTop: 15,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#9B4B00',
    fontSize: 14,
    fontWeight: '500',
  },

  // Profile Card Styles
  profileCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  profileIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  profileInfo: {
  locationMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  locationMetaLeft: {
    flex: 1,
    paddingRight: 10,
  },
  locationMetaText: {
    fontSize: 12,
    color: sunrise.muted,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackingLabel: {
    fontSize: 12,
    color: sunrise.muted,
    marginRight: 6,
  },
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  profileType: {
    fontSize: 14,
    color: sunrise.muted,
  },
  deleteButton: {
    padding: 5,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  profileAddress: {
    fontSize: 14,
    color: sunrise.muted,
    marginBottom: 8,
  },
  adjustmentSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  adjustmentText: {
    fontSize: 12,
    color: '#999',
    backgroundColor: sunrise.background,
    paddingHorizontal: 8,
  profileMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileMetaText: {
    fontSize: 12,
    color: sunrise.muted,
    flex: 1,
    paddingRight: 10,
  },
  profileSetButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e8eaf6',
  },
  profileSetButtonText: {
    fontSize: 12,
    color: '#3f51b5',
    fontWeight: '600',
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
  },
  eventText: {
    fontSize: 14,
    color: sunrise.ink,
    fontWeight: '600',
  },
  eventTime: {
    fontSize: 12,
    color: sunrise.muted,
  },
    paddingVertical: 4,
    borderRadius: 4,
  },

  // Travel Mode Styles
  travelCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  travelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  travelInfo: {
    flex: 1,
  },
  travelStatus: {
    fontSize: 16,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  travelDestination: {
    fontSize: 14,
    color: sunrise.muted,
    marginTop: 2,
  },
  travelSetupButton: {
    backgroundColor: sunrise.background,
    padding: 12,
    borderRadius: 8,
    marginTop: 15,
    alignItems: 'center',
  },
  travelSetupText: {
    color: '#9B4B00',
    fontSize: 14,
    fontWeight: '500',
  },

  // Recommendation Styles
  recommendationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // recommendationAction styles removed (cards are tappable instead of showing buttons)
  recommendationDescription: {
    fontSize: 14,
    color: sunrise.muted,
    marginTop: 2,
  },
  recommendationsEmpty: {
    fontSize: 14,
    color: sunrise.muted,
    marginTop: 6,
    marginBottom: 10,
    lineHeight: 20,
  },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: sunrise.background },
  modalHeader: {
    backgroundColor:'#FFF0DB',borderBottomLeftRadius:26,borderBottomRightRadius:26,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: sunrise.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: sunrise.ink,
  },
  closeButton: {
    fontSize: 24,
    color: sunrise.ink,
    padding: 5,
  },
  modalContent: { flex: 1 },
  modalBody: { padding: 20, paddingBottom: 40 },
  modalActions: {
    padding: 20,
  },

  // Form Styles
  formGroup: {
    marginBottom: 25,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: sunrise.ink,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: sunrise.orangeTint,
    padding: 15,
    borderRadius: 10,
    color: sunrise.ink,
    fontSize: 16,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  typeOption: {
    width: '31%',
    backgroundColor: sunrise.background,
    padding: 12,
    borderRadius: 10,
    margin: '1%',
    alignItems: 'center',
  },
  typeOptionSelected: {
    backgroundColor: sunrise.orangeTint,
    borderWidth: 2,
    borderColor: sunrise.orange,
  },
  typeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  typeName: {
    color: sunrise.ink,
    fontSize: 12,
    textAlign: 'center',
  },
  currentLocationButton: {
    backgroundColor: sunrise.background,
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  currentLocationText: {
    color: sunrise.ink,
    fontSize: 14,
    fontWeight: '500',
  },

  // Adjustment Controls
  adjustmentItem: {
    marginBottom: 15,
  },
  adjustmentLabel: {
    color: sunrise.ink,
    fontSize: 14,
    marginBottom: 8,
  },
  adjustmentControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustmentButton: {
    backgroundColor: sunrise.orangeTint,
    padding: 10,
    borderRadius: 6,
    marginHorizontal: 10,
  },
  adjustmentButtonText: {
    color: sunrise.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  adjustmentValue: {
    color: sunrise.ink,
    fontSize: 16,
    fontWeight: 'bold',
    minWidth: 60,
    textAlign: 'center',
  },

  // Travel Features
  travelFeatures: {
    backgroundColor: sunrise.background,
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  featuresTitle: {
    color: sunrise.ink,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  featureItem: {
    marginBottom: 8,
  },
  featureText: {
    color: sunrise.muted,
    fontSize: 14,
  },

  // Save Button
  saveButton: {
    backgroundColor: sunrise.orange,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: sunrise.ink,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LocationSmartFeatures;

