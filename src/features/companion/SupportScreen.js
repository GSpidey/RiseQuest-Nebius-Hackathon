import React,{useEffect,useRef,useState} from 'react';
import {View,Text,ScrollView,TextInput,TouchableOpacity,Switch} from 'react-native';
import {featureStyles as s} from '../ui';
import {featureApi} from '../api';
import {getAuthToken} from '../../services/AuthTokenStorage';
import RiseQuestDialog from '../../components/RiseQuestDialog';
import {listenOnce,stopSpeech} from './speech';
import {stopVoiceConversation} from './voiceConversation';
import {requestKey,supportSnapshot,supportChange,claimLegacyMood} from './supportClient';
import {scheduleSupportReminders,cancelFocusReminder,scheduleFocusReminder,requestSupportPermission} from './supportReminders';
import {dueText,dueInstant} from './readerText';
import ReadingPanel from './ReadingPanel';

const Button=({children,onPress,disabled=false})=><TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.chip,{minHeight:44,justifyContent:'center',opacity:disabled?.5:1}]}><Text style={s.secondaryText}>{children}</Text></TouchableOpacity>;
const Field=({label,value,onChangeText,...rest})=><View><Text style={s.body}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} value={String(value??'')} onChangeText={onChangeText} {...rest}/></View>;
const Toggle=({label,value,onValueChange})=><View style={s.row}><Text style={[s.body,{flex:1}]}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onValueChange}/></View>;
export default function SupportScreen({owner,initialTab='plan',companion='sol',onNavigate,onChanged}) {
 const [tab,setTab]=useState(initialTab),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [noteSearch,setNoteSearch]=useState(''),[legacyConfirm,setLegacyConfirm]=useState(false);
 const [note,setNote]=useState(null),[quest,setQuest]=useState(null),[draft,setDraft]=useState(null),[pending,setPending]=useState(null);
 const [mood,setMood]=useState({valence:0,energy:4,focus:4,restless:false,notes:''}),[legacy,setLegacy]=useState(null);
 const [focusEnd,setFocusEnd]=useState(0),[remaining,setRemaining]=useState(0),[focusLabel,setFocusLabel]=useState('');
 const alive=useRef(true),lock=useRef(false),token=useRef(null),retry=useRef(null);
 const options=()=>({expectedToken:token.current});
 const refresh=async()=>{
   const result=await supportSnapshot(options());if(!alive.current)return;
   setData(result);setDraft(result.preferences.data);
   setQuest(old=>old?result.quests.find(q=>q.id===old.id)||null:null);
 };
 const run=async fn=>{if(lock.current||!token.current)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){if(alive.current)setError(e.message);}finally{lock.current=false;if(alive.current)setBusy(false);}};
 useEffect(()=>{alive.current=true;getAuthToken().then(async value=>{if(!alive.current)return;token.current=value;await run(refresh);}).catch(e=>setError(e.message));
   return()=>{alive.current=false;stopSpeech();stopVoiceConversation();cancelFocusReminder();};},[owner]);
 useEffect(()=>{if(!focusEnd)return;const tick=()=>{const left=Math.max(0,Math.ceil((focusEnd-Date.now())/1000));setRemaining(left);if(!left){setFocusEnd(0);setFocusLabel('Time for a gentle pause. Stretch or look away from your screen.');}};tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[focusEnd]);
 const change=body=>run(async()=>{
   const encoded=JSON.stringify(body);if(retry.current?.encoded!==encoded)retry.current={encoded,key:requestKey()};
   const result=await supportChange({...body,key:retry.current.key},options());retry.current=null;if(!alive.current)return;
   if(body.operation==='note_save')setNote(result);
   if(body.operation==='note_delete')setNote(null);
   setPending(null);onChanged?.();await refresh();
   if(body.operation==='preferences')await scheduleSupportReminders(owner,body.data);
 });
 const ask=(title,body,description=title)=>setPending({title,body,description});
 const patchQuest=(q,changes)=>change({operation:'quest_update',id:q.id,revision:q.revision,changes});
 const startFocus=(minutes,kind='focus')=>{setFocusLabel(kind==='break'?'A short break':'One small step at your pace');setFocusEnd(Date.now()+minutes*60000);scheduleFocusReminder(owner,data.preferences.data,minutes,kind).catch(()=>{});};
 if(!owner)return <View style={s.page}><Text style={s.heading}>Sign in for your saved plan and notes.</Text><Button onPress={()=>onNavigate('home')}>Back</Button></View>;
 return <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <View style={s.row}><Text style={[s.title,{flex:1}]}>A little structure</Text><Button onPress={()=>onNavigate('companion')}>Companion</Button></View>
  <View style={[s.row,{flexWrap:'wrap'}]}>{[['plan','My day'],['notes','Notes'],['checkin','Check in'],['preferences','Preferences']].map(([id,label])=><Button key={id} onPress={()=>{stopSpeech();setTab(id);}}>{tab===id?'✓ ':''}{label}</Button>)}</View>
  {!!error&&<Text accessibilityRole="alert" style={{color:'#9A2942'}}>{error}</Text>}
  <Button disabled={busy} onPress={()=>run(refresh)}>{busy?'Please wait…':'Refresh'}</Button>
  {data&&tab==='plan'&&<>
   <View style={s.card}><Text style={s.heading}>{data.plan.gentle?'Keep today gentle':'Your next small steps'}</Text><Text style={s.body}>{data.plan.clock.local} · {data.plan.clock.timezone}</Text><Text style={s.muted}>{data.plan.unfinishedCount} unfinished quests · {data.plan.remainingMinutes} minutes recorded. Suggested time today: {data.plan.plannedMinutes} minutes.</Text></View>
   {data.plan.today.map(item=><View key={item.id} style={s.card}><Text style={s.heading}>{item.title}</Text><Text style={s.body}>{item.stepTitle} · Try {item.minutes} minutes{item.overdue?' · Due date passed':''}</Text><View style={s.row}><Button onPress={()=>startFocus(item.minutes)}>Start focus</Button><Button onPress={()=>setQuest(data.quests.find(q=>q.id===item.id))}>Edit steps</Button></View></View>)}
   {!!focusLabel&&<View style={s.card}><Text accessibilityLiveRegion="polite" style={s.heading}>{focusLabel}</Text>{focusEnd>0&&<Text style={s.body}>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</Text>}<View style={s.row}><Button onPress={()=>{cancelFocusReminder();setFocusEnd(0);setFocusLabel('Take a break. Your progress is saved when you mark a step complete.');}}>Pause</Button><Button onPress={()=>startFocus(5,'break')}>5-minute break</Button><Button onPress={()=>{cancelFocusReminder();setFocusEnd(0);setFocusLabel('');}}>Finish</Button><Button onPress={()=>{setTab('notes');setNote({id:requestKey(),revision:0,title:'Focus notes',body:'',pinned:false,questId:null});}}>Jot a note</Button></View></View>}
   {['now','today','later'].map(lane=><View key={lane} style={s.card}><Text style={s.heading}>{lane[0].toUpperCase()+lane.slice(1)}</Text>{data.quests.filter(q=>q.lane===lane).map(q=><View key={q.id}><Button onPress={()=>setQuest(q)}>{q.title} · {q.currentStep}/{q.totalSteps} steps</Button><View style={s.row}>{['now','today','later'].filter(v=>v!==lane).map(v=><Button key={v} disabled={busy} onPress={()=>patchQuest(q,{lane:v})}>Move to {v}</Button>)}</View></View>)}</View>)}
   {quest&&<View style={s.card}>
    <Text style={s.heading}>Edit your quest</Text>
    <Field label="Quest title" value={quest.title} maxLength={120} onChangeText={title=>setQuest({...quest,title})}/>
    <Field label="Description" value={quest.description} multiline maxLength={1000} onChangeText={description=>setQuest({...quest,description})}/>
    <Field label={`Due date and time (${data.preferences.data.timezone})`} placeholder="YYYY-MM-DD HH:mm" value={quest._dueText??dueText(quest.dueAt,data.preferences.data.timezone)} onChangeText={_dueText=>setQuest({...quest,_dueText})}/>
    <Field label="Priority (1–5)" keyboardType="number-pad" value={quest.priority} onChangeText={priority=>setQuest({...quest,priority:Number(priority)})}/>
    <Field label="Energy needed (1–5)" keyboardType="number-pad" value={quest.energyDemand} onChangeText={v=>setQuest({...quest,energyDemand:Number(v)})}/>
    <Button disabled={busy} onPress={()=>{try{patchQuest(quest,{title:quest.title,description:quest.description,dueAt:quest._dueText===undefined?quest.dueAt:dueInstant(quest._dueText,data.preferences.data.timezone),priority:quest.priority,energyDemand:quest.energyDemand});}catch(e){setError(e.message);}}}>Save quest</Button>
    {quest.subtasks.map((step,index)=><View key={step.id} style={s.card}>
     <Field label={`Step ${index+1}`} value={step.title} maxLength={120} onChangeText={title=>setQuest({...quest,subtasks:quest.subtasks.map(s=>s.id===step.id?{...s,title}:s)})}/>
     <Field label="Minutes" keyboardType="number-pad" value={step.estimatedMinutes} onChangeText={v=>setQuest({...quest,subtasks:quest.subtasks.map(s=>s.id===step.id?{...s,estimatedMinutes:Number(v)}:s)})}/>
     <View style={[s.row,{flexWrap:'wrap'}]}>
      <Button disabled={busy} onPress={()=>change({operation:'step_update',id:quest.id,revision:quest.revision,stepId:step.id,title:step.title,estimatedMinutes:step.estimatedMinutes})}>Save step</Button>
      <Button disabled={busy} onPress={()=>change({operation:'step_complete',id:quest.id,revision:quest.revision,stepId:step.id,completed:!step.completed})}>{step.completed?'Undo complete':'Complete'}</Button>
      {index>0&&<Button disabled={busy} onPress={()=>{const ids=quest.subtasks.map(s=>s.id);[ids[index-1],ids[index]]=[ids[index],ids[index-1]];change({operation:'steps_reorder',id:quest.id,revision:quest.revision,ids});}}>Move up</Button>}
      <Button disabled={busy} onPress={()=>ask('Remove this step?',{operation:'step_delete',id:quest.id,revision:quest.revision,stepId:step.id},step.title)}>Delete step</Button>
     </View>
    </View>)}
    <Button disabled={busy} onPress={()=>change({operation:'step_add',id:quest.id,revision:quest.revision,title:'New small step',estimatedMinutes:5})}>Add a step</Button>
    <Button disabled={busy} onPress={()=>ask('Complete this quest?',{operation:'quest_complete',id:quest.id,revision:quest.revision},`Mark every step in “${quest.title}” complete.`)}>Complete quest</Button>
    <Button onPress={()=>setQuest(null)}>Close editor</Button>
   </View>}
  </>}
  {data&&tab==='notes'&&<>
   <Button onPress={()=>setNote({id:requestKey(),revision:0,title:'',body:'',pinned:false,questId:null})}>New note</Button>
   <Field label="Search notes" value={noteSearch} onChangeText={setNoteSearch}/>
   {data.notes.filter(item=>item.title.toLowerCase().includes(noteSearch.toLowerCase())).map(item=><Button key={item.id} disabled={busy} onPress={()=>run(async()=>{const r=await featureApi(`/api/companion/notes/${encodeURIComponent(item.id)}`,undefined,options());if(alive.current)setNote(r.note);})}>{item.pinned?'★ ':''}{item.title}</Button>)}
   {note&&<View style={s.card}>
    <Field label="Note title" value={note.title} maxLength={120} onChangeText={title=>setNote({...note,_dirty:true,title})}/>
    <Field label="Your note" value={note.body} multiline maxLength={30000} onChangeText={body=>setNote({...note,_dirty:true,body})}/>
    <Toggle label="Pin note" value={note.pinned} onValueChange={pinned=>setNote({...note,_dirty:true,pinned})}/>
    <Text style={s.body}>Link to a quest</Text><View style={[s.row,{flexWrap:'wrap'}]}><Button onPress={()=>setNote({...note,_dirty:true,questId:null})}>{!note.questId?'✓ ':''}None</Button>{data.quests.map(q=><Button key={q.id} onPress={()=>setNote({...note,_dirty:true,questId:q.id})}>{q.id===note.questId?'✓ ':''}{q.title}</Button>)}</View>
    <Button disabled={busy} onPress={()=>run(async()=>{stopVoiceConversation();const said=await listenOnce();if(alive.current)setNote(old=>({...old,_dirty:true,body:(old.body+'\n'+said).trim().slice(0,30000)}));})}>Dictate</Button>
    <Button disabled={busy} onPress={()=>change({operation:'note_save',...note})}>Save note</Button>
    {note._dirty&&<Text style={s.muted}>Save your changes before reading this note.</Text>}
    {note.revision>0&&!note._dirty&&<ReadingPanel key={`${note.id}:${note.revision}`} owner={owner} companion={companion} feature="notes" note={note} text={note.body} preferences={data.preferences.data}/>}
    {note.revision>0&&<Button disabled={busy} onPress={()=>ask('Delete this note?',{operation:'note_delete',id:note.id,revision:note.revision},note.title)}>Delete note</Button>}
    <Button onPress={()=>setNote(null)}>Close note</Button>
   </View>}
  </>}
  {data&&tab==='checkin'&&<>
   <View style={s.card}><Text style={s.heading}>How is today feeling?</Text>
    {[['valence','Mood',[-2,-1,0,1,2]],['energy','Energy',[1,2,3,4,5,6,7]],['focus','Focus',[1,2,3,4,5,6,7]]].map(([key,label,values])=><View key={key}><Text style={s.body}>{label} · low to high</Text><View style={[s.row,{flexWrap:'wrap'}]}>{values.map(v=><Button key={v} onPress={()=>setMood({...mood,[key]:v})}>{mood[key]===v?'✓ ':''}{v}</Button>)}</View></View>)}
    <Toggle label="Feeling restless" value={mood.restless} onValueChange={restless=>setMood({...mood,restless})}/>
    <Field label="Anything to remember?" value={mood.notes} multiline maxLength={1000} onChangeText={notes=>setMood({...mood,notes})}/>
    <Button disabled={busy} onPress={()=>change({operation:'check_in',...mood})}>Save check-in</Button>
   </View>
   {data.history.map(item=><View key={item.id} style={s.card}><Text style={s.body}>{new Date(item.recordedAt).toLocaleString()} · Mood {item.valence}, energy {item.energy}, focus {item.focus}</Text><Text style={s.body}>{item.notes}</Text><Button onPress={()=>ask('Delete this check-in?',{operation:'check_in_delete',id:item.id})}>Delete</Button></View>)}
   <Button onPress={()=>setLegacyConfirm(true)}>Review older device check-ins</Button>
   {legacy&&<View style={s.card}><Text style={s.muted}>These older entries are saved on this device for your account.</Text>{legacy.map((row,i)=><Text key={i} style={s.body}>{row.timestamp} · {row.notes||row.mood?.label||row.mood?.id||''}</Text>)}</View>}
  </>}
  {draft&&tab==='preferences'&&<View style={s.card}>
   <Field label="Time zone" value={draft.timezone} onChangeText={timezone=>setDraft({...draft,timezone})}/>
   <Button onPress={()=>setDraft({...draft,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'})}>Use device time zone</Button>
   <Field label="Available minutes per day" value={draft.availableMinutes} keyboardType="number-pad" onChangeText={v=>setDraft({...draft,availableMinutes:Number(v)})}/>
   <Field label="Maximum quests today" value={draft.maxToday} keyboardType="number-pad" onChangeText={v=>setDraft({...draft,maxToday:Number(v)})}/>
   {[['quietStart','Quiet time starts'],['quietEnd','Quiet time ends'],['checkInTime','Check-in time']].map(([key,label])=><Field key={key} label={`${label} (HH:mm)`} value={draft[key]} onChangeText={v=>setDraft({...draft,[key]:v})}/>)}
   {[['reminders','Gentle task reminders'],['checkIns','Daily check-in reminder'],['shareMood','Use recent check-ins in companion replies'],['shareWorkload','Use my workload in companion replies']].map(([key,label])=><Toggle key={key} label={label} value={draft[key]} onValueChange={v=>setDraft({...draft,[key]:v})}/>)}
   <Button disabled={busy} onPress={()=>run(async()=>{const granted=await requestSupportPermission();if(!alive.current)return;if(granted)await scheduleSupportReminders(owner,data.preferences.data);else setError('Allow RiseQuest notifications in your phone settings to receive reminders.');})}>Allow phone reminders</Button>
   {['small_steps','gentle_pacing','steady_sleep','less_stimulation','clear_language','regular_breaks'].map(value=><Toggle key={value} label={value.replace(/_/g,' ')} value={draft.accommodations.includes(value)} onValueChange={v=>setDraft({...draft,accommodations:v?[...draft.accommodations,value]:draft.accommodations.filter(x=>x!==value)})}/>)}
   <Text style={s.heading}>Automatic RisePoints spending</Text><Text style={s.body}>Generated reading: Lumen 25 RP per started 500 characters; other note voices 10 RP per started 250. Replaying saved audio is free. Limits reset at midnight UTC and the start of each UTC month.</Text>
   <Toggle label="Allow automatic RP spending" value={draft.automaticRP.enabled} onValueChange={enabled=>setDraft({...draft,automaticRP:{...draft.automaticRP,enabled}})}/>
   {['reader','notes','conversation'].map(feature=><Toggle key={feature} label={feature} value={draft.automaticRP.features.includes(feature)} onValueChange={v=>setDraft({...draft,automaticRP:{...draft.automaticRP,features:v?[...draft.automaticRP.features,feature]:draft.automaticRP.features.filter(f=>f!==feature)}})}/>)}
   {['dailyCap','monthlyCap'].map(key=><Field key={key} label={key==='dailyCap'?'Daily RP limit':'Monthly RP limit'} value={draft.automaticRP[key]} keyboardType="number-pad" onChangeText={v=>setDraft({...draft,automaticRP:{...draft.automaticRP,[key]:Number(v)}})}/>)}
   <Button disabled={busy} onPress={()=>{const body={operation:'preferences',revision:data.preferences.revision,data:draft,confirmSpending:true};draft.automaticRP.enabled?ask('Save spending choices?',body,`Allow ${draft.automaticRP.features.join(', ')} to spend up to ${draft.automaticRP.dailyCap} RP daily and ${draft.automaticRP.monthlyCap} RP monthly.`):change(body);}}>Save preferences</Button>
   <Button onPress={()=>onNavigate('wallet')}>Automatic card recharge</Button>
  </View>}
  <RiseQuestDialog visible={legacyConfirm} title="Are these your older check-ins?" description="Confirm that the older check-ins on this device belong to you. They will be copied to this account on this device; the original history is kept." confirmLabel="These are mine" cancelLabel="Cancel" busy={busy} error={error} onClose={()=>setLegacyConfirm(false)} onConfirm={()=>run(async()=>{const rows=await claimLegacyMood(owner);if(alive.current){setLegacy(rows);setLegacyConfirm(false);}})}/>
  <RiseQuestDialog visible={!!pending} title={pending?.title} description={pending?.description} busy={busy} error={error} confirmLabel="Confirm" cancelLabel="Cancel" onConfirm={()=>change(pending.body)} onClose={()=>setPending(null)}/>
 </ScrollView>;
}
