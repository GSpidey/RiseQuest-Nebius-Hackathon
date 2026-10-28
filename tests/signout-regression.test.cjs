const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('App.js','utf8');
function setup(fail=false){
 const source=app.slice(app.indexOf('  const signOut = async'),app.indexOf('  const initializeMonetization'));
 const state={},calls=[],context={signOutBusyRef:{current:false},screenHistoryRef:{current:['home','settings']},previousScreenRef:{current:'settings'},welcomeChecked:{current:'owner'},stopVoiceConversation(){calls.push('stopVoice')},cancelGoldenSignIn(){},clearAuthToken:async()=>{if(fail)throw Error('secure storage unavailable');calls.push('clearToken')},AsyncStorage:{multiRemove:async keys=>calls.push(keys)},riseQuestWalletService:{clearCache:async()=>{}},unstable_batchedUpdates:fn=>{calls.push('batch');fn();},Alert:{alert:()=>calls.push('alert')},console:{error(){}}};
 for(const m of source.matchAll(/\b(set\w+)\(/g))context[m[1]]=value=>{state[m[1]]=value};
 vm.createContext(context);vm.runInContext(source+';globalThis.signOut=signOut',context);return{context,state,calls};
}
test('sign out closes account surfaces, clears navigation and secrets, preserves alarms',async()=>{
 const h=setup();await h.context.signOut();assert.equal(h.state.setCurrentScreen,'start');assert.equal(h.state.setUserProfile,null);assert.equal(h.state.setIsAuthenticated,false);assert.equal(h.state.setMustSetPassword,false);assert.equal(h.state.setShowSupportCenter,false);assert.equal(h.state.setShowProfileModal,false);assert.equal(h.state.setVerifiedAdminRole,false);assert.equal(h.state.setAuthPassword,'');assert.equal(h.state.setShowAuthInline,true);assert.equal(h.context.screenHistoryRef.current.length,0);assert.ok(!h.calls.flat().includes('risequest_alarms'));assert.ok(h.calls.indexOf('clearToken')<h.calls.indexOf('batch'));
});
test('failed secure storage removal does not falsely report successful logout',async()=>{const h=setup(true);await h.context.signOut();assert.ok(!('setIsAuthenticated'in h.state));assert.ok(h.calls.includes('alert'));assert.equal(h.context.signOutBusyRef.current,false);});
test('faulty session listener cannot abort token removal or other subscribers',async()=>{
 const source=fs.readFileSync('src/services/AuthTokenStorage.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');let cleared=false,removed=false,notified=false;
 const context={AsyncStorage:{getItem:async()=>null,multiRemove:async()=>{removed=true}},Keychain:{getGenericPassword:async()=>false,resetGenericPassword:async()=>{cleared=true}},console:{warn(){}},Promise};vm.createContext(context);vm.runInContext(source+';globalThis.api={clearAuthToken,onAuthSessionChanged}',context);context.api.onAuthSessionChanged(()=>{throw Error('stale screen')});context.api.onAuthSessionChanged(()=>{assert.ok(removed);notified=true});await context.api.clearAuthToken();assert.ok(cleared&&removed&&notified);
});
