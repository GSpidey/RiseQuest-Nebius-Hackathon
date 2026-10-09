import Contacts from 'react-native-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';

export const EmergencyService = {
  async getContacts() {
    try {
      const status = await Contacts.requestPermission();
      if (status === 'authorized') {
        const data = (Contacts.getAllWithoutPhotos ? await Contacts.getAllWithoutPhotos() : await Contacts.getAll());
        return (Array.isArray(data) ? data : [])
          .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
          .map((contact) => {
            const nameParts = [contact.givenName, contact.middleName, contact.familyName].filter(Boolean);
            const computedName = String(contact.displayName || nameParts.join(' ') || contact.company || '').trim();
            const primaryNumber = String(contact.phoneNumbers?.[0]?.number || '').trim();
            return {
              ...contact,
              id: String(contact.recordID || contact.id || primaryNumber || Date.now()),
              name: computedName || primaryNumber || 'Unknown',
              primaryNumber,
            };
          })
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      }
      return [];
    } catch (error) {
      console.error('Error getting contacts:', error);
      return [];
    }
  },

  async getEmergencyContacts() {
    try {
      const contacts = await AsyncStorage.getItem('emergencyContacts');
      return contacts ? JSON.parse(contacts) : [];
    } catch (error) {
      console.error('Error loading emergency contacts:', error);
      return [];
    }
  },

  async saveEmergencyContacts(contacts) {
    try {
      await AsyncStorage.setItem('emergencyContacts', JSON.stringify(contacts));
    } catch (error) {
      console.error('Error saving emergency contacts:', error);
      throw error;
    }
  },

  async addEmergencyContact(contact) {
    try {
      const contacts = await this.getEmergencyContacts();
      const phoneNumber =
        String(
          contact?.primaryNumber ||
          contact?.phoneNumber ||
          contact?.phoneNumbers?.[0]?.number ||
          ''
        ).trim();

      const displayName = String(contact?.name || contact?.displayName || '').trim();
      const fallbackName = [contact?.givenName, contact?.familyName].filter(Boolean).join(' ').trim();

      const newContact = {
        id: Date.now().toString(),
        name: displayName || fallbackName || phoneNumber || 'Unknown',
        phoneNumber,
        relationship: contact.relationship || 'Friend',
        addedAt: Date.now(),
      };
      contacts.push(newContact);
      await this.saveEmergencyContacts(contacts);
      return newContact;
    } catch (error) {
      console.error('Error adding emergency contact:', error);
      throw error;
    }
  },

  async removeEmergencyContact(contactId) {
    try {
      const contacts = await this.getEmergencyContacts();
      const filtered = contacts.filter(c => c.id !== contactId);
      await this.saveEmergencyContacts(filtered);
    } catch (error) {
      console.error('Error removing emergency contact:', error);
      throw error;
    }
  },

  async triggerEmergencyBackup(alarmInfo, missedCount = 1) {
    try {
      const emergencyContacts = await this.getEmergencyContacts();
      
      if (emergencyContacts.length === 0) {
        Alert.alert(
          'No Emergency Contacts',
          'Add emergency contacts in settings to enable backup alerts.'
        );
        return false;
      }

      const message = this.generateEmergencyMessage(alarmInfo, missedCount);
      
      // Show confirmation before sending
      return new Promise((resolve) => {
        Alert.alert(
          '🚨 Emergency Backup Alert',
          `Send wake-up call request to ${emergencyContacts.length} emergency contact(s)?`,
          [
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => resolve(false)
            },
            { 
              text: 'Send Alert', 
              style: 'destructive',
              onPress: () => {
                this.sendEmergencyAlerts(emergencyContacts, message);
                resolve(true);
              }
            },
          ]
        );
      });
    } catch (error) {
      console.error('Error triggering emergency backup:', error);
      return false;
    }
  },

  generateEmergencyMessage(alarmInfo, missedCount) {
    const time = new Date().toLocaleTimeString();
    const date = new Date().toLocaleDateString();
    
    return `🚨 EMERGENCY WAKE-UP REQUEST 🚨\n\n` +
           `Your friend needs help waking up!\n\n` +
           `⏰ Missed Alarm: ${alarmInfo.title || 'Morning Alarm'}\n` +
           `🕐 Time: ${time} on ${date}\n` +
           `🔄 Missed ${missedCount} time(s)\n\n` +
           `Please call them to help wake them up!\n\n` +
           `- Sent by RiseQuest App`;
  },

  async sendEmergencyAlerts(contacts, message) {
    try {
      for (const contact of contacts) {
        // For demo purposes, we'll show what would be sent
        // In a real app, you'd integrate with SMS service like Twilio
        console.log(`Emergency alert would be sent to ${contact.name} (${contact.phoneNumber}):`, message);
        
        // Option 1: Open SMS app with pre-filled message
        const smsUrl = `sms:${contact.phoneNumber}?body=${encodeURIComponent(message)}`;
        
        // Option 2: Make a phone call
        const callUrl = `tel:${contact.phoneNumber}`;
        
        // For now, show what actions would be taken
        Alert.alert(
          'Emergency Alert Actions',
          `Would send SMS to ${contact.name} and optionally call them.`,
          [
            { 
              text: 'SMS', 
              onPress: () => Linking.openURL(smsUrl)
            },
            { 
              text: 'Call', 
              onPress: () => Linking.openURL(callUrl)
            },
            { text: 'Skip', style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      console.error('Error sending emergency alerts:', error);
    }
  },

  async scheduleEmergencyCheck(alarmId, delay = 10) {
    // In a real app, you'd use background tasks or server-side scheduling
    // For demo, we'll simulate with a timeout
    console.log(`Emergency check scheduled for alarm ${alarmId} in ${delay} minutes`);
    
    // Store the scheduled check
    const checks = await this.getScheduledChecks();
    checks.push({
      id: Date.now().toString(),
      alarmId,
      scheduledFor: Date.now() + (delay * 60 * 1000),
      createdAt: Date.now(),
    });
    await AsyncStorage.setItem('emergencyChecks', JSON.stringify(checks));
  },

  async getScheduledChecks() {
    try {
      const checks = await AsyncStorage.getItem('emergencyChecks');
      return checks ? JSON.parse(checks) : [];
    } catch (error) {
      console.error('Error getting scheduled checks:', error);
      return [];
    }
  },

  async cancelEmergencyCheck(alarmId) {
    try {
      const checks = await this.getScheduledChecks();
      const filtered = checks.filter(check => check.alarmId !== alarmId);
      await AsyncStorage.setItem('emergencyChecks', JSON.stringify(filtered));
    } catch (error) {
      console.error('Error canceling emergency check:', error);
    }
  },

  // Buddy system - connect with other RiseQuest users
  async getRiseQuestBuddies() {
    try {
      const buddies = await AsyncStorage.getItem('riseQuestBuddies');
      return buddies ? JSON.parse(buddies) : [];
    } catch (error) {
      console.error('Error getting RiseQuest buddies:', error);
      return [];
    }
  },

  async addRiseQuestBuddy(buddy) {
    try {
      const buddies = await this.getRiseQuestBuddies();
      const newBuddy = {
        id: Date.now().toString(),
        name: buddy.name,
        username: buddy.username,
        status: 'pending', // pending, active, inactive
        addedAt: Date.now(),
      };
      buddies.push(newBuddy);
      await AsyncStorage.setItem('riseQuestBuddies', JSON.stringify(buddies));
      return newBuddy;
    } catch (error) {
      console.error('Error adding RiseQuest buddy:', error);
      throw error;
    }
  },

  generateBuddyWakeUpCall(senderName, alarmInfo) {
    return {
      type: 'buddy_wake_up_call',
      from: senderName,
      message: `🔔 Wake up call from ${senderName}!\n\n` +
               `They're helping you wake up for: ${alarmInfo.title}\n\n` +
               `Time to rise and shine! 🌅`,
      timestamp: Date.now(),
      alarmInfo,
    };
  },

  getEmergencySettings() {
    return {
      enableBackupAlerts: true,
      backupDelay: 10, // minutes
      maxMissedAlarms: 3,
      allowBuddyWakeUp: true,
      autoCallEmergencyContacts: false,
      emergencyMessage: 'Custom emergency message...',
    };
  },
};
