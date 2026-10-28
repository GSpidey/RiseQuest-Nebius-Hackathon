import { AppAlert as Alert } from '../../components/AppModal';
import { celebrate } from '../customization/ThemeMotion';
import ActionLabel from '../ActionLabel';
import React,{useEffect,useRef,useState} from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNCalendarEvents from 'react-native-calendar-events';
import {featureStyles as s,personalText} from '../ui';
import {speak,stopSpeech,stopWhenBackgrounded} from '../companion/speech';
import {WeatherService} from '../../utils/AIServices';
import QuestService from '../../services/QuestService';
import CompanionAvatar from '../companion/CompanionAvatar';
import AlarmReadiness from './AlarmReadiness';
export function routineDay(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
export default function RoutineScreen({userProfile,onNavigate}){
 const owner=userProfile?.id||userProfile?.email||'guest',prefs=userProfile?.preferences||{},key=`risequest_routine:${owner}`;
 const [items,setItems]=useState(['Drink some water','Open the curtains','Choose one priority','Check my first appointment']);
 const [done,setDone]=useState([]),[draft,setDraft]=useState(''),[day,setDay]=useState(routineDay()),[ready,setReady]=useState(false),[briefing,setBriefing]=useState('Calendar, weather and your next goal in one place.'),[busy,setBusy]=useState(false);
 const alive=useRef(true),saving=useRef(Promise.resolve());
 useEffect(()=>{alive.current=true;setReady(false);AsyncStorage.getItem(key).then(raw=>{if(!alive.current)return;try{const v=JSON.parse(raw);if(Array.isArray(v?.items))setItems(v.items);setDone(v?.day===routineDay()?v.done||[]:[]);}catch(_){}setReady(true);});const clean=stopWhenBackgrounded();const app=AppState.addEventListener('change',v=>{if(v==='active'&&routineDay()!==day){setDay(routineDay());setDone([]);}});return()=>{alive.current=false;clean();app.remove();};},[key,day]);
 useEffect(()=>{if(ready){const value=JSON.stringify({items,done,day});saving.current=saving.current.then(()=>AsyncStorage.setItem(key,value)).catch(()=>{});}},[items,done,day,ready,key]);
 const prepare=async()=>{
  if(busy)return;setBusy(true);const lines=[`Good ${new Date().getHours()<12?'morning':'day'}. ${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}.`];
  try{
   let permission=await RNCalendarEvents.checkPermissions();if(permission==='undetermined')permission=await RNCalendarEvents.requestPermissions();
   if(permission==='authorized'){const start=new Date(),end=new Date();end.setHours(23,59,59,999);const events=await RNCalendarEvents.fetchAllEvents(start.toISOString(),end.toISOString());const future=events.filter(e=>new Date(e.endDate)>start).sort((a,b)=>new Date(a.startDate)-new Date(b.startDate)).slice(0,4);lines.push(future.length?future.map(e=>`${e.allDay?'Today':new Date(e.startDate).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}: ${e.title}.`).join(' '):'No more calendar events today.');}
   else lines.push('Calendar permission is off. You can keep planning without it.');
  }catch(_){lines.push('Calendar could not refresh.');}
  try{const w=await WeatherService.getCurrentWeather({requestPermission:true});lines.push(w&&!w.error&&w.temperature!=null?`Weather: ${w.temperature} degrees Celsius, ${w.description}.`:'Weather could not refresh.');}catch(_){lines.push('Weather could not refresh.');}
  try{const quests=await QuestService.getUserQuests(owner);const q=quests.find(v=>v.status==='active');if(q)lines.push(`Your next quest: ${q.title}. ${q.subtasks?.find(t=>!t.completed)?.title||'Choose one small step.'}`);}catch(_){lines.push('Saved quests could not refresh.');}
  if(prefs.goals?.length)lines.push(`Your goals: ${prefs.goals.slice(0,3).join(', ')}.`);
  if(alive.current){setBriefing(lines.join('\n\n'));setBusy(false);}
 };
 return <ScrollView style={s.page} contentContainerStyle={s.content}>
  <View style={s.row}><CompanionAvatar character="fern" size={85} reducedMotion={prefs.reducedSensory}/><View style={{flex:1}}><Text style={s.title}>A gentle start</Text><Text style={s.muted}>Your day, one step at a time.</Text></View></View>
  <View style={s.card}><Text style={s.heading}>Today’s routine</Text><Text style={s.muted}>{done.length} of {items.length} complete · resets each day</Text>
   {items.map((item,i)=><View key={`${i}-${item}`} style={s.row}><TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:done.includes(i)}} style={[s.chip,{flex:1},done.includes(i)&&s.selected]} onPress={()=>{if(!done.includes(i))celebrate('routine');setDone(v=>v.includes(i)?v.filter(n=>n!==i):[...v,i]);}}><Text style={personalText(prefs)}>{done.includes(i)?'✓  ':'○  '}{item}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${item}`} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}} onPress={()=>{setItems(v=>v.filter((_,n)=>n!==i));setDone(v=>v.filter(n=>n!==i).map(n=>n>i?n-1:n));}}><ActionLabel icon="close"/></TouchableOpacity></View>)}
   <TextInput accessibilityLabel="Add a routine step" placeholder="Add your own small step" style={s.input} value={draft} maxLength={120} onChangeText={setDraft}/>
   <TouchableOpacity style={s.button} onPress={()=>{if(draft.trim()&&items.length<15){setItems(v=>[...v,draft.trim()]);setDraft('');}}}><ActionLabel icon="quests" primary>Add step</ActionLabel></TouchableOpacity>
  </View>
  <View style={s.card}><Text style={s.heading}>Your daily briefing</Text><Text style={personalText(prefs)}>{briefing}</Text><Text style={s.muted}>Allow calendar and location when prompted to personalize your briefing.</Text><TouchableOpacity disabled={busy} style={s.button} onPress={prepare}><ActionLabel icon="today" primary>{busy?'Preparing…':'Prepare briefing'}</ActionLabel></TouchableOpacity><View style={s.row}><TouchableOpacity style={s.chip} onPress={()=>speak(briefing).catch(()=>Alert.alert('Audio unavailable','You can read the briefing above.'))}><ActionLabel icon="speaker">Read aloud</ActionLabel></TouchableOpacity><TouchableOpacity style={s.chip} onPress={stopSpeech}><ActionLabel icon="stop">Stop audio</ActionLabel></TouchableOpacity></View></View>
  <View style={s.card}><Text style={s.heading}>A moment of encouragement</Text><Text style={personalText(prefs)}>“I can begin with one small step. I can pause, adjust, and try again.”</Text><TouchableOpacity style={s.chip} onPress={()=>speak('I can begin with one small step. I can pause, adjust, and try again.').catch(()=>{})}><ActionLabel icon="speaker">Hear affirmation</ActionLabel></TouchableOpacity></View>
  <AlarmReadiness/>
  <TouchableOpacity style={s.button} onPress={()=>onNavigate('quests')}><ActionLabel icon="quests" primary>Plan my next quest</ActionLabel></TouchableOpacity>
 </ScrollView>;
}

