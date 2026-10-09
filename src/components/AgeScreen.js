import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AGE_BANDS } from '../services/agePolicy';
import { requiresParent } from '../../backend/src/agePolicy';
import CountrySelector from './CountrySelector';

export default function AgeScreen({ value, onChange, countryCode, onCountryChange }) {
  return <View style={styles.container}>
    <Text style={styles.title}>Which age group are you in?</Text>
    <Text style={styles.note}>We use this to offer appropriate features and privacy protections.</Text>
    {AGE_BANDS.map(band => <TouchableOpacity key={band.id} accessibilityRole="radio"
      accessibilityState={{ checked: value === band.id }} onPress={() => onChange(band.id)}
      style={[styles.option, value === band.id && styles.selected]}>
      <Text style={styles.label}>{band.label}</Text>
    </TouchableOpacity>)}
    {onCountryChange && <CountrySelector value={countryCode} onChange={onCountryChange} />}
    {value && requiresParent(value, countryCode) && <Text style={styles.note}>For this age group and region, RiseQuest uses parent-managed profiles. Ask your parent or guardian to sign in to their own account and open Family profiles in More. Do not enter your email or phone number here.</Text>}
  </View>;
}
const styles = StyleSheet.create({ container: { paddingVertical: 12 }, title: { fontSize: 21, fontWeight: '700', color: '#30243C' },
  note: { fontSize: 15, lineHeight: 22, color: '#584E60', marginVertical: 10 }, option: { padding: 14, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#DDD5E1', marginVertical: 4 },
  selected: { backgroundColor: '#FFF1DE', borderColor: '#B55300' }, label: { fontSize: 17, color: '#30243C' } });
