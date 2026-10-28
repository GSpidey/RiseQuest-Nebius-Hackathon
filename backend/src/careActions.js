// Proposals contain names and requested changes only. The phone resolves owned
// records, captures current revisions and asks for confirmation before execution.
function validateCareAction(action){
 if(!action||typeof action!=='object'||Array.isArray(action))return null;
 const string=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max;
 const op=action.operation;
 if(op==='care_plan')return {operation:op};
 if(op==='care_checkin')return Number.isInteger(action.valence)&&action.valence>=-2&&action.valence<=2&&Number.isInteger(action.energy)&&action.energy>=1&&action.energy<=7&&Number.isInteger(action.focus)&&action.focus>=1&&action.focus<=7?{operation:op,valence:action.valence,energy:action.energy,focus:action.focus}:null;
 if(op==='care_new_note')return string(action.title,120)&&string(action.body,30000)?{operation:op,title:action.title.trim(),body:action.body}:null;
 if(!string(action.query,120))return null;
 const base={operation:op,query:action.query.trim()};
 if(op==='care_complete')return base;
 if(op==='care_add_step')return string(action.title,120)?{...base,title:action.title.trim()}:null;
 if(op==='care_quest'){
  const c=action.changes;if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).length!==1)return null;
  if(string(c.title,120))return {...base,changes:{title:c.title.trim()}};
  return ['now','today','later'].includes(c.lane)?{...base,changes:{lane:c.lane}}:null;
 }
 if(op==='care_step'){
  if(!string(action.stepQuery,120)||!['complete','undo','delete','rename'].includes(action.change))return null;
  if(action.change==='rename'&&!string(action.title,120))return null;
  return {...base,stepQuery:action.stepQuery.trim(),change:action.change,...(action.change==='rename'?{title:action.title.trim()}:{})};
 }
 if(op==='care_note'){
  if(!['read','delete','pin','unpin','edit'].includes(action.change)||action.change==='edit'&&!string(action.body,30000))return null;
  return {...base,change:action.change,...(action.change==='edit'?{body:action.body}:{})};
 }
 return null;
}
module.exports={validateCareAction};
