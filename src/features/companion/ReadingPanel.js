import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TouchableOpacity} from 'react-native';
import {getAuthToken} from '../../services/AuthTokenStorage';
import {featureApi} from '../api';
import {featureStyles as s} from '../ui';
import {playReading,stopVoiceConversation} from './voiceConversation';
import RiseQuestDialog from '../../components/RiseQuestDialog';
export default function ReadingPanel({owner,companion='sol',feature='reader',text='',note,preferences}){
 const [status,setStatus]=useState(null),[voice,setVoice]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[page,setPage]=useState(0);
 const alive=useRef(true),lock=useRef(false),token=useRef(null),chunk=text.slice(page*3000,(page+1)*3000),pages=Math.max(1,Math.ceil(text.length/3000));
 useEffect(()=>{alive.current=true;getAuthToken().then(t=>{token.current=t;return featureApi(`/api/companion/reading?companion=${encodeURIComponent(companion)}`,undefined,{expectedToken:t});}).then(r=>{if(alive.current){setStatus(r);setVoice(r.voices?.[0]?.id);}}).catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;stopVoiceConversation();};},[owner,companion]);
 useEffect(()=>{setPage(0);},[text]);
 const cost=status?Math.ceil(chunk.length/status.unitCharacters)*status.rate:0;
 const play=async realistic=>{if(lock.current||!chunk)return;lock.current=true;setBusy(true);setError('');setConfirm(false);
  try{await playReading(chunk,realistic?{companion,feature,voiceId:voice,text:chunk,noteId:note?.id,revision:note?.revision,offset:page*3000,
    priceVersion:status.priceVersion,maxCost:cost,confirmed:true,automatic:preferences?.automaticRP?.enabled&&preferences.automaticRP.features.includes(feature)}:null,{owner,expectedToken:token.current});}
  catch(e){if(alive.current)setError(e.message);}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const button=(label,onPress,disabled=busy)=><TouchableOpacity accessibilityRole="button" disabled={disabled} style={s.chip} onPress={onPress}><Text style={s.secondaryText}>{label}</Text></TouchableOpacity>;
 return <View style={s.card}><Text style={s.heading}>Read aloud</Text><Text style={s.muted}>Passage {page+1} of {pages} · {chunk.length} characters</Text>
 <View style={[s.row,{flexWrap:'wrap'}]}>{button('Previous',()=>setPage(p=>p-1),busy||page===0)}{button('Next',()=>setPage(p=>p+1),busy||page+1>=pages)}{button('Device voice · free',()=>play(false),busy||!chunk)}{button('Stop',()=>{stopVoiceConversation();},false)}</View>
 {status?.eligible&&status.owned&&<><View style={[s.row,{flexWrap:'wrap'}]}>{status.voices.map(v=><TouchableOpacity key={v.id} disabled={busy} style={s.chip} onPress={()=>setVoice(v.id)}><Text style={s.secondaryText}>{voice===v.id?'✓ ':''}{v.name}</Text></TouchableOpacity>)}</View>
 <Text style={s.body}>{status.rate} RP per started {status.unitCharacters} characters. This passage: up to {cost} RP. Saved audio replays free.</Text>
 {button(busy?'Preparing…':`Realistic voice · up to ${cost} RP`,()=>preferences?.automaticRP?.enabled&&preferences.automaticRP.features.includes(feature)?play(true):setConfirm(true),busy||!chunk)}</>}
 {!!error&&<Text accessibilityRole="alert" style={{color:'#9A2942'}}>{error}</Text>}
 <RiseQuestDialog visible={confirm} title="Read this passage?" description={`Use up to ${cost} RP to prepare this voice.`} confirmLabel={`Read · up to ${cost} RP`} cancelLabel="Cancel" onConfirm={()=>play(true)} onClose={()=>setConfirm(false)}/>
 </View>;
}
