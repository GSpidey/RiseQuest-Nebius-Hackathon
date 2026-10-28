const test=require('node:test'),assert=require('node:assert/strict');
const {threshold,levelProgress,legacyTotal}=require('../backend/src/leveling');
const {loginStreak,key,grants}=require('../backend/src/progression');
const {ACHIEVEMENTS,CATALOG}=require('../backend/src/cosmeticCatalog');
test('level thresholds increase by 50 XP per level and boundaries agree',()=>{
 for(let level=1;level<6000;level++){
  const start=threshold(level),next=threshold(level+1),p=levelProgress(start);
  assert.equal(p.level,level);assert.equal(p.currentXp,0);assert.equal(p.remainingXp,100+50*(level-1));
  assert.equal(levelProgress(next-1).level,level);assert.equal(levelProgress(next).level,level+1);
 }
 for(const v of [null,undefined,NaN,-1,'invalid'])assert.equal(levelProgress(v).level,1);
 assert.equal(legacyTotal({experience:75,level:3}),375);assert.equal(legacyTotal({experience:250,level:3}),250);
});
test('28 earned medals and 2 shop decorations, unique IDs and XP scales per metric',()=>{
 assert.equal(ACHIEVEMENTS.length,28);assert.equal(new Set(ACHIEVEMENTS.map(a=>a.id)).size,28);
 assert.equal([...CATALOG,...ACHIEVEMENTS].filter(i=>i.type==='badges').length,30);
 for(const metric of new Set(ACHIEVEMENTS.map(a=>a.metric))){const sorted=ACHIEVEMENTS.filter(a=>a.metric===metric).sort((a,b)=>a.target-b.target);for(let i=1;i<sorted.length;i++)assert(sorted[i].xp>sorted[i-1].xp);}
 assert(ACHIEVEMENTS.every(a=>Number.isInteger(a.xp)&&a.xp>0));
});
test('login streak uses calendar days and allows yesterday before today’s check-in',()=>{
 const now=new Date('2026-10-24T12:00:00Z');assert.equal(loginStreak(['2026-10-23','2026-10-22','2026-10-22'],now),2);assert.equal(loginStreak(['2026-10-24','2026-10-23'],now),2);assert.equal(loginStreak(['2026-10-22'],now),0);
});
test('XP grant keys isolate users/sources and repeat calls skip duplicate grants',async()=>{
 const saved=new Map(),tx={xpGrant:{createMany:async({data,skipDuplicates})=>{assert(skipDuplicates);data.forEach(g=>{if(!saved.has(g.id))saved.set(g.id,g);});}}};
 await grants(tx,'one','badge',[['sun',25]]);await grants(tx,'one','badge',[['sun',25]]);await grants(tx,'two','badge',[['sun',25]]);assert.equal(saved.size,2);assert.notEqual(key('one','badge','sun'),key('one','activity','sun'));
});
