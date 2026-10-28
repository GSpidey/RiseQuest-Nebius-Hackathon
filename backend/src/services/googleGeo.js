function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function reverseGoogle({ lat, lon }) {
  const key = requireEnv('GOOGLE_MAPS_API_KEY');
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lon}`);
  url.searchParams.set('key', key);

  const resp = await fetch(url.toString(), {signal:AbortSignal.timeout(5000)});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google Geocoding error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK') {
    throw new Error(`Google Geocoding status: ${data.status}`);
  }

  const first = data.results?.[0];

  const components = first?.address_components || [];
  const get = (type) => {
    const found = components.find(c => Array.isArray(c.types) && c.types.includes(type));
    return found?.long_name || null;
  };

  return {
    formattedAddress: first?.formatted_address || null,
    placeId: first?.place_id || null,
    country: get('country'),
    locality: get('locality'),
    administrativeAreaLevel1: get('administrative_area_level_1'),
    postalCode: get('postal_code'),
    raw: process.env.NODE_ENV === 'development' ? data : undefined,
  };
}

const reverseCache=new Map(),reversePending=new Map();
let lastFallback=0,geoQueue=Promise.resolve();
async function reverseGeocode({lat,lon}) {
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw new Error('Invalid location');
 const cacheKey=`${lat.toFixed(3)},${lon.toFixed(3)}`,cached=reverseCache.get(cacheKey);
 if(cached&&Date.now()-cached.at<3600000)return cached.data;
 if(reversePending.has(cacheKey))return reversePending.get(cacheKey);
 const work=(async()=>{
  let result;
  if(process.env.GOOGLE_MAPS_API_KEY){try{result=await reverseGoogle({lat,lon});}catch(e){console.warn('[Geocoding] Primary reverse lookup unavailable.');}}
  if(!result){
   // Bound fallback load and obey the public provider's one-request-per-second limit.
   if(reversePending.size>4)throw new Error('Place names are busy. Coordinates remain available.');
   const fallback=geoQueue.catch(()=>{}).then(async()=>{
    const wait=1100-(Date.now()-lastFallback);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastFallback=Date.now();
    const url=new URL('https://nominatim.openstreetmap.org/reverse');
    for(const [k,v] of Object.entries({format:'jsonv2',lat,lon,zoom:14,addressdetails:1}))url.searchParams.set(k,String(v));
    const r=await fetch(url,{signal:AbortSignal.timeout(4000),headers:{'User-Agent':'RiseQuest/1.2 (https://risequest-api.goldenepics.com; admin@goldenepics.com)','Accept':'application/json'}});
    if(!r.ok)throw new Error('Place name unavailable');const g=await r.json(),a=g.address||{};
    return {formattedAddress:g.display_name||null,locality:a.city||a.town||a.village||a.county||null,administrativeAreaLevel1:a.state||null,country:a.country||null,postalCode:a.postcode||null,placeId:null,attribution:'© OpenStreetMap contributors'};
   });geoQueue=fallback;result=await fallback;
  }
  if(reverseCache.size>=500)reverseCache.delete(reverseCache.keys().next().value);
  reverseCache.set(cacheKey,{at:Date.now(),data:result});return result;
 })();reversePending.set(cacheKey,work);
 try{return await work;}finally{reversePending.delete(cacheKey);}
}

async function placesAutocomplete({ input, lat, lon }) {
  const key = requireEnv('GOOGLE_MAPS_API_KEY');
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('key', key);
  if (lat != null && lon != null) {
    url.searchParams.set('location', `${lat},${lon}`);
    url.searchParams.set('radius', '50000');
  }

  const resp = await fetch(url.toString(), {signal:AbortSignal.timeout(5000)});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google Places error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places status: ${data.status}`);
  }

  const predictions = (data.predictions || []).slice(0, 10).map(p => ({
    description: p.description,
    placeId: p.place_id,
    types: p.types,
  }));

  return { predictions };
}

async function geocodeAddress({ address }) {
  const key = requireEnv('GOOGLE_MAPS_API_KEY');
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', key);

  const resp = await fetch(url.toString(), {signal:AbortSignal.timeout(5000)});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google Geocoding error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK') {
    throw new Error(`Google Geocoding status: ${data.status}`);
  }
  const first = data.results?.[0];
  return {
    latitude: first?.geometry?.location?.lat ?? null,
    longitude: first?.geometry?.location?.lng ?? null,
    formattedAddress: first?.formatted_address || null,
    placeId: first?.place_id || null,
  };
}

async function placesTextSearch({ query, lat, lon, radius = 50000 }) {
  const key = requireEnv('GOOGLE_MAPS_API_KEY');
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  url.searchParams.set('key', key);
  if (lat != null && lon != null) {
    url.searchParams.set('location', `${lat},${lon}`);
    url.searchParams.set('radius', String(radius));
  }

  const resp = await fetch(url.toString(), {signal:AbortSignal.timeout(5000)});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google Places error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places status: ${data.status}`);
  }

  return {
    results: (data.results || []).slice(0, 20).map(place => ({
      placeId: place.place_id,
      name: place.name,
      formattedAddress: place.formatted_address,
      latitude: place.geometry?.location?.lat,
      longitude: place.geometry?.location?.lng,
      rating: place.rating,
      types: place.types,
    })),
  };
}

async function placeDetails({ placeId, fields }) {
  const key = requireEnv('GOOGLE_MAPS_API_KEY');
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', fields || 'name,formatted_address,geometry,rating,formatted_phone_number,opening_hours,website');
  url.searchParams.set('key', key);

  const resp = await fetch(url.toString(), {signal:AbortSignal.timeout(5000)});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google Place Details error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK') {
    throw new Error(`Google Place Details status: ${data.status}`);
  }
  return { result: data.result };
}

async function nearbyPlaces({ lat, lon, type = 'point_of_interest', radius = 5000 }) {
  const key = requireEnv('GOOGLE_MAPS_API_KEY');
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location', `${lat},${lon}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('type', type);
  url.searchParams.set('key', key);

  const resp = await fetch(url.toString(), {signal:AbortSignal.timeout(5000)});
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Google Nearby error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Nearby status: ${data.status}`);
  }
  return {
    results: (data.results || []).slice(0, 20).map(place => ({
      placeId: place.place_id,
      name: place.name,
      vicinity: place.vicinity,
      latitude: place.geometry?.location?.lat,
      longitude: place.geometry?.location?.lng,
      rating: place.rating,
      types: place.types,
      priceLevel: place.price_level,
    })),
  };
}

module.exports = {
  reverseGeocode,
  placesAutocomplete,
  geocodeAddress,
  placesTextSearch,
  placeDetails,
  nearbyPlaces,
};
