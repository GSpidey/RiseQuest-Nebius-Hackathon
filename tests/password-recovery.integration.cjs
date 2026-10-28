// Executed only against the disposable database inside the candidate image.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client');const {completePasswordReset}=require('/app/src/passwordRecovery');const p=new PrismaClient();
async function token(userId,value,expiry=Date.now()+60000){return p.passwordResetToken.create({data:{userId,tokenHash:crypto.createHash('sha256').update(value).digest('hex'),expiresAt:new Date(expiry)}});}
(async()=>{
 const email='password-fixture@example.test',password='Only-a-disposable-test-password';
 await p.user.create({data:{id:email,name:'Reset fixture',role:'SUPERADMIN',authProvider:'google'}});
 await token(email,'one');await token(email,'older');
 const results=await Promise.allSettled([1,2].map(()=>completePasswordReset(p,{email,token:'one',password})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 let user=await p.user.findUnique({where:{id:email}});assert.ok(await bcrypt.compare(password,user.passwordHash));assert.equal(user.role,'SUPERADMIN');assert.equal(user.name,'Reset fixture');
 await assert.rejects(()=>completePasswordReset(p,{email,token:'one',password}),/Invalid or expired/);
 await assert.rejects(()=>completePasswordReset(p,{email,token:'older',password}),/Invalid or expired/);
 await token(email,'expired',Date.now()-1000);await assert.rejects(()=>completePasswordReset(p,{email,token:'expired',password}),/Invalid or expired/);
 await token(email,'disabled');await p.user.update({where:{id:email},data:{disabledAt:new Date()}});await assert.rejects(()=>completePasswordReset(p,{email,token:'disabled',password}),/Invalid or expired/);
 await assert.rejects(()=>completePasswordReset(p,{email,token:'disabled',password:'x'.repeat(73)}),/72 bytes/);
 console.log('Password recovery: concurrent claim, replay, older-token invalidation, expiry, disabled-account protection and unchanged admin role passed');
})().finally(()=>p.$disconnect()).catch(e=>{console.error(e.message);process.exitCode=1});
