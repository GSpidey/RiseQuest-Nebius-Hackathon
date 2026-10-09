import { getAuthToken } from '../services/AuthTokenStorage';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  Dimensions,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { WELLBEING_NOTICE } from '../config/wellbeingNotice';

const { width } = Dimensions.get('window');

/**
 * AI Coach & Analytics Dashboard
 * Personalized AI coaching, pattern analysis, and intelligent recommendations
 */
export const AICoachAnalytics = ({ userProfile, alarmData, sleepData, onNavigate }) => {
  const [currentTab, setCurrentTab] = useState('coach');
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [userMessage, setUserMessage] = useState('');
  const [analytics, setAnalytics] = useState({});
  const [patterns, setPatterns] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [coachPersonality, setCoachPersonality] = useState('motivational');
  const chatStorageKey = `risequest_chat:${encodeURIComponent(String(userProfile?.email || 'guest').toLowerCase())}`;
  const personalityStorageKey = `${chatStorageKey}:personality`;

  const chatInputRef = useRef(null);
  const lastTypedAtRef = useRef(0);
  const suppressAutoRefocusRef = useRef(false);

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

  const coachPersonalities = [
    { id: 'motivational', name: 'Motivational', icon: '💪', description: 'Energetic and encouraging' },
    { id: 'gentle', name: 'Gentle', icon: '🌸', description: 'Calm and supportive' },
    { id: 'scientific', name: 'Scientific', icon: '🔬', description: 'Data-driven and analytical' },
    { id: 'friendly', name: 'Friendly', icon: '😊', description: 'Casual and understanding' },
    { id: 'professional', name: 'Professional', icon: '👔', description: 'Business-focused approach' },
    { id: 'fun', name: 'Fun', icon: '🎉', description: 'Playful and upbeat' },
    { id: 'strict', name: 'Strict', icon: '📏', description: 'Firm and disciplined' },
    { id: 'rude', name: 'Rude', icon: '😈', description: 'Edgy and sarcastic' },
  ];

  useEffect(() => {
    loadChatHistory();
    generateAnalytics();
    detectPatterns();
    generateRecommendations();
  }, [userProfile, alarmData, sleepData]);

  useEffect(() => {
    AsyncStorage.setItem(personalityStorageKey, coachPersonality).catch(() => {});
  }, [coachPersonality, personalityStorageKey]);

  const readJsonSafe = async (resp) => {
    const text = await resp.text();
    if (!text) return { json: null, text: '' };
    try {
      return { json: JSON.parse(text), text };
    } catch (_) {
      return { json: null, text };
    }
  };

  const fetchBackendSummary = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return null;
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/events/alarm/summary?days=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { json } = await readJsonSafe(resp);
      if (!resp.ok) return null;
      return json;
    } catch {
      return null;
    }
  };

  const fetchBackendDailySeries = async (days = 7) => {
    try {
      const token = await getAuthToken();
      if (!token) return null;
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/events/alarm/daily?days=${encodeURIComponent(String(days))}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { json } = await readJsonSafe(resp);
      if (!resp.ok) return null;
      if (!Array.isArray(json?.series)) return null;
      return json.series;
    } catch {
      return null;
    }
  };

  const fetchChatHistory = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return null;
      const baseUrl = await getBackendBaseUrl();
      const resp = await fetch(`${baseUrl}/api/coach/chat/history?limit=60`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { json } = await readJsonSafe(resp);
      if (!resp.ok) return null;
      if (!json?.messages) return null;
      return json.messages.map((m) => ({
        id: String(m.id),
        type: m.role === 'assistant' ? 'ai' : 'user',
        message: String(m.content || ''),
        timestamp: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
      }));
    } catch {
      return null;
    }
  };

  const loadChatHistory = async () => {
    try {
      const savedPersonality = await AsyncStorage.getItem(personalityStorageKey);
      if (savedPersonality) {
        setCoachPersonality(String(savedPersonality));
      }

      const backend = await fetchChatHistory();
      if (backend) {
        setChatMessages(backend);
        await AsyncStorage.setItem(chatStorageKey, JSON.stringify(backend));
        return;
      }

      const history = await AsyncStorage.getItem(chatStorageKey);
      if (history) {
        setChatMessages(JSON.parse(history));
      } else {
        // Initialize with welcome message
        const welcomeMessage = {
          id: '1',
          type: 'ai',
          message: getWelcomeMessage(),
          timestamp: new Date().toISOString(),
        };
        setChatMessages([welcomeMessage]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const getWelcomeMessage = () => {
    const personality = coachPersonalities.find(p => p.id === coachPersonality);
    const name = userProfile?.displayName?.split(' ')[0] || 'there';
    
    switch (coachPersonality) {
      case 'motivational':
        return `Hey ${name}! 💪 Ready to CRUSH your morning routine? I'm here to help you become an unstoppable force of productivity!`;
      case 'gentle':
        return `Hello ${name} 🌸 I'm here to gently guide you toward better sleep and more peaceful mornings. How are you feeling today?`;
      case 'scientific':
        return `Greetings ${name} 🔬 I'll be analyzing your sleep patterns and alarm effectiveness to optimize your circadian rhythm and wake performance.`;
      case 'friendly':
        return `Hi ${name}! 😊 I'm your friendly wake-up coach. Think of me as your morning buddy who's always here to chat and help out!`;
      case 'professional':
        return `Good day ${name} 👔 I'm your professional sleep optimization consultant. Let's discuss strategies to enhance your morning productivity.`;
      default:
        return `Hello ${name}! I'm your AI wake-up coach, here to help you achieve your morning goals!`;
    }
  };

  const generateAnalytics = () => {
    // Prefer backend summary (real stored events). Fill remaining metrics from local data.
    (async () => {
      const summary = await fetchBackendSummary();
      if (summary?.success) {
        const dailySeries = await fetchBackendDailySeries(7);
        const local = {
          sleepQuality: calculateAverageSleepQuality(),
          consistencyScore: calculateConsistency(),
          improvementTrend: calculateImprovementTrend(),
          challengePerformance: calculateChallengePerformance(),
          weeklyComparison: generateWeeklyComparison(),
          monthlyTrends: generateMonthlyTrends(),
          personalBests: calculatePersonalBests(),
        };

        setAnalytics({
          ...local,
          wakeUpSuccess: Number(summary.wakeUpSuccess || 0),
          totalEvents: Number(summary.totalEvents || 0),
          byType: summary.byType || {},
          days: Number(summary.days || 30),
          dailySeries: Array.isArray(dailySeries) ? dailySeries : null,
        });
        return;
      }

      const analytics = {
        wakeUpSuccess: calculateWakeUpSuccess(),
        sleepQuality: calculateAverageSleepQuality(),
        consistencyScore: calculateConsistency(),
        improvementTrend: calculateImprovementTrend(),
        challengePerformance: calculateChallengePerformance(),
        weeklyComparison: generateWeeklyComparison(),
        monthlyTrends: generateMonthlyTrends(),
        personalBests: calculatePersonalBests(),
      };
      setAnalytics(analytics);
    })();
  };

  const detectPatterns = () => {
    const detectedPatterns = [];

    // Day of week patterns
    const weekdayPattern = analyzeDayOfWeekPatterns();
    if (weekdayPattern.significance > 0.7) {
      detectedPatterns.push({
        type: 'weekday',
        title: 'Weekday Performance Pattern',
        description: `Your wake-up success is ${weekdayPattern.trend} on ${weekdayPattern.bestDay}s`,
        confidence: weekdayPattern.significance,
        icon: '📅',
      });
    }

    // Weather correlation
    const weatherPattern = analyzeWeatherCorrelation();
    if (weatherPattern.correlation > 0.6) {
      detectedPatterns.push({
        type: 'weather',
        title: 'Weather Impact Pattern',
        description: `${weatherPattern.weatherType} weather affects your wake-up success by ${Math.round(weatherPattern.impact * 100)}%`,
        confidence: weatherPattern.correlation,
        icon: '🌤️',
      });
    }

    // Sleep duration correlation
    const sleepPattern = analyzeSleepDurationPattern();
    if (sleepPattern.correlation > 0.5) {
      detectedPatterns.push({
        type: 'sleep',
        title: 'Optimal Sleep Duration',
        description: `You perform best with ${sleepPattern.optimalDuration} hours of sleep`,
        confidence: sleepPattern.correlation,
        icon: '😴',
      });
    }

    // Challenge difficulty pattern
    const challengePattern = analyzeChallengePattern();
    if (challengePattern.consistency > 0.6) {
      detectedPatterns.push({
        type: 'challenge',
        title: 'Challenge Difficulty Sweet Spot',
        description: `${challengePattern.optimalDifficulty} difficulty gives you the best balance of success and engagement`,
        confidence: challengePattern.consistency,
        icon: '🎮',
      });
    }

    setPatterns(detectedPatterns);
  };

  const generateRecommendations = () => {
    const recommendations = [];

    const conditions = Array.isArray(userProfile?.supportConditions) ? userProfile.supportConditions : [];
    const has = (c) => conditions.includes(c);
    const pool = [];

    if (has('adhd')) {
      pool.push({
        type: 'adhd',
        priority: 'high',
        title: 'Start with one tiny task',
        description: 'Pick a 2-minute win after waking up (water, open curtains, sit up) to build momentum.',
        action: 'Try Today',
        icon: '🎯',
      });
      pool.push({
        type: 'adhd',
        priority: 'medium',
        title: 'Reduce decision fatigue',
        description: 'Pre-set your alarm label + wake message so mornings feel automatic.',
        action: 'Edit Alarm',
        icon: '🧠',
      });
    }

    if (has('anxiety')) {
      pool.push({
        type: 'anxiety',
        priority: 'high',
        title: 'Gentle wake-up routine',
        description: 'Use a calmer tone and a reassuring message. Avoid loud surprises first thing.',
        action: 'Tune Alarm',
        icon: '🌿',
      });
    }

    if (has('bipolar')) {
      pool.push({
        type: 'bipolar',
        priority: 'high',
        title: 'Keep a stable wake time',
        description: 'Consistency often helps—try not to shift your wake time too much day-to-day.',
        action: 'Plan',
        icon: '🗓️',
      });
    }

    if (has('autism')) {
      pool.push({
        type: 'autism',
        priority: 'medium',
        title: 'Predictable morning steps',
        description: 'Keep the same sequence each morning; predictable routines can reduce stress.',
        action: 'Simplify',
        icon: '🫧',
      });
    }

    // Add 1–2 daily rotating recommendations from the condition pool.
    const daily = pickDaily(pool, `${userProfile?.email || 'guest'}:${todayKey()}:coach`, 2);
    daily.forEach((r) => recommendations.push(r));

    // If no conditions are selected, still provide a couple of useful rotating tips.
    if (recommendations.length === 0) {
      const genericPool = [
        {
          type: 'general',
          priority: 'medium',
          title: 'Make the first minute easy',
          description: 'Put your phone across the room and set a simple first step (water, light, sit up).',
          action: 'Try Today',
          icon: '🧩',
        },
        {
          type: 'general',
          priority: 'medium',
          title: 'Use light to wake faster',
          description: 'Open curtains or step into brighter light within 5 minutes of waking.',
          action: 'Do it',
          icon: '☀️',
        },
        {
          type: 'general',
          priority: 'low',
          title: 'Stabilize your wake time',
          description: 'Even a 30–60 minute window improves consistency over time.',
          action: 'Plan',
          icon: '🕒',
        },
      ];

      const genericDaily = pickDaily(genericPool, `${userProfile?.email || 'guest'}:${todayKey()}:coach:generic`, 2);
      genericDaily.forEach((r) => recommendations.push(r));
    }

    // Sleep schedule recommendations
    if (typeof analytics.consistencyScore === 'number' && analytics.consistencyScore < 70) {
      recommendations.push({
        type: 'schedule',
        priority: 'high',
        title: 'Improve Sleep Consistency',
        description: 'Try going to bed and waking up at the same time every day, even on weekends.',
        action: 'Set Bedtime Reminder',
        icon: '🕐',
      });
    }

    // Challenge difficulty recommendations
    if (typeof analytics.challengePerformance?.successRate === 'number' && analytics.challengePerformance.successRate < 60) {
      recommendations.push({
        type: 'challenge',
        priority: 'medium',
        title: 'Adjust Challenge Difficulty',
        description: 'Your current challenge difficulty might be too high. Consider lowering it for better success.',
        action: 'Adjust Difficulty',
        icon: '🎯',
      });
    }

    // Sleep quality recommendations
    if (typeof analytics.sleepQuality === 'number' && analytics.sleepQuality < 75) {
      recommendations.push({
        type: 'sleep',
        priority: 'high',
        title: 'Improve Sleep Quality',
        description: 'Your sleep quality could be better. Consider optimizing your sleep environment.',
        action: 'Sleep Tips',
        icon: '🛏️',
      });
    }

    // Tone recommendations
    const toneAnalysis = analyzeToneEffectiveness();
    if (toneAnalysis.needsChange) {
      recommendations.push({
        type: 'tone',
        priority: 'medium',
        title: 'Try Different Alarm Tones',
        description: `Your current tone might be losing effectiveness. Try ${toneAnalysis.suggestedTone}.`,
        action: 'Change Tone',
        icon: '🎵',
      });
    }

    setRecommendations(recommendations);
  };

  const AICoachTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.coachHeader}>
        <Text style={styles.coachGreeting}>
          {getCoachGreeting()}
        </Text>
        <Text style={styles.wellbeingNotice}>{WELLBEING_NOTICE}</Text>
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => setShowChatModal(true)}
        >
          <Text style={styles.chatButtonText}>💬 Chat with Coach</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.personalitySelector}>
        <Text style={styles.sectionTitle}>🎭 Coach Personality</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {coachPersonalities.map(personality => (
            <TouchableOpacity
              key={personality.id}
              style={[
                styles.personalityOption,
                coachPersonality === personality.id && styles.personalitySelected
              ]}
              onPress={() => setCoachPersonality(personality.id)}
            >
              <Text style={styles.personalityIcon}>{personality.icon}</Text>
              <Text style={styles.personalityName}>{personality.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.quickInsights}>
        <Text style={styles.sectionTitle}>⚡ Quick Insights</Text>
        {getQuickInsights().map((insight, index) => (
          <View key={index} style={styles.insightCard}>
            <Text style={styles.insightIcon}>{insight.icon}</Text>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>{insight.title}</Text>
              <Text style={styles.insightDescription}>{insight.description}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.recommendationsSection}>
        <Text style={styles.sectionTitle}>🎯 AI Recommendations</Text>
        {recommendations.slice(0, 3).map((rec, index) => (
          <TouchableOpacity
            key={index}
            style={styles.recommendationCard}
            onPress={() => handleRecommendationAction(rec)}
            activeOpacity={0.9}
          >
            <View style={[styles.priorityBadge, styles[`priority${rec.priority}`]]}>
              <Text style={styles.priorityText}>{rec.priority.toUpperCase()}</Text>
            </View>
            <Text style={styles.recIcon}>{rec.icon}</Text>
            <View style={styles.recContent}>
              <Text style={styles.recTitle}>{rec.title}</Text>
              <Text style={styles.recDescription}>{rec.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const AnalyticsTab = () => {
    const byType = analytics?.byType || {};
    const series = Array.isArray(analytics?.dailySeries) ? analytics.dailySeries : null;
    const lineLabels = series && series.length
      ? series.map((s) => weekdayLabelFromDateKey(s.date))
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const lineData = series && series.length
      ? series.map((s) => Number(s.successRate || 0))
      : [0, 0, 0, 0, 0, 0, 0];

    const barLabels = ['Triggered', 'Dismiss', 'Snooze', 'Challenge'];
    const barData = [
      Number(byType.triggered || 0),
      Number(byType.dismiss || 0),
      Number(byType.snooze || 0),
      Number(byType.challenge || 0),
    ];

    return (
    <ScrollView style={styles.tabContent}>
      <View style={styles.analyticsHeader}>
        <Text style={styles.sectionTitle}>📊 Performance Analytics</Text>
        <View style={styles.timeRangeSelector}>
          <TouchableOpacity style={styles.timeButton}>
            <Text style={styles.timeButtonText}>7D</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.timeButton, styles.timeButtonActive]}>
            <Text style={[styles.timeButtonText, styles.timeButtonActiveText]}>30D</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.timeButton}>
            <Text style={styles.timeButtonText}>90D</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>
            {typeof analytics.wakeUpSuccess === 'number' ? `${analytics.wakeUpSuccess}%` : '—'}
          </Text>
          <Text style={styles.metricLabel}>Wake-Up Success</Text>
          <Text style={styles.metricTrend}>
            {analytics?.totalEvents ? `${analytics.totalEvents} events / ${analytics.days || 30}d` : ''}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>
            {typeof analytics.sleepQuality === 'number' ? `${analytics.sleepQuality}%` : '—'}
          </Text>
          <Text style={styles.metricLabel}>Sleep Quality</Text>
          <Text style={styles.metricTrend}>
            {Array.isArray(sleepData) && sleepData.length ? `${sleepData.length} nights tracked` : 'No sleep data yet'}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>
            {typeof analytics.consistencyScore === 'number' ? `${analytics.consistencyScore}%` : '—'}
          </Text>
          <Text style={styles.metricLabel}>Consistency</Text>
          <Text style={styles.metricTrend}>
            {Number(byType.triggered || 0) ? `${Number(byType.triggered || 0)} alarms triggered` : ''}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>
            {typeof analytics?.challengePerformance?.successRate === 'number'
              ? `${analytics.challengePerformance.successRate}%`
              : '—'}
          </Text>
          <Text style={styles.metricLabel}>Challenge Success</Text>
          <Text style={styles.metricTrend}>
            {Number(byType.challenge || 0) ? `${Number(byType.challenge || 0)} challenge events` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Wake-Up Success Trend</Text>
        <LineChart
          data={{
            labels: lineLabels,
            datasets: [{
              data: lineData,
              strokeWidth: 3,
              color: (opacity = 1) => `rgba(81, 179, 236, ${opacity})`,
            }],
          }}
          width={width - 40}
          height={200}
          chartConfig={{
            backgroundColor: 'transparent',
            backgroundGradientFrom: '#fff',
            backgroundGradientTo: '#fff',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(102, 126, 234, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          }}
          bezier
          style={styles.chart}
        />
      </View>

      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Alarm Events (Last {analytics.days || 30} Days)</Text>
        <BarChart
          data={{
            labels: barLabels,
            datasets: [{
              data: barData,
            }],
          }}
          width={width - 40}
          height={200}
          chartConfig={{
            backgroundColor: 'transparent',
            backgroundGradientFrom: '#fff',
            backgroundGradientTo: '#fff',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(102, 126, 234, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
          }}
          style={styles.chart}
        />
      </View>
    </ScrollView>
    );
  };

  const PatternsTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>🔍 Detected Patterns</Text>
      
      {patterns.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No patterns detected yet</Text>
          <Text style={styles.emptySubtext}>
            Use RiseQuest for a few weeks to see personalized patterns
          </Text>
        </View>
      ) : (
        patterns.map((pattern, index) => (
          <View key={index} style={styles.patternCard}>
            <View style={styles.patternHeader}>
              <Text style={styles.patternIcon}>{pattern.icon}</Text>
              <View style={styles.patternInfo}>
                <Text style={styles.patternTitle}>{pattern.title}</Text>
                <View style={styles.confidenceBar}>
                  <View 
                    style={[
                      styles.confidenceFill, 
                      { width: `${pattern.confidence * 100}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.confidenceText}>
                  {Math.round(pattern.confidence * 100)}% confidence
                </Text>
              </View>
            </View>
            <Text style={styles.patternDescription}>{pattern.description}</Text>
          </View>
        ))
      )}

      <View style={styles.correlationMatrix}>
        <Text style={styles.sectionTitle}>🔗 Factor Correlations</Text>
        <View style={styles.matrixGrid}>
          {getCorrelationMatrix().length === 0 ? (
            <Text style={styles.emptySubtext}>Not enough data yet to compute correlations.</Text>
          ) : getCorrelationMatrix().map((item, index) => (
            <View key={index} style={styles.correlationItem}>
              <Text style={styles.correlationFactors}>{item.factors}</Text>
              <View style={styles.correlationStrength}>
                <View 
                  style={[
                    styles.correlationBar,
                    { 
                      width: `${Math.abs(item.correlation) * 100}%`,
                      backgroundColor: item.correlation > 0 ? '#4CAF50' : '#F44336'
                    }
                  ]} 
                />
              </View>
              <Text style={styles.correlationValue}>
                {item.correlation > 0 ? '+' : ''}{Math.round(item.correlation * 100)}%
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const ChatModal = () => (
    <Modal
      visible={showChatModal}
      animationType="slide"
      onRequestClose={() => setShowChatModal(false)}
      onShow={() => {
        suppressAutoRefocusRef.current = false;
        requestAnimationFrame(() => {
          chatInputRef.current?.focus?.();
        });
      }}
    >
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.chatContainer}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle}>💬 AI Coach Chat</Text>
            <TouchableOpacity
              onPress={() => {
                suppressAutoRefocusRef.current = true;
                setShowChatModal(false);
              }}
            >
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <FlatList
              data={chatMessages}
              keyExtractor={(m, idx) => String(m?.id ?? `${m?.timestamp ?? 't'}-${idx}`)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 20, paddingBottom: 12 }}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.messageContainer,
                    item.type === 'user' ? styles.userMessage : styles.aiMessage,
                  ]}
                >
                  <Text style={styles.messageText}>{item.message}</Text>
                  <Text style={styles.messageTime}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              )}
            />

            <View style={styles.chatInput}>
              <TextInput
                ref={chatInputRef}
                style={styles.messageInput}
                value={userMessage}
                onChangeText={(t) => {
                  lastTypedAtRef.current = Date.now();
                  setUserMessage(t);

                  // Some Android devices occasionally blur the input during state updates;
                  // focusing next frame keeps the keyboard stable while typing.
                  if (Platform.OS === 'android') {
                    requestAnimationFrame(() => {
                      if (!suppressAutoRefocusRef.current) {
                        chatInputRef.current?.focus?.();
                      }
                    });
                  }
                }}
                placeholder="Ask your coach anything…"
                placeholderTextColor="rgba(255,255,255,0.6)"
                multiline
                blurOnSubmit={false}
                autoFocus
                onBlur={() => {
                  if (!showChatModal) return;
                  if (suppressAutoRefocusRef.current) return;
                  const sinceTyped = Date.now() - (lastTypedAtRef.current || 0);
                  if (sinceTyped < 400) {
                    setTimeout(() => {
                      if (!suppressAutoRefocusRef.current) {
                        chatInputRef.current?.focus?.();
                      }
                    }, 60);
                  }
                }}
              />
              <TouchableOpacity
                style={[styles.sendButton, !userMessage.trim() && { opacity: 0.5 }]}
                onPress={sendMessage}
                disabled={!userMessage.trim()}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );

  // Helper functions for calculations
  const calculateWakeUpSuccess = () => {
    return null;
  };

  const calculateAverageSleepQuality = () => {
    if (!sleepData || sleepData.length === 0) return null;
    const total = sleepData.reduce((sum, day) => sum + day.sleepQuality, 0);
    return Math.round(total / sleepData.length);
  };

  const calculateConsistency = () => {
    return null;
  };

  const calculateImprovementTrend = () => {
    return null;
  };

  const calculateChallengePerformance = () => {
    return null;
  };

  const generateWeeklyComparison = () => {
    return null;
  };

  const generateMonthlyTrends = () => {
    return null;
  };

  const calculatePersonalBests = () => {
    return null;
  };

  const analyzeDayOfWeekPatterns = () => {
    return { significance: 0, trend: '', bestDay: '' };
  };

  const analyzeWeatherCorrelation = () => {
    return { correlation: 0, weatherType: '', impact: 0 };
  };

  const analyzeSleepDurationPattern = () => {
    return { correlation: 0, optimalDuration: '' };
  };

  const analyzeChallengePattern = () => {
    return { consistency: 0, optimalDifficulty: '' };
  };

  const analyzeToneEffectiveness = () => {
    return { needsChange: false, suggestedTone: null };
  };

  const getCoachGreeting = () => {
    const hour = new Date().getHours();
    const name = userProfile?.displayName?.split(' ')[0] || 'Champion';
    
    if (hour < 12) {
      return `Good morning, ${name}! Ready to make today amazing? ☀️`;
    } else if (hour < 18) {
      return `Good afternoon, ${name}! How's your day going? 🌤️`;
    } else {
      return `Good evening, ${name}! Let's plan for a great tomorrow! 🌙`;
    }
  };

  const getQuickInsights = () => {
    const byType = analytics?.byType || analytics?._byType || {};
    const triggered = Number(byType.triggered || 0);
    const dismiss = Number(byType.dismiss || 0);
    const snooze = Number(byType.snooze || 0);
    const challenge = Number(byType.challenge || 0);
    const days = Number(analytics?.days || analytics?._days || 30);
    const success = typeof analytics?.wakeUpSuccess === 'number' ? analytics.wakeUpSuccess : null;

    return [
      {
        icon: '📈',
        title: 'Wake-Up Success',
        description: success != null ? `${success}% over the last ${days} days` : 'Not enough data yet. Use alarms for a few days.',
      },
      {
        icon: '⏰',
        title: 'Alarm Activity',
        description: `${triggered} triggered · ${dismiss} dismissed · ${snooze} snoozed`,
      },
      {
        icon: '🎮',
        title: 'Challenges',
        description: challenge > 0 ? `${challenge} challenge events logged` : 'No challenge events logged yet.',
      },
    ];
  };

  const getCorrelationMatrix = () => {
    // Correlations require richer datasets (sleep + wake + environment). Keep empty until collected.
    return [];
  };

  const weekdayLabelFromDateKey = (dateKey) => {
    try {
      const d = new Date(`${dateKey}T00:00:00Z`);
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return names[d.getUTCDay()] || String(dateKey);
    } catch {
      return String(dateKey);
    }
  };

  const sendMessage = async () => {
    if (!userMessage.trim()) return;

    const newUserMessage = {
      id: Date.now().toString(),
      type: 'user',
      message: userMessage,
      timestamp: new Date().toISOString(),
    };

    setChatMessages(prev => {
      const next = [...prev, newUserMessage];
      AsyncStorage.setItem(chatStorageKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setUserMessage('');

    // Provider outages are disclosed; prepared tips never impersonate live AI.
    try {
      const token = await getAuthToken();
      if (token) {
        const baseUrl = await getBackendBaseUrl();
        const resp = await fetch(`${baseUrl}/api/coach/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: String(newUserMessage.message),
            personality: coachPersonality,
          }),
        });
        const { json, text } = await readJsonSafe(resp);
        if (!resp.ok) {
          throw new Error(json?.error || text || 'Coach chat failed');
        }

        const reply = String(json?.reply || '').trim();
        const newAIMessage = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          message: json?.provider === 'curated' ? `Prepared guidance\n\n${reply}` : reply || 'No reply was received. Please try again.',
          timestamp: new Date().toISOString(),
        };

        setChatMessages(prev => {
          const next = [...prev, newAIMessage];
          AsyncStorage.setItem(chatStorageKey, JSON.stringify(next)).catch(() => {});
          return next;
        });
        return;
      }
    } catch (e) {
      // Keep the user's message locally; clearly disclose unavailable live AI.
    }

      const newAIMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        message: 'Live coaching is unavailable right now. Prepared tip: choose one small, manageable next step and take a break if you need it. No alarms or settings have been changed.',
        timestamp: new Date().toISOString(),
      };
      setChatMessages(prev => {
        const next = [...prev, newAIMessage];
        AsyncStorage.setItem(chatStorageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
  };

  const handleRecommendationAction = (recommendation) => {
    const action = String(recommendation?.action || '').trim();
    const nav = typeof onNavigate === 'function' ? onNavigate : null;

    if (nav) {
      if (action === 'Edit Alarm' || action === 'Adjust Difficulty') {
        nav('alarms');
        return;
      }
      if (action === 'Tune Alarm' || action === 'Change Tone') {
        nav('advanced-alarms');
        return;
      }
      if (action === 'Set Bedtime Reminder' || action === 'Sleep Tips') {
        nav('sleep');
        return;
      }
      if (action === 'Plan') {
        nav('quests');
        return;
      }
    }

    switch (action) {
      case 'Set Bedtime Reminder':
        Alert.alert('Bedtime Reminder', 'Open Sleep to choose and save a bedtime reminder. Nothing has been changed yet.');
        break;
      case 'Adjust Difficulty':
        Alert.alert('Challenge Difficulty', 'Open Alarms, select an alarm, then choose and save its challenge difficulty.');
        break;
      case 'Sleep Tips':
        Alert.alert('Sleep Optimization Tips', 'Here are some tips to improve your sleep quality:\n• Keep room temperature cool (65-68°F)\n• Avoid screens 1 hour before bed\n• Use blackout curtains\n• Try meditation or reading');
        break;
      case 'Change Tone':
        Alert.alert('Alarm Tone', 'Open Alarms to preview a tone and save your choice. Nothing has been changed yet.');
        break;
      case 'Plan':
        Alert.alert('Plan', 'Open Quests to plan a small, realistic morning goal.');
        break;
      case 'Edit Alarm':
      case 'Tune Alarm':
        Alert.alert('Alarms', 'Open the Alarms tab to adjust your alarm settings.');
        break;
      case 'Try Today':
      case 'Do it':
        Alert.alert('Try it', 'Try this one small action today, then come back tomorrow for fresh suggestions.');
        break;
      default:
        Alert.alert('Recommendation', String(recommendation?.description || '')); 
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FF7A00', '#7C5CFC']} style={styles.header}>
        <Text style={styles.headerTitle}>🤖 AI Coach & Analytics</Text>
        <Text style={styles.headerSubtitle}>Personalized insights and intelligent coaching</Text>
      </LinearGradient>

      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, currentTab === 'coach' && styles.activeTab]}
          onPress={() => setCurrentTab('coach')}
        >
          <Text style={[styles.tabText, currentTab === 'coach' && styles.activeTabText]}>
            Coach
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
          style={[styles.tab, currentTab === 'patterns' && styles.activeTab]}
          onPress={() => setCurrentTab('patterns')}
        >
          <Text style={[styles.tabText, currentTab === 'patterns' && styles.activeTabText]}>
            Patterns
          </Text>
        </TouchableOpacity>
      </View>

      {currentTab === 'coach' && <AICoachTab />}
      {currentTab === 'analytics' && <AnalyticsTab />}
      {currentTab === 'patterns' && <PatternsTab />}

      <ChatModal />
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
    borderBottomColor: '#667eea',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#667eea',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Coach Tab Styles
  coachHeader: {
    backgroundColor: 'white',
    padding: 20,
    margin: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  coachGreeting: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  chatButton: {
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  wellbeingNotice: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  chatButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Personality Selector
  personalitySelector: {
    margin: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  personalityOption: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  personalitySelected: {
    backgroundColor: '#667eea',
  },
  personalityIcon: {
    fontSize: 24,
    marginBottom: 5,
  },
  personalityName: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },

  // Insights
  quickInsights: {
    margin: 15,
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
    marginTop: 2,
  },

  // Recommendations
  recommendationsSection: {
    margin: 15,
  },
  recommendationCard: {
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
  priorityBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityhigh: {
    backgroundColor: '#F44336',
  },
  prioritymedium: {
    backgroundColor: '#FF9800',
  },
  prioritylow: {
    backgroundColor: '#4CAF50',
  },
  priorityText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // recAction styles removed (recommendation cards are tappable)
  recDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },

  // Analytics Tab
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: 15,
  },
  timeRangeSelector: {
    flexDirection: 'row',
  },
  timeButton: {
    backgroundColor: 'white',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    marginLeft: 5,
  },
  timeButtonActive: {
    backgroundColor: '#667eea',
  },
  timeButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  timeButtonActiveText: {
    color: 'white',
  },

  // Metrics Grid
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
    color: '#667eea',
  },
  metricLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  metricTrend: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 2,
  },

  // Charts
  chartContainer: {
    backgroundColor: 'white',
    margin: 15,
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

  // Patterns Tab
  patternCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    margin: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  patternHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  patternIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  patternInfo: {
    flex: 1,
  },
  patternTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  confidenceBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginTop: 5,
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  confidenceText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  patternDescription: {
    fontSize: 14,
    color: '#666',
  },

  // Correlation Matrix
  correlationMatrix: {
    margin: 15,
  },
  matrixGrid: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  correlationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  correlationFactors: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  correlationStrength: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginHorizontal: 10,
  },
  correlationBar: {
    height: '100%',
    borderRadius: 4,
  },
  correlationValue: {
    width: 50,
    textAlign: 'right',
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },

  // Chat Modal
  chatContainer: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  chatTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    fontSize: 24,
    color: 'white',
    padding: 5,
  },
  chatMessages: {
    flex: 1,
    padding: 20,
  },
  messageContainer: {
    marginBottom: 15,
    maxWidth: '80%',
    padding: 12,
    borderRadius: 15,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  messageTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    textAlign: 'right',
  },
  chatInput: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  messageInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 12,
    borderRadius: 10,
    color: 'white',
    fontSize: 16,
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 10,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Empty State
  emptyState: {
    backgroundColor: 'white',
    padding: 30,
    borderRadius: 12,
    margin: 15,
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
});

export default AICoachAnalytics;
