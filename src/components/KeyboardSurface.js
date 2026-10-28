import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

// Keyboard coordinates are window-relative; nested screens start below app chrome.
// Bound the whole list/form, rather than trying to move only its bottom composer.
export default function KeyboardSurface({ children, style }) {
  const surface = useRef(null);
  const [top, setTop] = useState(0);
  const measure = useCallback(() => {
    surface.current?.measureInWindow((_x, y) => {
      if (Number.isFinite(y)) setTop(Math.max(0, y));
    });
  }, []);
  return (
    <View ref={surface} collapsable={false} onLayout={measure} style={[styles.fill, style]}>
      <KeyboardAvoidingView style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={top}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}
const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
