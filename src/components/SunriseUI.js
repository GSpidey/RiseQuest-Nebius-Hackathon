import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export const sunrise = {
  orange: '#FF7A00', gold: '#FFC83D', blue: '#45B7FF', teal: '#16B8A6',
  purple: '#7C5CFC', background: '#FFF9F2', ink: '#252438', muted: '#625E70',
  border: '#EEE4DB', orangeTint: '#FFF0DB', blueTint: '#EAF6FF',
  tealTint: '#E7F8F4', purpleTint: '#F0ECFF',
};

const paths = {
  today: 'M3 17h18M5 21h14M6 13a6 6 0 0 1 12 0M12 2v3M3 6l2 2M21 6l-2 2',
  wellness: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  quests: 'M9 5H5v16h14V5h-4M9 3h6v4H9ZM8 14l3 3 5-6',
  community: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9',
  more: 'M5 5h4v4H5ZM15 5h4v4h-4ZM5 15h4v4H5ZM15 15h4v4h-4Z',
  alarm: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16M12 8v5l3 2M3 2l-2 3M21 2l2 3M5 19l-2 3M19 19l2 3',
  sleep: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  coach: 'M4 3h16v14H9l-5 4V3ZM8 8h8M8 12h5',
  wallet: 'M3 5h16v4M3 5v15h18V9H3M16 13h5v4h-5Z',
  star: 'm12 2 3.1 6.3L22 9.3l-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1Z',
  location: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM8 12l3 3 5-6',
  games: 'M7 7h10c3 0 5 11 3 12-2 1-4-3-4-3H8s-2 4-4 3C2 18 4 7 7 7ZM7 10v5M4.5 12.5h5M16 11h.1M18 14h.1',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3-5-6-9-6ZM7 8h.1M11 6h.1M16 8h.1M6 13h.1',
  support: 'M3 13v-1a9 9 0 0 1 18 0v1M3 12h3v7H3ZM18 12h3v7h-3ZM21 19c0 3-5 3-9 3',
  arrow: 'm9 5 7 7-7 7',
  down: 'm5 9 7 7 7-7',
  up: 'm5 15 7-7 7 7',
  back: 'm15 5-7 7 7 7',
};

export function SunriseIcon({ name, color = sunrise.ink, size = 24 }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d={paths[name] || paths.star} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export function ToolRow({ icon, title, subtitle, onPress, tint = sunrise.purpleTint, color = sunrise.purple }) {
  return <TouchableOpacity style={ui.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}${subtitle ? `. ${subtitle}` : ''}`}>
    <View style={[ui.iconTile, { backgroundColor: tint }]}><SunriseIcon name={icon} color={color} /></View>
    <View style={ui.rowText}><Text style={ui.rowTitle}>{title}</Text>{!!subtitle && <Text style={ui.subtitle}>{subtitle}</Text>}</View>
    <SunriseIcon name="arrow" size={18} color={sunrise.muted} />
  </TouchableOpacity>;
}

export function DashboardSection({ title, subtitle, expanded, onToggle, children, color = sunrise.purple }) {
  return <View style={ui.card}>
    <TouchableOpacity onPress={onToggle} style={ui.sectionHeading} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={title}>
      <View style={[ui.sectionMarker, { backgroundColor: color }]} />
      <View style={ui.rowText}><Text style={ui.title}>{title}</Text>{!!subtitle && <Text style={ui.subtitle}>{subtitle}</Text>}</View>
      <SunriseIcon name={expanded ? 'up' : 'down'} size={20} />
    </TouchableOpacity>
    {expanded && <View style={ui.sectionBody}>{children}</View>}
  </View>;
}

export const ui = StyleSheet.create({
  page: { flex: 1, backgroundColor: sunrise.background },
  pageContent: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: sunrise.border, marginBottom: 16, overflow: 'hidden' },
  title: { color: sunrise.ink, fontSize: 19, fontWeight: '800' },
  subtitle: { color: sunrise.muted, fontSize: 14, lineHeight: 21, marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, minHeight: 62, gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: sunrise.ink, fontSize: 16, fontWeight: '700' },
  iconTile: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { padding: 18, flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 72 },
  sectionMarker: { width: 5, height: 32, borderRadius: 3 },
  sectionBody: { paddingHorizontal: 18, paddingBottom: 16 },
  button: { backgroundColor: sunrise.orange, borderRadius: 15, padding: 15, minHeight: 48, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#30200A', fontWeight: '800', fontSize: 16 },
});
