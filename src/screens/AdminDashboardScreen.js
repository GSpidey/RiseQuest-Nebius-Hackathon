import { getAuthToken } from '../services/AuthTokenStorage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import { getBackendBaseUrl } from '../config/backendConfig';

async function authFetch(path, { method = 'GET', body = null } = {}) {
  const baseUrl = await getBackendBaseUrl();
  const token = await getAuthToken();
  if (!token) throw new Error('Missing auth token');

  const resp = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    throw new Error(json?.error || `Request failed (HTTP ${resp.status})`);
  }
  return json;
}

export default function AdminDashboardScreen({ visible, onClose }) {
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [userQuery, setUserQuery] = useState('');

  const [tickets, setTickets] = useState([]);
  const [ticketStatus, setTicketStatus] = useState('OPEN');

  const [audit, setAudit] = useState([]);

  const [paymentsUserId, setPaymentsUserId] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);

  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [myRole, setMyRole] = useState('USER');

  const tabs = useMemo(
    () => [
      { id: 'overview', label: '📊 Overview' },
      { id: 'users', label: '👥 Users' },
      { id: 'support', label: '🎧 Support' },
      { id: 'payments', label: '💳 Payments' },
      { id: 'audit', label: '🧾 Audit' },
    ],
    []
  );

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem('risequest_user_role')
      .then((r) => {
        if (r) setMyRole(String(r).toUpperCase());
      })
      .catch(() => {});
    void refreshCurrentTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tab]);

  const refreshCurrentTab = async () => {
    setLoading(true);
    try {
      if (tab === 'overview') {
        const data = await authFetch('/api/admin/overview');
        setOverview(data?.overview || null);
      } else if (tab === 'users') {
        const data = await authFetch(`/api/admin/users?limit=50&query=${encodeURIComponent(userQuery.trim())}`);
        setUsers(Array.isArray(data?.users) ? data.users : []);
      } else if (tab === 'support') {
        const status = String(ticketStatus || '').toUpperCase();
        const data = await authFetch(`/api/admin/support/tickets?limit=80&status=${encodeURIComponent(status)}`);
        setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
      } else if (tab === 'payments') {
        setSubscriptions([]);
        if (paymentsUserId.trim()) {
          const data = await authFetch(`/api/admin/payments/subscriptions?userId=${encodeURIComponent(paymentsUserId.trim().toLowerCase())}`);
          setSubscriptions(Array.isArray(data?.subscriptions) ? data.subscriptions : []);
        }
      } else if (tab === 'audit') {
        const data = await authFetch('/api/admin/audit?limit=120');
        setAudit(Array.isArray(data?.audit) ? data.audit : []);
      }
    } catch (e) {
      Alert.alert('Admin', e?.message ? String(e.message) : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const openUser = (u) => {
    setSelectedUser(u);
    setTempPassword('');
    setShowUserModal(true);
  };

  const patchUser = async (userId, changes) => {
    setLoading(true);
    try {
      await authFetch(`/api/admin/users/${encodeURIComponent(String(userId))}`, { method: 'PATCH', body: changes });
      await refreshCurrentTab();
    } catch (e) {
      Alert.alert('Admin', e?.message ? String(e.message) : 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const triggerReset = async (userId) => {
    setLoading(true);
    try {
      await authFetch(`/api/admin/users/${encodeURIComponent(String(userId))}/trigger-password-reset`, { method: 'POST' });
      Alert.alert('Password reset', 'Reset email triggered (if email delivery is configured).');
    } catch (e) {
      Alert.alert('Admin', e?.message ? String(e.message) : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const setPassword = async (userId) => {
    const p = String(tempPassword || '');
    if (p.length < 8) {
      Alert.alert('Temporary password', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await authFetch(`/api/admin/users/${encodeURIComponent(String(userId))}/set-password`, { method: 'POST', body: { password: p } });
      Alert.alert('Temporary password', 'Password was updated for this user.');
      setTempPassword('');
    } catch (e) {
      Alert.alert('Admin', e?.message ? String(e.message) : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const updateTicket = async (ticketId, changes) => {
    setLoading(true);
    try {
      await authFetch(`/api/admin/support/tickets/${encodeURIComponent(String(ticketId))}`, { method: 'PATCH', body: changes });
      await refreshCurrentTab();
    } catch (e) {
      Alert.alert('Admin', e?.message ? String(e.message) : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const OverviewTab = () => (
    <ScrollView contentContainerStyle={styles.scrollPad}>
      <Text style={styles.sectionTitle}>📊 Admin Overview</Text>
      <View style={styles.card}>
        <Text style={styles.kv}>Users: {overview?.usersTotal ?? '—'}</Text>
        <Text style={styles.kv}>Admins: {overview?.adminsTotal ?? '—'}</Text>
        <Text style={styles.kv}>Disabled: {overview?.usersDisabled ?? '—'}</Text>
        <Text style={styles.kv}>Support (open): {overview?.supportTicketsOpen ?? '—'}</Text>
        <Text style={styles.kv}>Subscriptions: {overview?.subscriptionsTotal ?? '—'}</Text>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={refreshCurrentTab} disabled={loading}>
        <Text style={styles.primaryBtnText}>{loading ? 'Loading…' : 'Refresh'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const UsersTab = () => (
    <ScrollView contentContainerStyle={styles.scrollPad} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>👥 User Management</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Search (email, name, phone)</Text>
        <View style={styles.row}>
          <TextInput
            value={userQuery}
            onChangeText={setUserQuery}
            placeholder="Search"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.smallBtn} onPress={refreshCurrentTab} disabled={loading}>
            <Text style={styles.smallBtnText}>Go</Text>
          </TouchableOpacity>
        </View>
      </View>

      {(Array.isArray(users) ? users : []).map((u) => (
        <TouchableOpacity key={u.id} style={styles.listItem} onPress={() => openUser(u)}>
          <Text style={styles.listTitle}>{u.id}</Text>
          <Text style={styles.listSub}>Role: {u.role} • Provider: {u.authProvider || '—'} • Disabled: {u.disabledAt ? 'yes' : 'no'}</Text>
        </TouchableOpacity>
      ))}

      {!users.length && !loading && (
        <View style={styles.card}>
          <Text style={styles.kv}>No users found.</Text>
        </View>
      )}
    </ScrollView>
  );

  const SupportTab = () => (
    <ScrollView contentContainerStyle={styles.scrollPad} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>🎧 Support Tickets</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Status</Text>
        <View style={styles.pills}>
          {['OPEN', 'IN_PROGRESS', 'RESOLVED'].map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.pill, String(ticketStatus) === s && styles.pillActive]}
              onPress={() => setTicketStatus(s)}
            >
              <Text style={[styles.pillText, String(ticketStatus) === s && styles.pillTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={refreshCurrentTab} disabled={loading}>
          <Text style={styles.primaryBtnText}>{loading ? 'Loading…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {(Array.isArray(tickets) ? tickets : []).map((t) => (
        <View key={t.id} style={styles.card}>
          <Text style={styles.listTitle}>{t.subject}</Text>
          <Text style={styles.listSub}>From: {t.userEmail || t.userId || '—'} • Status: {t.status}</Text>
          <Text style={styles.bodyText}>{t.message}</Text>

          <View style={[styles.row, { marginTop: 10 }]}>
            {t.status !== 'IN_PROGRESS' && (
              <TouchableOpacity style={styles.smallBtn} onPress={() => updateTicket(t.id, { status: 'IN_PROGRESS' })}>
                <Text style={styles.smallBtnText}>In progress</Text>
              </TouchableOpacity>
            )}
            {t.status !== 'RESOLVED' && (
              <TouchableOpacity style={styles.smallBtn} onPress={() => updateTicket(t.id, { status: 'RESOLVED' })}>
                <Text style={styles.smallBtnText}>Resolve</Text>
              </TouchableOpacity>
            )}
            {t.status !== 'OPEN' && (
              <TouchableOpacity style={styles.smallBtn} onPress={() => updateTicket(t.id, { status: 'OPEN' })}>
                <Text style={styles.smallBtnText}>Reopen</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {!tickets.length && !loading && (
        <View style={styles.card}>
          <Text style={styles.kv}>No tickets in this status.</Text>
        </View>
      )}
    </ScrollView>
  );

  const PaymentsTab = () => (
    <ScrollView contentContainerStyle={styles.scrollPad} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>💳 Payments</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Lookup subscriptions by user email</Text>
        <View style={styles.row}>
          <TextInput
            value={paymentsUserId}
            onChangeText={setPaymentsUserId}
            placeholder="user@example.com"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.smallBtn} onPress={refreshCurrentTab} disabled={loading}>
            <Text style={styles.smallBtnText}>Fetch</Text>
          </TouchableOpacity>
        </View>
      </View>

      {(Array.isArray(subscriptions) ? subscriptions : []).map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.listTitle}>{s.status}</Text>
          <Text style={styles.listSub}>Price: {s.priceId || '—'} • Period end: {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleString() : '—'}</Text>
          <Text style={styles.bodyText}>Stripe sub id: {s.stripeSubscriptionId}</Text>
        </View>
      ))}

      {!subscriptions.length && !loading && paymentsUserId.trim() !== '' && (
        <View style={styles.card}>
          <Text style={styles.kv}>No subscriptions found for that user.</Text>
        </View>
      )}
    </ScrollView>
  );

  const AuditTab = () => (
    <ScrollView contentContainerStyle={styles.scrollPad}>
      <Text style={styles.sectionTitle}>🧾 Admin Audit</Text>

      <TouchableOpacity style={styles.primaryBtn} onPress={refreshCurrentTab} disabled={loading}>
        <Text style={styles.primaryBtnText}>{loading ? 'Loading…' : 'Refresh'}</Text>
      </TouchableOpacity>

      {(Array.isArray(audit) ? audit : []).map((a) => (
        <View key={a.id} style={styles.card}>
          <Text style={styles.listTitle}>{a.action}</Text>
          <Text style={styles.listSub}>Actor: {a.actorId} • Target: {a.targetUserId || '—'}</Text>
          <Text style={styles.bodyText}>{new Date(a.createdAt).toLocaleString()}</Text>
        </View>
      ))}

      {!audit.length && !loading && (
        <View style={styles.card}>
          <Text style={styles.kv}>No audit entries.</Text>
        </View>
      )}
    </ScrollView>
  );

  const UserModal = () => {
    const u = selectedUser;
    if (!u) return null;

    return (
      <Modal visible={showUserModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowUserModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>User</Text>
            <TouchableOpacity onPress={() => setShowUserModal(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollPad} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <Text style={styles.listTitle}>{u.id}</Text>
              <Text style={styles.listSub}>Role: {u.role} • Provider: {u.authProvider || '—'}</Text>
              <Text style={styles.listSub}>Disabled: {u.disabledAt ? 'yes' : 'no'}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.pills}>
                {[
                  'USER',
                  'STAFF',
                  ...(String(myRole) === 'SUPERADMIN' ? ['ADMIN', 'SUPERADMIN'] : []),
                ].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.pill, String(u.role) === r && styles.pillActive]}
                    onPress={() => patchUser(u.id, { role: r })}
                  >
                    <Text style={[styles.pillText, String(u.role) === r && styles.pillTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {String(myRole) !== 'SUPERADMIN' && (
                <Text style={styles.hint}>
                  You can promote users to STAFF (limited admin). Only SUPERADMIN can grant ADMIN/SUPERADMIN.
                </Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Disable account</Text>
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.smallBtn}
                  onPress={() => patchUser(u.id, { disabled: !u.disabledAt })}
                >
                  <Text style={styles.smallBtnText}>{u.disabledAt ? 'Enable' : 'Disable'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallBtn} onPress={() => triggerReset(u.id)}>
                  <Text style={styles.smallBtnText}>Send reset email</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Set temporary password</Text>
              <TextInput
                value={tempPassword}
                onChangeText={setTempPassword}
                placeholder="Temporary password (min 8 chars)"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setPassword(u.id)} disabled={loading}>
                <Text style={styles.primaryBtnText}>{loading ? 'Working…' : 'Set password'}</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                Use sparingly. This immediately changes the user password.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderTab = () => {
    if (loading && tab !== 'users') {
      // lightweight indication is enough; we also show spinners in buttons
    }

    switch (tab) {
      case 'overview':
        return <OverviewTab />;
      case 'users':
        return <UsersTab />;
      case 'support':
        return <SupportTab />;
      case 'payments':
        return <PaymentsTab />;
      case 'audit':
        return <AuditTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <LinearGradient colors={['#667eea', '#764ba2']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>🛠️ Admin</Text>
            <View style={styles.headerRight}>
              {loading ? <ActivityIndicator color="#fff" /> : null}
              <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
                <Text style={styles.headerBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBarScroll}
            contentContainerStyle={styles.tabBar}
          >
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabBtn, tab === t.id && styles.tabBtnActive]}
                onPress={() => setTab(t.id)}
              >
                <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>{renderTab()}</View>
          <UserModal />
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerBtnText: { color: '#fff', fontWeight: '900' },
  tabBarScroll: { maxHeight: 52 },
  tabBar: { paddingHorizontal: 12, paddingBottom: 10, gap: 8, alignItems: 'center' },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
  },
  tabBtnActive: { backgroundColor: 'rgba(255,255,255,0.32)' },
  tabText: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: '#fff' },

  scrollPad: { padding: 16, paddingBottom: 30 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 10 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  kv: { color: '#0f172a', fontWeight: '800', marginBottom: 6 },
  label: { color: '#334155', fontWeight: '900', marginBottom: 8 },
  bodyText: { color: '#0f172a', marginTop: 8, lineHeight: 18 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#0f172a',
  },
  smallBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  primaryBtn: {
    marginTop: 10,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '900' },

  listItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  listTitle: { color: '#0f172a', fontWeight: '900' },
  listSub: { color: '#475569', marginTop: 6 },

  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  pillActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  pillText: { color: '#0f172a', fontWeight: '900', fontSize: 12 },
  pillTextActive: { color: '#fff' },

  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  modalClose: { fontSize: 14, fontWeight: '900', color: '#667eea' },
  hint: { color: '#64748b', marginTop: 8, fontSize: 12 },
});
