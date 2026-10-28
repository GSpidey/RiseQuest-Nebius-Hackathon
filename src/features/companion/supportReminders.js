import PushNotification from 'react-native-push-notification';
let generation=0,focusGeneration=0;
const ids=Array.from({length:24},(_,i)=>String(860100+i));
export function cancelFocusReminder(){focusGeneration++;PushNotification.cancelLocalNotification(ids[23]);}
export function cancelSupportReminders(){generation++;cancelFocusReminder();ids.forEach(id=>PushNotification.cancelLocalNotification(id));}
export async function requestSupportPermission(){
 await PushNotification.requestPermissions();
 return new Promise(resolve=>PushNotification.checkPermissions(p=>resolve(!!p.alert)));
}
export async function scheduleFocusReminder(owner,p,minutes,kind='focus',now=new Date()){
 cancelFocusReminder();const version=focusGeneration;
 if(!owner||!p.reminders||!Number.isFinite(minutes)||minutes<1||minutes>60)return;
 const date=new Date(now.getTime()+minutes*60000);
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:p.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
 const quiet=p.quietStart!==p.quietEnd&&(p.quietStart<p.quietEnd?time>=p.quietStart&&time<p.quietEnd:time>=p.quietStart||time<p.quietEnd);
 if(quiet)return;
 const granted=await new Promise(resolve=>PushNotification.checkPermissions(resolve));
 if(version!==focusGeneration||!granted.alert)return;
 PushNotification.createChannel({channelId:'companion-care',channelName:'Gentle companion reminders',importance:3,vibrate:false},()=>{});
 PushNotification.localNotificationSchedule({id:ids[23],channelId:'companion-care',title:'A gentle pause',
 message:kind==='break'?'Your short break has ended. Continue when you are ready.':'Your focus time has ended. Pause or record a small step when you are ready.',
 date,allowWhileIdle:false,playSound:false,userInfo:{kind:'companion-care',owner,screen:'care'}});
}
export function reminderDates(p,now=new Date()){
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:p.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit'});
 const result=[],seen=new Set();
 for(let ms=Math.ceil((now.getTime()+60000)/60000)*60000;ms<now.getTime()+8*86400000;ms+=60000){
  const parts=Object.fromEntries(formatter.formatToParts(new Date(ms)).map(v=>[v.type,v.value]));
  const time=`${parts.hour}:${parts.minute}`,day=`${parts.year}-${parts.month}-${parts.day}`;
  const quiet=p.quietStart===p.quietEnd?false:p.quietStart<p.quietEnd?time>=p.quietStart&&time<p.quietEnd:time>=p.quietStart||time<p.quietEnd;
  if(quiet)continue;
  for(const [enabled,target,kind] of [[p.checkIns,p.checkInTime,'checkin'],[p.reminders,p.quietEnd,'plan']]){
   const key=day+kind;if(enabled&&time===target&&!seen.has(key)){seen.add(key);result.push({date:new Date(ms),kind});}
  }
 }
 return result.slice(0,16);
}
export async function scheduleSupportReminders(owner,p){
 cancelSupportReminders();const version=generation;if(!owner||!p.reminders&&!p.checkIns)return;
 PushNotification.createChannel({channelId:'companion-care',channelName:'Gentle companion reminders',importance:3,vibrate:false},()=>{});
 const granted=await new Promise(resolve=>PushNotification.checkPermissions(resolve));
 if(version!==generation||!granted.alert)return; // Saving preference does not silently open a permission prompt.
 reminderDates(p).forEach(({date,kind},i)=>PushNotification.localNotificationSchedule({id:ids[i],channelId:'companion-care',title:'A moment for you',
 message:kind==='checkin'?'How are your energy and focus today?':'Choose one small step for today.',date,allowWhileIdle:false,playSound:false,
 userInfo:{kind:'companion-care',owner,screen:kind==='checkin'?'checkin':'care'}}));
}
