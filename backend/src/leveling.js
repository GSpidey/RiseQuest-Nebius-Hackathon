// Lifetime XP never resets on level-up. Each next level costs 50 XP more.
function threshold(level) { const n=Math.max(0,Math.floor(level)-1);return 100*n+25*n*(n-1); }
function levelProgress(value) {
 const totalXp=Math.max(0,Math.min(1000000000,Math.floor(Number(value)||0)));
 let level=Math.max(1,Math.floor((-75+Math.sqrt(5625+100*totalXp))/50)+1);
 while(threshold(level+1)<=totalXp)level++;
 while(threshold(level)>totalXp)level--;
 const floor=threshold(level),next=threshold(level+1),needed=next-floor,current=totalXp-floor;
 return {level,totalXp,currentXp:current,neededXp:needed,remainingXp:next-totalXp,nextLevel:level+1,percent:Math.min(100,current/needed*100)};
}
function legacyTotal(stats={}) {
 const xp=Math.max(0,Math.floor(Number(stats.experience)||0)),level=Math.max(1,Math.floor(Number(stats.level)||1));
 // Old wake-ups kept lifetime XP; old games kept XP within their triangular level.
 return stats.xpVersion===2 ? xp : xp >= (level-1)*100 ? xp : xp+50*level*(level-1);
}
module.exports={threshold,levelProgress,legacyTotal};
