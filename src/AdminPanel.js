import ModalHeading from './components/ModalHeading';
import Modal, { AppAlert as Alert } from './components/AppModal';
import { getAuthToken } from './services/AuthTokenStorage';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import ImprovementSuggestions from './ImprovementSuggestions';
import ErrorLogService from './utils/ErrorLogService';
import { getBackendBaseUrl } from './config/backendConfig';
import riseQuestWalletService from './services/RiseQuestWalletService';

const AdminPanel = ({
  visible,
  onClose,
  userProfile,
  alarms,
  isAdminAuthenticated,
  onOpenPaymentTest,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [showImprovements, setShowImprovements] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshot, setSnapshot] = useState({
    alarmsTotal: 0,
    alarmsEnabled: 0,
    alarmsChallenge: 0,
    alarmsWeather: 0,
    lastAlarmId: null,

    rpBalance: null,
    rpSource: null,
    rpTransactions: 0,

    purchasedCount: 0,
    purchasedByType: {},
    equippedThemeId: null,
    equippedSoundId: null,
    defaultTone: null,

    tokenPresent: false,
    backendHealth: null,
    backendHealthError: null,
  });

  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (visible) {
      void refreshAll();
    }
  }, [visible]);

  const normalizePurchased = (raw) => {
    const list = Array.isArray(raw) ? raw : [];
    const byType = {};
    list.forEach((it) => {
      const type = String(it?.type || it?.category || 'unknown');
      byType[type] = (byType[type] || 0) + 1;
    });
    return { count: list.length, byType };
  };

  const loadBackendHealth = async () => {
    try {
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/health`);
      const text = await resp.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!resp.ok) {
        return { ok: false, error: `HTTP ${resp.status}`, json };
      }
      return { ok: true, json };
    } catch (e) {
      return { ok: false, error: e?.message ? String(e.message) : 'Network error', json: null };
    }
  };

  const refreshSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      const storedAlarmsRaw = await AsyncStorage.getItem('risequest_alarms');
      const storedAlarms = storedAlarmsRaw ? JSON.parse(storedAlarmsRaw) : null;
      const alarmsList = Array.isArray(alarms) ? alarms : (Array.isArray(storedAlarms) ? storedAlarms : []);
      const enabled = alarmsList.filter((a) => a?.isEnabled !== false);
      const challenge = alarmsList.filter((a) => Boolean(a?.challengeMode));
      const weather = alarmsList.filter((a) => Boolean(a?.weatherAlert));

      const lastAlarmId = await AsyncStorage.getItem('risequest_last_alarm_id');
      const token = await getAuthToken();

      const purchasedRaw = await AsyncStorage.getItem('purchasedCosmetics');
      const purchased = purchasedRaw ? JSON.parse(purchasedRaw) : [];
      const purchasedInfo = normalizePurchased(purchased);

      const [equippedThemeId, equippedSoundId, defaultToneRaw] = await Promise.all([
        AsyncStorage.getItem('risequest_app_theme_id'),
        AsyncStorage.getItem('risequest_equipped_sound_id'),
        AsyncStorage.getItem('risequest_default_alarm_tone'),
      ]);

      let defaultTone = null;
      try {
        defaultTone = defaultToneRaw ? JSON.parse(defaultToneRaw) : null;
      } catch {
        defaultTone = null;
      }

      const rpTxRaw = await AsyncStorage.getItem('risePointsTransactions');
      const rpTx = rpTxRaw ? JSON.parse(rpTxRaw) : [];

      let rpBalance = null;
      let rpSource = null;
      try {
        await riseQuestWalletService.loadAuthData();
        const userId = await riseQuestWalletService.getCurrentUserId();
        if (userId) {
          const bal = await riseQuestWalletService.getBalance(userId);
          if (typeof bal?.risePoints === 'number') {
            rpBalance = Number(bal.risePoints || 0);
            rpSource = 'wallet';
          }
        }
      } catch (_) {
        // ignore
      }

      const health = await loadBackendHealth();

      setSnapshot({
        alarmsTotal: alarmsList.length,
        alarmsEnabled: enabled.length,
        alarmsChallenge: challenge.length,
        alarmsWeather: weather.length,
        lastAlarmId: lastAlarmId ? String(lastAlarmId) : null,

        rpBalance,
        rpSource,
        rpTransactions: Array.isArray(rpTx) ? rpTx.length : 0,

        purchasedCount: purchasedInfo.count,
        purchasedByType: purchasedInfo.byType,
        equippedThemeId: equippedThemeId ? String(equippedThemeId) : null,
        equippedSoundId: equippedSoundId ? String(equippedSoundId) : null,
        defaultTone,

        tokenPresent: Boolean(token),
        backendHealth: health.ok ? (health.json || { ok: true }) : null,
        backendHealthError: health.ok ? null : String(health.error || 'Health check failed'),
      });
    } catch (_) {
      // ignore
    } finally {
      setSnapshotLoading(false);
    }
  };

  const refreshLogs = async () => {
    setLogsLoading(true);
    try {
      const list = await ErrorLogService.getLogs();
      const next = Array.isArray(list) ? list.slice().reverse() : [];
      setLogs(next);
    } catch (_) {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([refreshSnapshot(), refreshLogs()]);
  };

  const AccessTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>🔐 Admin Access Required</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Admin tools are restricted.</Text>
        <Text style={styles.infoItem}>Sign in as an admin account to access these tools.</Text>
      </View>
    </ScrollView>
  );

  const OverviewTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.supportHeader}>
        <Text style={styles.sectionTitle}>📊 Overview</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {snapshotLoading ? (
        <View style={{ paddingVertical: 10 }}>
          <ActivityIndicator />
        </View>
      ) : (
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{snapshot.alarmsTotal}</Text>
            <Text style={styles.metricLabel}>Total Alarms</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{snapshot.alarmsEnabled}</Text>
            <Text style={styles.metricLabel}>Enabled Alarms</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{snapshot.purchasedCount}</Text>
            <Text style={styles.metricLabel}>Purchased Items</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{snapshot.rpBalance == null ? '—' : snapshot.rpBalance}</Text>
            <Text style={styles.metricLabel}>Rise Points ({snapshot.rpSource || 'n/a'})</Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>👤 Current User</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Name: {userProfile?.displayName || '—'}</Text>
        <Text style={styles.infoItem}>Email: {userProfile?.email || '—'}</Text>
        <Text style={styles.infoItem}>Provider: {userProfile?.authProvider || '—'}</Text>
        <Text style={styles.infoItem}>Token: {snapshot.tokenPresent ? 'present' : 'missing'}</Text>
      </View>

      <Text style={styles.sectionTitle}>🌐 Backend Health</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Status: {snapshot.backendHealthError ? 'DOWN/ERROR' : 'OK'}</Text>
        {!!snapshot.backendHealthError && <Text style={styles.infoItem}>Error: {snapshot.backendHealthError}</Text>}
      </View>
    </ScrollView>
  );

  const SupportTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>🎧 Support Tickets</Text>
      
      <View style={styles.supportHeader}>
        <Text style={styles.supportEmail}>Support Email: Risequestsupport@goldenepics.com</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={refreshAll}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Support tickets are currently not wired to a backend admin queue.</Text>
        <Text style={styles.infoItem}>Use this panel for diagnostics, logs, and local app state until admin APIs exist.</Text>
      </View>

      <TouchableOpacity
        style={[styles.actionButton, { marginTop: 8 }]}
        onPress={() => setShowImprovements(true)}
      >
        <Text style={styles.actionButtonText}>💡 Feature Suggestions</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const UsersTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>👥 User Management</Text>

      <View style={styles.userStatsCard}>
        <Text style={styles.userStatTitle}>Current Signed-In User</Text>
        <View style={styles.userStatRow}>
          <Text style={styles.userStatLabel}>Email</Text>
          <Text style={styles.userStatValue}>{userProfile?.email || '—'}</Text>
        </View>
        <View style={styles.userStatRow}>
          <Text style={styles.userStatLabel}>Name</Text>
          <Text style={styles.userStatValue}>{userProfile?.displayName || '—'}</Text>
        </View>
        <View style={styles.userStatRow}>
          <Text style={styles.userStatLabel}>Provider</Text>
          <Text style={styles.userStatValue}>{userProfile?.authProvider || '—'}</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Full user management requires backend admin APIs.</Text>
        <Text style={styles.infoItem}>This tab is focused on local app state + authentication diagnostics.</Text>
      </View>
    </ScrollView>
  );

  const AlarmsTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>⏰ Alarms</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Total: {snapshot.alarmsTotal}</Text>
        <Text style={styles.infoItem}>Enabled: {snapshot.alarmsEnabled}</Text>
        <Text style={styles.infoItem}>Challenge Mode: {snapshot.alarmsChallenge}</Text>
        <Text style={styles.infoItem}>Weather Alerts: {snapshot.alarmsWeather}</Text>
        <Text style={styles.infoItem}>Last Alarm ID: {snapshot.lastAlarmId || '—'}</Text>
      </View>

      {(Array.isArray(alarms) ? alarms : []).slice(0, 12).map((a, idx) => (
        <View key={a?.id || idx} style={styles.ticketCard}>
          <Text style={styles.ticketSubject}>{a?.label || 'Alarm'}</Text>
          <Text style={styles.ticketUser}>Time: {a?.time || '—'} • Enabled: {a?.isEnabled === false ? 'no' : 'yes'}</Text>
          <Text style={styles.activityText}>
            Tone: {a?.selectedTone || 'default'}{a?.customToneName ? ` (${a.customToneName})` : ''}
          </Text>
          <Text style={styles.activityText}>
            Challenge: {a?.challengeMode ? 'on' : 'off'} • Weather: {a?.weatherAlert ? 'on' : 'off'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );

  const RewardsTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>💎 Rewards & Cosmetics</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Rise Points: {snapshot.rpBalance == null ? '—' : snapshot.rpBalance} ({snapshot.rpSource || 'n/a'})</Text>
        <Text style={styles.infoItem}>Transactions (local): {snapshot.rpTransactions}</Text>
        <Text style={styles.infoItem}>Purchased cosmetics: {snapshot.purchasedCount}</Text>
        <Text style={styles.infoItem}>Equipped theme: {snapshot.equippedThemeId || 'default'}</Text>
        <Text style={styles.infoItem}>Equipped store sound: {snapshot.equippedSoundId || 'none'}</Text>
      </View>

      <Text style={styles.sectionTitle}>🎵 Default Alarm Tone</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Selected: {snapshot.defaultTone?.selectedTone || 'default'}</Text>
        <Text style={styles.infoItem}>Name: {snapshot.defaultTone?.customToneName || '—'}</Text>
        <Text style={styles.infoItem}>Source: {snapshot.defaultTone?.source || '—'}</Text>
      </View>

      <Text style={styles.sectionTitle}>📦 Inventory Breakdown</Text>
      <View style={styles.infoCard}>
        {Object.keys(snapshot.purchasedByType || {}).length ? (
          Object.entries(snapshot.purchasedByType).map(([k, v]) => (
            <Text key={k} style={styles.infoItem}>{k}: {v}</Text>
          ))
        ) : (
          <Text style={styles.infoItem}>No inventory found.</Text>
        )}
      </View>
    </ScrollView>
  );

  const DiagnosticsTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>🧰 Diagnostics</Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Backend health: {snapshot.backendHealthError ? 'ERROR' : 'OK'}</Text>
        {!!snapshot.backendHealthError && <Text style={styles.infoItem}>{snapshot.backendHealthError}</Text>}
      </View>

      <TouchableOpacity
        style={styles.actionButton}
        onPress={async () => {
          await refreshSnapshot();
          Alert.alert('Diagnostics', snapshot.backendHealthError ? 'Backend health check failed.' : 'Backend health OK.');
        }}
      >
        <Text style={styles.actionButtonText}>🌐 Re-check backend health</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => {
          if (typeof onOpenPaymentTest === 'function') onOpenPaymentTest();
          else Alert.alert('Payment Test', 'Not available in this build.');
        }}
      >
        <Text style={styles.actionButtonText}>🧪 Open Payment Flow Test</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, { borderColor: '#fecaca' }]}
        onPress={() => {
          Alert.alert(
            'Clear local caches',
            'This will remove local cosmetics inventory and default tone (does not affect server wallet). Continue?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await AsyncStorage.multiRemove([
                      'purchasedCosmetics',
                      'risequest_equipped_sound_id',
                      'risequest_default_alarm_tone',
                      'risequest_app_theme_id',
                    ]);
                    await refreshSnapshot();
                    Alert.alert('Cleared', 'Local cosmetic defaults cleared.');
                  } catch (_) {
                    Alert.alert('Clear', 'Failed to clear local caches.');
                  }
                },
              },
            ]
          );
        }}
      >
        <Text style={[styles.actionButtonText, { color: '#b91c1c' }]}>🧹 Clear local cosmetics defaults</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const LogsTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.supportHeader}>
        <Text style={styles.sectionTitle}>🧾 Error Logs</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={refreshLogs}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoItem}>Entries: {Array.isArray(logs) ? logs.length : 0}</Text>
        <TouchableOpacity
          style={[styles.editButton, { marginTop: 10 }]}
          onPress={() => {
            Alert.alert(
              'Clear logs',
              'Remove stored logs from this device?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: async () => {
                    await ErrorLogService.clear();
                    await refreshLogs();
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.editButtonText}>Clear logs</Text>
        </TouchableOpacity>
      </View>

      {logsLoading ? (
        <View style={{ paddingVertical: 10 }}>
          <ActivityIndicator />
        </View>
      ) : !logs.length ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoItem}>No stored logs yet.</Text>
        </View>
      ) : (
        logs.slice(0, 120).map((l) => (
          <View key={l.id} style={styles.activityCard}>
            <Text style={styles.activityDate}>{new Date(Number(l.ts || 0)).toLocaleString()} • {String(l.level || '').toUpperCase()}</Text>
            <Text style={styles.activityText}>{String(l.message || '')}</Text>
            {!!l.stack && <Text style={styles.activityText}>{String(l.stack)}</Text>}
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab />;
      case 'support': return <SupportTab />;
      case 'users': return <UsersTab />;
      case 'alarms': return <AlarmsTab />;
      case 'rewards': return <RewardsTab />;
      case 'diagnostics': return <DiagnosticsTab />;
      case 'logs': return <LogsTab />;
      default: return <OverviewTab />;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
        <View style={styles.header}>
          <ModalHeading compact light title="RiseQuest Admin Panel" icon="shield"/>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'alarms', label: '⏰ Alarms' },
            { id: 'rewards', label: '💎 Rewards' },
            { id: 'diagnostics', label: '🧰 Diagnostics' },
            { id: 'logs', label: '🧾 Logs' },
            { id: 'users', label: '👥 Users' },
            { id: 'support', label: '🎧 Support' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, activeTab === tab.id && styles.activeTab]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.content}>
          {!isAdminAuthenticated ? <AccessTab /> : renderTabContent()}
        </View>
        
        <ImprovementSuggestions
          visible={showImprovements}
          onClose={() => setShowImprovements(false)}
        />
      </LinearGradient>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  tabBar: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 15,
    padding: 5,
    alignItems: 'center',
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: 10,
    marginRight: 8,
  },
  activeTab: {
    backgroundColor: 'white',
  },
  tabText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#667eea',
  },
  content: {
    flex: 1,
    backgroundColor: 'white',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingTop: 20,
  },
  tabContent: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 15,
    marginTop: 10,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  metricCard: {
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 15,
    width: '48%',
    marginBottom: 10,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#667eea',
  },
  metricLabel: {
    fontSize: 12,
    color: '#718096',
    marginTop: 5,
    textAlign: 'center',
  },
  conversionCard: {
    backgroundColor: '#e6fffa',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  conversionRate: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#38b2ac',
  },
  conversionLabel: {
    fontSize: 14,
    color: '#2d3748',
    marginTop: 5,
  },
  activityCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  activityDate: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#667eea',
  },
  activityText: {
    fontSize: 12,
    color: '#718096',
    marginTop: 5,
  },
  supportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  supportEmail: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '600',
  },
  refreshButton: {
    backgroundColor: '#667eea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  ticketCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ticketId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a5568',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  highPriority: { backgroundColor: '#fed7d7' },
  mediumPriority: { backgroundColor: '#fefcbf' },
  lowPriority: { backgroundColor: '#c6f6d5' },
  priorityText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: 5,
  },
  ticketUser: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 10,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ticketStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  openStatus: { backgroundColor: '#fed7d7', color: '#c53030' },
  pendingStatus: { backgroundColor: '#fefcbf', color: '#d69e2e' },
  closedStatus: { backgroundColor: '#c6f6d5', color: '#38a169' },
  viewButton: {
    backgroundColor: '#667eea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  userStatsCard: {
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  userStatTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 15,
  },
  userStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  userStatLabel: {
    fontSize: 14,
    color: '#718096',
  },
  userStatValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#667eea',
  },
  actionButton: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4a5568',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  settingLabel: {
    fontSize: 16,
    color: '#4a5568',
  },
  pricingCard: {
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  pricingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 15,
  },
  pricingItem: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 8,
  },
  editButton: {
    backgroundColor: '#667eea',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  editButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 20,
  },
  infoItem: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 8,
  },
});

export default AdminPanel;

