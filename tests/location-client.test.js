const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {setTimeout, clearTimeout};
vm.runInNewContext(fs.readFileSync('src/services/locationClient.js','utf8').replace('export function','function')+';this.create=createLocationClient;',context);
function fixture({granted=false, requestResult=false, platform='android', failure=null}={}) {
 const calls=[];
 const native={getCurrentPosition(ok,fail,options){calls.push(options);if(failure)fail(failure);else ok({coords:{latitude:43,longitude:-79}});},watchPosition(ok,fail,options){calls.push(options);return 7;},clearWatch(id){calls.push(['clear',id]);},stopObserving(){}};
 let requests=0;
 const client=context.create({native,platform,permission:{check:async()=>granted,request:async()=>{requests++;return requestResult;}}});
 return {client,calls,requests:()=>requests};
}
test('startup read never prompts or invokes native GPS without permission',async()=>{
 const f=fixture();await assert.rejects(f.client.current(),/Allow location/);assert.equal(f.requests(),0);assert.equal(f.calls.length,0);
});
test('explicit denied permission remains recoverable without native access',async()=>{
 const f=fixture();await assert.rejects(f.client.current({requestPermission:true}),/Allow location/);assert.equal(f.requests(),1);assert.equal(f.calls.length,0);
});
test('granted location works and Android uses platform provider for reads and watches',async()=>{
 const f=fixture({granted:true});assert.equal((await f.client.current()).coords.latitude,43);
 const id=await f.client.watch(()=>{},()=>{}, {forceLocationManager:false});assert.equal(id,7);
 assert(f.calls.every(options=>options.forceLocationManager===true));f.client.clearWatch(id);assert.deepEqual(f.calls.at(-1),['clear',7]);
});
test('permission-granted cold launch and provider errors reject without throwing outside the promise',async()=>{
 const error=new Error('provider unavailable'),f=fixture({granted:true,failure:error});await assert.rejects(f.client.current(),/provider unavailable/);
 assert.equal(f.requests(),0);
});
test('iOS uses its own authorization boundary without Android options',async()=>{
 const f=fixture({platform:'ios',requestResult:true});await f.client.current({requestPermission:true});assert.equal(f.requests(),1);assert.equal(f.calls[0].forceLocationManager,undefined);
});
test('concurrent location actions share one permission prompt',async()=>{
 let asks=0,grant;
 const client=context.create({native:{},platform:'android',permission:{check:async()=>false,request:()=>{asks++;return new Promise(resolve=>grant=resolve);}}});
 const a=client.authorize(true),b=client.authorize(true);await new Promise(resolve=>setImmediate(resolve));grant(true);
 assert.deepEqual(await Promise.all([a,b]),[true,true]);assert.equal(asks,1);
});
test('network location timeout falls back to precise GPS and accepts zero coordinates',async()=>{
 const calls=[];const client=context.create({platform:'android',permission:{check:async()=>true,precise:async()=>true},native:{getCurrentPosition(ok,error,options){calls.push(options);if(!options.enableHighAccuracy)error({code:3});else ok({coords:{latitude:0,longitude:0}});}}});
 const fix=await client.current();assert.equal(fix.coords.latitude,0);assert.deepEqual(calls.map(c=>c.enableHighAccuracy),[false,true]);
});
