import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { useCollection } from '../../services/cosmeticCollection';
export const themeArtwork = {
 theme_nature: require('../../assets/shop/nature.jpg'), theme_space: require('../../assets/shop/space.jpg'),
 theme_ocean: require('../../assets/shop/ocean.jpg'), theme_urban: require('../../assets/shop/urban.jpg'), theme_zen: require('../../assets/shop/zen.jpg'),
};
const motionByTheme = { theme_nature: 'petals', theme_zen: 'petals', theme_space: 'aurora', theme_ocean: 'aurora', theme_urban: 'sparkles' };
let sensory = false;
const preferences = new Set(), celebrations = new Set();
export function setMotionPreference(value) { sensory = Boolean(value); preferences.forEach(fn => fn(sensory)); }
export function celebrate(kind = 'success') { celebrations.forEach(fn => fn({ kind, at: Date.now() })); }
export function useReducedMotion() {
 const [reduced, setReduced] = useState(true), [quiet, setQuiet] = useState(sensory);
 useEffect(() => {
  let active = true;
  AccessibilityInfo.isReduceMotionEnabled().then(value => { if(active)setReduced(value); }).catch(() => {});
  const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
  preferences.add(setQuiet);
  return () => { active = false; listener.remove(); preferences.delete(setQuiet); };
 }, []);
 return reduced || quiet;
}
export function useThemeMotion() {
 const collection = useCollection(), themeId = collection.loadout.themeId;
 const theme = collection.inventory.find(i => i.id === themeId), design = theme?.design;
 return { themeId, design, background: themeArtwork[themeId] || (design?.backgroundUrl ? { uri: design.backgroundUrl } : null),
  effect: collection.loadout.animationId?.replace('anim_', '') || design?.motion || motionByTheme[themeId] || 'sparkles' };
}
export function ThemeBackdrop() {
 const { background, design } = useThemeMotion();
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF9F2' }]}>
  {background && <Image source={background} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: design?.backgroundOpacity ?? 0.22 }]} />}
 </View>;
}
export function MotionScreen({ children, screenKey, style }) {
 const reduced = useReducedMotion(), progress = useRef(new Animated.Value(1)).current;
 const { effect } = useThemeMotion();
 useEffect(() => {
  progress.stopAnimation();
  if (reduced || effect === 'none') { progress.setValue(1); return; }
  progress.setValue(0);
  const animation = Animated.timing(progress, { toValue: 1, duration: effect === 'petals' ? 260 : 190, easing: Easing.out(Easing.cubic), useNativeDriver: true });
  animation.start(); return () => animation.stop();
 }, [screenKey, reduced, progress, effect]);
 return <Animated.View style={[{ flex: 1, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0,1], outputRange: [8,0] }) }] }, style]}>{children}</Animated.View>;
}
export function MotionIcon({ children, active }) {
 const { effect } = useThemeMotion();
 const reduced = useReducedMotion(), scale = useRef(new Animated.Value(1)).current;
 useEffect(() => {
  scale.stopAnimation(); scale.setValue(1);
  if (!active || reduced || effect === 'none') return;
  const animation = Animated.sequence([Animated.timing(scale, { toValue: 1.16, duration: 110, useNativeDriver: true }),
   Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true })]);
  animation.start(); return () => animation.stop();
 }, [active, reduced, scale, effect]);
 return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}
export function Celebration({ preview = false, effect: requested }) {
 const reduced = useReducedMotion(), theme = useThemeMotion(), effect = requested || theme.effect;
 const [event, setEvent] = useState(preview ? { at: 1 } : null), progress = useRef(new Animated.Value(0)).current;
 useEffect(() => { if (preview) return; celebrations.add(setEvent); return () => celebrations.delete(setEvent); }, [preview]);
 useEffect(() => {
  if (!event || reduced) return;
  progress.setValue(0);
  const animation = Animated.timing(progress, { toValue: 1, duration: effect === 'petals' ? 1800 : 1200, easing: Easing.out(Easing.quad), useNativeDriver: true });
  animation.start(() => { if (!preview) setEvent(null); }); return () => animation.stop();
 }, [event, reduced, effect, preview, progress]);
 if ((!event && !preview) || reduced || effect === 'none') return null;
 const colors = effect === 'petals' ? ['#E891AC','#75B695','#EBC66A'] : effect === 'aurora' ? ['#45B7FF','#9572ED','#30BEAB'] : ['#F6BF39','#E97D9A','#50B5D6','#8C68DF'];
 return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }]}>
  {Array.from({ length: effect === 'fireworks' ? 20 : 12 }, (_,i) => {
   const angle = i * Math.PI * 2 / (effect === 'fireworks' ? 20 : 12), distance = 55 + (i % 4) * 21;
   return <Animated.View key={i} style={{ position: 'absolute', width: effect === 'aurora' ? 6 : 10, height: effect === 'aurora' ? 34 : 14,
    borderRadius: effect === 'petals' ? 10 : 3, backgroundColor: colors[i % colors.length],
    opacity: progress.interpolate({ inputRange: [0,.2,.75,1], outputRange: [0,1,1,0] }), transform: [
     { translateX: progress.interpolate({ inputRange: [0,1], outputRange: [0,Math.cos(angle)*distance] }) },
     { translateY: progress.interpolate({ inputRange: [0,1], outputRange: [0,Math.sin(angle)*distance+(effect === 'petals' ? 65 : 0)] }) },
     { rotate: progress.interpolate({ inputRange: [0,1], outputRange: ['0deg',`${i*39}deg`] }) }] }} />;
  })}
 </View>;
}
