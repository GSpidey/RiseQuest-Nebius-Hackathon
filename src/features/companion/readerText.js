// Optional cleanup is local and reversible; extracted text never enters action parsing.
export function removeRepeatedHeaders(text){
 const pages=String(text).split(/\f|\n\s*\n/),counts=new Map();
 for(const page of pages){const line=page.trim().split('\n')[0]?.trim();if(line&&line.length<=120)counts.set(line,(counts.get(line)||0)+1);}
 return pages.map(page=>{const lines=page.trim().split('\n'),first=lines[0]?.trim();return counts.get(first)>=3?lines.slice(1).join('\n'):page;}).join('\n\n');
}
export function dueText(value,timezone){
 if(!value)return '';const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
export function dueInstant(value,timezone){
 if(!value.trim())return null;
 const m=value.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)$/);if(!m)throw Error('Use a date and time such as 2026-10-28 14:30.');
 const desired=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);let result=desired;
 for(let i=0;i<4;i++){
  const formatted=dueText(new Date(result).toISOString(),timezone),parts=formatted.match(/\d+/g).map(Number);
  const local=Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4]);result+=desired-local;
 }
 const iso=new Date(result).toISOString();if(dueText(iso,timezone)!==value)throw Error('That time is unavailable in your time zone. Choose another time.');return iso;
}
