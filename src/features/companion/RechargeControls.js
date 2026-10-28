import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { initStripe, useStripe } from '@stripe/stripe-react-native';
import { usesStoreBilling } from '../../services/StorePurchaseService';
import { getAuthToken, onAuthSessionChanged } from '../../services/AuthTokenStorage';
import { featureApi } from '../api';
import { featureStyles as s } from '../ui';

const money = cents => `US$${(cents / 100).toFixed(2)}`;
const Button = ({ children, onPress, disabled }) => <TouchableOpacity accessibilityRole="button"
  disabled={disabled} style={[s.chip, disabled && { opacity: .5 }]} onPress={onPress}>
  <Text style={s.secondaryText}>{children}</Text></TouchableOpacity>;

export default function RechargeControls({ userProfile, onRefreshBalances }) {
  const owner = userProfile?.id || userProfile?.email;
  const [state, setState] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [pack, setPack] = useState('pocket'), [threshold, setThreshold] = useState('50'),
    [monthly, setMonthly] = useState('10.00'), [consent, setConsent] = useState(false), [notice, setNotice] = useState('');
  const generation = useRef(0), lock = useRef(false);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const storeBilling = usesStoreBilling();
  const refresh = async (version = generation.current) => {
    const data = await featureApi('/api/wallet/recharge');
    if (version !== generation.current) return;
    setState(data); setPack(data.pack); setThreshold(String(data.threshold));
    setMonthly((data.monthlyCents / 100).toFixed(2));
  };
  useEffect(() => {
    const version = ++generation.current;
    setState(null); setError(''); setConsent(false); setNotice('');
    if (owner && !storeBilling) refresh(version).catch(e => { if (version === generation.current) setError(e.message); });
    const off = onAuthSessionChanged(() => { generation.current++; setState(null); setConsent(false); setNotice(''); });
    return () => { generation.current++; off(); };
  }, [owner, storeBilling]);
  const run = async fn => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const version = generation.current;
    try {
      const token = await getAuthToken();
      const check = async () => {
        if (!token || token !== await getAuthToken() || version !== generation.current)
          throw Error('Your account changed. Reopen your wallet.');
      };
      const request = (path, body) => featureApi(path, body, { expectedToken: token });
      await check(); await fn(check, request); await check();
      await refresh(version); await onRefreshBalances?.();
    } catch (e) {
      if (version === generation.current) { setError(e.message); await refresh(version).catch(() => {}); }
    } finally { lock.current = false; if (version === generation.current) setBusy(false); }
  };
  const sheet = async (payload, check) => {
    await check();
    if (typeof payload.publishableKey !== 'string' || !/^pk_(live|test)_\w+$/.test(payload.publishableKey))
      throw Error('Payment setup could not connect. Please try again.');
    await initStripe({ publishableKey: payload.publishableKey, urlScheme: 'risequest' });
    await check();
    const initialized = await initPaymentSheet({ merchantDisplayName: 'RiseQuest', returnURL: 'risequest://stripe-redirect',
      ...(payload.setupIntentClientSecret ? { setupIntentClientSecret: payload.setupIntentClientSecret }
        : { paymentIntentClientSecret: payload.paymentIntentClientSecret }) });
    if (initialized.error) throw Error(initialized.error.message);
    await check();
    const result = await presentPaymentSheet();
    await check();
    if (result.error) throw Error(result.error.code === 'Canceled' ? 'Card setup or confirmation was cancelled.' : result.error.message);
  };
  const setup = () => run(async (check, request) => {
    if (!consent) throw Error('Review and authorise recharge first.');
    const c = { pack, threshold: Number(threshold), monthlyCents: Math.round(Number(monthly) * 100),
      terms: state.terms, confirmed: true, revision: state.revision };
    const payload = await request('/api/wallet/recharge/setup', c);
    await sheet(payload, check);
    await check();
    await request('/api/wallet/recharge/activate', { setupId: payload.setupId, revision: payload.revision,
      terms: state.terms, confirmed: true });
    setConsent(false); setNotice('Automatic recharge is on.');
  });
  const recover = id => run(async (check, request) => {
    const payload = await request('/api/wallet/recharge/recover', { id });
    if (payload.paymentIntentClientSecret) await sheet(payload, check);
    await check(); setNotice('Your wallet will update when the payment is confirmed.');
  });
  const disable = () => run(async (check, request) => { await request('/api/wallet/recharge/disable', {}); setConsent(false); setNotice('Automatic recharge is off.'); });
  if (!owner) return <View style={s.card}><Text style={s.heading}>Automatic RP recharge</Text><Text style={s.body}>Sign in to manage recharge.</Text></View>;
  if (storeBilling) return <View style={s.card}><Text style={s.heading}>RP recharge</Text><Text style={s.body}>Your app store handles RP purchases. Choose a pack below to refill your wallet.</Text></View>;
  const selected = state?.packs?.[pack];
  return <View style={s.card}>
    <Text style={s.heading}>Automatic RP recharge</Text>
    <Text style={s.body}>Keep your wallet topped up with a limit you choose.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    {busy && <ActivityIndicator />}
    <Button disabled={busy} onPress={() => run(async () => {})}>Refresh recharge</Button>
    {state && <>
      <Text style={s.body}>{state.enabled ? 'Automatic recharge is on.' : 'Automatic recharge is off for your account.'}</Text>
      {state.pauseReason === 'bank_confirmation' && <Text style={s.muted}>Your bank needs confirmation for the pending payment.</Text>}
      {state.pauseReason === 'payment_failed' && <Text style={s.muted}>The last payment failed. You can save a card and authorise recharge again.</Text>}
      {!state.eligible ? <Text style={s.muted}>An adult account can authorise automatic card charges.</Text> : <>
        <Text style={s.body}>Recharge pack</Text>
        {Object.entries(state.packs).map(([id, p]) => <Button key={id} disabled={busy} onPress={() => { setPack(id); setConsent(false); }}>
          {pack === id ? '✓ ' : ''}{p.name} · {p.points} RP · {money(p.cents)}
        </Button>)}
        <Text style={s.body}>When my balance falls below (RP)</Text>
        <TextInput accessibilityLabel="RP recharge threshold" editable={!busy} style={s.input} keyboardType="number-pad" value={threshold}
          onChangeText={v => { setThreshold(v); setConsent(false); }} />
        <Text style={s.body}>Maximum per calendar month (USD)</Text>
        <TextInput accessibilityLabel="Monthly recharge money limit in US dollars" editable={!busy} style={s.input} keyboardType="decimal-pad" value={monthly}
          onChangeText={v => { setMonthly(v); setConsent(false); }} />
        <Text style={s.muted}>At most one recharge every 24 hours. Monthly limits reset at the start of each month in UTC.</Text>
        {selected && <View><Text style={s.body}>I authorise RiseQuest to charge my saved card {money(selected.cents)} for {selected.points} RP when my balance is below {threshold || '…'} RP, up to US${monthly || '…'} per month. Turning this on may recharge immediately if my balance is already below the threshold. I can turn it off here at any time. An already submitted payment may still complete.</Text>
          <Switch accessibilityLabel="Authorise automatic card recharge" disabled={busy} value={consent} onValueChange={setConsent} /></View>}
        <Button disabled={busy || !consent} onPress={setup}>{state.enabled ? 'Update card and recharge settings' : 'Save card and enable recharge'}</Button>
      </>}
      {(state.enabled || state.attempts.some(a => ['reserved', 'ready', 'processing', 'requires_action'].includes(a.status))) &&
        <Button disabled={busy} onPress={disable}>Turn off automatic recharge</Button>}
      {!!state.attempts.length && <Text style={s.heading}>Recharge history</Text>}
      {state.attempts.map(a => <View key={a.id}><Text style={s.muted}>{new Date(a.createdAt).toLocaleString()} · {money(a.amount)} · {a.points} RP · {a.status.replace(/_/g, ' ')}</Text>
        {a.status === 'requires_action' && <Button disabled={busy} onPress={() => recover(a.id)}>Confirm with my bank</Button>}
      </View>)}
    </>}
  </View>;
}
