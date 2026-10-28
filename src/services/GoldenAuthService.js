import { AppState, Linking } from 'react-native';
import { getAuthToken } from './AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
let activeCancel, attempt = 0;
export function cancelGoldenSignIn() { attempt++; activeCancel?.(); }
async function post(path, body, token) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try {
  const response=await fetch(`${await getBackendBaseUrl()}${path}`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'GoldenEpics sign-in could not finish.'),{code:data.code});return data;
 }finally{clearTimeout(timer);}
}
export async function signInWithGoldenEpics({ageBand,countryCode,link=false}={}) {
 cancelGoldenSignIn();
 const version=attempt;
 const ensureCurrent=()=>{if(version!==attempt)throw Object.assign(new Error('Sign-in canceled.'),{code:'CANCELED'});};
 const initialToken=await getAuthToken();
 ensureCurrent();
 const start=await post(link?'/api/auth/golden/link':'/api/auth/golden/start',{ageBand,countryCode},link?initialToken:null);
 ensureCurrent();
 if(!start.authorizationUrl?.startsWith('https://accounts.example.invalid/api/auth/'))throw new Error('The sign-in address could not be verified.');
 return new Promise((resolve,reject)=>{
  let done=false,checking=false,opened=false,timer;
  const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(expiry);listener.remove();if(activeCancel===cancel)activeCancel=null;error?reject(error):resolve(result);};
  const cancel=()=>finish(Object.assign(new Error('Sign-in canceled.'),{code:'CANCELED'}));
  const check=async()=>{
   if(done||checking||!opened||AppState.currentState!=='active')return;
   checking=true;clearTimeout(timer);
   try{
    if(await getAuthToken()!==initialToken)throw new Error('Your account changed. Start sign-in again.');
    const result=await post('/api/golden/complete',{pollSecret:start.pollSecret});
    if(result.status==='complete'){finish(null,result);return;}
    timer=setTimeout(check,15000);
   }catch(error){finish(error);}finally{checking=false;}
  };
  const listener=AppState.addEventListener('change',state=>{if(state==='active')check();});
  const expiry=setTimeout(()=>finish(new Error('Sign-in expired. Please try again.')),Math.min(start.expiresIn||900,900)*1000);
  activeCancel=cancel;
  Linking.openURL(start.authorizationUrl).then(()=>{opened=true;timer=setTimeout(check,1500);}).catch(error=>finish(error));
 });
}
