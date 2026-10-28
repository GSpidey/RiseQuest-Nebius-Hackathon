// All GPS access uses one provider and one permission boundary.
// Android's platform LocationManager avoids the fused-provider binary mismatch
// between geolocation-service 5.x and newer Google Play Services dependencies.
export function createLocationClient({native, permission, platform}) {
  let permissionRequest = null;
  const authorize = async (requestPermission = false) => {
    if (await permission.check()) return true;
    if (!requestPermission) return false;
    if (!permissionRequest) permissionRequest = permission.request().finally(() => { permissionRequest = null; });
    return permissionRequest;
  };
  const options = extra => ({enableHighAccuracy: true, timeout: 15000, maximumAge: 10000,
    ...extra, ...(platform === 'android' ? {forceLocationManager: true, showLocationDialog: false} : {})});
  return {
    authorize,
    async current({requestPermission = false} = {}) {
      if (!await authorize(requestPermission)) throw new Error('Allow location to use this feature.');
      const precise = permission.precise ? await permission.precise() : true;
      const locate = high => new Promise((resolve, reject) => {
        let settled=false;
        const finish=fn=>value=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
        const timer=setTimeout(()=>finish(reject)(new Error('Location timed out. Check that phone location is on and try again.')),high?12000:9000);
        try{native.getCurrentPosition(finish(resolve),finish(reject),options({enableHighAccuracy:high,timeout:high?10000:7000,maximumAge:120000}));}
        catch(error){finish(reject)(error);}
      });
      // A network fix is usually available indoors. GPS is a bounded fallback,
      // never a requirement for basic weather or approximate location access.
      try{return await locate(false);}catch(error){if(!precise||platform!=='android'||error?.code===1)throw error;return locate(true);}

    },
    async watch(onPosition, onError, extra = {}) {
      if (!await authorize(false)) {onError?.(new Error('Allow location to use live updates.')); return null;}
      const precise = permission.precise ? await permission.precise() : true;
      return native.watchPosition(onPosition, onError, options({enableHighAccuracy: precise, distanceFilter: 25, interval: 30000, fastestInterval: 15000, ...extra}));
    },
    clearWatch(id) {if (id != null) native.clearWatch(id);},
    stopObserving() {native.stopObserving();},
  };
}
