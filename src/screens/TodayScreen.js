import { AppAlert as Alert } from '../components/AppModal';
import { XpBar } from '../components/ProgressCard';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import questService from '../services/QuestService';
import { WeatherService } from '../utils/AIServices';
import { DashboardSection, ToolRow, SunriseIcon, sunrise, ui } from '../components/SunriseUI';
import DiscreetAd from '../components/DiscreetAd';

const defaults = { wellness: true, progress: false, explore: false };

export default function TodayScreen({ userProfile, isGuest, premium, adsSuppressed, alarms, stats, points, onNavigate, onCreateAlarm, onRewards, onCosmetics, onFocus, weather, weatherLoading, onRefreshWeather, nextTrigger, accentColors }) {
  const account = isGuest ? 'guest' : String(userProfile?.id || userProfile?.email || 'guest');
  const preferenceKey = `risequest_today_sections:${account}`;
  const [sections, setSections] = useState(defaults);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [quest, setQuest] = useState(null);
  const [questLoading, setQuestLoading] = useState(!isGuest);
  const writeQueue = useRef(Promise.resolve());

  useEffect(() => {
    let live = true;
    setSections(defaults);
    setPreferencesReady(false);
    AsyncStorage.getItem(preferenceKey).then(raw => {
      if (!live) return;
      const saved = raw ? JSON.parse(raw) : {};
      setSections(Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof saved?.[key] === 'boolean' ? saved[key] : value])));
    }).catch(() => {}).finally(() => { if (live) setPreferencesReady(true); });
    return () => { live = false; };
  }, [preferenceKey]);

  useEffect(() => {
    let live = true;
    setQuest(null);
    if (isGuest || !userProfile?.id) { setQuestLoading(false); return; }
    setQuestLoading(true);
    questService.getUserQuests(userProfile.id).then(list => {
      if (live) setQuest(Array.isArray(list) ? list.find(item => item.status === 'active') || null : null);
    }).catch(() => {}).finally(() => { if (live) setQuestLoading(false); });
    return () => { live = false; };
  }, [isGuest, userProfile?.id]);

  const toggle = key => {
    if (!preferencesReady) return;
    const next = { ...sections, [key]: !sections[key] };
    setSections(next);
    writeQueue.current = writeQueue.current.catch(() => {}).then(() => AsyncStorage.setItem(preferenceKey, JSON.stringify(next))).catch(() => {});
  };
  const nextAlarm = alarms.filter(alarm => alarm.isEnabled !== false)
    .map(alarm => ({ alarm, date: nextTrigger(alarm) }))
    .filter(item => Number.isFinite(item.date.getTime()))
    .sort((a, b) => a.date - b.date)[0];
  const temperature = weather?.temperatureExact ?? weather?.temperature;
  const hasWeather = !weather?.error && temperature != null && Number.isFinite(Number(temperature));
  const weatherNumbers = hasWeather ? [
    `${Math.round(Number(temperature))}°C`,
    typeof weather.humidity === 'number' ? `${Math.round(weather.humidity)}% RH` : null,
    typeof weather.windSpeed === 'number' ? `${Math.round(weather.windSpeed)} km/h` : null,
  ].filter(Boolean).join('  ·  ') : weatherLoading ? 'Weather…' : 'Weather unavailable';
  const showWeather = () => {
    const details = hasWeather
      ? `${weather.city || 'Your area'} ${weather.description || ''}\n${typeof weather.apparentTemperatureExact === 'number' ? `Feels like ${weather.apparentTemperatureExact.toFixed(1)}°C\n` : ''}${weather.stale?'Showing the last available reading.\n':''}${WeatherService.getWeatherAdvice(weather)}`.trim()
      : String(weather?.error || 'Refresh to see your local weather.');
    Alert.alert('Today’s weather', details, [{ text: 'Close', style: 'cancel' }, { text: 'Refresh', onPress: onRefreshWeather }]);
  };

  return <ScrollView style={ui.page} contentContainerStyle={ui.pageContent} showsVerticalScrollIndicator={false}>
    <TouchableOpacity style={s.weatherStrip} onPress={showWeather} accessibilityRole="button"
      accessibilityLabel={`Weather: ${weatherNumbers}`} accessibilityHint="Show weather details and refresh">
      <SunriseIcon name="today" size={20} color="#A24A00" />
      <Text style={s.weatherNumbers}>{weatherNumbers}</Text>
    </TouchableOpacity>
    <View style={[ui.card, { borderTopWidth: 4, borderTopColor: accentColors?.[0] || sunrise.orange }]}>
      {!!userProfile?.bannerUrl && <Image source={{ uri: userProfile.bannerUrl }} style={{ width: '100%', height: 80 }} resizeMode="cover" accessibilityLabel="Your profile banner" />}
      <LinearGradient colors={['#FFF0DB', '#FFF9E8']} style={s.focus}>
        <View style={s.heading}><SunriseIcon name="today" color="#A24A00" /><Text style={s.eyebrow}>YOUR DAILY FOCUS</Text></View>
        <Text style={s.heroTitle}>One good step at a time.</Text>
        <Text style={ui.subtitle}>A little structure. More room for you.</Text>
        <ToolRow icon="alarm" title={nextAlarm ? nextAlarm.date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Set your next alarm'}
          subtitle={nextAlarm ? `Next alarm · ${nextAlarm.alarm.label || 'Wake up'}` : 'Give your morning a gentle starting point'}
          onPress={() => nextAlarm ? onNavigate('alarms') : onCreateAlarm()} tint="#FFE2B3" color="#994500" />
        <ToolRow icon="quests" title={questLoading ? 'Loading your active quest…' : quest?.title || 'Choose your next quest'}
          subtitle={quest ? 'Continue your active quest' : isGuest ? 'Sign in to save quests and progress' : 'Small steps toward something that matters'}
          onPress={() => onNavigate('quests')} />
        <TouchableOpacity style={ui.button} onPress={onCreateAlarm} accessibilityRole="button"><Text style={ui.buttonText}>Set an alarm</Text></TouchableOpacity>
      </LinearGradient>
    </View>

    <DashboardSection title="Wellness snapshot" subtitle="Make space for how you feel" color={sunrise.teal} expanded={sections.wellness} onToggle={() => toggle('wellness')}>
      <ToolRow icon="wellness" title="How are you feeling?" subtitle="Your mood check-in" onPress={() => onNavigate('wellness')} tint={sunrise.tealTint} color="#087C70" />
      <ToolRow icon="sleep" title="Sleep & recovery" subtitle="View your sleep log and insights" onPress={() => onNavigate('sleep')} tint={sunrise.blueTint} color="#1672A6" />
      <ToolRow icon="coach" title="Meet your companion" subtitle="Talk, plan, and choose your character" onPress={() => onNavigate('companion')} />
      <ToolRow icon="today" title="My daily routine" subtitle="Checklist, calendar, weather and goals" onPress={() => onNavigate('routine')} />
      <ToolRow icon="games" title="Adaptive mind practice" subtitle="Practice your chosen skills · Premium" onPress={() => onNavigate('brain-training')} />
      <ToolRow icon="coach" title="Coaching insights" onPress={() => onNavigate('coach')} />
      <TouchableOpacity style={[ui.button, { backgroundColor: sunrise.tealTint }]} onPress={onFocus} accessibilityRole="button"><Text style={[ui.buttonText, { color: '#075F56' }]}>Start a focus session</Text></TouchableOpacity>
    </DashboardSection>

    <DashboardSection title="Progress & rewards" subtitle={`Level ${stats.level} · ${stats.streak} day streak`} color={sunrise.gold} expanded={sections.progress} onToggle={() => toggle('progress')}>
      <Text style={s.progressValue}>{stats.experience} total XP</Text><XpBar progress={stats.progression}/>
      <Text style={ui.subtitle}>{stats.totalWakeUps} wake-ups recorded. Keep building your rhythm.</Text>
      <ToolRow icon="wallet" title={`${points} Rise Points`} subtitle="Open your wallet" onPress={() => onNavigate('wallet')} tint={sunrise.orangeTint} color="#994500" />
      <ToolRow icon="star" title="Rewards & achievements" subtitle="Explore your Rise Points rewards" onPress={onRewards} />
    </DashboardSection>

    <DashboardSection title="Explore RiseQuest" subtitle="Your tools, whenever you need them" color={sunrise.blue} expanded={sections.explore} onToggle={() => toggle('explore')}>
      <ToolRow icon="alarm" title="Alarms" onPress={() => onNavigate('alarms')} />
      <ToolRow icon="games" title="Challenge mini-games" onPress={() => onNavigate('mini-games')} />
      <ToolRow icon="palette" title="Cosmetic store" onPress={onCosmetics} />
      <ToolRow icon="location" title="Smart location" onPress={() => onNavigate('location')} />
      <ToolRow icon="shield" title="Wake buddies & emergency tools" onPress={() => onNavigate('social')} />
      {!adsSuppressed && <DiscreetAd account={userProfile?.email} guest={isGuest} premium={premium} optionalInlineAds={userProfile?.preferences?.optionalInlineAds === true} placement="discover_native" />}
    </DashboardSection>
  </ScrollView>;
}

const s = StyleSheet.create({
  focus: { padding: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  eyebrow: { color: '#8D4600', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: sunrise.ink, fontSize: 27, lineHeight: 34, fontWeight: '800' },
  progressValue: { color: sunrise.ink, fontSize: 28, fontWeight: '800' },
  weatherStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, marginBottom: 10, paddingHorizontal: 4 },
  weatherNumbers: { flexShrink: 1, color: sunrise.ink, fontSize: 14, fontWeight: '600' },
});

