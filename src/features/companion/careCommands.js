import {getAuthToken} from '../../services/AuthTokenStorage';
import {requestKey,supportSnapshot,supportChange} from './supportClient';
import {featureApi} from '../api';
const normal=s=>String(s||'').trim().toLowerCase().replace(/[.!?]+$/,'');
export function parseCareCommand(message){
 const text=String(message||'').trim().replace(/^please\s+/i,'').replace(/[.!?]+$/,'');
 if(/\b(?:don't|do not|unless|instead)\b/i.test(text))return null;
 let m;
 if(/^(?:plan my day|help me plan (?:my |the )?day|what should i (?:do|work on) (?:now|today)|what is next)$/i.test(text))return {operation:'care_plan'};
 if((m=text.match(/^move (?:quest |task )?(.+?) to (now|today|later)$/i)))return {operation:'care_quest',query:m[1],changes:{lane:m[2].toLowerCase()}};
 if((m=text.match(/^rename (?:quest|task) (.+?) to (.+)$/i)))return {operation:'care_quest',query:m[1],changes:{title:m[2].slice(0,120)}};
 if((m=text.match(/^(?:complete|finish) (?:quest|task) (.+)$/i)))return {operation:'care_complete',query:m[1]};
 if((m=text.match(/^add step (.+?) to (?:quest |task )?(.+)$/i)))return {operation:'care_add_step',query:m[2],title:m[1].slice(0,120)};
 if((m=text.match(/^(complete|undo|delete) step (.+?) (?:in|from) (?:quest |task )?(.+)$/i)))return {operation:'care_step',query:m[3],stepQuery:m[2],change:m[1].toLowerCase()};
 if((m=text.match(/^rename step (.+?) in (?:quest |task )?(.+?) to (.+)$/i)))return {operation:'care_step',query:m[2],stepQuery:m[1],change:'rename',title:m[3].slice(0,120)};
 if((m=text.match(/^(?:save|create) note (.+?):\s*(.+)$/i)))return {operation:'care_new_note',title:m[1].slice(0,120),body:m[2].slice(0,30000)};
 if((m=text.match(/^(read|delete|pin|unpin) (?:my |the )?note (.+)$/i)))return {operation:'care_note',query:m[2],change:m[1].toLowerCase()};
 if((m=text.match(/^edit note (.+?):\s*(.+)$/i)))return {operation:'care_note',query:m[1],change:'edit',body:m[2].slice(0,30000)};
 if((m=text.match(/^check in mood (-?[0-2]) energy ([1-7]) focus ([1-7])$/i)))return {operation:'care_checkin',valence:Number(m[1]),energy:Number(m[2]),focus:Number(m[3])};
 return null;
}
export function createCareManager({isCurrent,readNote}){
 const guard=()=>{if(!isCurrent())throw Error('Your account or screen changed. Please ask again.');};
 async function prepare(request,selectedId){
  guard();const token=await getAuthToken();guard();const state=await supportSnapshot({expectedToken:token});guard();
  if(request.operation==='care_plan')return {reply:state.plan.today.length?`It is ${state.plan.clock.local}. ${state.plan.gentle?'Let’s keep today gentle. ':''}Try ${state.plan.today.map(q=>`${q.stepTitle} for ${q.minutes} minutes`).join(', then ')}. There are ${state.plan.unfinishedCount} unfinished quests; the rest can wait.`:'Your plan is clear. Create a quest when you have something to work on.'};
  let body,prompt,note;
  if(request.operation==='care_checkin'){body={operation:'check_in',valence:request.valence,energy:request.energy,focus:request.focus,notes:'',restless:false};prompt=`Save mood ${request.valence}, energy ${request.energy}, focus ${request.focus}?`;}
  else if(request.operation==='care_new_note'){body={operation:'note_save',id:requestKey(),revision:0,title:request.title,body:request.body,pinned:false};prompt=`Save note “${request.title}”: ${request.body}?`;}
  else{
   const notes=request.operation==='care_note';
   const records=notes?state.notes:state.quests;
   const exact=records.filter(r=>normal(r.title)===normal(request.query));
   const matches=exact.length?exact:records.filter(r=>normal(r.title).includes(normal(request.query)));
   const selected=selectedId?matches.find(r=>r.id===selectedId):matches.length===1?matches[0]:null;
   if(!selected){if(!matches.length)return {reply:'I could not find that name in your saved items. Try its full title.'};const choices=matches.slice(0,12).map(r=>({id:r.id,label:r.title,names:[r.title]}));return {selection:{request,choices},reply:`Which one? ${choices.map((r,i)=>`${i+1}. ${r.label}`).join('; ')}`};}
   if(notes){
    ({note}=await featureApi(`/api/companion/notes/${encodeURIComponent(selected.id)}`,undefined,{expectedToken:token}));guard();
    if(request.change==='read'){body={operation:'read_note',id:note.id,revision:note.revision};prompt=`Read ${note.body.length>3000?'the first passage of ':''}“${note.title}” with the free device voice?`;}
    else if(request.change==='delete'){body={operation:'note_delete',id:note.id,revision:note.revision};prompt=`Delete note “${note.title}”?`;}
    else{body={operation:'note_save',id:note.id,revision:note.revision,title:note.title,body:request.change==='edit'?request.body:note.body,questId:note.questId,pinned:request.change==='pin'?true:request.change==='unpin'?false:note.pinned};prompt=`${request.change} note “${note.title}”${request.change==='edit'?': '+request.body:''}?`;}
   }else{
    body={id:selected.id,revision:selected.revision};
    if(request.operation==='care_quest'){Object.assign(body,{operation:'quest_update',changes:request.changes});prompt=`Change “${selected.title}”: ${request.changes.title?`rename to “${request.changes.title}”`:`move to ${request.changes.lane}`}?`;}
    if(request.operation==='care_complete'){body.operation='quest_complete';prompt=`Mark all steps in “${selected.title}” complete?`;}
    if(request.operation==='care_add_step'){Object.assign(body,{operation:'step_add',title:request.title,estimatedMinutes:5});prompt=`Add “${request.title}” to “${selected.title}” with a five-minute estimate?`;}
    if(request.operation==='care_step'){
     const steps=selected.subtasks.filter(s=>normal(s.title)===normal(request.stepQuery)||String(s.order)===request.stepQuery);
     if(steps.length!==1)return {reply:`Please use the exact step title or step number in “${selected.title}”.`};
     const step=steps[0];body.stepId=step.id;
     if(request.change==='delete')body.operation='step_delete';
     else if(request.change==='rename')Object.assign(body,{operation:'step_update',title:request.title});
     else Object.assign(body,{operation:'step_complete',completed:request.change==='complete'});
     prompt=`${request.change} step “${step.title}” in “${selected.title}”${request.title?` to “${request.title}”`:''}?`;
    }
   }
  }
  body.key=requestKey();return {action:{type:'care',body,prompt,token},reply:prompt+' Say yes or cancel.'};
 }
 async function execute(action){guard();if(action.body.operation==='read_note'){
  const {note}=await featureApi(`/api/companion/notes/${encodeURIComponent(action.body.id)}`,undefined,{expectedToken:action.token});guard();if(note.revision!==action.body.revision)throw Error('That note changed. Please ask again.');await readNote(note.body);return note.body.length>3000?'Open Notes to continue with the next passage.':'Reading finished.';
 }await supportChange(action.body,{expectedToken:action.token});guard();return 'Saved.';}
 return {prepare,execute};
}
