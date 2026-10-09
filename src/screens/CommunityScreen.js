import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Modal,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { sunrise } from '../components/SunriseUI';
import { communityService } from '../services/CommunityService';
import { getBackendBaseUrl, DEFAULT_BACKEND_BASE_URL } from '../config/backendConfig';

function shortName(nameOrEmail) {
  const v = String(nameOrEmail || '').trim();
  if (!v) return 'RiseQuester';
  if (v.includes('@')) return v.split('@')[0];
  return v;
}

function initialsFrom(nameOrEmail) {
  const v = String(nameOrEmail || '').trim();
  if (!v) return 'R';
  if (v.includes('@')) return v[0].toUpperCase();
  const parts = v.split(' ').filter(Boolean);
  if (!parts.length) return v[0].toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function CommunityScreen({ userProfile, onClose, embedded = false, communicationLimited = false, nativeTeenSafety = false }) {
  const [activeTab, setActiveTab] = useState('feed');
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState(null);
  const [backendUrlHint, setBackendUrlHint] = useState(null);

  // Feed
  const [feedScope, setFeedScope] = useState('all');
  const [posts, setPosts] = useState([]);
  const [feedCursor, setFeedCursor] = useState(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [composerVisibility, setComposerVisibility] = useState('BUDDIES');

  // Comments
  const [showComments, setShowComments] = useState(false);
  const [commentsPost, setCommentsPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');

  // Buddies
  const [buddyEmail, setBuddyEmail] = useState('');
  const [buddyBusy, setBuddyBusy] = useState(false);
  const [buddies, setBuddies] = useState([]);
  const [buddyIncoming, setBuddyIncoming] = useState([]);
  const [buddyOutgoing, setBuddyOutgoing] = useState([]);

  // Groups
  const [groups, setGroups] = useState([]);
  const [groupsBusy, setGroupsBusy] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupFeed, setGroupFeed] = useState([]);
  const [groupFeedCursor, setGroupFeedCursor] = useState(null);
  const [groupComposerText, setGroupComposerText] = useState('');

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTopic, setNewGroupTopic] = useState('ADHD');
  const [newGroupPublic, setNewGroupPublic] = useState(true);

  // Messages
  const [threads, setThreads] = useState([]);
  const [threadsBusy, setThreadsBusy] = useState(false);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadBusy, setThreadBusy] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [startMessageEmail, setStartMessageEmail] = useState('');

  // Safety
  const [blocks, setBlocks] = useState([]);
  const [blockEmail, setBlockEmail] = useState('');
  const [safetyBusy, setSafetyBusy] = useState(false);

  // Reporting (Android-safe)
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportDetails, setReportDetails] = useState('');

  const isGuest = Boolean(userProfile?.isGuest);
  const ageGroup = userProfile?.ageGroup || 'adult';
  const communityAllowedByAge = ageGroup !== 'child';

  const canPostPublic = useMemo(() => {
    if (!settings) return false;
    if (!settings.optIn) return false;
    if (settings.teenSafety) return false;
    return String(settings.visibility || 'BUDDIES').toUpperCase() === 'PUBLIC';
  }, [settings]);

  const loadSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const baseUrl = await getBackendBaseUrl();
      setBackendUrlHint(baseUrl);
      const resp = await communityService.getSettings();
      setSettings(resp?.settings ? { ...resp.settings, teenSafety: nativeTeenSafety || resp.settings.teenSafety } : null);
    } catch (e) {
      setSettingsError(e?.message || 'Failed to load community settings');
      setSettings(null);
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!alive) return;
      if (!isGuest && communityAllowedByAge) {
        await loadSettings();
      } else {
        setSettingsLoading(false);
        setSettings(null);
      }
    };
    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, communityAllowedByAge]);

  useEffect(() => {
    // Default composer visibility based on settings.
    if (!settings) return;
    if (settings.teenSafety) {
      setComposerVisibility('BUDDIES');
      return;
    }
    const v = String(settings.visibility || 'BUDDIES').toUpperCase();
    setComposerVisibility(v === 'PUBLIC' ? 'PUBLIC' : 'BUDDIES');
  }, [settings]);

  const ensureEnabled = () => {
    if (isGuest) {
      Alert.alert('Community', 'Community features require signing in.');
      return false;
    }
    if (!communityAllowedByAge) {
      Alert.alert('Community', 'Community features are disabled for child accounts.');
      return false;
    }
    if (settingsLoading) {
      return false;
    }
    if (!settings?.optIn) {
      Alert.alert('Community', 'Enable Community in Onboarding or Settings to continue.');
      return false;
    }
    return true;
  };

  const ensureCommunicationAllowed = () => {
    if (!ensureEnabled()) return false;
    if (communicationLimited) {
      Alert.alert('Parent communication controls', 'Apple reports communication limits for this device. Sending to other people is unavailable until a parent permits it. You can still read permitted content, report concerns, block users and use your other RiseQuest tools.');
      return false;
    }
    return true;
  };

  const loadFeed = async ({ reset } = {}) => {
    if (!ensureEnabled()) return;
    if (feedLoading) return;
    setFeedLoading(true);
    try {
      const resp = await communityService.getFeed({
        scope: feedScope,
        cursor: reset ? undefined : feedCursor,
        limit: 20,
      });
      const next = Array.isArray(resp?.posts) ? resp.posts : [];
      setPosts(prev => (reset ? next : [...prev, ...next]));
      setFeedCursor(resp?.nextCursor || null);
    } catch (e) {
      Alert.alert('Community Feed', e?.message || 'Failed to load feed');
    } finally {
      setFeedLoading(false);
    }
  };

  const refreshFeed = async () => {
    if (!ensureEnabled()) return;
    setFeedRefreshing(true);
    setFeedCursor(null);
    try {
      const resp = await communityService.getFeed({ scope: feedScope, limit: 20 });
      setPosts(Array.isArray(resp?.posts) ? resp.posts : []);
      setFeedCursor(resp?.nextCursor || null);
    } catch (e) {
      Alert.alert('Community Feed', e?.message || 'Failed to refresh feed');
    } finally {
      setFeedRefreshing(false);
    }
  };

  useEffect(() => {
    // Load initial feed when tab becomes active
    if (activeTab !== 'feed') return;
    if (!settings?.optIn) return;
    void refreshFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, feedScope, settings?.optIn]);

  const submitPost = async () => {
    if (!ensureCommunicationAllowed()) return;
    const content = composerText.trim();
    if (!content) return;

    const visibility = composerVisibility === 'PUBLIC' && canPostPublic ? 'PUBLIC' : 'BUDDIES';

    try {
      const resp = await communityService.createPost({
        content,
        visibility,
        type: 'POST',
      });
      const post = resp?.post;
      if (post) {
        setPosts(prev => [post, ...prev]);
      }
      setComposerText('');
    } catch (e) {
      Alert.alert('Post', e?.message || 'Failed to post');
    }
  };

  const openPostActions = (post) => {
    const canDelete = post?.author?.email && String(post.author.email).toLowerCase() === String(userProfile?.email || '').toLowerCase();
    Alert.alert(
      'Post',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          onPress: () => {
            setReportTarget({ targetType: 'POST', targetId: post.id });
            setReportDetails('');
            setShowReportModal(true);
          },
        },
        {
          text: 'Block User',
          style: 'destructive',
          onPress: () => blockUser(post?.author?.email),
        },
        ...(canDelete ? [{
          text: 'Delete',
          style: 'destructive',
          onPress: () => deletePost(post.id),
        }] : []),
      ]
    );
  };

  const deletePost = async (postId) => {
    try {
      await communityService.deletePost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e) {
      Alert.alert('Delete', e?.message || 'Failed to delete');
    }
  };

  const toggleReaction = async (post, emoji) => {
    if (!ensureCommunicationAllowed()) return;
    const already = Array.isArray(post?.myReactions) && post.myReactions.includes(emoji);

    setPosts(prev => prev.map(p => {
      if (p.id !== post.id) return p;
      const my = new Set(p.myReactions || []);
      if (already) my.delete(emoji);
      else my.add(emoji);
      return { ...p, myReactions: Array.from(my) };
    }));

    try {
      if (already) await communityService.unreact(post.id, emoji);
      else await communityService.react(post.id, emoji);
    } catch (e) {
      Alert.alert('Reaction', e?.message || 'Failed to update reaction');
      // Best-effort refresh
      void refreshFeed();
    }
  };

  const openComments = async (post) => {
    if (!ensureEnabled()) return;
    setCommentsPost(post);
    setShowComments(true);
    setCommentsLoading(true);
    setCommentText('');
    try {
      const resp = await communityService.listComments(post.id);
      setComments(Array.isArray(resp?.comments) ? resp.comments : []);
    } catch (e) {
      Alert.alert('Comments', e?.message || 'Failed to load comments');
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const submitComment = async () => {
    if (!ensureCommunicationAllowed()) return;
    const content = commentText.trim();
    if (!content || !commentsPost?.id) return;
    try {
      const resp = await communityService.addComment(commentsPost.id, content);
      if (resp?.comment) {
        setComments(prev => [...prev, resp.comment]);
      }
      setCommentText('');
    } catch (e) {
      Alert.alert('Comment', e?.message || 'Failed to add comment');
    }
  };

  const loadBuddies = async () => {
    if (!ensureEnabled()) return;
    setBuddyBusy(true);
    try {
      const [listResp, reqResp] = await Promise.all([
        communityService.listBuddies(),
        communityService.listBuddyRequests(),
      ]);
      setBuddies(Array.isArray(listResp?.buddies) ? listResp.buddies : []);
      setBuddyIncoming(Array.isArray(reqResp?.incoming) ? reqResp.incoming : []);
      setBuddyOutgoing(Array.isArray(reqResp?.outgoing) ? reqResp.outgoing : []);
    } catch (e) {
      Alert.alert('Buddies', e?.message || 'Failed to load buddies');
    } finally {
      setBuddyBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'buddies') return;
    if (!settings?.optIn) return;
    void loadBuddies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, settings?.optIn]);

  const sendBuddy = async () => {
    if (!ensureCommunicationAllowed()) return;
    const email = buddyEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert('Add Buddy', 'Enter a valid email address.');
      return;
    }
    setBuddyBusy(true);
    try {
      await communityService.sendBuddyRequest(email);
      setBuddyEmail('');
      await loadBuddies();
      Alert.alert('Request Sent', `Buddy request sent to ${email}`);
    } catch (e) {
      Alert.alert('Add Buddy', e?.message || 'Failed to send request');
    } finally {
      setBuddyBusy(false);
    }
  };

  const respondBuddy = async (requestId, action) => {
    if (!ensureEnabled()) return;
    if (action === 'accept' && !ensureCommunicationAllowed()) return;
    setBuddyBusy(true);
    try {
      await communityService.respondBuddyRequest(requestId, action);
      await loadBuddies();
    } catch (e) {
      Alert.alert('Buddy Request', e?.message || 'Failed');
    } finally {
      setBuddyBusy(false);
    }
  };

  const loadGroups = async () => {
    if (!ensureEnabled()) return;
    setGroupsBusy(true);
    try {
      const resp = await communityService.listGroups({ q: groupSearch.trim() || undefined });
      setGroups(Array.isArray(resp?.groups) ? resp.groups : []);
    } catch (e) {
      Alert.alert('Groups', e?.message || 'Failed to load groups');
    } finally {
      setGroupsBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'groups') return;
    if (!settings?.optIn) return;
    void loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, settings?.optIn]);

  const openGroup = async (group) => {
    setSelectedGroup(group);
    setGroupFeed([]);
    setGroupFeedCursor(null);
    try {
      const resp = await communityService.getGroupFeed(group.id, { limit: 20 });
      setGroupFeed(Array.isArray(resp?.posts) ? resp.posts : []);
      setGroupFeedCursor(resp?.nextCursor || null);
    } catch (e) {
      Alert.alert('Group', e?.message || 'Failed to load group feed');
    }
  };

  const joinOrLeaveGroup = async (group) => {
    if (!ensureEnabled()) return;
    if (!group.isMember && !ensureCommunicationAllowed()) return;
    setGroupsBusy(true);
    try {
      if (group.isMember) {
        await communityService.leaveGroup(group.id);
      } else {
        await communityService.joinGroup(group.id);
      }
      await loadGroups();
    } catch (e) {
      Alert.alert('Groups', e?.message || 'Failed to update membership');
    } finally {
      setGroupsBusy(false);
    }
  };

  const createGroup = async () => {
    if (!ensureCommunicationAllowed()) return;
    const name = newGroupName.trim();
    const topic = newGroupTopic.trim();
    if (name.length < 3) {
      Alert.alert('Create Group', 'Group name must be at least 3 characters.');
      return;
    }
    if (topic.length < 2) {
      Alert.alert('Create Group', 'Topic is required.');
      return;
    }

    setGroupsBusy(true);
    try {
      await communityService.createGroup({ name, topic, isPublic: newGroupPublic });
      setShowCreateGroup(false);
      setNewGroupName('');
      await loadGroups();
    } catch (e) {
      Alert.alert('Create Group', e?.message || 'Failed to create group');
    } finally {
      setGroupsBusy(false);
    }
  };

  const submitGroupPost = async () => {
    if (!ensureCommunicationAllowed()) return;
    if (!selectedGroup?.id) return;
    const content = groupComposerText.trim();
    if (!content) return;

    try {
      const resp = await communityService.createPost({
        content,
        groupId: selectedGroup.id,
        type: 'POST',
      });
      if (resp?.post) {
        setGroupFeed(prev => [resp.post, ...prev]);
      }
      setGroupComposerText('');
    } catch (e) {
      Alert.alert('Group Post', e?.message || 'Failed to post');
    }
  };

  const loadThreads = async () => {
    if (!ensureEnabled()) return;
    setThreadsBusy(true);
    try {
      const resp = await communityService.listThreads();
      setThreads(Array.isArray(resp?.threads) ? resp.threads : []);
    } catch (e) {
      Alert.alert('Messages', e?.message || 'Failed to load conversations');
    } finally {
      setThreadsBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'messages') return;
    if (!settings?.optIn) return;
    void loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, settings?.optIn]);

  const openThread = async (thread) => {
    setSelectedThread(thread);
    setThreadMessages([]);
    setMessageText('');
    setThreadBusy(true);
    try {
      const resp = await communityService.listMessages(thread.id, { limit: 50 });
      setThreadMessages(Array.isArray(resp?.messages) ? resp.messages : []);
    } catch (e) {
      Alert.alert('Messages', e?.message || 'Failed to load messages');
    } finally {
      setThreadBusy(false);
    }
  };

  const startConversation = async () => {
    if (!ensureCommunicationAllowed()) return;
    const email = startMessageEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert('Messages', 'Enter a valid email address.');
      return;
    }
    setThreadsBusy(true);
    try {
      const resp = await communityService.startDirectThread(email);
      const t = resp?.thread;
      if (t?.id) {
        await loadThreads();
        setStartMessageEmail('');
        await openThread({ id: t.id, otherUser: t.members?.find(m => m.email !== userProfile?.email) || null });
      }
    } catch (e) {
      Alert.alert('Messages', e?.message || 'Failed to start conversation');
    } finally {
      setThreadsBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!ensureCommunicationAllowed()) return;
    if (!selectedThread?.id) return;
    const content = messageText.trim();
    if (!content) return;

    setMessageText('');
    try {
      const resp = await communityService.sendMessage(selectedThread.id, content);
      if (resp?.message) {
        setThreadMessages(prev => [...prev, resp.message]);
      }
    } catch (e) {
      Alert.alert('Message', e?.message || 'Failed to send');
    }
  };

  const loadBlocks = async () => {
    if (!ensureEnabled()) return;
    setSafetyBusy(true);
    try {
      const resp = await communityService.listBlocks();
      setBlocks(Array.isArray(resp?.blocks) ? resp.blocks : []);
    } catch (e) {
      Alert.alert('Safety', e?.message || 'Failed to load blocked users');
    } finally {
      setSafetyBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'safety') return;
    if (!settings?.optIn) return;
    void loadBlocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, settings?.optIn]);

  const blockUser = async (email) => {
    if (!ensureEnabled()) return;
    const value = String(email || blockEmail || '').trim().toLowerCase();
    if (!value || !value.includes('@')) {
      Alert.alert('Block', 'Enter a valid email address.');
      return;
    }
    setSafetyBusy(true);
    try {
      await communityService.blockUser(value);
      setBlockEmail('');
      await loadBlocks();
      Alert.alert('Blocked', `${value} has been blocked.`);
    } catch (e) {
      Alert.alert('Block', e?.message || 'Failed to block user');
    } finally {
      setSafetyBusy(false);
    }
  };

  const unblockUser = async (email) => {
    if (!ensureEnabled()) return;
    setSafetyBusy(true);
    try {
      await communityService.unblockUser(email);
      await loadBlocks();
    } catch (e) {
      Alert.alert('Unblock', e?.message || 'Failed');
    } finally {
      setSafetyBusy(false);
    }
  };

  const submitReport = async () => {
    if (!ensureEnabled()) return;
    if (!reportTarget?.targetType || !reportTarget?.targetId) {
      setShowReportModal(false);
      return;
    }

    try {
      await communityService.report({
        targetType: reportTarget.targetType,
        targetId: reportTarget.targetId,
        reason: 'User report',
        details: reportDetails.trim() || null,
      });
      setShowReportModal(false);
      setReportTarget(null);
      setReportDetails('');
      Alert.alert('Report Submitted', 'Thanks — we’ll review this.');
    } catch (e) {
      Alert.alert('Report', e?.message || 'Failed to submit report');
    }
  };

  const TabButton = ({ id, label }) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === id && styles.tabButtonActive]}
      onPress={() => {
        setSelectedThread(null);
        setSelectedGroup(null);
        setActiveTab(id);
      }}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.tabLabel, activeTab === id && styles.tabLabelActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const Avatar = ({ label }) => (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initialsFrom(label)}</Text>
    </View>
  );

  const PostCard = ({ item }) => (
    <TouchableOpacity style={styles.postCard} onLongPress={() => openPostActions(item)} activeOpacity={0.9}>
      <View style={styles.postHeader}>
        <Avatar label={item?.author?.displayName || item?.author?.email} />
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthor}>{shortName(item?.author?.displayName || item?.author?.email)}</Text>
          <Text style={styles.postMeta}>
            {item?.visibility === 'PUBLIC' ? '🌍 Public' : item?.visibility === 'GROUP' ? '👥 Group' : '🔒 Buddies'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => openComments(item)}>
          <Text style={styles.postAction}>💬 {item?.counts?.comments || 0}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.postContent}>{item?.content}</Text>

      <View style={styles.reactionsRow}>
        {['💙', '🙌', '✨'].map((emoji) => {
          const active = Array.isArray(item?.myReactions) && item.myReactions.includes(emoji);
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.reactionChip, active && styles.reactionChipActive]}
              onPress={() => toggleReaction(item, emoji)}
            >
              <Text style={styles.reactionText}>{emoji}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ flex: 1 }} />
        <Text style={styles.reactionCount}>❤️ {item?.counts?.reactions || 0}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderFeed = () => (
    <View style={{ flex: 1 }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard item={item} />}
        contentContainerStyle={{ paddingBottom: 240 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={feedRefreshing} onRefresh={refreshFeed} />}
        ListEmptyComponent={() => (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No posts yet</Text>
            <Text style={styles.emptyText}>Start by posting a quick check-in or add buddies.</Text>
          </View>
        )}
        ListFooterComponent={() => (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            {feedLoading ? <ActivityIndicator color={sunrise.purple} /> : null}
            {feedCursor && !feedLoading ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => loadFeed({ reset: false })}>
                <Text style={styles.secondaryButtonText}>Load more</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.bottomDock}>
          <Text style={styles.sectionTitle}>Share an update</Text>
          <TextInput
            style={styles.composerInput}
            placeholder="How are you doing today?"
            placeholderTextColor={sunrise.muted}
            value={composerText}
            onChangeText={setComposerText}
            multiline
          />

          <View style={styles.composerRow}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, feedScope === 'all' && styles.pillActive]}
                onPress={() => setFeedScope('all')}
              >
                <Text style={[styles.pillText, feedScope === 'all' && styles.pillTextActive]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, feedScope === 'buddies' && styles.pillActive]}
                onPress={() => setFeedScope('buddies')}
              >
                <Text style={[styles.pillText, feedScope === 'buddies' && styles.pillTextActive]}>Buddies</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, feedScope === 'public' && styles.pillActive]}
                onPress={() => setFeedScope('public')}
              >
                <Text style={[styles.pillText, feedScope === 'public' && styles.pillTextActive]}>Public</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={[styles.pill, composerVisibility === 'BUDDIES' && styles.pillActive]}
                onPress={() => setComposerVisibility('BUDDIES')}
              >
                <Text style={[styles.pillText, composerVisibility === 'BUDDIES' && styles.pillTextActive]}>🔒</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!canPostPublic}
                style={[
                  styles.pill,
                  composerVisibility === 'PUBLIC' && styles.pillActive,
                  !canPostPublic && { opacity: 0.4 },
                ]}
                onPress={() => setComposerVisibility('PUBLIC')}
              >
                <Text style={[styles.pillText, composerVisibility === 'PUBLIC' && styles.pillTextActive]}>🌍</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, styles.rowButton]} onPress={submitPost}>
                <Text style={styles.primaryButtonText}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!canPostPublic && settings?.visibility === 'PUBLIC' && settings?.teenSafety && (
            <Text style={styles.helperText}>Teen Safety Mode is on — public posting is disabled.</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  const renderBuddies = () => (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Wake Buddies</Text>
        <Text style={styles.sectionSubtitle}>Add trusted friends for accountability and encouragement.</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Buddy email"
            placeholderTextColor={sunrise.muted}
            value={buddyEmail}
            onChangeText={setBuddyEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={[styles.primaryButton, styles.rowButton]} onPress={sendBuddy} disabled={buddyBusy}>
            <Text style={styles.primaryButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>

      {buddyBusy ? <ActivityIndicator style={{ marginTop: 8 }} color={sunrise.purple} /> : null}

      {buddyIncoming.length ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Requests</Text>
          {buddyIncoming.map((r) => (
            <View key={r.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{shortName(r.requestedBy?.displayName || r.requestedBy?.email)}</Text>
                <Text style={styles.listSubtitle}>{r.requestedBy?.email}</Text>
              </View>
              <TouchableOpacity style={styles.smallButton} onPress={() => respondBuddy(r.id, 'accept')}>
                <Text style={styles.smallButtonText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallButton, { backgroundColor: '#FFDAD6' }]} onPress={() => respondBuddy(r.id, 'decline')}>
                <Text style={styles.smallButtonText}>Decline</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      {buddies.length ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Your Buddies</Text>
          {buddies.map((b) => (
            <View key={b.buddyId} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{shortName(b.displayName || b.email)}</Text>
                <Text style={styles.listSubtitle}>{b.email}</Text>
              </View>
              <TouchableOpacity
                style={styles.smallButton}
                onPress={async () => {
                  if (!ensureCommunicationAllowed()) return;
                  try {
                    const resp = await communityService.startDirectThread(b.email);
                    setActiveTab('messages');
                    await openThread({ id: resp?.thread?.id, otherUser: { email: b.email, displayName: b.displayName, id: b.buddyId } });
                  } catch (e) {
                    Alert.alert('Message', e?.message || 'Failed to start chat');
                  }
                }}
              >
                <Text style={styles.smallButtonText}>Message</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No buddies yet</Text>
          <Text style={styles.emptyText}>Add someone you trust to start building accountability.</Text>
        </View>
      )}

      {buddyOutgoing.length ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Sent</Text>
          {buddyOutgoing.map((r) => (
            <View key={r.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>Pending</Text>
                <Text style={styles.listSubtitle}>{r.otherUserId}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );

  const renderGroups = () => {
    if (selectedGroup) {
      return (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>{selectedGroup.name}</Text>
              <TouchableOpacity style={styles.smallButton} onPress={() => setSelectedGroup(null)}>
                <Text style={styles.smallButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.sectionSubtitle}>Topic: {selectedGroup.topic}</Text>
            <TextInput
              style={styles.composerInput}
              placeholder="Share with the group…"
              placeholderTextColor={sunrise.muted}
              value={groupComposerText}
              onChangeText={setGroupComposerText}
              multiline
            />
            <TouchableOpacity style={styles.primaryButton} onPress={submitGroupPost}>
              <Text style={styles.primaryButtonText}>Post to Group</Text>
            </TouchableOpacity>
          </View>

          {groupFeed.map((p) => (
            <PostCard key={p.id} item={p} />
          ))}

          {groupFeedCursor ? (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={async () => {
                  try {
                    const resp = await communityService.getGroupFeed(selectedGroup.id, { cursor: groupFeedCursor, limit: 20 });
                    const next = Array.isArray(resp?.posts) ? resp.posts : [];
                    setGroupFeed(prev => [...prev, ...next]);
                    setGroupFeedCursor(resp?.nextCursor || null);
                  } catch (e) {
                    Alert.alert('Group', e?.message || 'Failed to load more');
                  }
                }}
              >
                <Text style={styles.secondaryButtonText}>Load more</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      );
    }

    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Support Circles</Text>
          <Text style={styles.sectionSubtitle}>Join topic-based circles for encouragement and tips.</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="Search groups"
              placeholderTextColor={sunrise.muted}
              value={groupSearch}
              onChangeText={setGroupSearch}
              autoCapitalize="none"
            />
            <TouchableOpacity style={[styles.primaryButton, styles.rowButton]} onPress={loadGroups} disabled={groupsBusy}>
              <Text style={styles.primaryButtonText}>Search</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowCreateGroup(true)}>
            <Text style={styles.secondaryButtonText}>Create Group</Text>
          </TouchableOpacity>
        </View>

        {groupsBusy ? <ActivityIndicator color={sunrise.purple} /> : null}

        {groups.length ? groups.map((g) => (
          <View key={g.id} style={styles.sectionCard}>
            <Text style={styles.listTitle}>{g.name}</Text>
            <Text style={styles.listSubtitle}>Topic: {g.topic} • Members: {g.memberCount}</Text>
            <View style={{ flexDirection: 'row', marginTop: 10 }}>
              <TouchableOpacity style={styles.smallButton} onPress={() => openGroup(g)}>
                <Text style={styles.smallButtonText}>Open</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallButton, { marginLeft: 8 }, g.isMember ? { backgroundColor: '#FFDAD6' } : { backgroundColor: sunrise.tealTint }]}
                onPress={() => joinOrLeaveGroup(g)}
              >
                <Text style={styles.smallButtonText}>{g.isMember ? 'Leave' : 'Join'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No groups found</Text>
            <Text style={styles.emptyText}>Try a different search or create one.</Text>
          </View>
        )}

        <Modal visible={showCreateGroup} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreateGroup(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: sunrise.background }}>
            <View style={{ padding: 16 }}>
              <Text style={{ color: sunrise.ink, fontSize: 20, fontWeight: '800' }}>Create Group</Text>
              <Text style={{ color: sunrise.muted, marginTop: 6 }}>Keep it supportive and specific.</Text>

              <TextInput
                style={[styles.input, { marginTop: 16 }]}
                placeholder="Group name"
                placeholderTextColor={sunrise.muted}
                value={newGroupName}
                onChangeText={setNewGroupName}
              />
              <TextInput
                style={[styles.input, { marginTop: 10 }]}
                placeholder="Topic (e.g., ADHD, Anxiety, Sleep)"
                placeholderTextColor={sunrise.muted}
                value={newGroupTopic}
                onChangeText={setNewGroupTopic}
              />

              <View style={{ flexDirection: 'row', marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.pill, newGroupPublic && styles.pillActive]}
                  onPress={() => setNewGroupPublic(true)}
                >
                  <Text style={[styles.pillText, newGroupPublic && styles.pillTextActive]}>Public</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pill, !newGroupPublic && styles.pillActive]}
                  onPress={() => setNewGroupPublic(false)}
                >
                  <Text style={[styles.pillText, !newGroupPublic && styles.pillTextActive]}>Invite-only</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', marginTop: 16 }}>
                <TouchableOpacity style={[styles.secondaryButton, { flex: 1, marginRight: 8 }]} onPress={() => setShowCreateGroup(false)}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryButton, { flex: 1, marginLeft: 8 }]} onPress={createGroup}>
                  <Text style={styles.primaryButtonText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      </ScrollView>
    );
  };

  const renderMessages = () => {
    if (selectedThread) {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>{shortName(selectedThread?.otherUser?.displayName || selectedThread?.otherUser?.email || 'Conversation')}</Text>
              <TouchableOpacity style={styles.smallButton} onPress={() => { setSelectedThread(null); void loadThreads(); }}>
                <Text style={styles.smallButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>

          {threadBusy ? <ActivityIndicator color={sunrise.purple} /> : null}

          <FlatList
            data={threadMessages}
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
            renderItem={({ item }) => {
              const mine = String(item?.sender?.email || '').toLowerCase() === String(userProfile?.email || '').toLowerCase();
              return (
                <View style={[styles.messageBubble, mine ? styles.messageMine : styles.messageOther]}>
                  <Text style={styles.messageText}>{item.content}</Text>
                </View>
              );
            }}
          />

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
            <View style={styles.messageComposerDock}>
              <TextInput
                style={[styles.input, { flex: 1, marginTop: 0 }]}
                placeholder="Message…"
                placeholderTextColor={sunrise.muted}
                value={messageText}
                onChangeText={setMessageText}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={sendMessage}>
                <Text style={styles.primaryButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Messages</Text>
          <Text style={styles.sectionSubtitle}>1:1 conversations with your buddies and trusted contacts.</Text>

          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="Start with email"
              placeholderTextColor={sunrise.muted}
              value={startMessageEmail}
              onChangeText={setStartMessageEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity style={[styles.primaryButton, styles.rowButton]} onPress={startConversation} disabled={threadsBusy}>
              <Text style={styles.primaryButtonText}>Start</Text>
            </TouchableOpacity>
          </View>
        </View>

        {threadsBusy ? <ActivityIndicator color={sunrise.purple} /> : null}

        {threads.length ? threads.map((t) => (
          <TouchableOpacity key={t.id} style={styles.sectionCard} onPress={() => openThread(t)}>
            <Text style={styles.listTitle}>{shortName(t?.otherUser?.displayName || t?.otherUser?.email || 'Conversation')}</Text>
            <Text style={styles.listSubtitle}>{t?.lastMessage?.content || 'No messages yet'}</Text>
          </TouchableOpacity>
        )) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No conversations</Text>
            <Text style={styles.emptyText}>Start a chat by entering a buddy’s email.</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderSafety = () => (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Safety</Text>
        <Text style={styles.sectionSubtitle}>Block users and keep your space supportive.</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Block email"
            placeholderTextColor={sunrise.muted}
            value={blockEmail}
            onChangeText={setBlockEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={[styles.primaryButton, styles.rowButton, { backgroundColor: '#FFDAD6' }]} onPress={() => blockUser()} disabled={safetyBusy}>
            <Text style={styles.primaryButtonText}>Block</Text>
          </TouchableOpacity>
        </View>
      </View>

      {safetyBusy ? <ActivityIndicator color={sunrise.purple} /> : null}

      {blocks.length ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Blocked</Text>
          {blocks.map((b) => (
            <View key={b.userId} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{shortName(b.displayName || b.email)}</Text>
                <Text style={styles.listSubtitle}>{b.email}</Text>
              </View>
              <TouchableOpacity style={styles.smallButton} onPress={() => unblockUser(b.email)}>
                <Text style={styles.smallButtonText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptyText}>You’re in control — block anyone who makes the space unsafe.</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderContent = () => {
    if (settingsLoading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator color={sunrise.purple} />
          <Text style={styles.centerText}>Loading community…</Text>
        </View>
      );
    }

    if (isGuest) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Sign in required</Text>
          <Text style={styles.centerText}>Community features sync with your account.</Text>
        </View>
      );
    }

    if (!communityAllowedByAge) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Community disabled</Text>
          <Text style={styles.centerText}>Community features are disabled for child accounts.</Text>
        </View>
      );
    }

    if (settingsError) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Community unavailable</Text>
          <Text style={styles.centerText}>{settingsError}</Text>
          <Text style={[styles.centerText, { marginTop: 10, fontSize: 12 }]}>
            Backend: {backendUrlHint || DEFAULT_BACKEND_BASE_URL}
          </Text>
          <TouchableOpacity style={[styles.secondaryButton, { marginTop: 14 }]} onPress={loadSettings}>
            <Text style={styles.secondaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!settings?.optIn) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Join Community</Text>
          <Text style={styles.centerText}>Enable Community in Settings or during Onboarding.</Text>
        </View>
      );
    }

    if (activeTab === 'feed') return renderFeed();
    if (activeTab === 'groups') return renderGroups();
    if (activeTab === 'buddies') return renderBuddies();
    if (activeTab === 'messages') return renderMessages();
    return renderSafety();
  };

  return (
    <LinearGradient colors={[sunrise.background, sunrise.blueTint]} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {!embedded && (
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={onClose}>
              <Text style={styles.headerButtonText}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>👥 Community</Text>
              <Text style={styles.headerSubtitle}>Support, accountability, and encouragement</Text>
            </View>
          </View>
        )}

        <View style={styles.tabRowFixed}>
          <TabButton id="feed" label="Feed" />
          <TabButton id="groups" label="Groups" />
          <TabButton id="buddies" label="Buddies" />
          <TabButton id="messages" label="Messages" />
          <TabButton id="safety" label="Safety" />
        </View>

        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          {renderContent()}
        </View>

        <Modal visible={showComments} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowComments(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: sunrise.background }}>
            <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: sunrise.ink, fontSize: 18, fontWeight: '800' }}>Comments</Text>
              <TouchableOpacity style={styles.smallButton} onPress={() => setShowComments(false)}>
                <Text style={styles.smallButtonText}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
              <Text style={{ color: sunrise.muted }}>{commentsPost?.content}</Text>
            </View>

            {commentsLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator color={sunrise.purple} />
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(c) => c.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                renderItem={({ item }) => (
                  <View style={styles.commentRow}>
                    <Avatar label={item?.author?.displayName || item?.author?.email} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: sunrise.ink, fontWeight: '700' }}>{shortName(item?.author?.displayName || item?.author?.email)}</Text>
                      <Text style={{ color: sunrise.ink }}>{item.content}</Text>
                    </View>
                  </View>
                )}
              />
            )}

            <View style={styles.messageComposer}>
              <TextInput
                style={[styles.input, { flex: 1, marginTop: 0 }]}
                placeholder="Add a comment…"
                placeholderTextColor={sunrise.muted}
                value={commentText}
                onChangeText={setCommentText}
              />
              <TouchableOpacity style={[styles.primaryButton, styles.rowButton]} onPress={submitComment}>
                <Text style={styles.primaryButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>

        <Modal visible={showReportModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowReportModal(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: sunrise.background }}>
            <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: sunrise.ink, fontSize: 18, fontWeight: '800' }}>Report</Text>
              <TouchableOpacity style={styles.smallButton} onPress={() => setShowReportModal(false)}>
                <Text style={styles.smallButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: 16 }}>
              <Text style={{ color: sunrise.muted }}>Briefly describe what happened.</Text>
              <TextInput
                style={[styles.composerInput, { marginTop: 12 }]}
                placeholder="Details (optional)"
                placeholderTextColor={sunrise.muted}
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
              />

              <View style={{ flexDirection: 'row', marginTop: 16 }}>
                <TouchableOpacity style={[styles.secondaryButton, { flex: 1, marginRight: 8 }]} onPress={() => setShowReportModal(false)}>
                  <Text style={styles.secondaryButtonText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryButton, { flex: 1, marginLeft: 8 }]} onPress={submitReport}>
                  <Text style={styles.primaryButtonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: sunrise.orangeTint,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerButtonText: { color: sunrise.ink, fontSize: 18, fontWeight: '800' },
  headerTitle: { color: sunrise.ink, fontSize: 20, fontWeight: '800' },
  headerSubtitle: { color: sunrise.muted, fontSize: 12, marginTop: 2 },

  tabRowFixed: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: sunrise.blueTint,
    borderWidth: 1,
    borderColor: sunrise.gold,
    marginHorizontal: 3,
  },
  tabButtonActive: {
    backgroundColor: sunrise.orangeTint,
    borderColor: sunrise.orange,
  },
  tabLabel: { color: sunrise.ink, fontWeight: '800', fontSize: 11, textAlign: 'center' },
  tabLabelActive: { color: sunrise.ink },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  sectionTitle: { color: sunrise.ink, fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { color: sunrise.muted, marginTop: 6 },

  composerInput: {
    marginTop: 10,
    backgroundColor: sunrise.purpleTint,
    borderRadius: 12,
    padding: 12,
    color: sunrise.ink,
    minHeight: 64,
  },
  composerRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pillRow: { flexDirection: 'row' },
  pill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  pillActive: { backgroundColor: sunrise.gold },
  pillText: { color: sunrise.ink, fontWeight: '800', fontSize: 12 },
  pillTextActive: { color: sunrise.ink },

  primaryButton: {
    backgroundColor: sunrise.gold,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: sunrise.ink, fontWeight: '800' },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: sunrise.blueTint,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: sunrise.ink, fontWeight: '800' },

  helperText: { color: sunrise.muted, marginTop: 8, fontSize: 12 },

  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center' },
  postAuthor: { color: sunrise.ink, fontWeight: '800' },
  postMeta: { color: sunrise.muted, fontSize: 12, marginTop: 2 },
  postAction: { color: sunrise.ink, fontWeight: '800' },
  postContent: { color: sunrise.ink, marginTop: 10, fontSize: 14, lineHeight: 20 },

  reactionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  reactionChip: {
    backgroundColor: sunrise.blueTint,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  reactionChipActive: { backgroundColor: sunrise.gold },
  reactionText: { fontSize: 14 },
  reactionCount: { color: sunrise.ink, fontWeight: '800' },

  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: sunrise.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: { color: sunrise.ink, fontWeight: '900' },

  row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  rowButton: { marginLeft: 10 },
  input: {
    flex: 1,
    backgroundColor: sunrise.purpleTint,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: sunrise.ink,
    marginTop: 0,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
    marginTop: 8,
  },
  listTitle: { color: sunrise.ink, fontWeight: '800' },
  listSubtitle: { color: sunrise.muted, marginTop: 2 },

  smallButton: {
    backgroundColor: sunrise.gold,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  smallButtonText: { color: sunrise.ink, fontWeight: '800' },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerTitle: { color: sunrise.ink, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  centerText: { color: sunrise.muted, marginTop: 8, textAlign: 'center' },

  emptyBox: { marginTop: 16, padding: 16, backgroundColor: sunrise.blueTint, borderRadius: 16 },
  emptyTitle: { color: sunrise.ink, fontWeight: '900' },
  emptyText: { color: sunrise.muted, marginTop: 4 },

  messageComposer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: sunrise.background,
  },

  bottomDock: {
    backgroundColor: sunrise.background,
    borderTopWidth: 1,
    borderTopColor: sunrise.border,
    marginHorizontal: -16,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  messageComposerDock: {
    backgroundColor: sunrise.background,
    borderTopWidth: 1,
    borderTopColor: sunrise.border,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageBubble: {
    maxWidth: '82%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  messageMine: { alignSelf: 'flex-end', backgroundColor: sunrise.gold },
  messageOther: { alignSelf: 'flex-start', backgroundColor: sunrise.purpleTint },
  messageText: { color: sunrise.ink },

  commentRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: sunrise.border },
});
