function weatherCodeToText(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return 'unknown';
  // Open-Meteo WMO weather interpretation codes
  if (c === 0) return 'clear';
  if (c === 1) return 'mainly clear';
  if (c === 2) return 'partly cloudy';
  if (c === 3) return 'overcast';
  if (c === 45 || c === 48) return 'fog';
  if (c === 51 || c === 53 || c === 55) return 'drizzle';
  if (c === 56 || c === 57) return 'freezing drizzle';
  if (c === 61 || c === 63 || c === 65) return 'rain';
  if (c === 66 || c === 67) return 'freezing rain';
  if (c === 71 || c === 73 || c === 75) return 'snow';
  if (c === 77) return 'snow grains';
  if (c === 80 || c === 81 || c === 82) return 'rain showers';
  if (c === 85 || c === 86) return 'snow showers';
  if (c === 95) return 'thunderstorm';
  if (c === 96 || c === 99) return 'thunderstorm with hail';
  return 'unknown';
}

async function getCurrentWeatherOpenWeather({ lat, lon, units = 'metric' }) {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error('Missing env var: OPENWEATHER_API_KEY');

  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('appid', key);
  url.searchParams.set('units', units);

  const resp = await fetch(url.toString(), {signal: AbortSignal.timeout(6000)});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenWeather error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();

  const exact = data.main?.temp;
  if(typeof exact!=='number'||!Number.isFinite(exact))throw new Error('Weather response missing temperature');
  const temperature = Math.round(exact);
  const description = data.weather?.[0]?.description || 'unknown';
  const humidity = data.main?.humidity ?? null;
  const windSpeed = typeof data.wind?.speed==='number' ? data.wind.speed*(units==='imperial'?1:3.6) : null;
  const city = data.name || null;
  const icon = data.weather?.[0]?.icon || null;

  return {
    temperature, temperatureExact:exact,
    description,
    humidity,
    windSpeed,
    city,
    icon,
    raw: process.env.NODE_ENV === 'development' ? data : undefined,
  };
}

async function getCurrentWeatherOpenMeteo({ lat, lon, units = 'metric' }) {
  // Open-Meteo uses fixed units; support 'imperial' roughly by converting.
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code');
  url.searchParams.set('timezone', 'auto');

  const resp = await fetch(url.toString(), {signal: AbortSignal.timeout(6000)});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Open-Meteo error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  const cur = data?.current || {};
  if(typeof cur.temperature_2m!=='number'||!Number.isFinite(cur.temperature_2m))throw new Error('Weather response missing temperature');

  let temperature = Number(cur.temperature_2m);
  let apparentTemperature = (typeof cur.apparent_temperature==='number'?cur.apparent_temperature:NaN);
  let windSpeed = (typeof cur.wind_speed_10m==='number'?cur.wind_speed_10m:NaN);
  const humidity = typeof cur.relative_humidity_2m==='number' && Number.isFinite(cur.relative_humidity_2m) ? cur.relative_humidity_2m : null;
  const description = weatherCodeToText(cur.weather_code);
  const asOf = typeof cur.time === 'string' ? cur.time : null;

  const city = null;

  if (units === 'imperial') {
    if (Number.isFinite(temperature)) temperature = (temperature * 9) / 5 + 32;
    if (Number.isFinite(apparentTemperature)) apparentTemperature = (apparentTemperature * 9) / 5 + 32;
    if (Number.isFinite(windSpeed)) windSpeed = windSpeed * 0.621371; // km/h -> mph
  }

  return {
    temperature: Number.isFinite(temperature) ? Math.round(temperature) : null,
    temperatureExact: Number.isFinite(temperature) ? temperature : null,
    apparentTemperature: Number.isFinite(apparentTemperature) ? Math.round(apparentTemperature) : null,
    apparentTemperatureExact: Number.isFinite(apparentTemperature) ? apparentTemperature : null,
    asOf,
    description,
    humidity,
    windSpeed: Number.isFinite(windSpeed) ? windSpeed : null,
    city,
    icon: null,
    raw: process.env.NODE_ENV === 'development' ? data : undefined,
  };
}

const cache=new Map(),pending=new Map();
async function getCurrentWeather({ lat, lon, units = 'metric' }) {
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180||!['metric','imperial'].includes(units))throw new Error('Invalid weather location');
  const key=`${lat.toFixed(2)},${lon.toFixed(2)},${units}`,cached=cache.get(key);
  if(cached&&Date.now()-cached.at<300000)return {...cached.data};
  if(pending.has(key))return {...await pending.get(key)};
  const job=(async()=>{
   let result;
   if(process.env.OPENWEATHER_API_KEY){try{result=await getCurrentWeatherOpenWeather({lat,lon,units});}catch(e){console.warn('[Weather] Primary provider unavailable; trying fallback.');}}
   if(!result)result=await getCurrentWeatherOpenMeteo({lat,lon,units});
   if(cache.size>=500)cache.delete(cache.keys().next().value);
   cache.set(key,{at:Date.now(),data:result});return result;
  })();pending.set(key,job);
  try{return {...await job};}catch(e){
   if(cached&&Date.now()-cached.at<1800000)return {...cached.data,stale:true};
   throw new Error('Weather could not refresh. Please try again shortly.');
  }finally{pending.delete(key);}
}
module.exports = { getCurrentWeather, getCurrentWeatherOpenMeteo, getCurrentWeatherOpenWeather };
