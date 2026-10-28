const test=require('node:test'),assert=require('node:assert/strict');
const {passwordResetContent}=require('../backend/src/services/email');
test('email contains clickable HTTPS reset link with credentials only in fragment',()=>{
 const content=passwordResetContent({to:'owner+test@example.com',token:'synthetic-token',expiresAt:new Date('2026-10-24T12:00:00Z')});
 const link=content.text.match(/https:\/\/\S+/)[0],url=new URL(link);
 assert.equal(url.origin,'https://risequest-api.goldenepics.com');assert.equal(url.pathname,'/admin/reset.html');assert.equal(url.search,'');
 assert.equal(new URLSearchParams(url.hash.slice(1)).get('email'),'owner+test@example.com');assert.match(content.html,/<a href="https:\/\//);assert.match(content.text,/synthetic-token/);
});
test('HTML escapes substituted values',()=>{const c=passwordResetContent({to:'x@example.com',token:'<img onerror="bad">',expiresAt:'<script>bad</script>'});assert.ok(!c.html.includes('<script>'));assert.ok(!c.html.includes('<img'));});
