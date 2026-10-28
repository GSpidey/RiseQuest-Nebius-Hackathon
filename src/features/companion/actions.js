import {validateCareAction} from '../../../backend/src/careActions';
// Keep navigation explicit and bounded. Opening a destination never purchases,
// saves an alarm, changes a profile, or bypasses that screen's access checks.
export const companionDestinations = {
  care:['day','my day','daily plan','planner'],
  notes:['notes','my notes'],
  checkin:['check in','checkin'],
  reader:['reader','reading','read with lumen'],
  home: ['home', 'today', 'dashboard'],
  alarms: ['alarms', 'alarm', 'alarm list'],
  quests: ['quests', 'quest', 'tasks', 'task list'],
  sleep: ['sleep', 'sleep log', 'sleep and recovery'],
  wallet: ['wallet', 'rise points', 'risepoints'],
  'mini-games': ['mini games', 'minigames', 'games', 'challenges'],
  routine: ['routine', 'daily routine', 'briefing', 'daily briefing'],
  'brain-training': ['brain training', 'mind practice', 'adaptive mind practice'],
  wellness: ['wellness', 'mood', 'mood check in'],
  coach: ['coach', 'coaching', 'coaching insights'],
  companion: ['companion', 'companions', 'companion chat'],
  settings: ['settings'],
  location: ['location', 'smart location'],
  social: ['wake buddies', 'wake buddy', 'social', 'emergency tools'],
  community: ['community'],
  family: ['family', 'family profiles'],
  'smart-wake': ['smart wake'],
  'advanced-alarms': ['advanced alarms'],
  more: ['more', 'tools'],
  shop: ['shop', 'store', 'cosmetic store', 'collection'],
  premium: ['premium', 'subscription', 'subscriptions', 'plans'],
  profile: ['profile', 'my profile'],
  support: ['support', 'help center', 'help centre'],
};
const normalizeCommand = text => String(text || '').toLowerCase().trim()
  .replace(/[.!?]+$/g, '').replace(/,/g, '').replace(/[-–—]/g, ' ').replace(/\s+/g, ' ');
function navigationTarget(text) {
  return normalizeCommand(text).replace(/^please /, '')
    .replace(/^(?:can|could|would|will) you (?:please )?/, '')
    .match(/^(?:open|show me|take me to|go to|navigate to|bring me to) (.+)$/)?.[1];
}
export function isNavigationRequest(text) {
  const target = navigationTarget(text);
  return Boolean(target && !/\b(?:don't|do not|not|instead|but|unless|if)\b/.test(target));
}
export function directNavigation(text) {
  if (!isNavigationRequest(text)) return null;
  const target = navigationTarget(text).replace(/ please$/, '').replace(/^(?:my|the) /, '')
    .replace(/ (?:screen|page|tab|section)$/, '');
  return Object.keys(companionDestinations).find(screen => companionDestinations[screen].includes(target)) || null;
}
export function confirmationIntent(text) {
  const value = normalizeCommand(text);
  if (/^(?:yes|yeah|yep|sure|okay|ok|confirm|go ahead|do it|please do|yes do it|yes go ahead)(?: please)?$/.test(value)) return 'confirm';
  if (/^(?:no|nope|cancel|cancel that|never mind|nevermind|don't|do not)(?: thanks| thank you| please)?$/.test(value)) return 'cancel';
  return null;
}
export function validCompanionAction(action) {
  if (!action || typeof action !== 'object') return null;
  if(action.type==='care'){const proposal=validateCareAction(action);return proposal?{type:'care',...proposal}:null;}
  if (action.type === 'manage') {
    const operations = ['alarm_delete','alarm_rename','alarm_time','alarm_enable','alarm_disable','quest_delete','item_buy','item_equip','item_unequip'];
    if (!operations.includes(action.operation) || typeof action.query !== 'string' || action.query.length > 120) return null;
    const result = {type:'manage',operation:action.operation,query:action.query.trim()};
    if (action.operation === 'alarm_rename') {
      if (typeof action.label !== 'string' || !action.label.trim() || action.label.length > 60) return null;
      result.label = action.label.trim();
    }
    if (action.operation === 'alarm_time') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(action.time)) return null;
      result.time = action.time;
    }
    if (action.operation.startsWith('item_')) {
      if (!['themes','badges','sounds','animations'].includes(action.itemType)) return null;
      result.itemType = action.itemType;
    }
    return result;
  }
  if (action.type === 'navigate' && Object.prototype.hasOwnProperty.call(companionDestinations, action.screen)) return {type:'navigate', screen:action.screen};
  if (action.type === 'briefing') return {type:'navigate', screen:'routine'};
  if (action.type === 'alarm' && /^([01]\d|2[0-3]):[0-5]\d$/.test(action.time)) return {type:'alarm', time:action.time, label:String(action.label || 'Wake up').slice(0,60)};
  if (action.type === 'quest' && typeof action.title === 'string' && action.title.trim() && action.title.length <= 120) return {type:'quest', title:action.title.trim(), description:String(action.description || '').slice(0,1000)};
  return null;
}
export function actionPrompt(action) {
  if (action.type === 'manage'||action.type==='care') return action.prompt || 'Review this change, then say yes or cancel.';
  if (action.type === 'navigate') return `Open ${companionDestinations[action.screen][0]}? Say yes or cancel, or use the buttons below.`;
  if (action.type === 'alarm') return `Prepare an alarm for ${action.time}: ${action.label}? Say yes or cancel. You can review its settings before saving.`;
  return `Create “${action.title}” and break it into steps? Say yes or cancel.`;
}

// Resolve explicit management commands locally, including when live chat is unavailable.
// Names/IDs and prices are resolved from the signed-in app, never from the model.
export function parseAlarmTime(value) {
  const m=String(value||'').trim().toLowerCase().replace(/\./g,'').match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if(!m)return null;
  let hour=Number(m[1]);const minute=Number(m[2]||0);
  if(minute>59 || (m[3]?(hour<1||hour>12):hour>23))return null;
  if(m[3])hour=hour%12+(m[3]==='pm'?12:0);
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
const cleanTarget=value=>String(value||'').trim().replace(/^(?:my|the|an?|named|called)\s+/i,'').replace(/^(?:named|called)\s+/i,'').replace(/^[“"']|[”"']$/g,'').trim();
export function directManagement(text) {
  const original=String(text||'').trim().replace(/[.!?]+$/g,'').replace(/^please\s+/i,'').replace(/^(?:can|could|would|will) you (?:please )?/i,'').replace(/\s+please$/i,'');
  if(/\b(?:don't|do not|not|unless|instead|but|and|all|every)\b/i.test(original))return null;
  let m,action;
  if((m=original.match(/^(?:delete|remove)\s+(?:(?:my|the|an?)\s+)?(alarm|quest|task)(?:\s+(.+))?$/i)))
    action={type:'manage',operation:m[1].toLowerCase()==='alarm'?'alarm_delete':'quest_delete',query:cleanTarget(m[2])};
  else if((m=original.match(/^(?:delete|remove)\s+(.+?)\s+(alarm|quest|task)$/i)))
    action={type:'manage',operation:m[2].toLowerCase()==='alarm'?'alarm_delete':'quest_delete',query:cleanTarget(m[1])};
  else if((m=original.match(/^rename\s+(?:(?:my|the)\s+)?alarm(?:\s+(.+?))?\s+to\s+(.+)$/i)) || (m=original.match(/^rename\s+(.+?)\s+alarm\s+to\s+(.+)$/i)))
    action={type:'manage',operation:'alarm_rename',query:cleanTarget(m[1]),label:cleanTarget(m[2])};
  else if((m=original.match(/^change\s+(?:the\s+)?time\s+of\s+(?:my\s+|the\s+)?alarm(?:\s+(.+?))?\s+to\s+(.+)$/i)) || (m=original.match(/^(?:change|set|move)\s+(?:(?:my|the)\s+)?alarm(?:\s+(?:named\s+)?(.+?))?\s+to\s+(.+)$/i)) || (m=original.match(/^(?:change|set|move)\s+(.+?)\s+alarm(?:\s+time)?\s+to\s+(.+)$/i)))
    action={type:'manage',operation:'alarm_time',query:cleanTarget(m[1]==='time'?'':m[1]),time:parseAlarmTime(m[2])};
  else if((m=original.match(/^(enable|disable|turn on|turn off)\s+(?:(?:my|the)\s+)?alarm(?:\s+(.+))?$/i)) || (m=original.match(/^(enable|disable|turn on|turn off)\s+(.+?)\s+alarm$/i)))
    action={type:'manage',operation:/^(enable|turn on)$/i.test(m[1])?'alarm_enable':'alarm_disable',query:cleanTarget(m[2])};
  else if((m=original.match(/^(buy|purchase|equip|use|unequip)\s+(?:(?:my|the|a)\s+)?(theme|badge|sound|animation)(?:\s+(.+))?$/i)) || (m=original.match(/^(buy|purchase|equip|use|unequip)\s+(.+?)\s+(theme|badge|sound|animation)$/i))){
    const typeFirst=/^(theme|badge|sound|animation)$/i.test(m[2]);
    const itemType=(typeFirst?m[2]:m[3]).toLowerCase()+'s';
    action={type:'manage',operation:/^(buy|purchase)$/i.test(m[1])?'item_buy':m[1].toLowerCase()==='unequip'?'item_unequip':'item_equip',query:cleanTarget(typeFirst?m[3]:m[2]),itemType};
  }
  return validCompanionAction(action);
}
export function isManagementRequest(text) {
  return /\b(?:delete|remove|rename|change|move|disable|enable|buy|purchase|equip|unequip)\b/i.test(text) && /\b(?:alarm|quest|task|theme|badge|sound|animation)\b/i.test(text);
}
