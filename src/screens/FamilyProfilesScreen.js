import ModalHeading from '../components/ModalHeading';
import Modal from '../components/AppModal';
import { useRiseQuestDialog } from '../components/RiseQuestDialog';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { pick, types } from '@react-native-documents/picker';
import { getAuthToken } from '../services/AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
import { sunrise, ui } from '../components/SunriseUI';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAccountCaches } from '../services/accountCache';

async function familyRequest(path, method = 'GET', body, multipart = false) {
  const token = await getAuthToken();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${await getBackendBaseUrl()}${path}`, { method, signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
    if (await getAuthToken() !== token) throw new Error('Your account changed. Reopen Family profiles.');
    let json;try{json=await response.json();}catch(_){throw new Error('Family profiles could not connect. Please try again shortly.');}
    if(await getAuthToken()!==token)throw new Error('Your account changed. Reopen Family profiles.');
    if (!response.ok) throw new Error(json.error || 'The request could not be completed.');
    return json;
  } finally { clearTimeout(timer); }
}
const Button = ({ label, onPress, disabled }) => <TouchableOpacity disabled={disabled} accessibilityRole="button"
  style={[ui.button, { marginTop: 10, opacity: disabled ? 0.5 : 1 }]} onPress={onPress}><Text style={ui.buttonText}>{label}</Text></TouchableOpacity>;
const field = { borderWidth: 1, borderColor: sunrise.border, borderRadius: 12, padding: 12, marginVertical: 8, color: sunrise.ink, backgroundColor: '#FFFFFF', minHeight: 48 };
const CHECKS = { signature: 'Signature and date are present and legible', guardianDeclaration: 'Parent/legal-guardian declaration is signed',
  emailMatches: 'Signed account email matches the verified parent', referenceMatches: 'Consent reference matches this request', noticeMatches: 'The complete current notice is included' };

export default function FamilyProfilesScreen({ onEnterChild, isAdmin = false }) {
  const {alert:notify,dialog}=useRiseQuestDialog();
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [codes, setCodes] = useState({}), [nickname, setNickname] = useState(''), [ageBand, setAgeBand] = useState('under13');
  const [review, setReview] = useState(null), [checks, setChecks] = useState({}), [note, setNote] = useState('');
  const [records, setRecords] = useState(null);
  const [editChild, setEditChild] = useState(null);
  const [purchaseRequests, setPurchaseRequests] = useState({requests:[],catalog:[]});
  const loadPurchases = async () => { if (!isAdmin) setPurchaseRequests(await familyRequest('/api/family/purchases')); };
  useEffect(() => { loadPurchases().catch(e => setError(e.message)); }, [isAdmin]);
  const load = async () => setData(await familyRequest(isAdmin ? '/api/admin/family/consents' : '/api/family'));
  const run = async (action, refresh = true) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); if (refresh) { await load(); await loadPurchases(); } } catch (e) { setError(e.message || 'Could not complete the request.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { let live = true; familyRequest(isAdmin ? '/api/admin/family/consents' : '/api/family')
    .then(value => { if (live) setData(value); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [isAdmin]);
  const upload = async consent => {
    const files = await pick({ type: [types.images], allowMultiSelection: false });
    const file = files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name || 'signed-notice.jpg', type: file.type || 'image/jpeg' });
    await familyRequest(`/api/family/consents/${consent.id}/document`, 'POST', form, true);
  };
  const approve = async approveValue => {
    await familyRequest(`/api/admin/family/consents/${review.id}/review`, 'POST', { approve: approveValue, checks, note });
    setReview(null); setChecks({}); setNote('');
  };
  return <><ScrollView style={ui.page} contentContainerStyle={ui.pageContent} keyboardShouldPersistTaps="handled">
    <Text style={ui.title}>{isAdmin ? 'Parent consent review' : 'Family profiles'}</Text>
    <Text style={[ui.subtitle, { marginVertical: 12 }]}>{isAdmin ? 'Review each signed document yourself. A checkbox is a review record, not a substitute for verification.' :
      'Create a private child profile after verified parental consent. Child coaching uses prepared routines, not external AI. Leaving child mode requires the parent to sign in again.'}</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#9C2626', marginVertical: 10 }}>{error}</Text>}
    <Button label={busy ? 'Working…' : 'Refresh'} disabled={busy} onPress={() => run(async () => {})} />
    {!isAdmin && purchaseRequests.requests.map(request => <View key={request.id} style={[ui.card,{padding:16,marginTop:12}]}>
      <Text style={ui.title}>{request.child?.name || 'Child'} requested new items</Text>
      <Text style={ui.subtitle}>{request.itemIds.map(id => purchaseRequests.catalog.find(item => item.id === id)?.name || id).join(' · ')}</Text>
      <Text style={ui.subtitle}>{request.amount} Rise Points from your wallet · expires {new Date(request.expiresAt).toLocaleDateString()}</Text>
      <Button disabled={busy} label={`Approve · ${request.amount} RP`} onPress={() => notify('Approve this purchase?', `Spend ${request.amount} of your Rise Points to add these items to your child's collection.`, [
        {text:'Cancel',style:'cancel'}, {text:'Approve purchase',onPress:()=>run(()=>familyRequest(`/api/family/purchases/${request.id}`,'POST',{approve:true}))},
      ])}/>
      <Button disabled={busy} label="Decline" onPress={() => run(()=>familyRequest(`/api/family/purchases/${request.id}`,'POST',{approve:false}))}/>
    </View>)}
    {!isAdmin && data && <View style={[ui.card, { padding: 16, marginTop: 16 }]}>
      <Text style={ui.title}>Before creating a child profile</Text>
      <Text selectable style={[ui.subtitle, { marginVertical: 12 }]}>{data.notice}</Text>
      <Button disabled={busy} label="Email me the notice and verification code" onPress={() => run(() => familyRequest('/api/family/consents', 'POST', { noticeVersion: data.noticeVersion }))} />
      <Text style={ui.subtitle}>Then verify the code below, sign the complete notice from your email, and upload a clear JPEG/PNG photograph or scan. No government ID or child personal information is needed.</Text>
    </View>}
    {(data?.consents || []).map(consent => <View key={consent.id} style={[ui.card, { padding: 16, marginTop: 16 }]}>
      <Text style={ui.title}>{consent.status.replaceAll('_', ' ')}</Text>
      <Text selectable style={ui.subtitle}>Reference: {consent.id}</Text>
      {isAdmin && <Text style={ui.subtitle}>Parent: {consent.parentId}</Text>}
      {!!consent.reviewNote && <Text style={ui.subtitle}>{consent.reviewNote}</Text>}
      {!isAdmin && consent.status === 'AWAITING_EMAIL' && <>
        <TextInput accessibilityLabel="Email verification code" autoCapitalize="none" autoCorrect={false} style={field}
          placeholder="Code from your email" value={codes[consent.id] || ''} onChangeText={value => setCodes(old => ({ ...old, [consent.id]: value }))} />
        <Button disabled={busy} label="Verify email" onPress={() => run(() => familyRequest(`/api/family/consents/${consent.id}/verify-email`, 'POST', { code: codes[consent.id] }))} />
      </>}
      {!isAdmin && consent.status === 'AWAITING_DOCUMENT' && <Button disabled={busy} label="Upload signed notice" onPress={() => run(() => upload(consent))} />}
      {!isAdmin && consent.status === 'APPROVED' && !consent.childId && <>
        <TextInput style={field} accessibilityLabel="Child nickname" placeholder="Nickname (not a legal name)" maxLength={40} value={nickname} onChangeText={setNickname} />
        {['under13', '13to15', '16to17'].map(band => <TouchableOpacity key={band} accessibilityRole="radio" accessibilityState={{ checked: ageBand === band }} onPress={() => setAgeBand(band)} style={{ padding: 12 }}>
          <Text style={ui.subtitle}>{ageBand === band ? '●' : '○'} {band === 'under13' ? 'Under 13' : band === '13to15' ? '13–15' : '16–17'}</Text>
        </TouchableOpacity>)}
        <Button disabled={busy || !nickname.trim()} label="Create private child profile" onPress={() => run(async () => {
          await familyRequest('/api/family/children', 'POST', { consentId: consent.id, nickname, profile: { ageBand } }); setNickname('');
        })} />
      </>}
      {!isAdmin && !['WITHDRAWN', 'DENIED'].includes(consent.status) && <Button disabled={busy} label="Withdraw consent" onPress={() => notify('Withdraw consent?', 'This deletes the linked child profile and its online data. Online child sessions will stop. Local alarms on devices are not remotely erased.', [
        { text: 'Keep', style: 'cancel' }, { text: 'Withdraw and delete', style: 'destructive', onPress: () => run(async () => {
          await familyRequest(`/api/family/consents/${consent.id}/withdraw`, 'POST', {});
          await clearAccountCaches(AsyncStorage, [consent.childId]); setRecords(null); setEditChild(null);
        }) },
      ])} />}
      {isAdmin && <Button disabled={busy} label="Review signed notice" onPress={() => run(async () => {
        const doc = await familyRequest(`/api/admin/family/consents/${consent.id}/document`); setReview({ ...consent, ...doc }); setChecks({}); setNote('');
      })} />}
    </View>)}
    {!isAdmin && (data?.children || []).map(child => <View style={[ui.card, { padding: 16 }]} key={child.id}>
      <Text style={ui.title}>{child.nickname}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
        <Text style={[ui.subtitle, { flex: 1 }]}>Allow optional Google child-directed, nonpersonalized ads. Never Meta. Premium remains ad-free.</Text>
        <Switch disabled={busy} accessibilityLabel="Allow optional child-directed Google ads" value={child.adsConsent === true}
          onValueChange={allowed => run(() => familyRequest(`/api/family/children/${encodeURIComponent(child.id)}/advertising`, 'PUT', { allowed }))} />
      </View>
      <Button disabled={busy} label="Open child mode" onPress={() => notify('Open child mode?', 'Your parent session will end. Sign in again to return to parent controls.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Open', onPress: () => run(async () => {
          const session = await familyRequest(`/api/family/children/${encodeURIComponent(child.id)}/session`, 'POST', {}); await onEnterChild(session);
        }, false) },
      ])} />
      <Button disabled={busy} label="Review saved records" onPress={() => run(async () => setRecords(await familyRequest(`/api/family/children/${encodeURIComponent(child.id)}/records`)))} />
      <Button disabled={busy} label="Edit routines and accessibility" onPress={() => setEditChild({ ...child, profile: { ...child.profile, preferences: { ...child.profile.preferences } } })} />
      <Button disabled={busy} label="Delete child profile" onPress={() => notify('Delete child profile?', 'This removes its online records and withdraws consent. This cannot be undone in the app.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => run(async () => {
          await familyRequest(`/api/family/children/${encodeURIComponent(child.id)}`, 'DELETE');
          await clearAccountCaches(AsyncStorage, [child.id]); setRecords(null); setEditChild(null);
        }) },
      ])} />
    </View>)}
    <Modal visible={Boolean(review)} onRequestClose={() => setReview(null)} animationType="slide">
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 50 }}>
        <ModalHeading title="Signed parent notice" icon="shield"/>
        {review && <Image source={{ uri: review.image }} style={{ width: '100%', height: 650 }} resizeMode="contain" accessibilityLabel="Signed parent consent document" />}
        {Object.entries(CHECKS).map(([key, label]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}><Text style={[ui.subtitle, { flex: 1 }]}>{label}</Text><Switch accessibilityLabel={label} value={checks[key] === true} onValueChange={value => setChecks(old => ({ ...old, [key]: value }))} /></View>)}
        <TextInput accessibilityLabel="Review note" multiline style={field} value={note} onChangeText={setNote} maxLength={500} placeholder="Review reason; avoid unnecessary personal details" />
        <Button disabled={busy || !Object.keys(CHECKS).every(k => checks[k]) || !note.trim()} label="Approve verified consent" onPress={() => run(() => approve(true))} />
        <Button disabled={busy || !note.trim()} label="Reject and explain" onPress={() => run(() => approve(false))} />
        <Button label="Close without reviewing" onPress={() => setReview(null)} />
        {!!error && <Text style={{ color: '#9C2626' }}>{error}</Text>}
      </ScrollView>
    </Modal>
    <Modal visible={Boolean(records)} onRequestClose={() => setRecords(null)}><ScrollView contentContainerStyle={{ padding: 24, paddingTop: 50 }}><ModalHeading title="Saved child records" icon="quests"/>{records&&<View style={{gap:14,marginVertical:18}}>{[['Quests','🌱',records.quests||[],r=>r.title,r=>r.status],['Alarm activity','☀️',records.alarms||[],r=>r.type.replaceAll('_',' '),r=>new Date(r.createdAt).toLocaleString()],['Sleep journal','🌙',records.sleep||[],r=>r.dateKey,r=>`${Math.floor(r.durationMinutes/60)}h ${r.durationMinutes%60}m · quality ${r.sleepQuality}/100`]].map(([title,icon,rows,label,detail])=><View key={title} style={[ui.card,{padding:18,gap:10,backgroundColor:title==='Quests'?'#EFF6E9':title==='Alarm activity'?'#FFF0D3':'#EFEAFB'}]}><Text style={ui.title}>{icon} {title}</Text>{!rows.length&&<Text style={ui.subtitle}>No saved activity yet.</Text>}{rows.map(row=><View key={row.id} style={{paddingVertical:8,borderBottomWidth:1,borderColor:'#DDD9D4'}}><Text style={{fontWeight:'700',color:sunrise.ink}}>{label(row)}</Text><Text style={ui.subtitle}>{detail(row)}</Text></View>)}</View>)}</View>}<Button label="Close" onPress={() => setRecords(null)} /></ScrollView></Modal>
    <Modal visible={Boolean(editChild)} onRequestClose={() => setEditChild(null)}><ScrollView contentContainerStyle={{ padding: 24, paddingTop: 50 }}>
      <ModalHeading title="Child routine preferences" icon="today"/>
      {['reducedSensory', 'captionsEnabled', 'dyslexiaFriendly'].map(key => <View key={key} style={{ flexDirection: 'row', padding: 12 }}><Text style={[ui.subtitle, { flex: 1 }]}>{key.replace(/([A-Z])/g, ' $1')}</Text><Switch accessibilityLabel={key} value={editChild?.profile?.preferences?.[key] === true} onValueChange={value => setEditChild(old => ({ ...old, profile: { ...old.profile, preferences: { ...old.profile.preferences, [key]: value } } }))} /></View>)}
      {['wake_consistency', 'focus', 'sleep', 'routine'].map(goal => <View key={goal} style={{ flexDirection: 'row', padding: 12 }}><Text style={[ui.subtitle, { flex: 1 }]}>{goal.replaceAll('_', ' ')}</Text><Switch accessibilityLabel={goal} value={editChild?.profile?.preferences?.goals?.includes(goal) || false} onValueChange={value => setEditChild(old => {
        const goals = old.profile.preferences.goals || []; return { ...old, profile: { ...old.profile, preferences: { ...old.profile.preferences, goals: value ? [...new Set([...goals, goal])] : goals.filter(v => v !== goal) } } };
      })} /></View>)}
      <Button disabled={busy} label="Save child preferences" onPress={() => run(async () => { await familyRequest(`/api/family/children/${encodeURIComponent(editChild.id)}/preferences`, 'PUT', { version: editChild.profile.version, profile: editChild.profile }); setEditChild(null); })} />
      <Button label="Cancel" onPress={() => setEditChild(null)} />
      {!!error && <Text style={{ color: '#9C2626' }}>{error}</Text>}
    </ScrollView></Modal>
  </ScrollView>{dialog}</>;
}

