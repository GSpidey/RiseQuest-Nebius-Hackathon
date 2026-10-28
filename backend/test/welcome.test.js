const {eligible,grantWelcome,rewardId,WELCOME_POINTS}=require('../src/welcome');
const start='2026-10-24T12:00:00Z';
const user={id:'new@example.test',createdAt:new Date('2026-10-24T12:01:00Z')};
const profile={completedAt:new Date('2026-10-24T12:02:00Z')};
test('only completed new accounts after the configured rollout qualify',()=>{
 expect(eligible(user,profile,start)).toBe(true);
 expect(eligible({...user,createdAt:new Date('2026-10-24T11:59:00Z')},profile,start)).toBe(false);
 expect(eligible(user,{},start)).toBe(false);
 expect(eligible({...user,disabledAt:new Date()},profile,start)).toBe(false);
 for(const value of ['',undefined,'not a date'])expect(eligible(user,profile,value)).toBe(false);
});
test('welcome credit is exactly 75, preserves an existing balance and replays without crediting again',async()=>{
 let balance=23,row=null;
 const tx={user:{findUnique:async()=>user},userProfile:{findUnique:async()=>profile},
  risePointsTransaction:{findUnique:async()=>row,create:async({data})=>{row=data;return row;}},
  risePointsBalance:{upsert:async({update})=>{balance+=update.balance.increment;}}};
 const first=await grantWelcome(tx,user.id,start),second=await grantWelcome(tx,user.id,start);
 expect(WELCOME_POINTS).toBe(75);expect(first).toBe(second);expect(balance).toBe(98);expect(row.id).toBe(rewardId(user.id));expect(row.delta).toBe(75);
});
test('old accounts cannot claim by supplying a different amount or completing the profile again',async()=>{
 const tx={user:{findUnique:async()=>({...user,createdAt:new Date('2025-01-01')})},userProfile:{findUnique:async()=>profile},
 risePointsTransaction:{findUnique:async()=>null,create:jest.fn()},risePointsBalance:{upsert:jest.fn()}};
 expect(await grantWelcome(tx,user.id,start)).toBeNull();expect(tx.risePointsTransaction.create).not.toHaveBeenCalled();expect(tx.risePointsBalance.upsert).not.toHaveBeenCalled();
});
