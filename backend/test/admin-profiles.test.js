const { OWNER_ID, assertAccountManagement, manageAccount, provisionOwner } = require('../src/adminPolicy');
const { mayViewProfile, publicCard } = require('../src/profileCards');
const { ACHIEVEMENTS } = require('../src/cosmeticCatalog');
const account = (id,role='USER') => ({id,role,disabledAt:null});
test.each(['USER','STAFF','ADMIN','SUPERADMIN'])('owner cannot be disabled, demoted or reset by %s',role=>{
 expect(()=>assertAccountManagement(account('actor',role),account(OWNER_ID,'SUPERADMIN'),{role:'USER',disabledAt:new Date()})).toThrow();
});
test.each(['ADMIN','SUPERADMIN'])('admin cannot change existing %s account, even when new role is USER',role=>{
 expect(()=>assertAccountManagement(account('actor','ADMIN'),account('target',role),{role:'USER'})).toThrow(/access level/);
});
test('only super admins grant admin access; self changes and disabled actors fail',()=>{
 expect(()=>assertAccountManagement(account('actor','ADMIN'),account('target'),{role:'ADMIN'})).toThrow(/super admin/);
 expect(()=>assertAccountManagement(account('actor','SUPERADMIN'),account('actor','SUPERADMIN'))).toThrow(/another/);
 expect(()=>assertAccountManagement({...account(OWNER_ID,'SUPERADMIN'),disabledAt:new Date()},account('target'))).toThrow();
 expect(()=>assertAccountManagement(account(OWNER_ID,'SUPERADMIN'),account('target','SUPERADMIN'),{role:'USER'})).not.toThrow();
 expect(()=>assertAccountManagement(account('actor','ADMIN'),account('target'),{role:'__proto__'})).toThrow(/Invalid role/);
});
test('transaction rechecks the current actor and rejects a stale administrator session',async()=>{
 const update=jest.fn(),audit=jest.fn();
 const tx={$executeRaw:jest.fn(),user:{findUnique:async({where})=>account(where.id,'USER')},adminAuditLog:{create:audit}};
 await expect(manageAccount({$transaction:fn=>fn(tx)},'demoted-actor','target',{},'USER_UPDATE',update)).rejects.toThrow(/Administrator/);
 expect(update).not.toHaveBeenCalled();expect(audit).not.toHaveBeenCalled();
});
test('owner provisioning preserves credentials and is idempotent',async()=>{
 let user={...account(OWNER_ID),passwordHash:'preserve',authProvider:'google'};const audit=jest.fn();
 const tx={$executeRaw:jest.fn(),user:{findUnique:async()=>user,upsert:async({update})=>{user={...user,...update};}},adminAuditLog:{create:audit}};
 const db={$transaction:fn=>fn(tx)};await provisionOwner(db);await provisionOwner(db);
 expect(user).toMatchObject({role:'SUPERADMIN',passwordHash:'preserve',authProvider:'google'});expect(audit).toHaveBeenCalledTimes(1);
});
function scenario(){return{viewer:{...account('viewer'),profile:{data:{ageGroup:'adult'}}},target:{...account('target'),profile:{data:{ageGroup:'adult'}}},viewerSettings:{optIn:true,visibility:'PUBLIC'},targetSettings:{optIn:true,visibility:'PUBLIC'},blocked:false,buddy:false};}
test('public adults can see profiles; friends-only requires accepted buddy',()=>{
 const s=scenario();expect(mayViewProfile(s)).toBe(true);s.targetSettings.visibility='BUDDIES';expect(mayViewProfile(s)).toBe(false);s.buddy=true;expect(mayViewProfile(s)).toBe(true);
});
test.each(['blocked','disabled','optout','child','child-provider','teen','missing-age','teen-safety'])('public discovery fails closed for %s',kind=>{
 const s=scenario();if(kind==='blocked')s.blocked=true;if(kind==='disabled')s.target.disabledAt=new Date();if(kind==='optout')s.targetSettings.optIn=false;
 if(kind==='child')s.target.profile.data.ageGroup='child';if(kind==='child-provider')s.target.authProvider='child';if(kind==='teen')s.target.profile.data.ageGroup='teen';
 if(kind==='missing-age')s.viewer.profile=null;if(kind==='teen-safety')s.viewerSettings.teenSafety=true;
 expect(mayViewProfile(s)).toBe(false);
 if(['blocked','disabled','optout','child','child-provider'].includes(kind)){s.buddy=true;expect(mayViewProfile(s)).toBe(false);}
});
test('public profile is an allowlist, with only selected, owned achievements',()=>{
 const user={id:'private@example.test',name:'River',createdAt:new Date('2026-01-01'),photoUrl:null,passwordHash:'secret',phoneNumber:'private',profile:{data:{supportConditions:['private']}},risePointsBalance:{balance:999}};
 const [a,b]=ACHIEVEMENTS;const result=publicCard(user,[a.id,b.id,'badge_early_bird'],[{itemId:a.id},{itemId:'badge_early_bird'}]);
 expect(Object.keys(result).sort()).toEqual(['badges','displayName','joined','photoUrl']);expect(result.badges.map(x=>x.id)).toEqual([a.id]);
 expect(JSON.stringify(result)).not.toMatch(/private|password|balance|supportConditions/);
});
