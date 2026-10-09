import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { COUNTRIES } from '../../backend/src/agePolicy';

export default function CountrySelector({ value, onChange }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const selected = COUNTRIES.find(country => country.code === value);
  const matches = COUNTRIES.filter(country => `${country.name} ${country.code}`.toLowerCase().includes(search.toLowerCase()));
  return <View style={{ marginVertical: 10 }}>
    <Text style={{ color: '#30243C', fontSize: 16, fontWeight: '700' }}>Country or region where you live</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose your country or region" onPress={() => setOpen(!open)}
      style={{ padding: 14, minHeight: 48, borderWidth: 1, borderColor: '#B8ADBF', borderRadius: 10, marginTop: 8 }}>
      <Text style={{ color: '#30243C', fontSize: 16 }}>{selected?.name || 'Choose country or region'} ▾</Text>
    </TouchableOpacity>
    {open && <View>
      <TextInput accessibilityLabel="Search countries" placeholder="Search country name" placeholderTextColor="#66596E" value={search} onChangeText={setSearch}
        style={{ minHeight: 48, color: '#30243C', padding: 12, borderBottomWidth: 1, borderColor: '#DDD5E1' }} />
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
        {matches.map(country => <TouchableOpacity key={country.code} accessibilityRole="button" onPress={() => { onChange(country.code); setOpen(false); setSearch(''); }} style={{ padding: 14, minHeight: 48 }}>
          <Text style={{ color: '#30243C', fontSize: 16 }}>{country.name}</Text>
        </TouchableOpacity>)}
        {!matches.length && <Text style={{ padding: 12, color: '#30243C' }}>No matching country.</Text>}
      </ScrollView>
    </View>}
  </View>;
}
