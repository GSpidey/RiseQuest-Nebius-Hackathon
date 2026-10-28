import { AppAlert as Alert } from '../../components/AppModal';
import ActionLabel from '../ActionLabel';
import React,{useEffect,useState} from 'react';
import { View, Text, TouchableOpacity, NativeModules, Platform, AppState, Linking } from 'react-native';
import {featureStyles as s} from '../ui';
export default function AlarmReadiness(){
 const [status,setStatus]=useState(null);
 const refresh=()=>NativeModules.RiseQuestAlarmAudio?.reliabilityStatus?.().then(setStatus).catch(()=>{});
 useEffect(()=>{refresh();const sub=AppState.addEventListener('change',v=>{if(v==='active')refresh();});return()=>sub.remove();},[]);
 const settings=kind=>{const task=Platform.OS==='android'?NativeModules.RiseQuestAlarmAudio.openReliabilitySettings(kind):Linking.openSettings();task?.catch(()=>Alert.alert('Open Settings','Open RiseQuest in your phone settings.'));};
 return <View style={s.card}><Text style={s.heading}>Alarm readiness</Text>
 {Platform.OS==='android'?<><Text style={s.body}>{status?`Exact alarms: ${status.exactAlarms?'allowed':'needs permission'}\nFull-screen alarms: ${status.fullScreen?'allowed':'needs permission'}\nAlarm volume: ${status.alarmVolume} of ${status.alarmVolumeMax}\nBattery: ${status.batteryUnrestricted?'unrestricted':'optimized'}`:'Refresh to check this phone’s alarm settings.'}</Text><Text style={s.muted}>Android controls Do Not Disturb and battery restrictions. Allow alarms in your DND settings and test with the screen locked. The app will not change your sound settings silently.</Text><View style={s.row}>{[['sound','Alarm volume'],['dnd','Do Not Disturb'],['battery','Battery settings'],['app','App permissions']].map(([kind,label])=><TouchableOpacity key={kind} style={s.chip} onPress={()=>settings(kind)}><ActionLabel icon={kind==='sound'?'speaker':kind==='dnd'?'sleep':'settings'}>{label}</ActionLabel></TouchableOpacity>)}</View></>:<><Text style={s.body}>On iOS 26+, RiseQuest uses AlarmKit with your permission. Earlier iOS versions use notifications; silent mode and Focus can limit sound.</Text><Text style={s.muted}>Allow RiseQuest alarms and notifications, then test an alarm with the phone locked. Keep the fixed alarm enabled when using a smart wake window.</Text><TouchableOpacity style={s.chip} onPress={()=>settings('app')}><ActionLabel icon="settings">Open iPhone settings</ActionLabel></TouchableOpacity></>}
 <TouchableOpacity style={s.chip} onPress={refresh}><ActionLabel icon="shield">Refresh checks</ActionLabel></TouchableOpacity></View>;
}

