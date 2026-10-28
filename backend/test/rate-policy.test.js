const express=require('express'),rateLimit=require('express-rate-limit'),jwt=require('jsonwebtoken');
const {apiRateKey,apiRateOptions}=require('../src/ratePolicy');
const {authentication}=require('../src/security');
const secret='test-secret';const token=sub=>jwt.sign({sub},secret,{expiresIn:60});
test('valid accounts sharing an IP have independent buckets; forged tokens do not',()=>{
 const req=t=>({ip:'192.0.2.1',headers:{authorization:'Bearer '+t}});
 expect(apiRateKey(req(token('a')),secret)).not.toBe(apiRateKey(req(token('b')),secret));
 expect(apiRateKey(req('forged'),secret)).toBe(apiRateKey(req('different-forgery'),secret));
 expect(apiRateKey(req(jwt.sign({sub:'a'},'wrong-secret',{expiresIn:60})),secret)).toBe(apiRateKey(req('forged'),secret));
});
test('normal browsing exceeds the old limit; actual throttling returns JSON and Retry-After',async()=>{
 const app=express();app.use('/api',rateLimit({...apiRateOptions(secret),limit:120}));app.get('/api/data',(q,s)=>s.json({ok:true}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port+'/api/data',headers={Authorization:'Bearer '+token('a')};
 try{for(let i=0;i<120;i++)expect((await fetch(url,{headers})).status).toBe(200);const blocked=await fetch(url,{headers});expect(blocked.status).toBe(429);expect((await blocked.json()).code).toBe('RATE_LIMITED');expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);expect((await fetch(url,{headers:{Authorization:'Bearer '+token('b')}})).status).toBe(200);}finally{await new Promise(r=>server.close(r));}
});
test('a recreated email cannot be accessed with a session from the deleted account',async()=>{
 const middleware=authentication({user:{findUnique:async()=>({id:'a',createdAt:new Date(Date.now()+5000)})}},secret);const res={status:jest.fn().mockReturnThis(),json:jest.fn()},next=jest.fn();await middleware({headers:{authorization:'Bearer '+token('a')}},res,next);expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();
});
