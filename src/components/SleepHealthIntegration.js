import ModalHeading from './ModalHeading';
import Modal, { AppAlert as Alert } from './AppModal';
import { getAuthToken } from '../services/AuthTokenStorage';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Dimensions, TextInput, NativeModules, Platform } from 'react-native';
import DevicePicker from './DevicePicker';
import PushNotification from 'react-native-push-notification';
import LinearGradient from 'react-native-linear-gradient';
import { LineChart, ProgressChart } from 'react-native-chart-kit';
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { GoogleFitService } from '../services/GoogleFitService';
import { createAccountDataCache } from '../services/accountDataCache';
import { probePhoneSensor } from '../services/probePhoneSensor';

const { width } = Dimensions.get('window');

/**
 * Comprehensive Sleep & Health Integration
 * Sleep tracking, wearable integration, and health metrics
 */
export const SleepHealthIntegration = ({ userProfile, onUpdateProfile, onNavigate }) => {
  const accountCache = createAccountDataCache(AsyncStorage, userProfile);
  const [sleepData, setSleepData] = useState([]);
  const [healthMetrics, setHealthMetrics] = useState({
    consistencyScore: 0,
    weeklyImprovement: 0,
  });
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [selectedDevice,setSelectedDevice]=useState(null);
  const [settingError,setSettingError]=useState('');
  const [savingSetting,setSavingSetting]=useState(false);
  const settingLock=useRef(false);
  const [currentTab, setCurrentTab] = useState('overview');
  const [showAddSleepModal, setShowAddSleepModal] = useState(false);
  const [savingSleep, setSavingSleep] = useState(false);
  const [googleFitDebug, setGoogleFitDebug] = useState({
    lastSyncAt: null,
    lastResult: null,
  });
  const [newSleep, setNewSleep] = useState({
    date: new Date().toISOString().slice(0, 10),
    bedtime: '22:30',
    wakeTime: '07:00',
    sleepQuality: '80',
    notes: '',
  });
  const [sleepGoals, setSleepGoals] = useState({
    bedtime: '22:00',
    wakeTime: '07:00',
    targetHours: 8,
    sleepQualityGoal: 85,
  });

  const supportedDevices = [
    { id: 'health_connect', name: 'Health Connect', icon: '🌙', status: 'available' },
    { id: 'apple_watch', name: 'Apple Watch', icon: '⌚', status: 'available' },
    { id: 'fitbit', name: 'Fitbit', icon: '📱', status: 'available' },
    { id: 'garmin', name: 'Garmin', icon: '⌚', status: 'available' },
    { id: 'samsung_health', name: 'Samsung Health', icon: '📱', status: 'available' },
    { id: 'google_fit', name: 'Google Fit', icon: '📱', status: 'available' },
    { id: 'phone_sensors', name: 'Phone Sensors', icon: '📱', status: 'connected' },
  ];

  useEffect(() => {
    loadSleepData();
    loadConnectedDevices();
    const stopSensorProbe = initializePhoneSensors();

    AsyncStorage.getItem('risequest_googlefit_last_sync')
      .then((v) => setGoogleFitDebug((p) => ({ ...p, lastSyncAt: v ? String(v) : null })))
      .catch(() => {});
    AsyncStorage.getItem('risequest_googlefit_last_result')
      .then((v) => setGoogleFitDebug((p) => ({ ...p, lastResult: v ? String(v) : null })))
      .catch(() => {});
    return stopSensorProbe;
  }, []);

  const readJsonSafe = async (resp) => {
    const text = await resp.text();
    if (!text) return { json: null, text: '' };
    try {
      return { json: JSON.parse(text), text };
    } catch (_) {
      return { json: null, text };
    }
  };

  const normalizeSleepEntry = (e) => {
    const bedtimeAt = e?.bedtimeAt ? new Date(e.bedtimeAt) : null;
    const wakeAt = e?.wakeAt ? new Date(e.wakeAt) : null;
    return {
      id: e?.id ? String(e.id) : String(Date.now()),
      date: e?.dateKey ? String(e.dateKey) : (wakeAt ? wakeAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
      bedtime: bedtimeAt ? bedtimeAt.toISOString() : null,
      wakeTime: wakeAt ? wakeAt.toISOString() : null,
      sleepDuration: typeof e?.durationMinutes === 'number'
        ? Math.round((e.durationMinutes / 60) * 10) / 10
        : Number(e?.sleepDuration || 0),
      sleepQuality: String(e?.notes||'').includes('Sleep quality was not measured.') ? null : typeof e?.sleepQuality === 'number' ? e.sleepQuality : Number(e?.sleepQuality || 0),
      notes: e?.notes != null ? String(e.notes) : '',
      source: e?.source ? String(e.source) : 'manual',
    };
  };

  const computeHealthMetrics = (entries) => {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return { consistencyScore: 0, weeklyImprovement: 0 };

    const recent = list.slice(-7);
    const previous = list.slice(-14, -7);
    const avgRecent = recent.length ? recent.reduce((s, d) => s + (Number(d.sleepDuration) || 0), 0) / recent.length : 0;
    const avgPrev = previous.length ? previous.reduce((s, d) => s + (Number(d.sleepDuration) || 0), 0) / previous.length : 0;
    const weeklyImprovement = avgPrev > 0 ? Math.round(((avgRecent - avgPrev) / avgPrev) * 100) : 0;

    const consistencyScore = Math.round(calculateBedtimeConsistency(recent));
    return {
      consistencyScore: Number.isFinite(consistencyScore) ? consistencyScore : 0,
      weeklyImprovement: Number.isFinite(weeklyImprovement) ? weeklyImprovement : 0,
    };
  };

  const loadSleepData = async () => {
    const cached = await accountCache.read('sleepData', []);
    const local = Array.isArray(cached) ? cached : [];
    setSleepData(local);
    setHealthMetrics(computeHealthMetrics(local));
    try {
      // Prefer backend entries when authenticated.
      const token = await getAuthToken();
      if (token && !userProfile?.isGuest) {
        const baseUrl = await getBackendBaseUrl();
        const resp = await fetch(`${baseUrl}/api/sleep/entries?days=90`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const { json } = await readJsonSafe(resp);
        if (resp.ok && json?.success && Array.isArray(json.entries)) {
          const normalized = json.entries.map(normalizeSleepEntry);
          setSleepData(normalized);
          setHealthMetrics(computeHealthMetrics(normalized));
          await accountCache.write('sleepData', normalized);
          return;
        }
        if (resp.status === 401 || resp.status === 403) {
          setSleepData([]);
          setHealthMetrics(computeHealthMetrics([]));
        }
      }
    } catch (error) {
      console.error('Error loading sleep data:', error);
    }
  };

  const buildDateTime = (dateKey, hhmm) => {
    const d = String(dateKey || '').trim();
    const t = String(hhmm || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    if (!/^\d{2}:\d{2}$/.test(t)) return null;
    const iso = `${d}T${t}:00.000Z`;
    const dt = new Date(iso);
    if (!Number.isFinite(dt.getTime())) return null;
    return dt;
  };

  const addSleepLog = async () => {
    if (savingSleep) return;
    try {
      setSavingSleep(true);

      const bedtimeAt = buildDateTime(newSleep.date, newSleep.bedtime);
      let wakeAt = buildDateTime(newSleep.date, newSleep.wakeTime);
      if (!bedtimeAt || !wakeAt) {
        Alert.alert('Sleep Log', 'Please enter valid date/time values (YYYY-MM-DD, HH:MM).');
        return;
      }

      // If wake time is earlier than bedtime, assume it is next day.
      if (wakeAt <= bedtimeAt) {
        wakeAt = new Date(wakeAt.getTime() + 24 * 60 * 60 * 1000);
      }

      const durationMinutes = Math.max(1, Math.round((wakeAt.getTime() - bedtimeAt.getTime()) / 60000));
      const sleepDuration = Math.round((durationMinutes / 60) * 10) / 10;
      const sleepQuality = Math.max(0, Math.min(100, Number(newSleep.sleepQuality || 0)));

      const localEntry = {
        id: String(Date.now()),
        date: String(wakeAt.toISOString().slice(0, 10)),
        bedtime: bedtimeAt.toISOString(),
        wakeTime: wakeAt.toISOString(),
        sleepDuration,
        sleepQuality: Math.round(sleepQuality),
        notes: String(newSleep.notes || '').slice(0, 1000),
        source: 'manual',
      };

      const next = [...sleepData, localEntry].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      setSleepData(next);
      setHealthMetrics(computeHealthMetrics(next));
      await accountCache.write('sleepData', next);

      // Sync to backend when authenticated.
      const token = await getAuthToken();
      if (token && !userProfile?.isGuest) {
        const baseUrl = await getBackendBaseUrl();
        const resp = await fetch(`${baseUrl}/api/sleep/entries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            bedtimeAt: localEntry.bedtime,
            wakeAt: localEntry.wakeTime,
            sleepQuality: localEntry.sleepQuality,
            notes: localEntry.notes,
            source: 'manual',
          }),
        });
        const { json, text } = await readJsonSafe(resp);
        if (!resp.ok) {
          throw new Error(json?.error || text || 'Failed to sync sleep log');
        }
      }

      setShowAddSleepModal(false);
    } catch (e) {
      Alert.alert('Sleep Log', e?.message ? String(e.message) : 'Failed to save sleep log');
    } finally {
      setSavingSleep(false);
    }
  };

  const loadConnectedDevices = async () => {
    // Old versions marked watches connected without talking to a device.
    // Only a completed import is retained, and only for this account.
    const imported=await accountCache.read('healthImportedSource',null);
    setConnectedDevices(imported ? ['health_connect'] : []);
  };

  const initializePhoneSensors = () => probePhoneSensor(
    accelerometer,
    () => setUpdateIntervalForType(SensorTypes.accelerometer, 1000),
    error => console.warn('Optional phone sensor unavailable:', error?.message || String(error)),
  );

  const OverviewTab = () => {
    const recentSleep = sleepData.slice(-7); // Last 7 days
    const avgDuration = recentSleep.length
      ? recentSleep.reduce((sum, day) => sum + (Number(day.sleepDuration) || 0), 0) / recentSleep.length
      : 0;
    const qualityRows=recentSleep.filter(d=>d.sleepQuality!==null);
    const avgQuality=qualityRows.length?qualityRows.reduce((sum,d)=>sum+Number(d.sleepQuality||0),0)/qualityRows.length:null;

    return (
      <ScrollView style={styles.tabContent}>
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{recentSleep.length ? `${avgDuration.toFixed(1)}h` : '—'}</Text>
            <Text style={styles.metricLabel}>Avg Sleep</Text>
            <Text style={styles.metricSubtext}>Last 7 days</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{avgQuality!==null ? `${avgQuality.toFixed(0)}%` : 'Not measured'}</Text>
            <Text style={styles.metricLabel}>Sleep Quality</Text>
            <Text style={styles.metricSubtext}>{recentSleep.length ? 'Self-reported rating' : 'No logs yet'}</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{recentSleep.length >= 2 ? `${Number(healthMetrics.consistencyScore || 0)}%` : '—'}</Text>
            <Text style={styles.metricLabel}>Consistency</Text>
            <Text style={styles.metricSubtext}>Bedtime routine</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{sleepData.length > 7 ? `${Number(healthMetrics.weeklyImprovement || 0) >= 0 ? '+' : ''}${Number(healthMetrics.weeklyImprovement || 0)}%` : '—'}</Text>
            <Text style={styles.metricLabel}>Weekly Trend</Text>
            <Text style={styles.metricSubtext}>{sleepData.length > 7 ? 'Compared with previous logs' : 'More logs needed'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryAction} onPress={() => {
          setNewSleep({
            date: new Date().toISOString().slice(0, 10),
            bedtime: sleepGoals.bedtime || '22:30',
            wakeTime: sleepGoals.wakeTime || '07:00',
            sleepQuality: '80',
            notes: '',
          });
          setShowAddSleepModal(true);
        }}>
          <Text style={styles.primaryActionText}>➕ Add Sleep Log</Text>
        </TouchableOpacity>

        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Sleep Duration Trend</Text>
          {recentSleep.length > 0 ? (
            <LineChart
              data={{
                labels: recentSleep.map(day => new Date(day.date).getDate().toString()),
                datasets: [
                  {
                    data: recentSleep.map(day => Number(day.sleepDuration) || 0),
                    strokeWidth: 3,
                    color: (opacity = 1) => `rgba(81, 179, 236, ${opacity})`,
                  },
                ],
              }}
              width={width - 40}
              height={200}
              chartConfig={{
                backgroundColor: 'transparent',
                backgroundGradientFrom: '#FFFFFF',
                backgroundGradientTo: '#FFFFFF',
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              }}
              bezier
              style={styles.chart}
            />
          ) : (
            <View style={[styles.chart, { padding: 16 }]}> 
              <Text style={{ color: '#586174' }}>No sleep data yet. Add a sleep log to start building insights.</Text>
            </View>
          )}
        </View>

        <View style={styles.insightsContainer}>
          <Text style={styles.sectionTitle}>🧠 Sleep Insights</Text>
          {generateSleepInsights().map((insight, index) => (
            <View key={index} style={styles.insightCard}>
              <Text style={styles.insightIcon}>{insight.icon}</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightDescription}>{insight.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  const AnalyticsTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.analyticsSection}>
        <Text style={styles.sectionTitle}>📊 Sleep Stages</Text>
        <View style={[styles.chart, { padding: 16 }]}>
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            Sleep stages require a wearable (Fitbit / Apple Watch / Samsung Health / Google Fit). Enable a device in the Devices tab to unlock this.
          </Text>
        </View>
      </View>

      <View style={styles.analyticsSection}>
        <Text style={styles.sectionTitle}>💓 Heart Rate</Text>
        <View style={[styles.chart, { padding: 16 }]}>
          <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
            Heart-rate during sleep is not available from phone sensors alone. Connect a wearable to sync HR sleep data.
          </Text>
        </View>
      </View>

      <View style={styles.analyticsSection}>
        <Text style={styles.sectionTitle}>🎯 Sleep Goals Progress</Text>
        <View style={styles.goalsGrid}>
          <View style={styles.goalCard}>
            {(() => {
              const recent = sleepData.slice(-7);
              const avg = recent.length
                ? recent.reduce((sum, d) => sum + (Number(d.sleepDuration) || 0), 0) / recent.length
                : 0;
              const target = Number(sleepGoals?.targetHours || 8);
              const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((avg / target) * 100))) : 0;
              return (
                <>
                  <Text style={styles.goalValue}>{avg ? `${avg.toFixed(1)}h` : '—'}</Text>
                  <Text style={styles.goalLabel}>Duration Goal</Text>
                  <View style={styles.goalProgress}>
                    <View style={[styles.goalProgressBar, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.goalPercent}>{avg ? `${pct}% of ${target}h` : 'No data yet'}</Text>
                </>
              );
            })()}
          </View>
          
          <View style={styles.goalCard}>
            {(() => {
              const recent = sleepData.slice(-7);
              const consistency = recent.length ? Math.round(calculateBedtimeConsistency(recent)) : 0;
              const bedtimeGoal = String(sleepGoals?.bedtime || '22:00');
              const pct = Math.max(0, Math.min(100, Number(consistency || 0)));
              return (
                <>
                  <Text style={styles.goalValue}>{bedtimeGoal}</Text>
                  <Text style={styles.goalLabel}>Bedtime Goal</Text>
                  <View style={styles.goalProgress}>
                    <View style={[styles.goalProgressBar, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.goalPercent}>{recent.length ? `${pct}% consistent` : 'No data yet'}</Text>
                </>
              );
            })()}
          </View>

          <View style={styles.goalCard}>
            {(() => {
              const recent = sleepData.slice(-7);
              const avgQ = recent.length
                ? recent.reduce((sum, d) => sum + (Number(d.sleepQuality) || 0), 0) / recent.length
                : 0;
              const targetQ = Number(sleepGoals?.sleepQualityGoal || 85);
              const pct = targetQ > 0 ? Math.max(0, Math.min(100, Math.round((avgQ / targetQ) * 100))) : 0;
              return (
                <>
                  <Text style={styles.goalValue}>{avgQ ? `${Math.round(avgQ)}%` : '—'}</Text>
                  <Text style={styles.goalLabel}>Quality Goal</Text>
                  <View style={styles.goalProgress}>
                    <View style={[styles.goalProgressBar, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.goalPercent}>{avgQ ? `${pct}% of ${targetQ}%` : 'No data yet'}</Text>
                </>
              );
            })()}
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const DevicesTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.devicesSection}>
        <Text style={styles.sectionTitle}>⌚ Devices & sleep sources</Text>
        <Text style={{color:"#63576E",marginBottom:16}}>Choose a device to search, pair or import sleep.</Text>
        
        {supportedDevices.map(device => (
          <TouchableOpacity accessibilityRole="button" key={device.id} style={[styles.deviceCard,{backgroundColor:"#F8F3FF",borderColor:"#E3D8F4",borderWidth:1}]} onPress={()=>{setSelectedDevice(device);setShowDeviceModal(true);}}>
            <Text style={styles.deviceIcon}>{device.icon}</Text>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceStatus}>
                {connectedDevices.includes(device.id) ? 'Sleep previously imported · tap to refresh' : device.id==='phone_sensors'?'Movement-assisted wake settings':'Find & choose a connection'}
              </Text>

              {device.id === 'google_fit' && (
                <>
                  {googleFitDebug.lastSyncAt && (
                    <Text style={styles.deviceDebug}>Last sync: {new Date(googleFitDebug.lastSyncAt).toLocaleString()}</Text>
                  )}
                  {googleFitDebug.lastResult && (
                    <Text style={styles.deviceDebug}>Status: {googleFitDebug.lastResult}</Text>
                  )}
                </>
              )}
            </View>
            <Text style={{fontSize:26,color:'#7651D0'}}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {connectedDevices.includes('google_fit') && (
        <TouchableOpacity
          style={[styles.syncButton, { marginTop: 0 }]}
          onPress={async () => {
            try {
              setGoogleFitDebug((p) => ({ ...p, lastResult: 'Syncing…' }));
              const result = await GoogleFitService.connectAndSyncSleep({ days: 30 });
              const msg = result?.ok
                ? String(result?.message || `Synced ${Number(result?.synced || 0)} nights.`)
                : String(result?.message || 'Google Fit sync failed');
              const stamp = new Date().toISOString();
              setGoogleFitDebug({ lastSyncAt: stamp, lastResult: msg });
              await AsyncStorage.setItem('risequest_googlefit_last_sync', stamp).catch(() => {});
              await AsyncStorage.setItem('risequest_googlefit_last_result', msg).catch(() => {});
              await loadSleepData();
              Alert.alert('Google Fit', msg);
            } catch (e) {
              Alert.alert('Google Fit', e?.message ? String(e.message) : 'Sync failed');
            }
          }}
        >
          <Text style={styles.syncButtonText}>🔄 Sync Google Fit Now</Text>
        </TouchableOpacity>
      )}

      <View style={styles.devicesSection}>
        <Text style={styles.sectionTitle}>✨ Sensor Settings</Text>
        {settingError?<Text accessibilityLiveRegion="polite" style={{color:"#963F50",padding:12}}>{settingError}</Text>:null}
        {savingSetting?<Text style={{padding:12}}>Saving your preference…</Text>:null}
        
        <View style={styles.settingCard}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingName}>Movement Tracking</Text>
            <Text style={styles.settingDescription}>
              Allow optional movement monitoring during your smart wake window
            </Text>
          </View>
          <Switch
            disabled={savingSetting}
            value={Boolean(userProfile?.sleepSettings?.movementTracking)}
            onValueChange={(value) => updateSleepSetting('movementTracking', value)}
          />
        </View>

        <View style={styles.settingCard}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingName}>Smart Wake-Up</Text>
            <Text style={styles.settingDescription}>
              Open a movement-assisted wake window before your fixed alarm
            </Text>
          </View>
          <Switch
            disabled={savingSetting}
            value={Boolean(userProfile?.sleepSettings?.smartWakeUp)}
            onValueChange={(value) => updateSleepSetting('smartWakeUp', value)}
          />
        </View>

        <View style={styles.settingCard}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingName}>Sleep Reminders</Text>
            <Text style={styles.settingDescription}>
              Daily bedtime reminder at 10:00 p.m. on this device
            </Text>
          </View>
          <Switch
            disabled={savingSetting}
            value={Boolean(userProfile?.sleepSettings?.reminders)}
            onValueChange={(value) => updateSleepSetting('reminders', value)}
          />
        </View>
      </View>

      <TouchableOpacity
        style={styles.syncButton}
        onPress={syncHealthData}
      >
        <Text style={styles.syncButtonText}>🔄 Sync All Devices</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const generateSleepInsights = () => {
    const insights = [];
    const recentSleep = sleepData.slice(-7);
    if (!recentSleep.length) return [{
      icon: '📝', title: 'Start Your Sleep Log',
      description: 'Add a sleep log to review your own patterns. No sleep insights are available yet.',
    }];
    const avgDuration = recentSleep.reduce((sum, day) => sum + day.sleepDuration, 0) / recentSleep.length;
    const avgQuality = recentSleep.reduce((sum, day) => sum + day.sleepQuality, 0) / recentSleep.length;

    if (avgDuration < 7) {
      insights.push({
        icon: '⚠️',
        title: 'Sleep Duration Below Optimal',
        description: 'Consider setting an earlier bedtime to reach 7-9 hours of sleep.'
      });
    }

    if (avgQuality > 85) {
      insights.push({
        icon: '🌟',
        title: 'Excellent Sleep Quality',
        description: 'Your sleep quality is above average. Keep up the great routine!'
      });
    }

    const consistency = calculateBedtimeConsistency(recentSleep);
    if (consistency < 70) {
      insights.push({
        icon: '🕐',
        title: 'Improve Sleep Consistency',
        description: 'Try to go to bed and wake up at similar times each day.'
      });
    }

    if (insights.length === 0) {
      insights.push({
        icon: '✅',
        title: 'Review Your Sleep Logs',
        description: 'Your saved logs can help you notice patterns. These summaries are not a health assessment.'
      });
    }

    return insights;
  };

  const calculateBedtimeConsistency = (sleepData) => {
    if (sleepData.length < 2) return 100;
    
    const bedtimes = sleepData.map(day => {
      const bedtime = new Date(day.bedtime);
      return bedtime.getHours() + bedtime.getMinutes() / 60;
    });

    const avgBedtime = bedtimes.reduce((sum, time) => sum + time, 0) / bedtimes.length;
    const variance = bedtimes.reduce((sum, time) => sum + Math.pow(time - avgBedtime, 2), 0) / bedtimes.length;
    const standardDeviation = Math.sqrt(variance);

    // Convert to consistency percentage (lower deviation = higher consistency)
    return Math.max(0, Math.min(100, 100 - (standardDeviation * 10)));
  };

  const updateSleepSetting = async (setting, value) => {
    if(settingLock.current)return;
    settingLock.current=true;setSavingSetting(true);setSettingError('');
    try {
      if(typeof onUpdateProfile!=='function')throw new Error('Reopen Sleep & recovery to save your settings.');
      if(value && (setting==='movementTracking'||setting==='smartWakeUp') && Platform.OS!=='android')throw new Error('Movement-assisted wake windows are available on Android. Your fixed alarm remains available.');
      await onUpdateProfile({...userProfile,sleepSettings:{...userProfile?.sleepSettings,[setting]:Boolean(value)}});
      if(setting==='reminders'){
        PushNotification.cancelLocalNotification('7314');
        if(value){
          PushNotification.createChannel({channelId:'risequest-sleep',channelName:'Bedtime reminders',importance:3},()=>{});
          const date=new Date();date.setHours(22,0,0,0);if(date<=new Date())date.setDate(date.getDate()+1);
          PushNotification.localNotificationSchedule({id:'7314',data:{kind:'sleep-reminder'},userInfo:{kind:'sleep-reminder'},channelId:'risequest-sleep',title:'Time to wind down 🌙',message:'A gentle moment to prepare for rest.',date,repeatType:'day',allowWhileIdle:false});
          setSettingError('Bedtime reminder saved for 10:00 p.m. Make sure notifications are allowed in phone settings.');
        }
      }else if(value){onNavigate?.('smart-wake');}
      else if(NativeModules.RiseQuestAlarmAudio?.stopSmartWake){await NativeModules.RiseQuestAlarmAudio.stopSmartWake();}
    }catch(error){setSettingError(error?.message||'Your setting could not be saved. Please try again.');}
    finally{settingLock.current=false;setSavingSetting(false);}
  };

  const syncHealthData = async () => {
    try {
      await loadSleepData();
      Alert.alert('Sync', 'Sleep data refreshed.');
    } catch (_) {
      Alert.alert('Sync', 'Failed to refresh sleep data.');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFF9F2', '#FFF0DB']} style={styles.header}>
        <Text style={styles.headerTitle}>😴 Sleep & Health</Text>
        <Text style={styles.headerSubtitle}>Track your sleep patterns and health metrics</Text>
      </LinearGradient>

      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'overview' && styles.activeTab]}
          onPress={() => setCurrentTab('overview')}
        >
          <Text style={[styles.tabText, currentTab === 'overview' && styles.activeTabText]}>
            Overview
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, currentTab === 'analytics' && styles.activeTab]}
          onPress={() => setCurrentTab('analytics')}
        >
          <Text style={[styles.tabText, currentTab === 'analytics' && styles.activeTabText]}>
            Analytics
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, currentTab === 'devices' && styles.activeTab]}
          onPress={() => setCurrentTab('devices')}
        >
          <Text style={[styles.tabText, currentTab === 'devices' && styles.activeTabText]}>
            Devices
          </Text>
        </TouchableOpacity>
      </View>

      {currentTab === 'overview' && <OverviewTab />}
      {currentTab === 'analytics' && <AnalyticsTab />}
      {currentTab === 'devices' && <DevicesTab />}

      <DevicePicker visible={showDeviceModal} device={selectedDevice} onClose={()=>setShowDeviceModal(false)} onPhoneSettings={()=>setCurrentTab('devices')} onImported={async source=>{await accountCache.write('healthImportedSource',source);await loadConnectedDevices();await loadSleepData();}}/>
      <Modal visible={showAddSleepModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddSleepModal(false)}>
        <View style={styles.modalContainer}>
          <LinearGradient colors={['#FFF9F2', '#FFF0DB']} style={styles.modalHeader}>
            <View style={{flex:1,paddingTop:8}}><ModalHeading compact title='➕ Add Sleep Log' icon="star"/></View>
            <TouchableOpacity onPress={() => setShowAddSleepModal(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalLabel}>Date (YYYY-MM-DD)</Text>
            <View style={styles.modalInputBox}>
              <TextInput
                value={String(newSleep.date || '')}
                onChangeText={(t) => setNewSleep((p) => ({ ...p, date: t }))}
                placeholder="2026-02-22"
                placeholderTextColor="#71697B"
                style={styles.modalInput}
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.modalLabel}>Bedtime (HH:MM)</Text>
            <View style={styles.modalInputBox}>
              <TextInput
                value={String(newSleep.bedtime || '')}
                onChangeText={(t) => setNewSleep((p) => ({ ...p, bedtime: t }))}
                placeholder="22:30"
                placeholderTextColor="#71697B"
                style={styles.modalInput}
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.modalLabel}>Wake time (HH:MM)</Text>
            <View style={styles.modalInputBox}>
              <TextInput
                value={String(newSleep.wakeTime || '')}
                onChangeText={(t) => setNewSleep((p) => ({ ...p, wakeTime: t }))}
                placeholder="07:00"
                placeholderTextColor="#71697B"
                style={styles.modalInput}
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.modalLabel}>Sleep quality (0-100)</Text>
            <View style={styles.modalInputBox}>
              <TextInput
                value={String(newSleep.sleepQuality || '')}
                onChangeText={(t) => setNewSleep((p) => ({ ...p, sleepQuality: t.replace(/[^0-9]/g, '').slice(0, 3) }))}
                placeholder="80"
                placeholderTextColor="#71697B"
                style={styles.modalInput}
                keyboardType="number-pad"
              />
            </View>

            <Text style={styles.modalLabel}>Notes (optional)</Text>
            <View style={styles.modalInputBox}>
              <TextInput
                value={String(newSleep.notes || '')}
                onChangeText={(t) => setNewSleep((p) => ({ ...p, notes: t }))}
                placeholder="Caffeine late, stress, workout, etc."
                placeholderTextColor="#71697B"
                style={[styles.modalInput, { minHeight: 70 }]}
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.modalSaveButton, savingSleep && { opacity: 0.7 }]}
              disabled={savingSleep}
              onPress={addSleepLog}
            >
              <Text style={styles.modalSaveText}>{savingSleep ? 'Saving…' : 'Save Sleep Log'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#252438',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#252438',
    marginTop: 4,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#A65000',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#A65000',
    fontWeight: '600',
  },
  primaryAction: {
    marginTop: 6,
    marginHorizontal: 10,
    backgroundColor: '#A65000',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#252438',
    fontWeight: '700',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFF9F2',
  },
  modalHeader: {
    backgroundColor:'#FFF0DB',borderBottomLeftRadius:26,borderBottomRightRadius:26,
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#252438',
    fontSize: 20,
    fontWeight: '700',
  },
  modalClose: {
    color: '#252438',
    fontSize: 20,
  },
  modalBody: {
    padding: 20,
  },
  modalLabel: {
    color: '#252438',
    marginTop: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  modalInputBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalInput: {
    color: '#252438',
  },
  modalSaveButton: {
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#252438',
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Overview Tab Styles
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  metricCard: {
    width: '48%',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    margin: '1%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  metricLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  metricSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  chartContainer: {
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  chart: {
    borderRadius: 8,
  },
  insightsContainer: {
    margin: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    marginLeft: 5,
  },
  insightCard: {
    flexDirection: 'row',
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
  insightIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  insightDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    lineHeight: 20,
  },

  // Analytics Tab Styles
  analyticsSection: {
    backgroundColor: 'white',
    margin: 10,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  goalCard: {
    width: '48%',
    backgroundColor: '#FFF9F2',
    padding: 15,
    borderRadius: 10,
    margin: '1%',
    alignItems: 'center',
  },
  goalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#A65000',
  },
  goalLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  goalProgress: {
    width: '100%',
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    marginTop: 8,
  },
  goalProgressBar: {
    height: '100%',
    backgroundColor: '#A65000',
    borderRadius: 3,
  },
  goalPercent: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },

  // Devices Tab Styles
  devicesSection: {
    margin: 10,
  },
  deviceCard: {
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
  deviceIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  deviceStatus: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  deviceDebug: {
    fontSize: 12,
    color: '#444',
    marginTop: 4,
  },
  settingCard: {
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
  settingInfo: {
    flex: 1,
  },
  settingName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  syncButton: {
    backgroundColor: '#A65000',
    padding: 15,
    borderRadius: 12,
    margin: 20,
    alignItems: 'center',
  },
  syncButtonText: {
    color: '#252438',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default SleepHealthIntegration;

