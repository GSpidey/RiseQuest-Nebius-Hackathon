const normal = text => String(text || '').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9:]+/g,' ').trim();
const fingerprint = (record, kind) => JSON.stringify(kind === 'alarm' ? record : {
  id:record.id,userId:record.userId,title:record.title,updatedAt:record.updatedAt,status:record.status,progress:record.progress,
});
function alarmNames(alarm) {
  const [h,m]=String(alarm.time||'').split(':').map(Number),period=h>=12?'pm':'am',hour=h%12||12;
  return [alarm.label,alarm.time,`${alarm.label} at ${alarm.time}`,`${hour}:${String(m).padStart(2,'0')} ${period}`,`${hour}:${String(m).padStart(2,'0')}${period}`,
    ...(m===0?[`${hour} ${period}`,`${hour}${period}`]:[])];
}
function matches(query, row) {
  const q=normal(query).replace(/^(?:named|called|at|for) /,'');
  return !q || row.names.some(name=>normal(name)===q);
}
function choose(rows, query) {
  const exact=rows.filter(row=>matches(query,row));
  if(exact.length || !query)return exact;
  const q=normal(query).replace(/^(?:named|called|at|for) /,'');
  return rows.filter(row=>row.names.some(name=>normal(name).includes(q)));
}
function chooseManagementOption(selection, text) {
  const n=normal(text).replace(/^(?:the|number|option) /,'').replace(/ one$/,'');
  const words=['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth'];
  const numbers=['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  let index=/^\d+$/.test(n)?Number(n)-1:words.indexOf(n);
  if(index<0)index=numbers.indexOf(n);
  if(index>=0)return selection.choices[index]?.id || null;
  const rows=choose(selection.choices,n);
  return rows.length===1?rows[0].id:null;
}
function createCompanionManager(deps) {
  const guard=()=>{if(!deps.isCurrent())throw Error('Your account or current screen changed. Please ask again.');};
  async function rowsFor(request) {
    guard();
    let rows;
    if(request.operation.startsWith('alarm_'))rows=deps.getAlarms().map(a=>({id:String(a.id),label:`${a.label || 'Alarm'} at ${a.time}`,names:alarmNames(a),record:a}));
    else if(request.operation==='quest_delete')rows=(await deps.listQuests()).filter(q=>q.userId===deps.owner).map(q=>({id:String(q.id),label:q.title,names:[q.title],record:q}));
    else {
      const collection=await deps.getCollection();
      const source=request.operation==='item_buy'?collection.catalog:collection.inventory;
      rows=(source||[]).filter(i=>i.type===request.itemType).map(i=>({id:String(i.id),label:i.name,names:[i.name,i.id],record:i}));
    }
    guard();return rows;
  }
  async function prepare(request, selectedId=null) {
    const rows=await rowsFor(request);
    const found=selectedId?rows.filter(row=>row.id===selectedId):choose(rows,request.query);
    if(!found.length)return {reply:request.operation==='item_buy'?'I could not find that item in the shop. Tell me its name.':`I could not find a matching ${request.operation.startsWith('alarm_')?'alarm':request.operation==='quest_delete'?'quest':'owned item'}. Tell me its name.`};
    if(found.length>1){
      if(found.length>12)return {reply:'Several match. Tell me a more specific name so I can choose the right one.'};
      const choices=found.map(({id,label,names})=>({id,label,names}));
      return {reply:`Which one? ${choices.map((c,i)=>`${i+1}. ${c.label}`).join('; ')}. Say its number or name.`,selection:{request,choices,owner:deps.owner}};
    }
    const target=found[0], op=request.operation;
    const action={...request,type:'manage',owner:deps.owner,targetId:target.id,targetLabel:target.label};
    let prompt;
    if(op.startsWith('alarm_')){
      action.expectedRecord=fingerprint(target.record,'alarm');
      const verbs={alarm_delete:`Delete “${target.label}”?`,alarm_rename:`Rename “${target.label}” to “${request.label}”?`,alarm_time:`Change “${target.label}” to ${request.time}?`,alarm_enable:`Enable “${target.label}”?`,alarm_disable:`Disable “${target.label}”?`};
      prompt=verbs[op];
    } else if(op==='quest_delete'){
      action.expectedRecord=fingerprint(target.record,'quest');prompt=`Delete the quest “${target.label}” and its steps?`;
    } else {
      const collection=await deps.getCollection();guard();
      if(op==='item_buy'){
        if(collection.inventory.some(i=>i.id===target.id))return {reply:`“${target.label}” is already in your collection. You can ask me to equip it.`};
        const quote=await deps.quote({itemIds:[target.id]});guard();
        if(!Number.isSafeInteger(quote.amount)||quote.amount<0)throw Error('Please review this item in the shop.');
        action.expectedAmount=quote.amount;action.parentApproval=Boolean(collection.requiresParentApproval);
        action.key=`companion_${Date.now()}_${Math.random().toString(36).slice(2,14)}`;
        prompt=action.parentApproval?`Ask your parent to buy “${target.label}” for ${quote.amount} Rise Points?`:`Buy “${target.label}” for ${quote.amount} Rise Points?`;
      }else{
        const slot={themes:'themeId',badges:'badgeIds',sounds:'soundId',animations:'animationId'}[request.itemType];
        if(!slot)throw Error('Choose an item from your collection.');
        const previous=collection.loadout[slot] ?? (slot==='badgeIds'?[]:null);
        if((slot==='badgeIds'?previous.includes(target.id):previous===target.id)===(op==='item_equip'))return {reply:op==='item_equip'?`“${target.label}” is already equipped.`:`“${target.label}” is not equipped.`};
        action.slot=slot;action.previous=JSON.stringify(previous);
        action.itemId=slot==='badgeIds'?(op==='item_equip'?[...previous,target.id]:previous.filter(id=>id!==target.id)):(op==='item_equip'?target.id:null);
        if(slot==='badgeIds'&&action.itemId.length>3)return {reply:'You already display three badges. Ask me to unequip one, then equip this badge.'};
        prompt=`${op==='item_equip'?'Equip':'Unequip'} “${target.label}”?`;
      }
    }
    action.prompt=prompt+' Say yes or cancel.';
    return {action,reply:action.prompt};
  }
  async function execute(action) {
    guard();if(action.owner!==deps.owner)throw Error('Please ask again from the account that owns this item.');
    const op=action.operation;
    const rows=await rowsFor(action), target=rows.find(row=>row.id===action.targetId);
    if(!target)throw Error('That item is no longer available. Please ask again.');
    if(op.startsWith('alarm_')){
      if(fingerprint(target.record,'alarm')!==action.expectedRecord)throw Error('That alarm changed. Please ask again to review its current settings.');
      guard();
      if(op==='alarm_delete'){await deps.removeAlarm(target.record);return `Deleted “${action.targetLabel}”.`;}
      const changes=op==='alarm_rename'?{label:action.label}:op==='alarm_time'?{time:action.time}:{isEnabled:op==='alarm_enable'};
      await deps.updateAlarm(target.record,changes);
      return `Updated “${action.targetLabel}”${op==='alarm_time'?` to ${action.time}`:op==='alarm_rename'?` to “${action.label}”`:''}.`;
    }
    if(op==='quest_delete'){
      if(fingerprint(target.record,'quest')!==action.expectedRecord)throw Error('That quest changed. Please ask again to review it.');
      guard();await deps.removeQuest(target.id);return `Deleted the quest “${action.targetLabel}”.`;
    }
    const collection=await deps.getCollection();guard();
    if(op==='item_buy'){
      if(Boolean(collection.requiresParentApproval)!==action.parentApproval)throw Error('Your purchase settings changed. Please ask again.');
      if(collection.inventory.some(i=>i.id===target.id))return `“${action.targetLabel}” is already in your collection.`;
      await deps.buy(action.parentApproval?'requests':'purchase',{itemIds:[target.id],expectedAmount:action.expectedAmount,key:action.key});
      return action.parentApproval?'Your purchase request is ready for your parent in Family profiles.':`“${action.targetLabel}” is in your collection. Ask me to equip it when you are ready.`;
    }
    const previous=collection.loadout[action.slot] ?? (action.slot==='badgeIds'?[]:null);
    if(JSON.stringify(previous)!==action.previous)throw Error('Your equipped items changed. Please ask again to review them.');
    await deps.equip({slot:action.slot,itemId:action.itemId},target.record);
    return `${op==='item_equip'?'Equipped':'Unequipped'} “${action.targetLabel}”.`;
  }
  return {prepare,execute};
}
module.exports={createCompanionManager,chooseManagementOption};
