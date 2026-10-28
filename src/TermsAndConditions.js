import Modal from './components/AppModal';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LEGAL_DOCS } from '../backend/src/legalContent';

export default function TermsAndConditions({ visible, onClose }) {
  const doc = LEGAL_DOCS.terms;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={styles.page}>
      <View style={styles.header}><Text style={styles.title}>{doc.title}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.link}>Close</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>Updated {doc.updated}</Text>
        {doc.sections.map(([title, body]) => <View key={title} style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>{title}</Text><Text style={styles.body}>{body}</Text>
        </View>)}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#FFFAF2' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#30243C', flex: 1 },
  close: { padding: 12, minHeight: 48 }, link: { color: '#954400', fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 40 }, section: { marginTop: 24 },
  heading: { fontSize: 20, fontWeight: '700', color: '#30243C', marginBottom: 8 },
  body: { fontSize: 16, lineHeight: 25, color: '#584E60' } });

