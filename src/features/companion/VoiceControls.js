import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Switch,TouchableOpacity,StyleSheet,Platform,Animated,TextInput} from 'react-native';
import {SunriseIcon,sunrise} from '../../components/SunriseUI';
import {useReducedMotion} from '../customization/ThemeMotion';
import {useVoiceConversation,updateVoiceSettings,startVoiceConversation,refreshVoiceStatus} from './voiceConversation';
export function ListeningGlow({active,children,reducedMotion=false,compact=false}){
 const pulse=useRef(new Animated.Value(0)).current,reduce=useReducedMotion();
 useEffect(()=>{pulse.setValue(0);if(!active||reduce||reducedMotion)return;
  const loop=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:1,duration:1000,useNativeDriver:true,isInteraction:false}),Animated.timing(pulse,{toValue:0,duration:1000,useNativeDriver:true,isInteraction:false})]));loop.start();return()=>loop.stop();
 },[active,reduce,reducedMotion,pulse]);
 return <View style={[styles.glowWrap,compact&&{borderRadius:28}]}>{active&&<Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject,styles.glow,{opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.18,.5]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[1,1.04]})}]}]} />}{children}</View>;
}
export default function VoiceControls(){
 const v=useVoiceConversation(),{settings,status}=v,[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[capDraft,setCapDraft]=useState(String(settings.sessionLimit));
 useEffect(()=>{setCapDraft(String(settings.sessionLimit));},[settings.sessionLimit]);
 const capValid=/^\d+$/.test(capDraft)&&Number.isSafeInteger(Number(capDraft))&&Number(capDraft)>0;
 const capRequired=settings.realistic&&settings.allowPoints&&!settings.unlimited;
 const saveCap=()=>{if(capValid)update({sessionLimit:Number(capDraft)});};
 useEffect(()=>{void refreshVoiceStatus();},[]);
 const update=patch=>{setError('');void updateVoiceSettings(patch).catch(()=>setError('Your choice could not be saved. Try again.'));};
 const toggle=async()=>{setError('');try{if(!v.active&&capRequired){if(!capValid){setError('Enter a whole RP amount greater than zero, or choose no session cap.');return;}await updateVoiceSettings({sessionLimit:Number(capDraft)});}await startVoiceConversation();}catch(e){setError(e.message);}};
 const label=v.phase==='speaking'?'Speaking · mic paused':v.phase==='thinking'?'Preparing reply · mic paused':v.phase==='starting'?'Starting voice chat…':'Listening · speak whenever you’re ready';
 const row=(title,detail,value,onChange,disabled=false)=><View style={styles.row}><View style={{flex:1,gap:4}}><Text style={styles.title}>{title}</Text>{!!detail&&<Text style={styles.detail}>{detail}</Text>}</View><Switch accessibilityLabel={title} disabled={disabled||v.active||v.busy} value={value} onValueChange={onChange} trackColor={{false:'#D5D6D1',true:'#69B9AD'}} thumbColor="#FFFFFF"/></View>;
 return <View style={styles.card}>
  <ListeningGlow active={v.active&&v.phase==='listening'}><TouchableOpacity accessibilityRole="button" accessibilityLabel={v.active?'Stop voice conversation':'Start hands-free voice conversation'} accessibilityState={{selected:v.active,disabled:!v.active&&(v.busy||(capRequired&&!capValid))}} disabled={!v.active&&(v.busy||(capRequired&&!capValid))} style={[styles.talk,v.active&&styles.talkActive]} onPress={toggle}>
   <SunriseIcon name={v.active?'stop':'mic'} size={25} color={v.active?'#FFFFFF':'#8D4600'}/><View style={{flex:1,gap:4}}><Text style={[styles.title,v.active&&{color:'#FFFFFF'}]}>{v.active?'Voice chat is on':'Start voice chat'}</Text><Text style={[styles.detail,v.active&&{color:'#FFFFFF'}]}>{v.active?label:'Speak, hear a reply, then keep talking'}</Text></View>
  </TouchableOpacity></ListeningGlow>
  <Text style={styles.detail}>{v.active?'Tap again to stop. Your microphone resumes after each reply.':'While on, spoken messages are sent automatically. Tap again to stop.'}</Text>
  {row('Read typed replies aloud','Automatically play replies to messages you type.',settings.autoRead,value=>update({autoRead:value}))}
  <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded}} style={styles.settings} onPress={()=>setExpanded(!expanded)}><Text style={styles.title}>Voice & spending</Text><Text style={styles.detail}>{expanded?'Hide −':'Choose +'}</Text></TouchableOpacity>
  {expanded&&<>
   {row('Realistic voice',status?.eligible?status?.reader?'Lumen’s reading voices are available for replies.':'Use the voices available for your alarms.':'Device voice is available for this profile.',settings.realistic,value=>update({realistic:value}),!status?.eligible)}
   {settings.realistic&&status?.eligible&&<>
    <View style={styles.allowance}><Text style={styles.title}>{status.limit?`${status.remaining} / ${status.limit} included credits left`:'Use RisePoints for realistic replies'}</Text>
     <Text style={styles.detail}>{status.reader?`Each unit covers up to ${status.unitCharacters} characters. Longer replies use more units.`:'1 credit covers up to 250 characters of a reply. Longer replies use more credits.'}</Text>
     <Text style={styles.price}>{status.reader?`${status.rate} RP per started ${status.unitCharacters} characters`:status.subscriber?'5 RP per extra credit · 50% less with your subscription':'10 RP per credit · 50% less with a subscription'}</Text>
     {status.limit>0&&<Text style={styles.detail}>{status.period?.startsWith('trial:')?'Trial credits expire':'Allowance resets'} {new Date(status.renewsAt).toLocaleDateString()}{status.subscriber?' · unused credits do not roll over':''}.</Text>}
    </View>
    {row('Allow RisePoints charges',`Automatically use ${status.rate} RP per credit ${status.limit?'after included credits':'for new audio'}. Saved audio replays free.`,settings.allowPoints,value=>update({allowPoints:value}))}
    {settings.allowPoints&&<>
     {row('No session cap','Use available RP until you stop. This does not purchase more points automatically.',settings.unlimited,value=>update({unlimited:value}))}
     {!settings.unlimited&&<><Text style={styles.title}>Your session limit · RP</Text><TextInput accessibilityLabel="Custom voice session RP limit" keyboardType="number-pad" editable={!v.active&&!v.busy} value={capDraft} onChangeText={setCapDraft} onBlur={saveCap} style={styles.capInput} placeholder="Enter any whole RP amount"/>{!capValid&&<Text accessibilityRole="alert" style={styles.notice}>Enter a whole RP amount greater than zero.</Text>}</>}
     <Text style={styles.detail}>{settings.unlimited?'Continue while you have enough RP.':'At your chosen limit, continue with device voice.'} {v.spent} RP used this session.</Text>
    </>}
    <Text style={styles.title}>Choose your voice</Text><View style={styles.chips}>{status.voices.map(voice=><TouchableOpacity key={voice.id} accessibilityRole="radio" accessibilityLabel={voice.name} accessibilityState={{checked:settings.voiceId===voice.id,disabled:v.active||v.busy}} disabled={v.active||v.busy} style={[styles.chip,settings.voiceId===voice.id&&styles.selected]} onPress={()=>update({voiceId:voice.id})}><Text style={styles.detail}>{voice.name}</Text></TouchableOpacity>)}</View>
   </>}
   {Platform.OS==='android'&&row('Keep chatting outside RiseQuest','Continue when switching apps. A persistent notification lets you stop.',settings.background,value=>update({background:value}))}
   {v.active&&<Text style={styles.detail}>Stop voice chat to change these choices.</Text>}
  </>}
  {!!(error||v.notice)&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{error||v.notice}</Text>}
 </View>;
}
const styles=StyleSheet.create({card:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:sunrise.border,borderRadius:24,padding:16,gap:15},glowWrap:{position:'relative',borderRadius:20},glow:{backgroundColor:'#2CB8A1',borderRadius:20},talk:{minHeight:76,flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:20,backgroundColor:sunrise.orangeTint,borderWidth:2,borderColor:'#F6BD70'},talkActive:{backgroundColor:'#217F77',borderColor:'#49BDAA'},row:{flexDirection:'row',alignItems:'center',gap:12},title:{fontSize:14,fontWeight:'800',color:sunrise.ink},detail:{fontSize:12,lineHeight:18,color:sunrise.muted},settings:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:44},allowance:{padding:12,gap:7,backgroundColor:'#E7F8F4',borderRadius:16},price:{fontSize:13,fontWeight:'700',color:'#216F66'},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{padding:12,minHeight:44,borderRadius:12,borderWidth:1,borderColor:sunrise.border,backgroundColor:'#FFF9F0'},selected:{backgroundColor:'#DDF3ED',borderColor:'#217F77'},capInput:{minHeight:48,padding:12,borderRadius:12,borderWidth:1,borderColor:'#217F77',backgroundColor:'#FFF9F0',color:sunrise.ink,fontSize:16},notice:{fontSize:12,lineHeight:19,color:'#8B4337'}});
