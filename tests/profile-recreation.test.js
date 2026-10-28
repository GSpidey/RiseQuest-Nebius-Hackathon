const test=require('node:test'),assert=require('node:assert/strict');const{createProfileRepository,profileCacheKey}=require('../src/services/profileRepository');
test('a fresh server registration never inherits the previous account onboarding selections',async()=>{
 const email='same@example.test',old={email,isGuest:false,displayName:'Keep identity',ageGroup:'adult',supportEnabled:true,supportConditions:['adhd'],onboardingCompleted:true,version:7,preferences:{goals:['old']}};
 const data=new Map([[profileCacheKey(email),JSON.stringify(old)]]),repo=createProfileRepository({storage:{getItem:async k=>data.get(k),setItem:async(k,v)=>data.set(k,v)},identity:async()=>email,request:async()=>({profile:{version:1,ageGroup:'adult',preferences:{analyticsOptIn:false},onboardingCompleted:false}})});
 const result=await repo.restore({email,displayName:'New registration'});assert.equal(result.onboardingCompleted,false);assert.equal(result.supportConditions,undefined);assert.deepEqual(result.preferences,{analyticsOptIn:false});assert.equal(result.displayName,'New registration');
});
