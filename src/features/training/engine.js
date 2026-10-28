const GAMES = Object.freeze([
 {id:'math',name:'Number paths',domain:'reasoning',description:'Gentle arithmetic that follows your progress'},
 {id:'memory',name:'Memory garden',domain:'memory',description:'Remember a growing pattern of tiles'},
 {id:'sorting',name:'Order & flow',domain:'attention',description:'Put mixed numbers into ascending order'},
 {id:'typing',name:'Word rhythm',domain:'language',description:'Practice a short phrase at your own pace'},
 {id:'audio',name:'Echo trail',domain:'auditory',description:'Listen to words and repeat their sequence'},
]);
function nextLevel(history,level=1){const recent=history.slice(-5);if(recent.length<5)return level;const good=recent.filter(r=>r.correct).length;return Math.max(1,Math.min(6,level+(good>=4?1:good<=2?-1:0)));}
function shuffle(values,random=Math.random){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function round(game,level=1,random=Math.random){level=Math.max(1,Math.min(6,Number(level)||1));const int=n=>Math.floor(random()*n);
 if(game==='math'){const a=1+int(5+level*4),b=1+int(3+level*2),multiply=level>=4;return{prompt:`${a} ${multiply?'×':'+'} ${b}`,answer:String(multiply?a*b:a+b)};}
 if(game==='memory'){const size=level>3?16:9;return{prompt:'Remember the highlighted tiles',size,answer:shuffle(Array.from({length:size},(_,i)=>i),random).slice(0,Math.min(2+level,7))};}
 if(game==='sorting'){const values=shuffle(Array.from({length:30},(_,i)=>i+1),random).slice(0,3+level);return{prompt:'Tap numbers from smallest to largest',values,answer:[...values].sort((a,b)=>a-b)};}
 if(game==='audio'){const words=['Sun','Moon','Rain','Tree'];return{prompt:'Listen, then tap the words in the same order',words,answer:Array.from({length:Math.min(2+level,7)},()=>words[int(words.length)])};}
 const phrases=['One step at a time','Make room for a gentle start','Small steps build a steady rhythm','I can pause and choose my next step','A quiet moment can help me begin again','Progress leaves room for rest and another try'];return{prompt:phrases[level-1],answer:phrases[level-1].toLowerCase()};
}
function correct(game,value,answer){if(game==='memory')return Array.isArray(value)&&value.length===answer.length&&new Set(value).size===value.length&&answer.every(v=>value.includes(v));if(Array.isArray(answer))return JSON.stringify(value)===JSON.stringify(answer);return String(value).trim().replace(/\s+/g,' ').toLowerCase()===String(answer).toLowerCase();}
module.exports={GAMES,nextLevel,round,correct,shuffle};
