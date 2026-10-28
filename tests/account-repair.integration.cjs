const assert=require('node:assert/strict'),{PrismaClient}=require('/app/node_modules/@prisma/client');
const{resolveIdentity}=require('/app/src/goldenAuth'),{requestDeletion,completeDeletion}=require('/app/src/accountDeletion');
if(!process.env.DATABASE_URL?.includes('@cosmetics-fixture:5432/fixture'))throw Error('Disposable fixture database required');
const p=new PrismaClient();
(async()=>{
 const id='repair-fixture@example.test',neighbor='repair-neighbor@example.test';
 await p.user.create({data:{id,name:'Keep my profile',authProvider:'password',passwordHash:'existing-password',profile:{create:{data:{ageGroup:'adult',goals:['keep']}}},risePointsBalance:{create:{balance:75}}}});
 await p.user.create({data:{id:neighbor}});
 const linked=await p.$transaction(tx=>resolveIdentity(tx,{sub:'golden-fixture'},{sub:'golden-fixture',email:id.toUpperCase(),email_verified:true},{}));
 assert.equal(linked.id,id);assert.equal(linked.passwordHash,'existing-password');assert.equal(linked.name,'Keep my profile');assert.equal(await p.user.count({where:{id}}),1);assert.equal((await p.risePointsBalance.findUnique({where:{userId:id}} )).balance,75);
 const returned=await p.$transaction(tx=>resolveIdentity(tx,{sub:'golden-fixture'},{sub:'golden-fixture',email:'changed@example.test',email_verified:true},{}));assert.equal(returned.id,id);
 const job=await requestDeletion(p,id,'fixture-secret');await completeDeletion(job,{prisma:p,stripe:{subscriptions:{cancel:()=>{throw Error('No subscription expected')}}},secret:'fixture-secret',uploadsDir:'/tmp/fixture-uploads'});
 assert.equal(await p.user.findUnique({where:{id}}),null);assert.equal(await p.goldenIdentity.findUnique({where:{subject:'golden-fixture'}}),null);assert(await p.user.findUnique({where:{id:neighbor}}));
 console.log('PASS: verified GoldenEpics email reuses account/password/profile/balance; subject remains stable; account deletion removes owned records and preserves neighboring user.');await p.$disconnect();
})().catch(async e=>{console.error(e);await p.$disconnect();process.exit(1)});
