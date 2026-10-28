import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { sunrise, SunriseIcon } from './SunriseUI';

// Decorative context stays outside the screen-reader reading order.
export default function ModalHeading({ title, description, icon = 'star', compact = false, light = false }) {
  return <View style={[styles.heading, compact && {flexDirection: 'row', alignItems: 'center', paddingBottom: 0, gap: 12, flex: 1}]}>
    <View style={[styles.art, compact && {width: 58, height: 58, marginBottom: 0, transform: [{scale: .72}]}]} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={styles.sun} />
      <View style={styles.orbit} />
      <View style={styles.tile}><SunriseIcon name={icon} size={28} color="#6544BC" /></View>
      <View style={styles.spark} />
    </View>
    <Text accessibilityRole="header" style={[styles.title,compact && {flex: 1, textAlign: 'left', fontSize: 21},light && {color: '#FFFFFF'}]}>{title}</Text>
    {!!description && <Text style={styles.description}>{description}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  heading: { alignItems: 'center', paddingBottom: 22 },
  art: { width: 112, height: 76, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  sun: { position: 'absolute', width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFE1A2', right: 4, top: 2 },
  orbit: { position: 'absolute', width: 86, height: 48, borderRadius: 24, backgroundColor: sunrise.orangeTint, left: 0, bottom: 0, transform: [{ rotate: '-12deg' }] },
  tile: { width: 64, height: 64, borderRadius: 22, backgroundColor: sunrise.purpleTint, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }] },
  spark: { position: 'absolute', width: 12, height: 12, borderRadius: 4, backgroundColor: sunrise.teal, left: 10, top: 6, transform: [{ rotate: '25deg' }] },
  title: { color: sunrise.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  description: { color: sunrise.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 330 },
});

