import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { UserProfileService } from '../models/RiseQuestModels';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Enhanced XCoin Wallet Integration with Age-Appropriate Controls
 */
const RisePointsWallet = ({ userProfile }) => {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showingStore, setShowingStore] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [parentalApproval, setParentalApproval] = useState(null);

  // Rise Points earning structure
  const pointsEarning = {
    wake_up_on_time: 10,
    complete_morning_routine: 15,
    win_mini_game: 5,
    streak_7_days: 50,
    streak_30_days: 200,
    mood_check_in: 5,
    focus_session_complete: 20,
    help_community_member: 25,
    weekly_challenge: 100
  };

  // Age-appropriate store items
  const storeItems = [
    // Digital Rewards (All Ages)
    {
      id: 'custom_alarm_tone',
      name: 'Custom Alarm Tone',
      description: 'Upload your own wake-up sound',
      price: 100,
      category: 'personalization',
      ageGroups: ['child', 'teen', 'adult'],
      type: 'digital'
    },
    {
      id: 'theme_pack_space',
      name: 'Space Theme Pack',
      description: 'Cosmic backgrounds and UI elements',
      price: 150,
      category: 'themes',
      ageGroups: ['child', 'teen', 'adult'],
      type: 'digital'
    },
    {
      id: 'avatar_accessories',
      name: 'Avatar Accessories Pack',
      description: 'Hats, glasses, and fun add-ons for your avatar',
      price: 75,
      category: 'personalization',
      ageGroups: ['child', 'teen', 'adult'],
      type: 'digital'
    },
    {
      id: 'premium_mini_games',
      name: 'Premium Mini-Games Pack',
      description: 'Extra challenging wake-up games',
      price: 200,
      category: 'games',
      ageGroups: ['teen', 'adult'],
      type: 'digital'
    },
    
    // Pro Features (Teens & Adults)
    {
      id: 'advanced_analytics',
      name: 'Advanced Sleep Analytics',
      description: '30 days of detailed sleep pattern analysis',
      price: 300,
      category: 'features',
      ageGroups: ['teen', 'adult'],
      type: 'feature',
      duration: 30
    },
    {
      id: 'ai_coach_premium',
      name: 'AI Coach Premium (1 Month)',
      description: 'Personalized coaching and insights',
      price: 500,
      category: 'features',
      ageGroups: ['teen', 'adult'],
      type: 'subscription',
      duration: 30
    },
    
    // Real-World Rewards (Age-Restricted)
    {
      id: 'coffee_gift_card',
      name: 'Coffee Shop Gift Card ($5)',
      description: 'Perfect morning reward!',
      price: 1000,
      category: 'gift_cards',
      ageGroups: ['teen', 'adult'],
      type: 'physical',
      parentalApproval: 'teen'
    },
    {
      id: 'book_voucher',
      name: 'Bookstore Voucher ($10)',
      description: 'Fuel your mind with new books',
      price: 2000,
      category: 'gift_cards',
      ageGroups: ['child', 'teen', 'adult'],
      type: 'physical',
      parentalApproval: 'child'
    },
    {
      id: 'charity_donation',
      name: 'Charity Donation ($10)',
      description: 'Donate to mental health organizations',
      price: 2000,
      category: 'charity',
      ageGroups: ['teen', 'adult'],
      type: 'charity'
    },
    
    // Experiences (Teen & Adult)
    {
      id: 'meditation_class',
      name: 'Online Meditation Class',
      description: 'One-on-one session with certified instructor',
      price: 1500,
      category: 'experiences',
      ageGroups: ['teen', 'adult'],
      type: 'experience',
      parentalApproval: 'teen'
    }
  ];

  useEffect(() => {
    loadWalletData();
  }, []);

  const loadWalletData = async () => {
    setLoading(true);
    try {
      // Load balance
      const savedBalance = await AsyncStorage.getItem('rise_points_balance');
      if (savedBalance) {
        setBalance(parseInt(savedBalance));
      }

      // Load transaction history
      const savedTransactions = await AsyncStorage.getItem('rise_points_transactions');
      if (savedTransactions) {
        setTransactions(JSON.parse(savedTransactions));
      }
    } catch (error) {
      console.error('Error loading wallet data:', error);
    } finally {
      setLoading(false);
    }
  };

  const awardPoints = async (action, customAmount = null) => {
    const dailyLimitedActions = new Set(['mood_check_in', 'focus_session_complete']);
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const userKey = String(userProfile?.email || userProfile?.userId || 'anon').trim().toLowerCase();

    if (dailyLimitedActions.has(action)) {
      const gateKey = `rise_points_daily:${userKey}:${action}:${todayKey}`;
      const already = await AsyncStorage.getItem(gateKey);
      if (already === 'true') {
        Alert.alert('Already claimed', 'You can earn points for this once per day. Come back tomorrow!');
        return;
      }
      await AsyncStorage.setItem(gateKey, 'true');
    }

    const points = customAmount || pointsEarning[action] || 0;
    if (points <= 0) return;

    try {
      const newBalance = balance + points;
      const transaction = {
        id: Date.now(),
        type: 'earn',
        amount: points,
        action: action,
        timestamp: new Date().toISOString(),
        description: getActionDescription(action)
      };

      const nextTransactions = [transaction, ...transactions].slice(0, 100);

      // Update state
      setBalance(newBalance);
      setTransactions(nextTransactions);

      // Save to storage
      await AsyncStorage.setItem('rise_points_balance', newBalance.toString());
      await AsyncStorage.setItem('rise_points_transactions', JSON.stringify(nextTransactions));

      // Show celebration for significant milestones
      if (action.includes('streak') || points >= 50) {
        Alert.alert(
          '🎉 Rise Points Earned!',
          `You earned ${points} Rise Points for ${getActionDescription(action)}!`,
          [{ text: 'Awesome!', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('Error awarding points:', error);
    }
  };

  const spendPoints = async (item) => {
    if (balance < item.price) {
      Alert.alert('Insufficient Points', `You need ${item.price - balance} more Rise Points to get this item.`);
      return;
    }

    // Check age restrictions
    if (!item.ageGroups.includes(userProfile?.ageGroup)) {
      Alert.alert('Age Restricted', 'This item is not available for your age group.');
      return;
    }

    // Check if parental approval is needed
    const needsApproval = item.parentalApproval && 
                         (userProfile?.ageGroup === 'child' || 
                          (userProfile?.ageGroup === 'teen' && item.parentalApproval === 'teen'));

    if (needsApproval) {
      requestParentalApproval(item);
      return;
    }

    processPurchase(item);
  };

  const requestParentalApproval = (item) => {
    Alert.alert(
      'Parental Approval Required',
      `This purchase requires approval from a parent or guardian.\n\nItem: ${item.name}\nCost: ${item.price} Rise Points\n\nWould you like to request approval?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Request Approval', 
          onPress: () => {
            // In a real app, this would send a notification to parents
            Alert.alert(
              'Approval Requested',
              'Your parent/guardian will be notified about this purchase request. You\'ll receive a notification when they respond.'
            );
          }
        }
      ]
    );
  };

  const processPurchase = async (item) => {
    try {
      const newBalance = balance - item.price;
      const transaction = {
        id: Date.now(),
        type: 'spend',
        amount: item.price,
        item: item.name,
        itemId: item.id,
        timestamp: new Date().toISOString(),
        description: `Purchased: ${item.name}`
      };

      // Update state
      setBalance(newBalance);
      setTransactions(prev => [transaction, ...prev.slice(0, 99)]);

      // Save to storage
      await AsyncStorage.setItem('rise_points_balance', newBalance.toString());
      await AsyncStorage.setItem('rise_points_transactions', JSON.stringify([transaction, ...transactions.slice(0, 99)]));

      // Handle different item types
      handleItemDelivery(item);

      Alert.alert(
        '🎉 Purchase Complete!',
        `You've successfully purchased ${item.name}!`,
        [{ text: 'Great!', style: 'default' }]
      );

      setShowingStore(false);
    } catch (error) {
      console.error('Error processing purchase:', error);
      Alert.alert('Error', 'Failed to process purchase. Please try again.');
    }
  };

  const handleItemDelivery = (item) => {
    switch (item.type) {
      case 'digital':
        // Unlock digital content in app
        break;
      case 'feature':
        // Enable premium features
        break;
      case 'subscription':
        // Start subscription period
        break;
      case 'physical':
        // Send delivery details to backend
        Alert.alert(
          'Physical Reward',
          'Your reward will be processed and you\'ll receive delivery details via email within 24 hours.'
        );
        break;
      case 'charity':
        Alert.alert(
          'Donation Made',
          'Thank you for your contribution! A donation receipt will be sent to your email.'
        );
        break;
      case 'experience':
        Alert.alert(
          'Experience Booked',
          'You\'ll receive booking details and scheduling information via email.'
        );
        break;
    }
  };

  const getActionDescription = (action) => {
    const descriptions = {
      wake_up_on_time: 'waking up on time',
      complete_morning_routine: 'completing morning routine',
      win_mini_game: 'winning a wake-up game',
      streak_7_days: 'maintaining a 7-day streak',
      streak_30_days: 'achieving a 30-day streak',
      mood_check_in: 'completing mood check-in',
      focus_session_complete: 'finishing a focus session',
      help_community_member: 'helping a community member',
      weekly_challenge: 'completing weekly challenge'
    };
    return descriptions[action] || action.replace(/_/g, ' ');
  };

  const getFilteredStoreItems = () => {
    return storeItems.filter(item => 
      userProfile ? item.ageGroups.includes(userProfile.ageGroup) : true
    );
  };

  const renderStoreItem = ({ item }) => (
    <TouchableOpacity
      style={styles.storeItem}
      onPress={() => setSelectedItem(item)}
    >
      <View style={styles.storeItemHeader}>
        <Text style={styles.storeItemName}>{item.name}</Text>
        <View style={[styles.priceTag, { backgroundColor: getCategoryColor(item.category) }]}>
          <Text style={styles.priceText}>{item.price}</Text>
        </View>
      </View>
      
      <Text style={styles.storeItemDescription}>{item.description}</Text>
      
      <View style={styles.storeItemMeta}>
        <Text style={styles.categoryText}>{item.category.replace('_', ' ')}</Text>
        {item.parentalApproval && (
          <Text style={styles.approvalText}>👨‍👩‍👧‍👦 Approval needed</Text>
        )}
      </View>
      
      <TouchableOpacity
        style={[
          styles.buyButton,
          balance < item.price && styles.buyButtonDisabled
        ]}
        onPress={() => spendPoints(item)}
        disabled={balance < item.price}
      >
        <Text style={[
          styles.buyButtonText,
          balance < item.price && styles.buyButtonTextDisabled
        ]}>
          {balance >= item.price ? 'Get This!' : 'Need More Points'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const getCategoryColor = (category) => {
    const colors = {
      personalization: '#FF9800',
      themes: '#9C27B0',
      games: '#4CAF50',
      features: '#2196F3',
      gift_cards: '#FF5722',
      charity: '#8BC34A',
      experiences: '#607D8B'
    };
    return colors[category] || '#666';
  };

  const renderTransaction = ({ item }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionLeft}>
        <Text style={styles.transactionEmoji}>
          {item.type === 'earn' ? '⬆️' : '⬇️'}
        </Text>
        <View>
          <Text style={styles.transactionDescription}>{item.description}</Text>
          <Text style={styles.transactionDate}>
            {new Date(item.timestamp).toLocaleDateString()}
          </Text>
        </View>
      </View>
      <Text style={[
        styles.transactionAmount,
        { color: item.type === 'earn' ? '#4CAF50' : '#FF5722' }
      ]}>
        {item.type === 'earn' ? '+' : '-'}{item.amount}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading your Rise Points...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Rise Points Wallet</Text>
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Your Balance</Text>
          <Text style={styles.balanceAmount}>{balance.toLocaleString()}</Text>
          <Text style={styles.balanceSubtext}>Rise Points</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowingStore(true)}
          >
            <Text style={styles.actionEmoji}>🛍️</Text>
            <Text style={styles.actionText}>Rewards Store</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => awardPoints('mood_check_in')}
          >
            <Text style={styles.actionEmoji}>💙</Text>
            <Text style={styles.actionText}>Mood Check-in</Text>
            <Text style={styles.actionPoints}>+{pointsEarning.mood_check_in}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => awardPoints('focus_session_complete')}
          >
            <Text style={styles.actionEmoji}>🎯</Text>
            <Text style={styles.actionText}>Focus Session</Text>
            <Text style={styles.actionPoints}>+{pointsEarning.focus_session_complete}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.earningGuide}>
          <Text style={styles.sectionTitle}>How to Earn Points</Text>
          {Object.entries(pointsEarning).map(([action, points]) => (
            <View key={action} style={styles.earningItem}>
              <Text style={styles.earningAction}>{getActionDescription(action)}</Text>
              <Text style={styles.earningPoints}>+{points}</Text>
            </View>
          ))}
        </View>

        <View style={styles.transactionHistory}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <FlatList
            data={transactions.slice(0, 10)}
            renderItem={renderTransaction}
            keyExtractor={item => item.id.toString()}
            scrollEnabled={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No transactions yet. Start earning points!</Text>
            }
          />
        </View>
      </ScrollView>

      {/* Store Modal */}
      <Modal
        visible={showingStore}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Rewards Store</Text>
            <TouchableOpacity onPress={() => setShowingStore(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={getFilteredStoreItems()}
            renderItem={renderStoreItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.storeList}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 30,
    paddingTop: 50,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  balanceContainer: {
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 5,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  balanceSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  actionButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionEmoji: {
    fontSize: 24,
    marginBottom: 5,
  },
  actionText: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  actionPoints: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  earningGuide: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
  },
  earningItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  earningAction: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  earningPoints: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  transactionHistory: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  transactionDescription: {
    fontSize: 14,
    color: '#333',
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    padding: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 16,
    color: '#667eea',
  },
  storeList: {
    padding: 20,
  },
  storeItem: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  storeItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  storeItemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  priceTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  priceText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  storeItemDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  storeItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  categoryText: {
    fontSize: 12,
    color: '#888',
    textTransform: 'capitalize',
  },
  approvalText: {
    fontSize: 12,
    color: '#FF9800',
  },
  buyButton: {
    backgroundColor: '#667eea',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: '#ccc',
  },
  buyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buyButtonTextDisabled: {
    color: '#888',
  },
});

export default RisePointsWallet;
