import { AppAlert as Alert } from '../../components/AppModal';
import { celebrate } from '../customization/ThemeMotion';
import React,{useEffect,useRef,useState} from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Switch, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {featureStyles as s,personalText} from '../ui';
import {GAMES,nextLevel,round,correct} from './engine';
import {MonetizationService} from '../../utils/MonetizationService';
import {speak,stopWhenBackgrounded,stopSpeech} from '../companion/speech';
export default function AdaptiveTraining({userProfile,onNavigate,onRoundComplete}){
 const prefs=userProfile?.preferences||{},owner=userProfile?.id||userProfile?.email||'guest',key=`risequest_practice:${owner}`;
 const [access,setAccess]=useState(false),[loaded,setLoaded]=useState(false),[game,setGame]=useState(null),[task,setTask]=useState(null),[history,setHistory]=useState({}),[levels,setLevels]=useState({});
 const [answer,setAnswer]=useState(''),[sequence,setSequence]=useState([]),[revealed,setRevealed]=useState(false),[feedback,setFeedback]=useState(''),[complete,setComplete]=useState(false),[roundCorrect,setRoundCorrect]=useState(false),[untimed,setUntimed]=useState(prefs.untimedChallenges!==false),[time,setTime]=useState(0);
 const active=useRef(true),locked=useRef(false),timer=useRef(null),start=useRef(0);
 useEffect(()=>{active.current=true;Promise.all([MonetizationService.checkFeatureAccess(MonetizationService.PREMIUM_FEATURES.UNLIMITED_MINI_GAMES),AsyncStorage.getItem(key)]).then(([allowed,raw])=>{if(!active.current)return;setAccess(allowed);try{const d=JSON.parse(raw);setHistory(d?.history||{});setLevels(d?.levels||{});}catch(_){}setLoaded(true);}).catch(()=>setLoaded(true));const clean=stopWhenBackgrounded();const sub=AppState.addEventListener('change',v=>{if(v!=='active'){clearTimeout(timer.current);setTask(null);setGame(null);}});return()=>{active.current=false;clearTimeout(timer.current);clean();sub.remove();};},[key]);
 useEffect(()=>{if(!game||!task||complete||untimed)return;const id=setInterval(()=>setTime(Math.max(0,60-Math.floor((Date.now()-start.current)/1000))),1000);return()=>clearInterval(id);},[game,task,complete,untimed]);
 const begin=async(id)=>{
  if(!access){await MonetizationService.triggerUpsell('locked_mini_game');setAccess(await MonetizationService.checkFeatureAccess(MonetizationService.PREMIUM_FEATURES.UNLIMITED_MINI_GAMES));return;}
  clearTimeout(timer.current);stopSpeech();locked.current=false;setGame(id);setTask(round(id,levels[id]||1));setAnswer('');setSequence([]);setFeedback('');setComplete(false);setRoundCorrect(false);setRevealed(id==='memory');start.current=Date.now();setTime(60);
  if(id==='memory'&&!untimed)timer.current=setTimeout(()=>{if(active.current)setRevealed(false);},Math.max(3000,6500-(levels[id]||1)*400));
 };
 const finish=()=>{
  if(locked.current||!task||revealed)return;locked.current=true;stopSpeech();const ok=correct(game,['math','typing'].includes(game)?answer:sequence,task.answer);
  const attempts=[...(history[game]||[]),{correct:ok,seconds:Math.round((Date.now()-start.current)/1000)}].slice(-30);
  const h={...history,[game]:attempts},l={...levels,[game]:attempts.length%5===0?nextLevel(attempts,levels[game]||1):levels[game]||1};
  setHistory(h);setLevels(l);setRoundCorrect(ok);setComplete(true);if(ok)celebrate('challenge');setFeedback(ok?'Nicely done. Ready for another small challenge?':'That was practice, too. Try again or choose an easier level.');AsyncStorage.setItem(key,JSON.stringify({history:h,levels:l})).catch(()=>{});
 };
 const domains=prefs.focusAreas||[],ordered=[...GAMES].sort((a,b)=>Number(domains.includes(b.domain))-Number(domains.includes(a.domain)));
 return <ScrollView style={s.page} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
  <Text style={s.title}>Mind practice</Text><Text style={s.body}>Small challenges. Room to improve.</Text><Text style={s.muted}>Practice adjusts after each five rounds. This is recreation, not a cognitive assessment.</Text>
  {!game?<><View style={s.row}><Text style={s.body}>Untimed practice</Text><Switch value={untimed} onValueChange={setUntimed}/></View>{!access&&<View style={s.card}><Text style={s.heading}>{loaded?'Included with Premium':'Checking your plan…'}</Text><Text style={s.body}>Adaptive number, memory, sorting, typing and listening games. Your original games and spoken affirmations remain free.</Text><TouchableOpacity style={s.button} onPress={()=>begin('math')}><Text style={s.buttonText}>View subscription options</Text></TouchableOpacity></View>}
  {ordered.map(g=><TouchableOpacity key={g.id} style={s.card} disabled={!loaded} onPress={()=>begin(g.id)}><Text style={s.heading}>{g.name} {access?'':'· Premium'}</Text><Text style={s.body}>{g.description}</Text><Text style={s.muted}>{g.domain} · level {levels[g.id]||1}</Text></TouchableOpacity>)}
  <TouchableOpacity style={s.chip} onPress={()=>onNavigate('mini-games')}><Text style={s.secondaryText}>Play original games · free</Text></TouchableOpacity><TouchableOpacity style={s.chip} onPress={()=>onNavigate('routine')}><Text style={s.secondaryText}>Spoken affirmations · free</Text></TouchableOpacity></>:task&&<>
   <View style={s.card}><Text style={s.heading}>{GAMES.find(g=>g.id===game)?.name} · level {levels[game]||1}</Text>{!untimed&&<Text style={s.muted}>{time>0?`${time}s suggested pace`:'Take your time — you can still finish.'}</Text>}<Text style={personalText(prefs)}>{task.prompt}</Text>
   {game==='memory'&&<><Text style={s.muted}>{revealed?'Study the tiles, then hide them when ready.':'Tap the tiles you remember.'}</Text><View style={[s.row,{gap:8}]}>{Array.from({length:task.size},(_,i)=><TouchableOpacity key={i} disabled={complete||revealed} accessibilityLabel={`Tile ${i+1}${revealed&&task.answer.includes(i)?', highlighted':''}`} accessibilityState={{selected:sequence.includes(i)}} style={{width:task.size===16?'21%':'29%',height:64,borderRadius:12,borderWidth:2,borderColor:'#AABABC',backgroundColor:(revealed?task.answer.includes(i):sequence.includes(i))?'#217F77':'#EEF2EF'}} onPress={()=>setSequence(v=>v.includes(i)?v.filter(n=>n!==i):[...v,i])}><Text style={{textAlign:'center',color:(revealed?task.answer.includes(i):sequence.includes(i))?'#FFF':'#233647',marginTop:20}}>{i+1}</Text></TouchableOpacity>)}</View>{revealed&&<TouchableOpacity style={s.button} onPress={()=>{clearTimeout(timer.current);setRevealed(false);}}><Text style={s.buttonText}>Hide pattern</Text></TouchableOpacity>}</>}
   {['math','typing'].includes(game)&&<TextInput accessibilityLabel="Your answer" style={s.input} keyboardType={game==='math'?'numeric':'default'} value={answer} editable={!complete} autoCorrect={false} maxLength={200} onChangeText={setAnswer}/>}
   {game==='audio'&&<TouchableOpacity style={s.button} onPress={()=>speak(task.answer.join('. ')).catch(()=>Alert.alert('Audio unavailable','Choose another skill or enable a speech voice in your phone settings.'))}><Text style={s.buttonText}>Listen to the trail</Text></TouchableOpacity>}
   {['audio','sorting'].includes(game)&&<><View style={s.row}>{(task.words||task.values).map(v=><TouchableOpacity key={v} style={s.chip} disabled={complete||(game==='sorting'&&sequence.includes(v))} onPress={()=>setSequence(old=>old.length<task.answer.length?[...old,v]:old)}><Text style={s.secondaryText}>{v}</Text></TouchableOpacity>)}</View><Text style={s.body}>Your sequence: {sequence.join(' → ')||'—'}</Text><TouchableOpacity disabled={complete} style={s.chip} onPress={()=>setSequence([])}><Text style={s.secondaryText}>Clear sequence</Text></TouchableOpacity></>}
   {complete&&roundCorrect&&onRoundComplete&&<TouchableOpacity style={s.button} onPress={()=>{stopSpeech();onRoundComplete();}}><Text style={s.buttonText}>Challenge complete · continue</Text></TouchableOpacity>}
   {feedback&&<Text accessibilityLiveRegion="polite" style={personalText(prefs)}>{feedback}</Text>}
   {!complete?<TouchableOpacity disabled={revealed} style={s.button} onPress={finish}><Text style={s.buttonText}>Check answer</Text></TouchableOpacity>:<TouchableOpacity style={s.button} onPress={()=>begin(game)}><Text style={s.buttonText}>Next round</Text></TouchableOpacity>}
   <TouchableOpacity style={s.chip} onPress={()=>{setLevels(v=>({...v,[game]:Math.max(1,(v[game]||1)-1)}));setTask(null);setGame(null);}}><Text style={s.secondaryText}>Make it gentler</Text></TouchableOpacity>
   <TouchableOpacity style={s.chip} onPress={()=>{stopSpeech();clearTimeout(timer.current);setGame(null);setTask(null);}}><Text style={s.secondaryText}>Choose another skill</Text></TouchableOpacity>
  </View></>}
 </ScrollView>;
}

