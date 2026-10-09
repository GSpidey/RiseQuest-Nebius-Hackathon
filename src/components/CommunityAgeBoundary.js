import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, NativeModules, Platform, Text, TouchableOpacity, View } from 'react-native';
import { communityAgeDecision, refreshCommunityAgeSignal } from '../services/communityAgePolicy';
import CommunityScreen from '../screens/CommunityScreen';

export default function CommunityAgeBoundary(props) {
  const [signal, setSignal] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const profile = props.userProfile;
  useEffect(() => {
    let backgrounded = false;
    const listener = AppState.addEventListener('change', state => {
      // A system permission sheet may briefly make the app inactive. Do not
      // re-open it in a loop; refresh only after an actual background session.
      if (state === 'background') backgrounded = true;
      if (state === 'active' && backgrounded) {
        backgrounded = false; setAttempt(value => value + 1);
      }
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let current = true;
    if (profile?.isGuest || !['adult', 'teen'].includes(profile?.ageGroup)) return () => { current = false; };
    (async () => {
      const result = Platform.OS === 'ios'
        ? await NativeModules.RiseQuestAgeRange.request()
        : { status: 'not-ios' };
      if (current) setSignal(previous => refreshCommunityAgeSignal(previous, result));
    })().catch(() => {
      if (current) setSignal(previous => refreshCommunityAgeSignal(previous, { status: 'error' }));
    });
    return () => { current = false; };
  }, [attempt, profile?.id, profile?.email, profile?.ageGroup, profile?.isGuest]);
  const decision = communityAgeDecision(profile, signal);
  if (decision.allowed) return <View style={{ flex: 1 }}>
    {decision.unavailable && <View style={{ padding: 12, backgroundColor: '#FFF1DE' }}>
      <Text style={{ color: '#584E60' }}>Apple's age check is unavailable. Your saved RiseQuest protections and any age restrictions already confirmed this session still apply.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ paddingVertical: 12 }}>
        <Text style={{ color: '#954400' }}>Retry Apple age check</Text>
      </TouchableOpacity>
    </View>}
    <CommunityScreen {...props} communicationLimited={decision.communicationLimited} nativeTeenSafety={decision.teen} />
  </View>;
  const text = {
    signin: 'Sign in to use Community.',
    child: 'Community is not available to children under 13. Your alarms, routines and other age-appropriate tools are still available.',
    profile: 'Complete your age group in your profile before using Community.',
    pending: 'Checking age-appropriate Community access…',
    retry: 'The age-range check could not finish. Please retry. Other RiseQuest tools remain available.',
  }[decision.reason];
  return <View style={{ padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 22, fontWeight: '700', color: '#30243C' }}>Community</Text>
    <Text style={{ fontSize: 16, color: '#584E60' }}>{text}</Text>
    {decision.reason === 'pending' && <ActivityIndicator accessibilityLabel="Checking age range" />}
    {decision.reason === 'retry' && <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)}
      style={{ padding: 16, backgroundColor: '#FFF1DE', borderRadius: 12 }}><Text style={{ color: '#954400' }}>Retry age check</Text></TouchableOpacity>}
  </View>;
}
