import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Switch, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addWakeBuddy, loadWakeBuddies } from '../services/wakeBuddy';

export default function AlarmBuddyPicker({ value, onChange }) {
  const [buddies, setBuddies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = async () => {
    setLoading(true);
    try { setBuddies(await loadWakeBuddies(AsyncStorage)); setError(''); }
    catch (failure) { setError(failure.message || 'Could not load buddies. Please retry.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);
  const add = async () => {
    if (busy || !agreed) return;
    setBusy(true);
    try {
      const buddy = await addWakeBuddy(AsyncStorage, { name, phone });
      setBuddies(await loadWakeBuddies(AsyncStorage));
      onChange(String(buddy.id)); setAdding(false); setName(''); setPhone(''); setAgreed(false); setError('');
    } catch (failure) { setError(failure.message || 'Could not save buddy. Please retry.'); }
    finally { setBusy(false); }
  };
  const option = (id, label, detail) => <TouchableOpacity key={id || 'none'} accessibilityRole="radio"
    accessibilityState={{ checked: (value || '') === id }} onPress={() => onChange(id || null)}
    style={[styles.option, (value || '') === id && styles.selected]}>
    <Text style={styles.name}>{label}</Text>{detail ? <Text style={styles.hint}>{detail}</Text> : null}
  </TouchableOpacity>;
  return <View style={styles.card}>
    <Text style={styles.title}>🤝 Wake-up buddy</Text>
    <Text style={styles.hint}>A familiar voice when you need a little encouragement. Choose a buddy for this alarm.</Text>
    <Text style={styles.hint}>When it rings, you can open their number in your dialer. Nothing is sent automatically.</Text>
    {loading ? <Text accessibilityLiveRegion="polite" style={styles.hint}>Loading buddies…</Text> : <>
      {option('', 'No buddy for this alarm')}
      {buddies.map(buddy => option(String(buddy.id), buddy.name, buddy.phone))}
      {value && !buddies.some(buddy => String(buddy.id) === value) && <Text style={styles.error}>This buddy is no longer available. Choose another or select No buddy.</Text>}
      <TouchableOpacity accessibilityRole="button" onPress={() => setAdding(!adding)} style={styles.option}>
        <Text style={styles.name}>{adding ? 'Cancel adding buddy' : '+ Add a buddy here'}</Text>
      </TouchableOpacity>
    </>}
    {adding && <View>
      <TextInput style={styles.input} accessibilityLabel="Buddy name" placeholder="Buddy name" placeholderTextColor="#746C80" value={name} onChangeText={setName} maxLength={80} />
      <TextInput style={styles.input} accessibilityLabel="Buddy phone number" placeholder="Phone number" placeholderTextColor="#746C80" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} />
      <View style={styles.row}><Text style={[styles.hint, { flex: 1 }]}>My buddy has agreed that I can contact them for wake-up support.</Text><Switch accessibilityLabel="Buddy agreed to wake-up support" value={agreed} onValueChange={setAgreed} /></View>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !agreed || busy }} disabled={!agreed || busy} onPress={add} style={[styles.option, { opacity: agreed && !busy ? 1 : 0.5 }]}><Text style={styles.name}>{busy ? 'Saving buddy…' : 'Save & select buddy'}</Text></TouchableOpacity>
      <Text style={styles.hint}>Saved in your existing Wake-Up Buddies list on this device.</Text>
    </View>}
    {!!error && <View><Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text><TouchableOpacity accessibilityRole="button" onPress={reload}><Text style={styles.name}>Retry loading buddies</Text></TouchableOpacity></View>}
  </View>;
}
const styles = StyleSheet.create({
  card: { marginBottom: 24, padding: 20, backgroundColor: '#F3FAF7', borderRadius: 22, borderWidth: 1, borderColor: '#D7EAE3' },
  title: { fontSize: 22, fontWeight: '700', color: '#233C36', marginBottom: 8 },
  hint: { color: '#52645E', fontSize: 15, lineHeight: 22, marginBottom: 8 },
  option: { padding: 15, marginTop: 9, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#E1EBE6' },
  selected: { borderColor: '#087C70', backgroundColor: '#E5F6F0' },
  name: { fontSize: 16, color: '#235F54', fontWeight: '600' },
  input: { color: '#263E36', backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginTop: 12, fontSize: 17, borderWidth: 1, borderColor: '#D7EAE3' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  error: { color: '#9A2525', fontSize: 15, marginTop: 10 },
});
