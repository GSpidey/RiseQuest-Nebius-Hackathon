import RiseQuestDialog from '../../components/RiseQuestDialog';
import { changeCollection, refreshCollection } from '../../services/cosmeticCollection';
import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,ScrollView,TextInput,KeyboardAvoidingView,Platform,StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CompanionAvatar from './CompanionAvatar';
import {SunriseIcon, sunrise} from '../../components/SunriseUI';
import {featureApi} from '../api';
import {featureStyles as s,personalText} from '../ui';
import VoiceControls from './VoiceControls';
import {useVoiceConversation,setVoiceContext,sendCompanionMessage,replayCompanionReply,clearVoiceAction,setCompanionReply,stopVoiceConversation,confirmCompanionAction} from './voiceConversation';
import {actionPrompt} from './actions';
import {MonetizationService} from '../../utils/MonetizationService';
const FREE=[{id:'sol',name:'Sol',access:'free',unlocked:true},{id:'fern',name:'Fern',access:'free',unlocked:true}];
const personalities=[['gentle','Gentle','leaf'],['motivational','Encouraging','sparkles'],['scientific','Practical','quests'],['fun','Playful','smile']];
const companionFeatures=['Chat by text or voice','Plan your day and manage quests','Choose from four conversation styles'];
const readerFeatures=['Read text from your screen','Read documents and images','Turn captured text into notes','Save and revisit your notes'];
function FeatureList({items}) {
 return <View style={c.featureList}>{items.map(item=><View key={item} style={c.featureRow}><Text accessible={false} style={c.featureTick}>✓</Text><Text style={c.purchaseDetail}>{item}</Text></View>)}</View>;
}
export default function CompanionHub({userProfile,onNavigate,onAlarm,onClose,onSelect}) {
 const owner=userProfile?.id||userProfile?.email||'guest',key=`risequest_companion:${owner}`,prefs=userProfile?.preferences||{};
 const [character,setCharacter]=useState('sol'),[personality,setPersonality]=useState('gentle'),[avatars,setAvatars]=useState(FREE);
 const [text,setText]=useState('');
 const conversation=useVoiceConversation(),{reply,action}=conversation;
 const setAction=()=>clearVoiceAction(),setReply=setCompanionReply;
 const [localBusy,setBusy]=useState(false),[tab,setTab]=useState('chat');
 const busy=localBusy||conversation.busy;
 const [purchase,setPurchase]=useState(null),[purchaseError,setPurchaseError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),alive=useRef(true),scroll=useRef(null);
 const refresh=()=>featureApi('/api/companions').then(r=>{if(alive.current)setAvatars(r.avatars);}).catch(()=>{});
 useEffect(()=>{alive.current=true;AsyncStorage.getItem(key).then(raw=>{if(!alive.current)return;try{const v=JSON.parse(raw);if(v){setCharacter(v.character||'sol');setPersonality(v.personality||'gentle');}}catch(_){}});refresh();return()=>{alive.current=false;};},[key]);
 const available=avatars.find(a=>a.id===character&&a.unlocked)?.id||'sol';
 useEffect(()=>{onSelect?.(available);},[available]);
 useEffect(()=>{setVoiceContext({companion:available,personality});},[available,personality]);
 const name=avatars.find(a=>a.id===available)?.name||'Sol';
 const message=reply||`I’m ${name}. What shall we work on today?`;
 const choose=async(a)=>{
  if(!a.unlocked){
   if(a.access==='subscription')return MonetizationService.triggerUpsell('header');
   if(lock.current)return;lock.current=true;setBusy(true);setPurchaseError('');setNotice('');
   try{const [quote,collection]=await Promise.all([featureApi('/api/cosmetics/quote',{itemIds:[`avatar_${a.id}`]}),refreshCollection()]);
    if(alive.current)setPurchase({avatar:a,expectedAmount:quote.amount,itemIds:[`avatar_${a.id}`],parent:collection.requiresParentApproval,key:`companion_${Date.now()}_${Math.random().toString(36).slice(2,12)}`});
   }catch(e){if(alive.current)setPurchaseError(e.message);}finally{lock.current=false;if(alive.current)setBusy(false);}return;
  }
  stopVoiceConversation();setReply(null);setAction(null);setCharacter(a.id);onSelect?.(a.id);await AsyncStorage.setItem(key,JSON.stringify({character:a.id,personality}));
 };
 const confirmPurchase=async()=>{
  if(lock.current||!purchase)return;lock.current=true;setBusy(true);setPurchaseError('');
  try{const {itemIds,expectedAmount,key:purchaseKey,parent,avatar}=purchase;
   await changeCollection(parent?'requests':'purchase',{itemIds,expectedAmount,key:purchaseKey});
   if(alive.current){setPurchase(null);setNotice(parent?'Your parent can review this request in Family profiles.':`${avatar.name} is ready to join you. Choose your new companion below.`);}await refresh();
  }catch(e){if(alive.current)setPurchaseError(e.message);}finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 const send=()=>{if(busy||conversation.active||!text.trim())return;const message=text;setText('');void sendCompanionMessage(message);};
 const execute=()=>{if(!busy&&action)void confirmCompanionAction();};
 return <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
  <View style={s.row}><Text style={[s.title,{flex:1}]}>Your companion</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close companion" style={s.chip} onPress={onClose}><SunriseIcon name="close" size={20}/></TouchableOpacity></View>
  {!!purchaseError&&!purchase&&<Text accessibilityRole="alert" style={{color:'#9A2942'}}>{purchaseError}</Text>}{!!notice&&<Text accessibilityLiveRegion="polite" style={{color:'#286B5E'}}>{notice}</Text>}
  <View style={c.tabs}>{[['chat','Talk & plan','coach'],['companions','Companion shop','shop']].map(([id,label,icon])=><TouchableOpacity key={id} accessibilityRole="tab" accessibilityState={{selected:tab===id}} style={[c.tab,tab===id&&c.activeTab]} onPress={()=>setTab(id)}><SunriseIcon name={icon} size={19} color={tab===id?'#9A4700':sunrise.muted}/><Text style={[c.tabText,tab===id&&c.activeText]}>{label}</Text></TouchableOpacity>)}</View>
  <View style={c.hero}><CompanionAvatar character={available} size={150} reducedMotion={prefs.reducedSensory} speaking={conversation.phase==='speaking'} interactive/><View style={c.heroCopy}><Text style={c.eyebrow}>YOUR DAILY SIDEKICK</Text><Text style={c.name}>{name}</Text><Text style={s.muted}>A little company.
A clear next step.</Text><TouchableOpacity accessibilityRole="button" style={c.changeButton} onPress={()=>setTab(tab==='chat'?'companions':'chat')}><SunriseIcon name={tab==='chat'?'shop':'coach'} size={16} color="#217F77"/><Text style={s.secondaryText}>{tab==='chat'?'Meet the crew':'Let’s talk'}</Text></TouchableOpacity></View></View>
  {tab==='companions'?<>{avatars.map(a=><TouchableOpacity key={a.id} disabled={busy} style={[s.card,a.id===available&&s.selected]} onPress={()=>choose(a)}>
   <View style={s.row}><CompanionAvatar character={a.id} size={90} reducedMotion/><View style={{flex:1}}><Text style={s.heading}>{a.name}</Text><Text style={s.body}>{a.id==='lumen'?'Your daily companion, with reading and note-taking tools.':a.description}</Text></View></View>
   <View style={c.purchaseDetails}>
    <Text style={c.purchaseLabel}>COMPANION TOOLS</Text>
    <FeatureList items={companionFeatures}/>
    {a.id==='lumen'&&<View style={c.readerDetails}><Text style={c.readerLabel}>PLUS, READ & SAVE WITH LUMEN</Text><FeatureList items={readerFeatures}/><Text style={c.purchaseNote}>Device voice is free. Generated reading voice: 25 RP per started 500 characters.</Text></View>}
    {a.access==='purchase'&&<FeatureList items={[a.id==='orbit'?'Space-traveller character artwork':a.id==='ember'?'Bright, fiery character artwork':a.id==='lumen'?'Lantern-bearing fox character artwork':'Distinct character artwork','Permanent account unlock']}/>}
   </View>
   <Text style={s.muted}>{a.id===available?'✓ Selected':a.unlocked?'Choose companion':a.access==='subscription'?'Included with Premium / Family':`${a.price} RisePoints · permanent unlock`}</Text>
  </TouchableOpacity>)}</>:<>
  <View style={s.row}>{personalities.map(([id,label,icon])=><TouchableOpacity key={id} accessibilityRole="button" accessibilityState={{selected:personality===id}} style={[c.personality,personality===id&&c.activePersonality]} onPress={()=>{setPersonality(id);AsyncStorage.setItem(key,JSON.stringify({character:available,personality:id}));}}><SunriseIcon name={icon} size={17} color="#217F77"/><Text style={c.personalityText}>{label}</Text></TouchableOpacity>)}</View>
  <View style={s.card}><Text accessibilityLiveRegion="polite" style={personalText(prefs)}>{message}</Text><View style={s.row}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Read reply aloud" disabled={busy||conversation.active} onPress={()=>{if(!reply)setCompanionReply(message);void replayCompanionReply();}} style={c.audioButton}><SunriseIcon name="speaker" size={19} color="#217F77"/><Text style={s.secondaryText}>Listen</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Stop audio and voice chat" onPress={()=>stopVoiceConversation()} style={c.audioButton}><SunriseIcon name="stop" size={17} color="#217F77"/><Text style={s.secondaryText}>Stop</Text></TouchableOpacity></View></View>
  {action&&<View style={s.card}><Text style={s.heading}>Your next step</Text><Text style={s.body}>{actionPrompt(action)}</Text><TouchableOpacity disabled={busy} style={s.button} onPress={execute}><Text style={s.buttonText}>{busy?'Please wait…':'Confirm'}</Text></TouchableOpacity><TouchableOpacity style={s.chip} onPress={()=>setAction(null)}><Text style={s.secondaryText}>Cancel</Text></TouchableOpacity></View>}
  <TextInput accessibilityLabel="Message your companion" style={s.input} multiline maxLength={1200} value={text} onChangeText={setText} placeholder="Try: help me break down tidying my room"/>
  <View style={s.row}><TouchableOpacity accessibilityRole="button" disabled={busy||conversation.active||!text.trim()} style={[s.button,c.inline]} onPress={send}><Text style={s.buttonText}>{busy?'Thinking…':'Send'}</Text><SunriseIcon name="send" size={18} color="#FFFFFF"/></TouchableOpacity></View>
  <VoiceControls/>
  <View style={s.row}>{[['care','My day','today'],['notes','Notes','quests'],['checkin','Check in','smile'],['reader','Read with Lumen','speaker'],['routine','My routine','today'],['alarms','Alarms','alarm'],['quests','Quests','quests'],['brain-training','Mind practice','games']].map(([screen,label,icon])=><TouchableOpacity key={screen} accessibilityRole="button" style={[s.chip,c.inline]} onPress={()=>onNavigate(screen)}><SunriseIcon name={icon} size={19} color="#217F77"/><Text style={s.secondaryText}>{label}</Text></TouchableOpacity>)}</View>
  </>}
 </ScrollView><RiseQuestDialog visible={Boolean(purchase)} title={purchase?.parent?'A new friend?':`Welcome ${purchase?.avatar.name||''}?`}
  description={purchase?.parent?`Ask your parent to unlock ${purchase.avatar.name} for ${purchase.expectedAmount} RP.`:`Unlock this companion permanently for ${purchase?.expectedAmount||0} RP.`}
  artwork={purchase&&<CompanionAvatar character={purchase.avatar.id} size={140} reducedMotion={prefs.reducedSensory}/>}
  busy={busy} error={purchaseError} confirmLabel={purchase?.parent?'Ask my parent':`Unlock · ${purchase?.expectedAmount||0} RP`} onConfirm={confirmPurchase} onClose={()=>{setPurchase(null);setPurchaseError('');}}/>
 </KeyboardAvoidingView>;
}

const c=StyleSheet.create({
 purchaseDetails:{marginTop:10,marginBottom:10,padding:10,borderRadius:12,backgroundColor:sunrise.orangeTint,gap:5},
 purchaseLabel:{fontSize:10,fontWeight:'800',letterSpacing:.6,color:'#8C4800'},
 purchaseDetail:{fontSize:13,lineHeight:20,color:sunrise.ink,flex:1},
 purchaseNote:{fontSize:12,lineHeight:18,color:sunrise.muted},
 featureList:{gap:7},featureRow:{flexDirection:'row',alignItems:'flex-start',gap:8},
 featureTick:{fontSize:15,lineHeight:20,fontWeight:'800',color:'#217F77'},
 readerDetails:{marginVertical:7,padding:12,borderRadius:12,backgroundColor:'#E7F8F4',gap:8},
 readerLabel:{fontSize:11,lineHeight:16,fontWeight:'800',letterSpacing:.5,color:'#175E54'},
 tabs:{flexDirection:'row',backgroundColor:'#EEE8E0',borderRadius:16,padding:4,gap:4},
 tab:{flex:1,minHeight:48,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,padding:8},
 activeTab:{backgroundColor:'#FFFFFF',elevation:2,shadowColor:'#66401D',shadowOpacity:.08,shadowRadius:4,shadowOffset:{width:0,height:2}},
 tabText:{fontSize:13,fontWeight:'700',color:sunrise.muted,flexShrink:1},activeText:{color:'#9A4700'},
 hero:{flexDirection:'row',alignItems:'center',backgroundColor:'#FFFFFF',borderRadius:24,padding:12,borderWidth:1,borderColor:sunrise.border},
 heroCopy:{flex:1,gap:8,paddingRight:4},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1,color:sunrise.muted},name:{fontSize:29,fontWeight:'800',color:sunrise.ink},
 changeButton:{flexDirection:'row',alignItems:'center',gap:6,minHeight:44,flexWrap:'wrap'},
 personality:{flexDirection:'row',alignItems:'center',gap:6,borderRadius:12,padding:10,minHeight:44,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:sunrise.border},
 activePersonality:{backgroundColor:'#E7F8F4',borderColor:'#217F77'},personalityText:{fontSize:13,fontWeight:'600',color:'#217F77'},
 audioButton:{flexDirection:'row',alignItems:'center',gap:7,minHeight:44,paddingHorizontal:12,borderRadius:12,backgroundColor:'#EDF4F1'},
 inline:{flexDirection:'row',alignItems:'center',gap:8},
});
