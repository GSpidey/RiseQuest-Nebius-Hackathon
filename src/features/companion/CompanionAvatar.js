import { useThemeMotion } from '../customization/ThemeMotion';
import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Image, Pressable} from 'react-native';

const artwork = {
  lumen: require('../../assets/companions/lumen.png'),
  sol: require('../../assets/companions/sol.png'),
  fern: require('../../assets/companions/fern.png'),
  luna: require('../../assets/companions/luna.png'),
  nova: require('../../assets/companions/nova.png'),
  orbit: require('../../assets/companions/orbit.png'),
  ember: require('../../assets/companions/ember.png'),
};
export default function CompanionAvatar({character='sol', size=150, reducedMotion=false, speaking=false, interactive=false}) {
  const themeMotion = useThemeMotion();
  const float = useRef(new Animated.Value(0)).current;
  const greeting = useRef(new Animated.Value(0)).current;
  const [systemReduced, setSystemReduced] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {if (active) setSystemReduced(value);}).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => {active = false; listener.remove();};
  }, []);
  useEffect(() => {
    float.setValue(0); greeting.setValue(0);
    if (reducedMotion || systemReduced || themeMotion.effect === 'none') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(float, {toValue: 1, duration: speaking ? 650 : themeMotion.effect === 'petals' ? 2400 : 1800, useNativeDriver: true, isInteraction: false}),
      Animated.timing(float, {toValue: 0, duration: speaking ? 650 : themeMotion.effect === 'petals' ? 2400 : 1800, useNativeDriver: true, isInteraction: false}),
    ]));
    animation.start();
    return () => {animation.stop(); greeting.stopAnimation();};
  }, [float, greeting, reducedMotion, systemReduced, speaking, themeMotion.effect]);
  const greet = () => {
    if (systemReduced || reducedMotion) return;
    greeting.stopAnimation(); greeting.setValue(0);
    Animated.sequence([1, -1, .5, 0].map(toValue => Animated.timing(greeting, {toValue, duration: 170, useNativeDriver: true}))).start();
  };
  const avatar = <Animated.View style={{width:size, height:size*1.25, transform:[
    {translateY:float.interpolate({inputRange:[0,1],outputRange:[0,-4]})},
    {rotate:greeting.interpolate({inputRange:[-1,1],outputRange:['-6deg','6deg']})},
  ]}}><Image source={artwork[character] || artwork.sol} resizeMode="contain" style={{width:'100%',height:'100%'}} accessible={false}/></Animated.View>;
  return interactive ? <Pressable onPress={greet} accessibilityRole="button" accessibilityLabel={`Say hello to ${character}`} accessibilityHint="Your companion waves back">{avatar}</Pressable>
    : <Animated.View accessible accessibilityLabel={`${character} companion`}>{avatar}</Animated.View>;
}
