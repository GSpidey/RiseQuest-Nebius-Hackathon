const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');const root='backend/src/admin/';const tick=()=>new Promise(r=>setTimeout(r,10));
function setup(file='reset.html',fragment=''){
 const dom=new JSDOM(fs.readFileSync(root+file,'utf8'),{url:'https://api.example.invalid/admin/'+file+fragment,runScripts:'outside-only'});
 const {window:w}=dom,calls=[];w.TextEncoder=TextEncoder;w.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({success:true})}};
 w.eval(fs.readFileSync(root+'password-fields.js','utf8'));if(file==='reset.html')w.eval(fs.readFileSync(root+'reset.js','utf8'));
 return{dom,w,calls,$:id=>w.document.getElementById(id)};
}
test('admin login has functional Show/Hide button that never submits credentials',()=>{
 const h=setup('index.html');h.$('password').value='Synthetic-password';const b=h.w.document.querySelector('[data-password-toggle]');b.click();assert.equal(h.$('password').type,'text');assert.equal(b.getAttribute('aria-pressed'),'true');b.click();assert.equal(h.$('password').type,'password');assert.equal(h.calls.length,0);h.dom.window.close();
});
test('fragment reset validates confirmation, strips URL token, and clears fields after success',async()=>{
 const h=setup('reset.html','#email=fixture%40example.test&token=synthetic-token');assert.equal(h.w.location.hash,'');assert.equal(h.$('reset-email').value,'fixture@example.test');assert.equal(h.$('reset-token').type,'hidden');h.$('new-password').value='Synthetic-password';h.$('confirm-password').value='different';h.$('save-password').click();assert.equal(h.calls.length,0);assert.match(h.$('reset-message').textContent,/do not match/);h.$('confirm-password').value='Synthetic-password';h.$('save-password').click();await tick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].body.token,'synthetic-token');assert.equal(h.$('reset-success').hidden,false);assert.equal(h.$('new-password').value,'');assert.equal(h.w.document.activeElement.id,'reset-success');h.dom.window.close();
});
test('old token email remains usable and requesting a new link gives neutral confirmation',async()=>{
 const h=setup();assert.equal(h.$('reset-token').type,'text');h.$('reset-email').value='fixture@example.test';h.$('send-new-link').click();await tick();assert.equal(h.calls[0].url,'/api/auth/forgot-password');assert.match(h.$('reset-message').textContent,/If this account exists/);h.dom.window.close();
});
test('expired-token API error leaves reset form available for another request',async()=>{
 const h=setup('reset.html','#email=fixture%40example.test&token=expired');h.w.fetch=async()=>({ok:false,json:async()=>({error:'Invalid or expired reset token'})});h.$('new-password').value=h.$('confirm-password').value='Synthetic-password';h.$('save-password').click();await tick();assert.equal(h.$('reset-form').hidden,false);assert.equal(h.$('send-new-link').disabled,false);assert.match(h.$('reset-message').textContent,/expired/);h.dom.window.close();
});
