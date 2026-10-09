import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
  TextInput,
  Alert,
  FlatList,
  Dimensions,
  Linking,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Contacts from 'react-native-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

/**
 * Social & Emergency Features Component
 * Trusted contacts, wake-up calls, emergency backup system
 */
export const SocialEmergencyFeatures = ({ userProfile, onUpdateProfile }) => {
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [wakeUpBuddies, setWakeUpBuddies] = useState([]);
  const [emergencySettings, setEmergencySettings] = useState({
    enabled: true,
    maxMissedAlarms: 3,
    emergencyDelay: 30, // minutes
    autoCallEnabled: false,
    emergencyMessage: "I may need assistance - my alarm system detected I haven't woken up as planned.",
  });
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showBuddyModal, setShowBuddyModal] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [selectedContactType, setSelectedContactType] = useState('emergency');
  const [availableContacts, setAvailableContacts] = useState([]);
  const [wakeUpHistory, setWakeUpHistory] = useState([]);

  useEffect(() => {
    loadTrustedContacts();
    loadWakeUpBuddies();
    loadEmergencySettings();
    loadWakeUpHistory();
  }, []);

  const loadTrustedContacts = async () => {
    try {
      const contacts = await AsyncStorage.getItem('trustedContacts');
      if (contacts) {
        setTrustedContacts(JSON.parse(contacts));
      }
    } catch (error) {
      console.error('Error loading trusted contacts:', error);
    }
  };

  const loadWakeUpBuddies = async () => {
    try {
      const buddies = await AsyncStorage.getItem('wakeUpBuddies');
      if (buddies) {
        setWakeUpBuddies(JSON.parse(buddies));
      }
    } catch (error) {
      console.error('Error loading wake-up buddies:', error);
    }
  };

  const loadEmergencySettings = async () => {
    try {
      const settings = await AsyncStorage.getItem('emergencySettings');
      if (settings) {
        setEmergencySettings(JSON.parse(settings));
      }
    } catch (error) {
      console.error('Error loading emergency settings:', error);
    }
  };

  const loadWakeUpHistory = async () => {
    try {
      const history = await AsyncStorage.getItem('wakeUpHistory');
      if (history) {
        setWakeUpHistory(JSON.parse(history));
      } else {
        setWakeUpHistory([]);
      }
    } catch (error) {
      console.error('Error loading wake-up history:', error);
    }
  };

  const requestContactsPermission = async () => {
    try {
      const status = await Contacts.requestPermission();
      if (status === 'authorized') {
        const data = await Contacts.getAll();
        setAvailableContacts(data);
        return true;
      } else {
        Alert.alert(
          'Permission Required',
          'Contact access is needed to select trusted contacts.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
      return false;
    }
  };

  const ContactSelectionModal = () => (
    <Modal visible={showContactsModal} animationType="slide">
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {selectedContactType === 'emergency' ? '🚨 Add Emergency Contact' : '👥 Add Wake-Up Buddy'}
          </Text>
          <TouchableOpacity onPress={() => setShowContactsModal(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <Text style={styles.sectionDescription}>
            {selectedContactType === 'emergency' 
              ? 'Emergency contacts will be notified if you miss multiple alarms'
              : 'Wake-up buddies can call you to help you wake up'
            }
          </Text>

          <TouchableOpacity
            style={styles.loadContactsButton}
            onPress={async () => {
              const permitted = await requestContactsPermission();
              if (!permitted) return;
            }}
          >
            <Text style={styles.loadContactsText}>📱 Load Contacts</Text>
          </TouchableOpacity>

          <View style={styles.manualContactForm}>
            <Text style={styles.formLabel}>Or Add Manually</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Contact Name"
              placeholderTextColor="rgba(255,255,255,0.6)"
              onChangeText={(text) => setManualContact(prev => ({ ...prev, name: text }))}
            />
            <TextInput
              style={styles.formInput}
              placeholder="Phone Number"
              placeholderTextColor="rgba(255,255,255,0.6)"
              keyboardType="phone-pad"
              onChangeText={(text) => setManualContact(prev => ({ ...prev, phone: text }))}
            />
            <TouchableOpacity
              style={styles.addManualButton}
              onPress={addManualContact}
            >
              <Text style={styles.addManualText}>Add Contact</Text>
            </TouchableOpacity>
          </View>

          {availableContacts.length > 0 && (
            <FlatList
              data={availableContacts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.contactItem}
                  onPress={() => selectContact(item)}
                >
                  <Text style={styles.contactName}>
                    {item.displayName || [item.givenName, item.familyName].filter(Boolean).join(' ') || item.name}
                  </Text>
                  <Text style={styles.contactPhone}>
                    {item.phoneNumbers?.[0]?.number || 'No phone number'}
                  </Text>
                </TouchableOpacity>
              )}
              style={styles.contactsList}
            />
          )}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );

  const WakeUpBuddyModal = () => (
    <Modal visible={showBuddyModal} animationType="slide">
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>👥 Wake-Up Buddy System</Text>
          <TouchableOpacity onPress={() => setShowBuddyModal(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.buddyFeatures}>
            <Text style={styles.featuresTitle}>How It Works</Text>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📞</Text>
              <Text style={styles.featureText}>
                Your buddy will receive a call request when you snooze
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🔄</Text>
              <Text style={styles.featureText}>
                Take turns being each other's wake-up buddy
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🎯</Text>
              <Text style={styles.featureText}>
                Build accountability and consistency together
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🏆</Text>
              <Text style={styles.featureText}>
                Earn bonus points for helping each other
              </Text>
            </View>
          </View>

          <View style={styles.inviteSection}>
            <Text style={styles.sectionTitle}>Invite Friends</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Friend's email or phone number"
              placeholderTextColor="rgba(255,255,255,0.6)"
            />
            <TouchableOpacity style={styles.inviteButton}>
              <Text style={styles.inviteButtonText}>Send Invitation</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>Buddy Settings</Text>
            
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Enable Wake-Up Calls</Text>
              <Switch
                value={userProfile?.buddySettings?.enabled}
                onValueChange={(value) => updateBuddySetting('enabled', value)}
              />
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Allow Calls From Buddies</Text>
              <Switch
                value={userProfile?.buddySettings?.allowCalls}
                onValueChange={(value) => updateBuddySetting('allowCalls', value)}
              />
            </View>

            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Mutual Accountability</Text>
              <Switch
                value={userProfile?.buddySettings?.mutual}
                onValueChange={(value) => updateBuddySetting('mutual', value)}
              />
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </Modal>
  );

  const EmergencySettingsModal = () => (
    <Modal visible={showEmergencyModal} animationType="slide">
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🚨 Emergency Settings</Text>
          <TouchableOpacity onPress={() => setShowEmergencyModal(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          <View style={styles.emergencySettings}>
            <View style={styles.settingGroup}>
              <Text style={styles.settingLabel}>Enable Emergency System</Text>
              <Switch
                value={emergencySettings.enabled}
                onValueChange={(value) => 
                  setEmergencySettings(prev => ({ ...prev, enabled: value }))
                }
              />
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.settingLabel}>
                Max Missed Alarms: {emergencySettings.maxMissedAlarms}
              </Text>
              <View style={styles.numberControls}>
                <TouchableOpacity
                  style={styles.numberButton}
                  onPress={() => adjustMissedAlarms(-1)}
                >
                  <Text style={styles.numberButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.numberValue}>{emergencySettings.maxMissedAlarms}</Text>
                <TouchableOpacity
                  style={styles.numberButton}
                  onPress={() => adjustMissedAlarms(1)}
                >
                  <Text style={styles.numberButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.settingLabel}>
                Emergency Delay: {emergencySettings.emergencyDelay} minutes
              </Text>
              <View style={styles.numberControls}>
                <TouchableOpacity
                  style={styles.numberButton}
                  onPress={() => adjustEmergencyDelay(-5)}
                >
                  <Text style={styles.numberButtonText}>-5</Text>
                </TouchableOpacity>
                <Text style={styles.numberValue}>{emergencySettings.emergencyDelay}</Text>
                <TouchableOpacity
                  style={styles.numberButton}
                  onPress={() => adjustEmergencyDelay(5)}
                >
                  <Text style={styles.numberButtonText}>+5</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.settingLabel}>Auto-Call Emergency Contacts</Text>
              <Switch
                value={emergencySettings.autoCallEnabled}
                onValueChange={(value) => 
                  setEmergencySettings(prev => ({ ...prev, autoCallEnabled: value }))
                }
              />
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.settingLabel}>Emergency Message</Text>
              <TextInput
                style={[styles.formInput, styles.messageInput]}
                value={emergencySettings.emergencyMessage}
                onChangeText={(text) => 
                  setEmergencySettings(prev => ({ ...prev, emergencyMessage: text }))
                }
                multiline
                placeholder="Custom emergency message"
                placeholderTextColor="rgba(255,255,255,0.6)"
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveEmergencySettings}
          >
            <Text style={styles.saveButtonText}>Save Emergency Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={testEmergencySystem}
          >
            <Text style={styles.testButtonText}>🧪 Test Emergency System</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </Modal>
  );

  const [manualContact, setManualContact] = useState({ name: '', phone: '' });

  const selectContact = (contact) => {
    const newContact = {
      id: contact.id || Date.now().toString(),
      name: contact.displayName || [contact.givenName, contact.familyName].filter(Boolean).join(' ') || contact.name || 'Unknown',
      phone: contact.phoneNumbers?.[0]?.number || '',
      type: selectedContactType,
      addedAt: new Date().toISOString(),
    };

    if (selectedContactType === 'emergency') {
      addTrustedContact(newContact);
    } else {
      addWakeUpBuddy(newContact);
    }
  };

  const addManualContact = () => {
    if (!manualContact.name.trim() || !manualContact.phone.trim()) {
      Alert.alert('Error', 'Please enter both name and phone number');
      return;
    }

    const newContact = {
      id: Date.now().toString(),
      name: manualContact.name,
      phone: manualContact.phone,
      type: selectedContactType,
      addedAt: new Date().toISOString(),
    };

    if (selectedContactType === 'emergency') {
      addTrustedContact(newContact);
    } else {
      addWakeUpBuddy(newContact);
    }

    setManualContact({ name: '', phone: '' });
  };

  const addTrustedContact = async (contact) => {
    try {
      const updatedContacts = [...trustedContacts, contact];
      setTrustedContacts(updatedContacts);
      await AsyncStorage.setItem('trustedContacts', JSON.stringify(updatedContacts));
      setShowContactsModal(false);
      Alert.alert('Success', 'Emergency contact added successfully!');
    } catch (error) {
      console.error('Error adding trusted contact:', error);
      Alert.alert('Error', 'Failed to add emergency contact');
    }
  };

  const addWakeUpBuddy = async (buddy) => {
    try {
      const updatedBuddies = [...wakeUpBuddies, buddy];
      setWakeUpBuddies(updatedBuddies);
      await AsyncStorage.setItem('wakeUpBuddies', JSON.stringify(updatedBuddies));
      setShowContactsModal(false);
      Alert.alert('Success', 'Wake-up buddy added successfully!');
    } catch (error) {
      console.error('Error adding wake-up buddy:', error);
      Alert.alert('Error', 'Failed to add wake-up buddy');
    }
  };

  const removeTrustedContact = async (contactId) => {
    Alert.alert(
      'Remove Contact',
      'Are you sure you want to remove this emergency contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedContacts = trustedContacts.filter(c => c.id !== contactId);
              setTrustedContacts(updatedContacts);
              await AsyncStorage.setItem('trustedContacts', JSON.stringify(updatedContacts));
            } catch (error) {
              console.error('Error removing trusted contact:', error);
            }
          }
        }
      ]
    );
  };

  const removeWakeUpBuddy = async (buddyId) => {
    Alert.alert(
      'Remove Buddy',
      'Are you sure you want to remove this wake-up buddy?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedBuddies = wakeUpBuddies.filter(b => b.id !== buddyId);
              setWakeUpBuddies(updatedBuddies);
              await AsyncStorage.setItem('wakeUpBuddies', JSON.stringify(updatedBuddies));
            } catch (error) {
              console.error('Error removing wake-up buddy:', error);
            }
          }
        }
      ]
    );
  };

  const adjustMissedAlarms = (delta) => {
    setEmergencySettings(prev => ({
      ...prev,
      maxMissedAlarms: Math.max(1, Math.min(10, prev.maxMissedAlarms + delta))
    }));
  };

  const adjustEmergencyDelay = (delta) => {
    setEmergencySettings(prev => ({
      ...prev,
      emergencyDelay: Math.max(5, Math.min(120, prev.emergencyDelay + delta))
    }));
  };

  const saveEmergencySettings = async () => {
    try {
      await AsyncStorage.setItem('emergencySettings', JSON.stringify(emergencySettings));
      setShowEmergencyModal(false);
      Alert.alert('Saved', 'Emergency settings saved successfully!');
    } catch (error) {
      console.error('Error saving emergency settings:', error);
      Alert.alert('Error', 'Failed to save emergency settings');
    }
  };

  const testEmergencySystem = () => {
    const contact = trustedContacts.find(item => String(item.phone || '').replace(/[^+\d]/g, '').length >= 3);
    if (!contact) {
      Alert.alert('Add a contact', 'Add a trusted contact with a phone number before previewing a test message.');
      return;
    }
    Alert.alert(
      'Preview a test message',
      `Open a clearly labelled test message to ${contact.name} in your messaging app? You decide whether to send it there. RiseQuest cannot confirm delivery and does not automatically notify these contacts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Messages',
          onPress: async () => {
            const phone = String(contact.phone).replace(/[^+\d]/g, '');
            const body = encodeURIComponent('RiseQuest test message only. No emergency or assistance is being reported.');
            try {
              await Linking.openURL(`sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${body}`);
            } catch {
              Alert.alert('Messages unavailable', 'No message was sent. Open your messaging app yourself to contact this person.');
            }
          }
        }
      ]
    );
  };

  const updateBuddySetting = (setting, value) => {
    const updatedProfile = {
      ...userProfile,
      buddySettings: {
        ...userProfile.buddySettings,
        [setting]: value,
      },
    };
    onUpdateProfile(updatedProfile);
  };

  const getHistoryIcon = (type, result) => {
    if (type === 'emergency_alert') {
      return result === 'successful' ? '🚨✅' : '🚨❌';
    } else if (type === 'buddy_call') {
      return result === 'successful' ? '📞✅' : result === 'no_answer' ? '📞⏰' : '📞❌';
    }
    return '📱';
  };

  const getHistoryColor = (result) => {
    switch (result) {
      case 'successful': return '#4CAF50';
      case 'no_answer': return '#FF9800';
      default: return '#F44336';
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.header}>
        <Text style={styles.headerTitle}>👥 Social & Emergency</Text>
        <Text style={styles.headerSubtitle}>Connect with others for accountability and safety</Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Emergency Contacts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🚨 Emergency Contacts</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                setSelectedContactType('emergency');
                setShowContactsModal(true);
              }}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {trustedContacts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No emergency contacts added</Text>
              <Text style={styles.emptySubtext}>
                Save trusted contacts for messages you choose to send. Automatic delivery is not enabled.
              </Text>
            </View>
          ) : (
            trustedContacts.map(contact => (
              <View key={contact.id} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeTrustedContact(contact.id)}
                >
                  <Text style={styles.removeButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowEmergencyModal(true)}
          >
            <Text style={styles.settingsButtonText}>⚙️ Emergency Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Wake-Up Buddies Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>👥 Wake-Up Buddies</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                setSelectedContactType('buddy');
                setShowContactsModal(true);
              }}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {wakeUpBuddies.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No wake-up buddies added</Text>
              <Text style={styles.emptySubtext}>
                Add friends who can help you wake up and build accountability
              </Text>
            </View>
          ) : (
            wakeUpBuddies.map(buddy => (
              <View key={buddy.id} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{buddy.name}</Text>
                  <Text style={styles.contactPhone}>{buddy.phone}</Text>
                  <Text style={styles.buddyStatus}>Active Buddy</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeWakeUpBuddy(buddy.id)}
                >
                  <Text style={styles.removeButtonText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => setShowBuddyModal(true)}
          >
            <Text style={styles.settingsButtonText}>⚙️ Buddy System Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Activity History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Recent Activity</Text>
          {wakeUpHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No recent activity</Text>
              <Text style={styles.emptySubtext}>
                Your social alarm activity will appear here
              </Text>
            </View>
          ) : (
            wakeUpHistory.map(item => (
              <View key={item.id} style={styles.historyCard}>
                <Text style={styles.historyIcon}>
                  {getHistoryIcon(item.type, item.result)}
                </Text>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyTitle}>
                    {item.type === 'emergency_alert' ? 'Emergency Alert' : 'Wake-Up Call'}
                  </Text>
                  <Text style={styles.historyDescription}>
                    {item.contact} • {item.date} at {item.time}
                  </Text>
                </View>
                <View 
                  style={[
                    styles.historyStatus,
                    { backgroundColor: getHistoryColor(item.result) }
                  ]}
                >
                  <Text style={styles.historyStatusText}>
                    {item.result.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Privacy & Safety Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔒 Privacy & Safety</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Your Privacy is Protected</Text>
            <Text style={styles.infoText}>
              • Contacts are stored securely on your device{'\n'}
              • Emergency notifications are only sent when configured{'\n'}
              • Wake-up buddies require mutual consent{'\n'}
              • You can disable features at any time
            </Text>
          </View>
        </View>
      </ScrollView>

      <ContactSelectionModal />
      <WakeUpBuddyModal />
      <EmergencySettingsModal />
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
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
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
    color: '#333',
  },
  addButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },

  // Contact Card Styles
  contactCard: {
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
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  contactPhone: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  buddyStatus: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 2,
    fontWeight: '500',
  },
  removeButton: {
    padding: 10,
  },
  removeButtonText: {
    fontSize: 18,
  },

  // Settings Button
  settingsButton: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  settingsButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '500',
  },

  // Empty State
  emptyState: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 5,
  },

  // History Card Styles
  historyCard: {
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
  historyIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  historyInfo: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  historyDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  historyStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  historyStatusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Info Card
  infoCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    fontSize: 24,
    color: 'white',
    padding: 5,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  sectionDescription: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Contact Selection
  loadContactsButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  loadContactsText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  manualContactForm: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  formLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 12,
    borderRadius: 8,
    color: 'white',
    fontSize: 16,
    marginBottom: 10,
  },
  addManualButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addManualText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactsList: {
    maxHeight: 300,
  },
  contactItem: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
  },

  // Buddy Features
  buddyFeatures: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  featuresTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  featureText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    flex: 1,
  },

  // Settings
  inviteSection: {
    marginBottom: 20,
  },
  inviteButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  inviteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  settingsSection: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  settingLabel: {
    color: 'white',
    fontSize: 16,
    flex: 1,
  },

  // Emergency Settings
  emergencySettings: {
    marginBottom: 20,
  },
  settingGroup: {
    marginBottom: 20,
  },
  numberControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  numberButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 10,
    borderRadius: 6,
    marginHorizontal: 10,
  },
  numberButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  numberValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  messageInput: {
    height: 80,
    textAlignVertical: 'top',
    marginTop: 10,
  },

  // Action Buttons
  saveButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  testButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  testButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default SocialEmergencyFeatures;
