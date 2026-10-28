const PRICE_VERSION = 'reader-2026-10-26-v1';
const fail = (message, status = 400) => Object.assign(Error(message), {status});
const integer = (v, min, max, label) => {if (!Number.isSafeInteger(v) || v < min || v > max) throw fail(`Choose a valid ${label}.`); return v;};
const text = (v, max, label, empty = false) => {if (typeof v !== 'string' || v.length > max || (!empty && !v.trim())) throw fail(`Enter a valid ${label}.`); return v.trim();};
function zone(value) {try {new Intl.DateTimeFormat('en', {timeZone:value}).format();} catch (_) {throw fail('Choose a valid time zone.');} return value;}
const defaults = () => ({timezone:'UTC',availableMinutes:60,maxToday:3,quietStart:'21:00',quietEnd:'08:00',checkInTime:'09:00',
  reminders:false,checkIns:false,shareMood:false,shareWorkload:true,accommodations:[],automaticRP:{enabled:false,features:[],dailyCap:100,monthlyCap:1000,priceVersion:PRICE_VERSION}});
function preferences(input = {}, previous = defaults()) {
  const p = {...previous, ...input};
  const allowed = Object.keys(defaults());
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k=>!allowed.includes(k))) throw fail('Review these preferences.');
  p.timezone=zone(text(p.timezone,100,'time zone'));
  integer(p.availableMinutes,5,720,'daily minutes'); integer(p.maxToday,1,10,'daily quest limit');
  for(const key of ['quietStart','quietEnd','checkInTime']) if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p[key]))throw fail('Use hours and minutes for reminder times.');
  for(const key of ['reminders','checkIns','shareMood','shareWorkload']) if(typeof p[key]!=='boolean')throw fail('Review your reminder and sharing choices.');
  if(!Array.isArray(p.accommodations)||p.accommodations.length>6||p.accommodations.some(v=>!['small_steps','gentle_pacing','steady_sleep','less_stimulation','clear_language','regular_breaks'].includes(v)))throw fail('Choose a listed support preference.');
  const a=p.automaticRP;
  if(!a||typeof a.enabled!=='boolean'||!Array.isArray(a.features)||a.features.some(v=>!['reader','notes','conversation'].includes(v)))throw fail('Choose the features allowed to use RP.');
  integer(a.dailyCap,1,100000,'daily RP cap');integer(a.monthlyCap,1,1000000,'monthly RP cap');
  if(a.dailyCap>a.monthlyCap)throw fail('Daily RP cap must fit within the monthly cap.');
  if(a.enabled&&(a.priceVersion!==PRICE_VERSION||!a.features.length))throw fail('Review the current voice price and choose a feature.');
  p.automaticRP={enabled:a.enabled,features:[...new Set(a.features)],dailyCap:a.dailyCap,monthlyCap:a.monthlyCap,priceVersion:a.priceVersion};
  return p;
}
function clock(now, timezone) {const f=new Intl.DateTimeFormat('en-CA',{timeZone:zone(timezone),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  return {iso:now.toISOString(),timezone,local:f.format(now)};}
function plan(quests, p, mood, sleep, now=new Date()) {
  const freshMood=mood&&now-new Date(mood.recordedAt)>=0&&now-new Date(mood.recordedAt)<86400000?mood:null;
  const freshSleep=sleep&&now-new Date(sleep.wakeAt)>=0&&now-new Date(sleep.wakeAt)<36*3600000?sleep:null;
  const gentle=!!(freshMood&&(freshMood.energy<=2||freshMood.focus<=2||freshMood.restless)||freshSleep&&freshSleep.durationMinutes<360);
  let remaining=Math.floor(p.availableMinutes*(gentle?.5:.8));
  const budget=remaining;
  const rows=quests.filter(q=>q.status!=='completed').map(q=>({...q,remainingMinutes:(q.subtasks||[]).filter(s=>!s.completed).reduce((n,s)=>n+Math.max(1,s.estimatedMinutes||5),0)||Math.max(5,q.estimatedTotalMinutes||5)}));
  const sorted=[...rows].sort((a,b)=>Number(b.lane==='now')-Number(a.lane==='now')||
    (a.dueAt?new Date(a.dueAt).getTime():Infinity)-(b.dueAt?new Date(b.dueAt).getTime():Infinity)||b.priority-a.priority);
  const today=[];
  for(const q of sorted){
    if(today.length>=p.maxToday||remaining<=0)break;
    const step=(q.subtasks||[]).find(s=>!s.completed);
    const minutes=Math.min(remaining,p.accommodations.includes('small_steps')?5:gentle?10:25,step?.estimatedMinutes||q.remainingMinutes);
    today.push({id:q.id,title:q.title,revision:q.revision,lane:q.lane,dueAt:q.dueAt,remainingMinutes:q.remainingMinutes,
      stepId:step?.id||null,stepTitle:step?.title||q.title,minutes,startOnly:minutes<q.remainingMinutes,overdue:!!q.dueAt&&new Date(q.dueAt)<now});
    remaining-=minutes;
  }
  return {clock:clock(now,p.timezone),gentle,budgetMinutes:budget,plannedMinutes:budget-remaining,unfinishedCount:rows.length,
    remainingMinutes:rows.reduce((n,q)=>n+q.remainingMinutes,0),today,later:rows.filter(q=>!today.some(t=>t.id===q.id)).map(q=>({id:q.id,title:q.title,lane:q.lane,dueAt:q.dueAt})),
    recentCheckIn:freshMood?{energy:freshMood.energy,focus:freshMood.focus,restless:freshMood.restless,recordedAt:freshMood.recordedAt}:null};
}
module.exports={PRICE_VERSION,fail,integer,text,zone,defaults,preferences,clock,plan};
