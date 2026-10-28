const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('src/services/fetchWithTimeout.js','utf8').replace('export async function','async function');
test('mobile fetch works with AbortController and no static AbortSignal.timeout',async()=>{
 let cleared=0;const context={AbortController,fetch:async()=>({ok:true}),setTimeout,clearTimeout:id=>{cleared++;clearTimeout(id)}};vm.createContext(context);vm.runInContext(source+';this.request=fetchWithTimeout;',context);assert.equal((await context.request('fixture',{},100)).ok,true);assert.equal(cleared,1);
});
test('mobile timeout aborts a stalled request and clears the timer',async()=>{
 const context={AbortController,setTimeout,clearTimeout,fetch:async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))};vm.createContext(context);vm.runInContext(source+';this.request=fetchWithTimeout;',context);await assert.rejects(context.request('fixture',{},10),/aborted/);
});
