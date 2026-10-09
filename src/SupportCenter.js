import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Linking,
  Switch,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfileService } from './models/RiseQuestModels';

const SupportCenter = ({ visible, onClose, userProfile, onUpdateProfile }) => {
  const [activeTab, setActiveTab] = useState('settings');
  const [supportForm, setSupportForm] = useState({
    subject: '',
    message: '',
    email: '',
    priority: 'medium',
  });

  const [supportPrefs, setSupportPrefs] = useState({
    supportEnabled: false,
    supportConditions: [],
    reducedSensory: false,
    dyslexiaFriendly: false,
    captionsEnabled: false,
    uiDensity: 'standard',
  });

  useEffect(() => {
    if (!visible) return;
    const p = userProfile || {};
    setSupportPrefs({
      supportEnabled: Boolean(p.supportEnabled),
      supportConditions: Array.isArray(p.supportConditions) ? p.supportConditions : [],
      reducedSensory: Boolean(p.preferences?.reducedSensory),
      dyslexiaFriendly: Boolean(p.preferences?.dyslexiaFriendly),
      captionsEnabled: Boolean(p.preferences?.captionsEnabled),
      uiDensity: String(p.preferences?.uiDensity || 'standard'),
    });
  }, [visible, userProfile]);

  const supportEmail = 'Risequestsupport@goldenepics.com';

  const toggleArrayValue = (arr, value) => {
    const list = Array.isArray(arr) ? arr : [];
    return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  };

  const saveSupportSettings = async () => {
    try {
      const merged = await UserProfileService.updateProfile({
        supportEnabled: Boolean(supportPrefs.supportEnabled),
        supportConditions: supportPrefs.supportEnabled
          ? (Array.isArray(supportPrefs.supportConditions) ? supportPrefs.supportConditions : [])
          : [],
        usageMode: supportPrefs.supportEnabled ? UserProfileService.USAGE_MODES.SUPPORT : UserProfileService.USAGE_MODES.STANDARD,
        preferences: {
          ...(userProfile?.preferences || {}),
          reducedSensory: Boolean(supportPrefs.reducedSensory),
          dyslexiaFriendly: Boolean(supportPrefs.dyslexiaFriendly),
          captionsEnabled: Boolean(supportPrefs.captionsEnabled),
          uiDensity: String(supportPrefs.uiDensity || 'standard'),
        },
      });
      if (merged && typeof onUpdateProfile === 'function') {
        onUpdateProfile(merged);
      }
      Alert.alert('Support Settings', 'Saved successfully.');
    } catch (e) {
      Alert.alert('Support Settings', 'Could not save your settings.');
    }
  };

  const faqData = [
    {
      category: '🚨 Alarm Issues',
      questions: [
        {
          q: 'My alarm didn\'t ring, what happened?',
          a: 'Several factors can affect alarm reliability:\n• Device in Do Not Disturb mode\n• App not running in background\n• System volume turned down\n• Battery optimization blocking the app\n\nCheck your device settings and ensure RiseQuest has proper permissions.'
        },
        {
          q: 'How do I set up a backup alarm?',
          a: 'Premium users can enable the Emergency Backup System:\n1. Go to Settings > Premium Features\n2. Enable "Emergency Backup"\n3. Add trusted contacts\n4. Set backup delay time\n\nThis will send wake-up calls if your main alarm fails.'
        },
        {
          q: 'Can I use my own music as alarm tone?',
          a: 'Yes! Premium users can:\n1. Tap "Create Alarm"\n2. Select "Custom Tone"\n3. Choose from your music library\n4. Preview and save\n\nFree users have access to 3 built-in tones.'
        }
      ]
    },
    {
      category: '💳 Billing & Subscriptions',
      questions: [
        {
          q: 'How do I cancel my premium subscription?',
          a: 'To cancel your subscription:\n• iOS: Settings > [Your Name] > Subscriptions > RiseQuest\n• Android: Play Store > Menu > Subscriptions > RiseQuest\n\nYou\'ll keep premium features until your current period ends.'
        },
        {
          q: 'Can I get a refund?',
          a: 'Refund policies depend on your platform:\n• iOS: Apple handles refunds through their standard policy\n• Android: Google Play refund policy applies\n\nContact us at Risequestsupport@goldenepics.com for assistance with refund requests.'
        },
        {
          q: 'What happens after my free trial?',
          a: 'After your 7-day free trial:\n• You\'ll be charged for your selected plan\n• Cancel anytime before trial ends to avoid charges\n• All premium features remain during trial\n• No commitment - cancel anytime'
        }
      ]
    },
    {
      category: '🎮 RisePoints & Rewards',
      questions: [
        {
          q: 'How do I earn RisePoints?',
          a: 'Earn RisePoints by:\n• Completing wake-up challenges (+10-50 points)\n• Daily alarm streaks (+25 points/day)\n• Mini-game victories (+15-30 points)\n• Sharing achievements (+20 points)\n• Premium bonuses (2x multiplier)'
        },
        {
          q: 'What can I buy with RisePoints?',
          a: 'Spend RisePoints on:\n• New alarm themes (100-300 points)\n• Exclusive wake-up sounds (150-500 points)\n• Achievement badges (50-200 points)\n• Special challenge packs (400-800 points)\n• Bonus XP boosters (100 points)'
        },
        {
          q: 'Do RisePoints expire?',
          a: 'RisePoints never expire! They stay in your account permanently. However, special promotional points may have expiration dates (clearly marked when earned).'
        }
      ]
    },
    {
      category: '⚙️ Technical Issues',
      questions: [
        {
          q: 'The app crashes when I open it',
          a: 'Try these troubleshooting steps:\n1. Force close and restart the app\n2. Restart your device\n3. Update to latest app version\n4. Clear app cache (Android)\n5. Reinstall the app\n\nIf issues persist, contact support with your device model.'
        },
        {
          q: 'Location-based alarms aren\'t working',
          a: 'Ensure location permissions are enabled:\n• iOS: Settings > Privacy > Location Services > RiseQuest\n• Android: Settings > Apps > RiseQuest > Permissions\n\nAlso check that GPS/location services are turned on for your device.'
        },
        {
          q: 'How do I backup my alarm data?',
          a: 'Your alarm data is automatically backed up:\n• Premium users: Cloud sync across devices\n• Free users: Local device backup\n\nTo restore: Log in with the same account on a new device.'
        }
      ]
    }
  ];

  const contactReasons = [
    { id: 'bug', label: '🐛 Report a Bug', priority: 'high' },
    { id: 'feature', label: '💡 Feature Request', priority: 'low' },
    { id: 'billing', label: '💳 Billing Issue', priority: 'high' },
    { id: 'account', label: '👤 Account Problem', priority: 'medium' },
    { id: 'alarm', label: '⏰ Alarm Not Working', priority: 'high' },
    { id: 'premium', label: '⭐ Premium Features', priority: 'medium' },
    { id: 'other', label: '❓ Other Issue', priority: 'medium' },
  ];

  const handleSendEmail = () => {
    const { subject, message, email } = supportForm;
    
    if (!subject || !message || !email) {
      Alert.alert('Missing Information', 'Please fill in all fields before sending.');
      return;
    }

    const emailBody = encodeURIComponent(`
Support Request Details:
------------------------
Priority: ${supportForm.priority.toUpperCase()}
User Email: ${email}
Subject: ${subject}

Message:
${message}

Device Information:
- App Version: 1.0.0
- Platform: ${Platform.OS}
- Timestamp: ${new Date().toLocaleString()}

Please respond to this request as soon as possible.

Thank you!
    `);

    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(`RiseQuest Support: ${subject}`)}&body=${emailBody}`;
    
    Linking.openURL(mailtoUrl).then(() => {
      Alert.alert(
        'Email Sent!',
        'Your support request has been sent. We typically respond within 24-48 hours.',
        [
          {
            text: 'OK',
            onPress: () => {
              setSupportForm({ subject: '', message: '', email: '', priority: 'medium' });
              onClose();
            }
          }
        ]
      );
    }).catch(() => {
      Alert.alert(
        'Email Error',
        `Please manually send your request to: ${supportEmail}`,
        [
          {
            text: 'Copy Email',
            onPress: () => Alert.alert('Copied!', 'Support email copied to clipboard')
          },
          { text: 'OK' }
        ]
      );
    });
  };

  const QuickActions = () => (
    <View style={styles.quickActions}>
      <Text style={styles.sectionTitle}>🚀 Quick Actions</Text>
      
      <TouchableOpacity 
        style={styles.quickActionButton}
        onPress={() => Linking.openURL(`mailto:${supportEmail}`)}
      >
        <Text style={styles.quickActionIcon}>📧</Text>
        <Text style={styles.quickActionText}>Email Support Directly</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.quickActionButton}
        onPress={() => setActiveTab('contact')}
      >
        <Text style={styles.quickActionIcon}>📝</Text>
        <Text style={styles.quickActionText}>Submit Support Ticket</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.quickActionButton}
        onPress={() => {
          // Open app store for rating
          Alert.alert('Rate RiseQuest', 'Thank you for your feedback! This would open the app store.');
        }}
      >
        <Text style={styles.quickActionIcon}>⭐</Text>
        <Text style={styles.quickActionText}>Rate the App</Text>
      </TouchableOpacity>
    </View>
  );

  const FAQTab = () => (
    <ScrollView style={styles.tabContent}>
      <QuickActions />
      
      {faqData.map((category, categoryIndex) => (
        <View key={categoryIndex} style={styles.faqCategory}>
          <Text style={styles.categoryTitle}>{category.category}</Text>
          
          {category.questions.map((faq, faqIndex) => (
            <View key={faqIndex} style={styles.faqItem}>
              <Text style={styles.faqQuestion}>{faq.q}</Text>
              <Text style={styles.faqAnswer}>{faq.a}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );

  const ContactTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>📞 Contact Support</Text>
      <Text style={styles.supportInfo}>
        We're here to help! Choose your issue type below or send us a detailed message.
      </Text>

      <View style={styles.contactReasons}>
        <Text style={styles.reasonsTitle}>What can we help you with?</Text>
        {contactReasons.map((reason) => (
          <TouchableOpacity
            key={reason.id}
            style={[
              styles.reasonButton,
              supportForm.subject === reason.label && styles.reasonButtonSelected
            ]}
            onPress={() => setSupportForm({ ...supportForm, subject: reason.label, priority: reason.priority })}
          >
            <Text style={[
              styles.reasonText,
              supportForm.subject === reason.label && styles.reasonTextSelected
            ]}>
              {reason.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.formLabel}>Your Email Address</Text>
        <TextInput
          style={styles.textInput}
          value={supportForm.email}
          onChangeText={(text) => setSupportForm({ ...supportForm, email: text })}
          placeholder="your.email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.formLabel}>Subject (or select above)</Text>
        <TextInput
          style={styles.textInput}
          value={supportForm.subject}
          onChangeText={(text) => setSupportForm({ ...supportForm, subject: text })}
          placeholder="Brief description of your issue"
        />

        <Text style={styles.formLabel}>Detailed Message</Text>
        <TextInput
          style={[styles.textInput, styles.messageInput]}
          value={supportForm.message}
          onChangeText={(text) => setSupportForm({ ...supportForm, message: text })}
          placeholder="Please describe your issue in detail. Include any error messages or steps to reproduce the problem."
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <View style={styles.priorityContainer}>
          <Text style={styles.formLabel}>Priority Level</Text>
          <View style={styles.priorityButtons}>
            {['low', 'medium', 'high'].map((priority) => (
              <TouchableOpacity
                key={priority}
                style={[
                  styles.priorityButton,
                  supportForm.priority === priority && styles.priorityButtonSelected
                ]}
                onPress={() => setSupportForm({ ...supportForm, priority })}
              >
                <Text style={[
                  styles.priorityText,
                  supportForm.priority === priority && styles.priorityTextSelected
                ]}>
                  {priority.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.sendButton} onPress={handleSendEmail}>
          <Text style={styles.sendButtonText}>📧 Send Support Request</Text>
        </TouchableOpacity>

        <Text style={styles.responseTime}>
          💬 We typically respond within 24-48 hours
        </Text>
      </View>
    </ScrollView>
  );

  const SupportSettingsTab = () => (
    <ScrollView style={styles.tabContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>🧠 Support Settings</Text>
      <Text style={styles.supportInfo}>
        Adjust neurodivergent support and accessibility preferences. These settings are optional and can be changed anytime.
      </Text>

      <View style={styles.settingCard}>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Enable Special Support</Text>
            <Text style={styles.settingDesc}>ADHD/ADD and bipolar-friendly features, gentle routines, and tracking tools</Text>
          </View>
          <Switch
            value={supportPrefs.supportEnabled}
            onValueChange={(v) => setSupportPrefs(prev => ({ ...prev, supportEnabled: v }))}
            trackColor={{ false: '#cbd5e0', true: '#22c55e' }}
            thumbColor={supportPrefs.supportEnabled ? '#ffffff' : '#f4f3f4'}
          />
        </View>
      </View>

      {supportPrefs.supportEnabled && (
        <View style={styles.settingCard}>
          <Text style={styles.settingTitle}>Support Areas</Text>
          <Text style={styles.settingDesc}>Select what you want help with</Text>
          <View style={styles.pillsRow}>
            {[
              { id: 'adhd', label: 'ADHD' },
              { id: 'add', label: 'ADD' },
              { id: 'bipolar', label: 'Bipolar' },
              { id: 'general', label: 'Wellness' },
            ].map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.pill, supportPrefs.supportConditions.includes(c.id) && styles.pillActive]}
                onPress={() => setSupportPrefs(prev => ({
                  ...prev,
                  supportConditions: toggleArrayValue(prev.supportConditions, c.id),
                }))}
              >
                <Text style={[styles.pillText, supportPrefs.supportConditions.includes(c.id) && styles.pillTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>♿ Accessibility</Text>
      <View style={styles.settingCard}>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Reduced sensory mode</Text>
            <Text style={styles.settingDesc}>Less intense visuals and gentler prompts</Text>
          </View>
          <Switch
            value={supportPrefs.reducedSensory}
            onValueChange={(v) => setSupportPrefs(prev => ({ ...prev, reducedSensory: v }))}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Dyslexia-friendly</Text>
            <Text style={styles.settingDesc}>Improves readability</Text>
          </View>
          <Switch
            value={supportPrefs.dyslexiaFriendly}
            onValueChange={(v) => setSupportPrefs(prev => ({ ...prev, dyslexiaFriendly: v }))}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Captions for audio</Text>
            <Text style={styles.settingDesc}>Show captions when audio cues are used</Text>
          </View>
          <Switch
            value={supportPrefs.captionsEnabled}
            onValueChange={(v) => setSupportPrefs(prev => ({ ...prev, captionsEnabled: v }))}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>📐 Interface density</Text>
      <View style={styles.settingCard}>
        <View style={styles.pillsRow}>
          {[
            { id: 'compact', label: 'Compact' },
            { id: 'standard', label: 'Standard' },
            { id: 'spacious', label: 'Spacious' },
          ].map((d) => (
            <TouchableOpacity
              key={d.id}
              style={[styles.pill, supportPrefs.uiDensity === d.id && styles.pillActive]}
              onPress={() => setSupportPrefs(prev => ({ ...prev, uiDensity: d.id }))}
            >
              <Text style={[styles.pillText, supportPrefs.uiDensity === d.id && styles.pillTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.primarySaveButton} onPress={saveSupportSettings}>
        <Text style={styles.primarySaveButtonText}>Save Support Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'settings': return <SupportSettingsTab />;
      case 'faq': return <FAQTab />;
      case 'contact': return <ContactTab />;
      default: return <FAQTab />;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Support</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'settings' && styles.activeTab]}
            onPress={() => setActiveTab('settings')}
          >
            <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>
              🧠 Settings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'faq' && styles.activeTab]}
            onPress={() => setActiveTab('faq')}
          >
            <Text style={[styles.tabText, activeTab === 'faq' && styles.activeTabText]}>
              ❓ FAQ
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'contact' && styles.activeTab]}
            onPress={() => setActiveTab('contact')}
          >
            <Text style={[styles.tabText, activeTab === 'contact' && styles.activeTabText]}>
              📞 Contact
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {renderTabContent()}
        </View>
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
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    margin: 20,
    borderRadius: 15,
    padding: 5,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: 'white',
  },
  tabText: {
    color: 'white',
    fontSize: 14,
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
  },
  tabContent: {
    flex: 1,
    padding: 20,
  },
  quickActions: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 15,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7fafc',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  quickActionIcon: {
    fontSize: 20,
    marginRight: 15,
  },
  quickActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4a5568',
  },
  faqCategory: {
    marginBottom: 25,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 5,
  },
  faqItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    color: '#718096',
    lineHeight: 20,
  },
  supportInfo: {
    fontSize: 16,
    color: '#718096',
    lineHeight: 24,
    marginBottom: 20,
    textAlign: 'center',
  },
  settingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  settingDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#eef2f7',
    marginVertical: 10,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pillActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#667eea',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  pillTextActive: {
    color: '#4338ca',
  },
  primarySaveButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  primarySaveButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  contactReasons: {
    marginBottom: 20,
  },
  reasonsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 10,
  },
  reasonButton: {
    backgroundColor: '#f7fafc',
    borderRadius: 10,
    padding: 15,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  reasonButtonSelected: {
    backgroundColor: '#ebf4ff',
    borderColor: '#667eea',
  },
  reasonText: {
    fontSize: 14,
    color: '#718096',
    fontWeight: '500',
  },
  reasonTextSelected: {
    color: '#667eea',
    fontWeight: 'bold',
  },
  formContainer: {
    marginTop: 20,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a5568',
    marginBottom: 8,
    marginTop: 15,
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontSize: 14,
    color: '#4a5568',
  },
  messageInput: {
    height: 120,
    textAlignVertical: 'top',
  },
  priorityContainer: {
    marginTop: 15,
  },
  priorityButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priorityButton: {
    flex: 1,
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 2,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  priorityButtonSelected: {
    backgroundColor: '#fed7d7',
    borderColor: '#e53e3e',
  },
  priorityText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#718096',
  },
  priorityTextSelected: {
    color: '#e53e3e',
  },
  sendButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 15,
  },
  sendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  responseTime: {
    fontSize: 14,
    color: '#38a169',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 30,
  },
});

export default SupportCenter;
