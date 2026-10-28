import React,{useEffect,useRef,useState} from 'react';
import {View,Text,ScrollView,TextInput,TouchableOpacity,NativeModules} from 'react-native';
import {featureStyles as s} from '../ui';
import {featureApi} from '../api';
import {getAuthToken} from '../../services/AuthTokenStorage';
import {requestKey,supportSnapshot,supportChange} from './supportClient';
import {removeRepeatedHeaders} from './readerText';
import ReadingPanel from './ReadingPanel';
import CompanionAvatar from './CompanionAvatar';
import {stopVoiceConversation} from './voiceConversation';
const native=NativeModules.RiseQuestReader;
export default function ReaderScreen({owner,onNavigate}){
 const [text,setText]=useState(''),[status,setStatus]=useState(null),[prefs,setPrefs]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[capture,setCapture]=useState(null),[saved,setSaved]=useState(false);
 const alive=useRef(true),lock=useRef(false),token=useRef(null),session=useRef(null),saveKey=useRef(null),lastCaptureText=useRef('');
 useEffect(()=>{alive.current=true;getAuthToken().then(async t=>{token.current=t;const [r,p]=await Promise.all([featureApi('/api/companion/reading?companion=lumen',undefined,{expectedToken:t}),supportSnapshot({expectedToken:t})]);if(alive.current){setStatus(r);setPrefs(p.preferences.data);}}).catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;session.current=null;native?.stopCapture();stopVoiceConversation();};},[owner]);
 useEffect(()=>{if(!capture)return;let working=false;const timer=setInterval(async()=>{if(working)return;working=true;try{const result=await native.captureStatus(capture);if(!alive.current||session.current!==capture)return;if(result.text&&result.text!==lastCaptureText.current){lastCaptureText.current=result.text;setText(result.text.slice(0,30000));saveKey.current=null;setSaved(false);}if(!result.active){setCapture(null);session.current=null;}}catch(e){if(alive.current){setError('Screen reading stopped. You can start it again.');setCapture(null);}}finally{working=false;}},1500);return()=>clearInterval(timer);},[capture]);
 const run=async fn=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(e.message||'Could not read that content.');}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const button=(label,fn,disabled=busy)=><TouchableOpacity accessibilityRole="button" disabled={disabled} style={s.chip} onPress={fn}><Text style={s.secondaryText}>{label}</Text></TouchableOpacity>;
 return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={s.row}><CompanionAvatar character="lumen" size={85}/><View style={{flex:1}}><Text style={s.title}>Read with Lumen</Text><Text style={s.body}>A little light for the next page.</Text></View></View>
 {button('Back to companion',()=>onNavigate('companion'))}
 {!!error&&<Text accessibilityRole="alert" style={{color:'#9A2942'}}>{error}</Text>}
 {status&&!status.owned?<View style={s.card}><Text style={s.body}>Lumen’s reading tools come with the permanent companion unlock.</Text>{button('Meet Lumen',()=>onNavigate('companion'))}</View>:status&&<>
 <View style={s.card}><Text style={s.heading}>Choose what to read</Text><Text style={s.body}>Import a PDF, image or text file, or paste a passage. Documents can be up to 20 MB and 30 PDF pages.</Text>
 {button('Import document or image',()=>run(async()=>{if(!native)throw Error('Install the updated RiseQuest app to import documents.');stopVoiceConversation();const result=await native.importDocument();if(result?.text&&alive.current){setText(result.text.slice(0,30000));saveKey.current=null;setSaved(false);}}))}
 <Text style={s.body}>For another app, start screen reading, approve the system prompt, then open the page you want to read. On Android, tap Read screen in the reading notification. Return here to review the text. Screen reading ends after two minutes.</Text>
 {capture?button('Stop screen reading',()=>{native?.stopCapture();session.current=null;setCapture(null);},false):button('Start screen reading',()=>run(async()=>{if(!native)throw Error('Install the updated RiseQuest app to read another screen.');stopVoiceConversation();const id=requestKey();session.current=id;lastCaptureText.current='';await native.startCapture(id);if(alive.current&&session.current===id)setCapture(id);} ))}
 {button('Remove repeated headers',()=>{setText(removeRepeatedHeaders(text));saveKey.current=null;setSaved(false);})}
 <TextInput accessibilityLabel="Passage to read" style={[s.input,{minHeight:180}]} value={text} multiline maxLength={30000} onChangeText={v=>{setText(v);saveKey.current=null;setSaved(false);}} placeholder="Paste a passage or import a page"/>
 </View>
 <ReadingPanel owner={owner} companion="lumen" text={text} preferences={prefs}/>
 {button(saved?'Saved to notes':'Save to notes',()=>run(async()=>{if(!saveKey.current)saveKey.current=requestKey();await supportChange({operation:'note_save',id:saveKey.current,revision:0,key:saveKey.current,title:'Reading notes',body:text,pinned:false},{expectedToken:token.current});if(alive.current)setSaved(true);}),busy||!text||saved)}
 {button('Open notes',()=>onNavigate('notes'))}
 </>}
 </ScrollView>;
}
