import { getAuthToken } from '../services/AuthTokenStorage';
import { getBackendBaseUrl } from '../config/backendConfig';
export async function featureApi(path, body, options = {}) {
 const token=await getAuthToken();
 if(options.expectedToken && token!==options.expectedToken) throw new Error('Your account changed. Please reopen this screen.');
 if(!token) throw new Error('Sign in to use live coaching and your saved collection.');
 const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),Math.min(70000,options.timeoutMs||35000));
 try {
  const response=await fetch(`${await getBackendBaseUrl()}${path}`,{method:body?'POST':'GET',signal:controller.signal,
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
  if(await getAuthToken()!==token) throw new Error('Your account changed. Please reopen this screen.');
  if(response.status===429){const error=new Error('Please wait a moment, then tap Refresh to try again.');error.code='RATE_LIMITED';error.retryAfter=Number(response.headers?.get('retry-after')||60);throw error;}
  let result;
  try { result=await response.json(); } catch (_) {
   throw new Error(response.status===401?'Your session expired. Please sign in again.':'This service is temporarily unavailable. Please try again shortly.');
  }
  if(await getAuthToken()!==token)throw new Error('Your account changed. Please reopen this screen.');
  if(!result || typeof result!=='object' || Array.isArray(result))throw new Error('This service is temporarily unavailable. Please try again shortly.');
  if(!response.ok){const error=new Error(typeof result.error==='string'?result.error:'Could not connect. Please try again.');error.code=result.code;error.status=response.status;throw error;}return result;
 }catch(error){
  if(error.name==='AbortError')throw new Error('The connection took too long. Please try again.');
  if(error instanceof TypeError)throw new Error('Could not connect. Check your internet connection and try again.');
  throw error;
 }finally{clearTimeout(timeout);}
}

