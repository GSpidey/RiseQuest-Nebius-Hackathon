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
  Image,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { MonetizationService } from '../utils/MonetizationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import riseQuestWalletService from '../services/RiseQuestWalletService';
import { pick, types, isCancel, keepLocalCopy } from '@react-native-documents/picker';

/**
 * RiseQuest Cosmetic Store - Themes, Sounds, and Visual Customizations
 * Age-appropriate content with parental controls for minors
 */
const CosmeticStore = ({ userProfile, onPurchaseComplete, onPurchaseStarted }) => {
  const [selectedCategory, setSelectedCategory] = useState('themes');
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showingPreview, setShowingPreview] = useState(null);
  const [userBalance, setUserBalance] = useState(0);

  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [equippedSoundId, setEquippedSoundId] = useState(null);
  const [equippedThemeId, setEquippedThemeId] = useState(null);

  // Cosmetic store categories
  const categories = [
    { id: 'themes', name: 'Themes', icon: '🎨' },
    { id: 'sounds', name: 'Sounds', icon: '🔊' },
    { id: 'animations', name: 'Animations', icon: '✨' },
    { id: 'badges', name: 'Badges', icon: '🏆' },
    { id: 'bundles', name: 'Bundles', icon: '📦' },
    { id: 'inventory', name: 'My Items', icon: '🎒' },
  ];

  // Store items with age-appropriate filtering
  const storeItems = {
    themes: [
      {
        id: 'theme_nature',
        name: 'Forest Morning',
        description: 'Peaceful forest sounds and green themes',
        price: 200,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'forest_preview.jpg',
        category: 'basic'
      },
      {
        id: 'theme_space',
        name: 'Space Explorer',
        description: 'Cosmic themes with space sounds',
        price: 200,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'space_preview.jpg',
        category: 'basic'
      },
      {
        id: 'theme_ocean',
        name: 'Ocean Waves',
        description: 'Calming ocean sounds and blue themes',
        price: 200,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'ocean_preview.jpg',
        category: 'basic'
      },
      {
        id: 'theme_urban',
        name: 'City Vibes',
        description: 'Modern urban themes for productivity',
        price: 350,
        ageGroups: ['teen', 'adult'],
        preview: 'urban_preview.jpg',
        category: 'premium'
      },
      {
        id: 'theme_zen',
        name: 'Zen Garden',
        description: 'Meditation-focused minimalist design',
        price: 350,
        ageGroups: ['teen', 'adult'],
        preview: 'zen_preview.jpg',
        category: 'premium'
      }
    ],
    sounds: [
      {
        id: 'sound_birds',
        name: 'Morning Birds',
        description: 'Gentle bird songs for natural wake-up',
        price: 120,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'birds_preview.mp3',
        category: 'basic'
      },
      {
        id: 'sound_rain',
        name: 'Gentle Rain',
        description: 'Soft rain sounds for peaceful mornings',
        price: 120,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'rain_preview.mp3',
        category: 'basic'
      },
      {
        id: 'sound_motivational',
        name: 'Daily Affirmations',
        description: 'Positive voice messages for motivation',
        price: 220,
        ageGroups: ['teen', 'adult'],
        preview: 'affirmations_preview.mp3',
        category: 'premium'
      }
    ],
    animations: [
      {
        id: 'anim_sparkles',
        name: 'Success Sparkles',
        description: 'Celebration animations for achievements',
        price: 150,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'sparkles_preview.gif',
        category: 'basic'
      },
      {
        id: 'anim_fireworks',
        name: 'Victory Fireworks',
        description: 'Epic fireworks for major milestones',
        price: 250,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'fireworks_preview.gif',
        category: 'premium'
      }
    ],
    badges: [
      {
        id: 'badge_early_bird',
        name: 'Early Bird Gold',
        description: 'Premium badge for consistent early rising',
        price: 80,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'early_bird_preview.png',
        category: 'basic'
      },
      {
        id: 'badge_streak_master',
        name: 'Streak Master',
        description: 'Exclusive badge for 100+ day streaks',
        price: 150,
        ageGroups: ['child', 'teen', 'adult'],
        preview: 'streak_master_preview.png',
        category: 'premium'
      }
    ],
    bundles: [
      {
        id: 'bundle_starter',
        name: 'Starter Pack',
        description: 'Basic theme + sound + animation bundle',
        price: 450,
        ageGroups: ['child', 'teen', 'adult'],
        items: ['theme_nature', 'sound_birds', 'anim_sparkles'],
        category: 'basic'
      },
      {
        id: 'bundle_premium',
        name: 'Premium Collection',
        description: 'All premium cosmetics with exclusive content',
        price: 900,
        ageGroups: ['teen', 'adult'],
        items: ['theme_zen', 'theme_urban', 'sound_motivational', 'anim_fireworks'],
        category: 'premium'
      }
    ]
  };

  useEffect(() => {
    loadUserBalance();
  }, []);

  useEffect(() => {
    void loadEquipped();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedCategory === 'inventory') {
      void loadInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  const inferTypeFromId = (id) => {
    const value = String(id || '');
    if (value.startsWith('theme_')) return 'themes';
    if (value.startsWith('sound_')) return 'sounds';
    if (value.startsWith('anim_')) return 'animations';
    if (value.startsWith('badge_')) return 'badges';
    if (value.startsWith('bundle_')) return 'bundles';
    return null;
  };

  const getThemeGradient = (themeId) => {
    // Use only palettes already used elsewhere in the app.
    switch (String(themeId || '')) {
      case 'theme_nature':
      case 'theme_zen':
        return ['#48bb78', '#38a169'];
      case 'theme_urban':
        return ['#feca57', '#ff9ff3'];
      case 'theme_space':
      case 'theme_ocean':
      default:
        return ['#667eea', '#764ba2'];
    }
  };

  const loadEquipped = async () => {
    try {
      const [soundId, themeId] = await Promise.all([
        AsyncStorage.getItem('risequest_equipped_sound_id'),
        AsyncStorage.getItem('risequest_app_theme_id'),
      ]);
      setEquippedSoundId(soundId ? String(soundId) : null);
      setEquippedThemeId(themeId ? String(themeId) : null);
    } catch (_) {
      // ignore
    }
  };

  const normalizePurchased = (raw) => {
    const seen = new Set();
    const next = [];
    (Array.isArray(raw) ? raw : []).forEach((it) => {
      const id = String(it?.id || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const type = it?.type || inferTypeFromId(id) || 'unknown';
      next.push({
        id,
        name: String(it?.name || id),
        type,
        rarity: it?.rarity || it?.category || null,
        purchaseDate: it?.purchaseDate || null,
      });
    });
    return next;
  };

  const loadInventory = async () => {
    setInventoryLoading(true);
    try {
      const existing = await AsyncStorage.getItem('purchasedCosmetics');
      const parsed = existing ? JSON.parse(existing) : [];
      const normalized = normalizePurchased(parsed);
      setInventoryItems(normalized);
      await loadEquipped();
    } catch (e) {
      setInventoryItems([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  const ensureAudioPermission = async () => true; // The system document picker grants access to the chosen file.

  const setSoundFileForItem = async (soundItem) => {
    try {
      const ok = await ensureAudioPermission();
      if (!ok) {
        Alert.alert('Permission needed', 'Allow audio access to choose a tone file.');
        return;
      }

      const result = await pick({ type: [types.audio] });
      const file = Array.isArray(result) ? result[0] : result;
      let uri = file?.uri ? String(file.uri) : null;
      const name = file?.name ? String(file.name) : 'Custom tone';
      if (!uri) {
        Alert.alert('Tone', 'No audio file selected.');
        return;
      }
      const [copy] = await keepLocalCopy({ destination: 'documentDirectory', files: [{ uri, fileName: `store_${Date.now()}_${String(name).replace(/[^a-zA-Z0-9._-]/g, '_')}` }] });
      if (copy.status !== 'success') throw new Error('Could not retain the tone');
      uri = copy.localUri;
      await AsyncStorage.setItem(`risequest_store_sound_uri:${soundItem.id}`, uri);
      await AsyncStorage.setItem(`risequest_store_sound_name:${soundItem.id}`, name);
      Alert.alert('Saved', `${soundItem.name} linked to: ${name}`);
    } catch (e) {
      if (isCancel(e)) return;
      Alert.alert('Tone', 'Could not pick an audio file.');
    } finally {
      await loadInventory();
    }
  };

  const equipSoundAsDefault = async (soundItem) => {
    try {
      const uri = await AsyncStorage.getItem(`risequest_store_sound_uri:${soundItem.id}`);
      const name = await AsyncStorage.getItem(`risequest_store_sound_name:${soundItem.id}`);
      if (!uri) {
        Alert.alert(
          'Link a tone file',
          'This store sound needs an audio file from your device. Set a file first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Set file', onPress: () => setSoundFileForItem(soundItem) },
          ]
        );
        return;
      }

      await AsyncStorage.setItem('risequest_equipped_sound_id', String(soundItem.id));
      await AsyncStorage.setItem(
        'risequest_default_alarm_tone',
        JSON.stringify({
          selectedTone: 'custom',
          customToneUri: String(uri),
          customToneName: String(name || soundItem.name || 'Custom tone'),
          source: 'store',
          soundId: String(soundItem.id),
        })
      );

      setEquippedSoundId(String(soundItem.id));
      Alert.alert('Equipped', `${soundItem.name} is now your default alarm tone.`);
    } catch (_) {
      Alert.alert('Equip failed', 'Could not equip this sound.');
    }
  };

  const equipTheme = async (themeItem) => {
    try {
      await AsyncStorage.setItem('risequest_app_theme_id', String(themeItem.id));
      setEquippedThemeId(String(themeItem.id));
      Alert.alert('Theme equipped', `${themeItem.name} is now active.`);
    } catch (_) {
      Alert.alert('Theme', 'Could not equip this theme.');
    }
  };

  const loadUserBalance = async () => {
    try {
      // Prefer real wallet balance (server-side ledger) when signed in.
      try {
        await riseQuestWalletService.loadAuthData();
        const userId = await riseQuestWalletService.getCurrentUserId();
        if (userId) {
          const bal = await riseQuestWalletService.getBalance(userId);
          if (typeof bal?.risePoints === 'number') {
            setUserBalance(Number(bal.risePoints || 0));
            return;
          }
        }
      } catch (_) {
        // fall back
      }

      const sub = await MonetizationService.getUserSubscription();
      setUserBalance(Number(sub?.risePoints || 0));
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  };

  const getFilteredItems = () => {
    if (selectedCategory === 'inventory') return [];
    const items = storeItems[selectedCategory] || [];
    return items.filter(item => 
      item.ageGroups.includes(userProfile?.ageGroup || 'adult')
    );
  };

  const addToCart = (item) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) return prev;
      return [...prev, item];
    });
    Alert.alert('Added to Cart', `${item.name} added to your cart!`);
  };

  const removeFromCart = (itemId) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  const calculateCartTotal = () => {
    return cartItems.reduce((total, item) => total + item.price, 0);
  };

  const showCartSummary = () => {
    if (!cartItems.length) return;
    const total = Math.round(calculateCartTotal());
    const lines = cartItems.slice(0, 8).map((i) => `• ${i.name} (${i.price} RP)`).join('\n');
    Alert.alert(
      `🛒 Cart (${cartItems.length})`,
      `${lines}${cartItems.length > 8 ? `\n… +${cartItems.length - 8} more` : ''}\n\nTotal: ${total} RP`,
      [
        { text: 'Clear cart', style: 'destructive', onPress: () => setCartItems([]) },
        { text: 'OK' },
      ]
    );
  };

  const processPurchase = async () => {
    onPurchaseStarted?.();
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart first.');
      return;
    }

    setLoading(true);
    try {
      const totalPoints = Math.round(calculateCartTotal());
      if (!Number.isFinite(totalPoints) || totalPoints <= 0) {
        Alert.alert('Invalid total', 'Could not calculate the total RP for this purchase.');
        return;
      }
      
      // Check if user needs parental approval (under 18)
      if (userProfile?.ageGroup === 'child' && totalPoints > 500) {
        Alert.alert(
          'Parental Approval Required',
          'Purchases over 500 RP require parental approval.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Request Approval', onPress: () => requestParentalApproval(totalPoints) }
          ]
        );
        return;
      }

      const ok = await MonetizationService.spendRisePoints(totalPoints, `Cosmetics (${cartItems.length} items)`, { itemIds: cartItems.map(item => item.id) });
      if (!ok) return;

      await savePurchasedItems(cartItems);
      setCartItems([]);
      await loadUserBalance();
      
      Alert.alert(
        'Unlocked! ✨',
        'Your cosmetic items have been unlocked using RP.',
        [{ text: 'OK', onPress: () => onPurchaseComplete?.() }]
      );
    } catch (error) {
      Alert.alert('Purchase Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const requestParentalApproval = async (points) => {
    // Implementation for parental approval system
    Alert.alert(
      'Approval Sent',
      `A request for ${Number(points || 0)} RP has been sent to your parent/guardian.`
    );
  };

  const savePurchasedItems = async (items) => {
    try {
      const existing = await AsyncStorage.getItem('purchasedCosmetics');
      const purchased = existing ? JSON.parse(existing) : [];

      const resolveById = (id) => {
        const all = Object.values(storeItems).flat();
        return all.find((x) => String(x?.id) === String(id)) || null;
      };

      const expanded = [];
      (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item?.id) return;
        expanded.push(item);
        if (Array.isArray(item.items) && item.items.length) {
          item.items.forEach((childId) => {
            const child = resolveById(childId);
            if (child) expanded.push(child);
          });
        }
      });

      const nowIso = new Date().toISOString();
      const newItems = expanded.map((item) => ({
        id: String(item.id),
        name: String(item.name || item.id),
        type: inferTypeFromId(item.id) || selectedCategory,
        rarity: item.category || null,
        purchaseDate: nowIso,
      }));

      const normalized = normalizePurchased([...(Array.isArray(purchased) ? purchased : []), ...newItems]);
      await AsyncStorage.setItem('purchasedCosmetics', JSON.stringify(normalized));
    } catch (error) {
      console.error('Error saving purchased items:', error);
    }
  };

  const renderInventory = () => {
    if (inventoryLoading) {
      return (
        <View style={{ padding: 20 }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 10, textAlign: 'center', color: '#475569' }}>Loading your items…</Text>
        </View>
      );
    }

    if (!inventoryItems.length) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No items yet</Text>
          <Text style={styles.emptySubtext}>Unlock themes or sounds to see them here.</Text>
        </View>
      );
    }

    const themes = inventoryItems.filter((x) => x.type === 'themes');
    const sounds = inventoryItems.filter((x) => x.type === 'sounds');

    const renderRow = (item) => {
      const isSound = item.type === 'sounds';
      const isTheme = item.type === 'themes';

      const equipped = isSound
        ? String(equippedSoundId || '') === String(item.id)
        : isTheme
        ? String(equippedThemeId || '') === String(item.id)
        : false;

      return (
        <View key={item.id} style={styles.inventoryItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName} numberOfLines={1}>
              {equipped ? '✅ ' : ''}{item.name}
            </Text>
            <Text style={styles.itemDescription} numberOfLines={2}>
              {isSound ? 'Sound item (link your own audio file, then equip as default).' : isTheme ? 'Theme (applies to main app gradients).' : ''}
            </Text>
          </View>
          {isSound && (
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <TouchableOpacity style={styles.inventoryButtonAlt} onPress={() => setSoundFileForItem(item)}>
                <Text style={styles.inventoryButtonAltText}>Set file</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.inventoryButton} onPress={() => equipSoundAsDefault(item)}>
                <Text style={styles.inventoryButtonText}>Equip</Text>
              </TouchableOpacity>
            </View>
          )}
          {isTheme && (
            <View style={{ alignItems: 'flex-end' }}>
              <TouchableOpacity style={styles.inventoryButton} onPress={() => equipTheme(item)}>
                <Text style={styles.inventoryButtonText}>Equip</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 15, paddingBottom: 130 }}>
        {!!sounds.length && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔊 Sounds</Text>
            {sounds.map(renderRow)}
          </View>
        )}
        {!!themes.length && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🎨 Themes</Text>
            {themes.map(renderRow)}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderStoreItem = ({ item }) => (
    <View style={styles.storeItem}>
      <View style={styles.itemPreview}>
        <Text style={styles.previewPlaceholder}>🖼️</Text>
      </View>
      
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDescription}>{item.description}</Text>
        
        {/* Bundles can optionally show extra info later */}
        
        <View style={styles.itemFooter}>
          <Text style={styles.itemPrice}>⭐ {item.price} RP</Text>
          <TouchableOpacity
            style={styles.addToCartButton}
            onPress={() => addToCart(item)}
          >
            <Text style={styles.addToCartText}>Add to Cart</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.compactInfoRow}>
        <Text style={styles.compactInfoText}>⭐ Balance: {Number(userBalance || 0)} RP</Text>
        {cartItems.length > 0 && (
          <TouchableOpacity style={styles.compactCartButton} onPress={showCartSummary} activeOpacity={0.9}>
            <Text style={styles.compactCartText}>🛒 {cartItems.length}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryTabs}
        contentContainerStyle={styles.categoryTabsContent}
      >
        {categories.map(category => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryTab,
              selectedCategory === category.id && styles.activeCategoryTab
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text style={[
              styles.categoryName,
              selectedCategory === category.id && styles.activeCategoryName
            ]}>
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectedCategory === 'inventory' ? (
        renderInventory()
      ) : (
        <FlatList
          data={getFilteredItems()}
          renderItem={renderStoreItem}
          keyExtractor={item => item.id}
          style={styles.storeList}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Cart Summary */}
      {selectedCategory !== 'inventory' && cartItems.length > 0 && (
        <View style={styles.cartSummary}>
          <View style={styles.cartInfo}>
            <Text style={styles.cartTotal}>
              Total: ⭐ {Math.round(calculateCartTotal())} RP
            </Text>
            <Text style={styles.cartItems}>
              {cartItems.length} item{cartItems.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.checkoutButton}
            onPress={processPurchase}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.checkoutText}>Unlock</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  compactInfoRow: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  compactInfoText: {
    color: '#111827',
    fontWeight: '800',
  },
  compactCartButton: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingHorizontal: 10,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactCartText: {
    color: '#fff',
    fontWeight: '900',
  },
  categoryTabs: {
    flexGrow: 0,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  categoryTabsContent: {
    alignItems: 'center',
  },
  categoryTab: {
    alignItems: 'center',
    marginHorizontal: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    minWidth: 80,
  },
  activeCategoryTab: {
    backgroundColor: '#667eea',
  },
  categoryIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  categoryName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeCategoryName: {
    color: '#fff',
    fontWeight: 'bold',
  },
  storeList: {
    flex: 1,
    padding: 15,
  },
  inventoryItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#eef2ff',
  },
  inventoryButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  inventoryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  inventoryButtonAlt: {
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  inventoryButtonAltText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  storeItem: {
    backgroundColor: '#fff',
    borderRadius: 15,
    marginBottom: 15,
    padding: 15,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemPreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  previewPlaceholder: {
    fontSize: 30,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  itemDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  bundleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  originalPrice: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
    marginRight: 10,
  },
  savings: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
  },
  addToCartButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addToCartText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cartSummary: {
    backgroundColor: '#fff',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cartInfo: {
    flex: 1,
  },
  cartTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cartItems: {
    fontSize: 14,
    color: '#666',
  },
  checkoutButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkoutText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default CosmeticStore;
