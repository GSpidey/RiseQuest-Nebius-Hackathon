import { AppAlert as Alert } from '../../components/AppModal';
import ActionLabel from '../ActionLabel';
import React,{useEffect,useState} from 'react';
import { View, Text, ScrollView, TouchableOpacity, NativeModules, Platform, AppState } from 'react-native';
import {featureStyles as s} from '../ui';
import AlarmReadiness from './AlarmReadiness';
export default function SmartWakeScreen({alarms,nextTrigger,onEnsureAlarm,onNavigate}){
 const [minutes,setMinutes]=useState(15),[status,setStatus]=useState(null),[busy,setBusy]=useState(false);
 const available=(alarms||[]).filter(a=>a.isEnabled!==false).map(a=>({alarm:a,date:nextTrigger(a)})).sort((a,b)=>a.date-b.date);
 const next=available[0];const refresh=()=>NativeModules.RiseQuestAlarmAudio?.smartWakeStatus?.().then(setStatus).catch(()=>{});
 useEffect(()=>{refresh();const timer=setInterval(refresh,5000);return()=>clearInterval(timer);},[]);
 const start=async()=>{if(!next||busy)return;setBusy(true);try{if(!await onEnsureAlarm(next.alarm))return;await NativeModules.RiseQuestAlarmAudio.startSmartWake(JSON.stringify({...next.alarm,triggerMs:next.date.getTime(),windowMinutes:minutes}));setTimeout(refresh,700);}catch(_){Alert.alert('Smart wake unavailable','Your fixed alarm remains available. Check the alarm time and phone permissions.');}finally{setBusy(false);}};
 return <ScrollView style={s.page} contentContainerStyle={s.content}><Text style={s.title}>Smart wake window</Text><View style={s.card}><Text style={s.heading}>Wake with a little flexibility</Text><Text style={s.body}>Choose a window before your fixed alarm. On Android, optional phone movement monitoring can start the alarm when repeated movement is detected inside that window.</Text><Text style={s.muted}>Movement is a wake-up cue, not a sleep-stage measurement. Your fixed alarm stays scheduled.</Text><Text style={s.body}>{next?`Next alarm: ${next.date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:'Set an enabled alarm first.'}</Text>
 <View style={s.row}>{[5,10,15,20,30].map(n=><TouchableOpacity key={n} style={[s.chip,minutes===n&&s.selected]} onPress={()=>setMinutes(n)}><Text style={s.secondaryText}>{n} min</Text></TouchableOpacity>)}</View>
 {Platform.OS==='android'?<><Text style={s.muted}>Start this only when you are ready to sleep. Monitoring uses an ongoing notification and may use additional battery. Place the phone safely; never cover it or put a charging phone under bedding. You can stop monitoring from its notification.</Text><TouchableOpacity disabled={busy||!next||next.date-Date.now()>16*3600000} style={s.button} onPress={start}><ActionLabel icon="sleep" primary>{busy?'Starting…':'Start tonight’s window'}</ActionLabel></TouchableOpacity><TouchableOpacity style={s.chip} onPress={()=>NativeModules.RiseQuestAlarmAudio.stopSmartWake().then(refresh)}><ActionLabel icon="stop">Stop monitoring</ActionLabel></TouchableOpacity><Text accessibilityLiveRegion="polite" style={s.body}>{status?.active?'Monitoring is on. ':''}{status?.status||'Monitoring is off.'}</Text></>:<Text style={s.body}>This iPhone uses the fixed AlarmKit alarm. Background movement monitoring is not enabled on iOS.</Text>}
 </View><AlarmReadiness/><TouchableOpacity style={s.chip} onPress={()=>onNavigate('sleep')}><ActionLabel icon="sleep">Open sleep log & wearable sync</ActionLabel></TouchableOpacity><TouchableOpacity style={s.chip} onPress={()=>onNavigate('alarms')}><ActionLabel icon="alarm">Manage fixed alarms</ActionLabel></TouchableOpacity></ScrollView>;
}

