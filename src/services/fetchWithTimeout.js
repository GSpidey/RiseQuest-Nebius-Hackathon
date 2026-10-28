// React Native's AbortSignal polyfill does not provide AbortSignal.timeout().
// Keep cancellation compatible with the native fetch implementation.
export async function fetchWithTimeout(url, options = {}, milliseconds = 15000) {
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),milliseconds);
 try{return await fetch(url,{...options,signal:controller.signal});}
 finally{clearTimeout(timer);}
}
