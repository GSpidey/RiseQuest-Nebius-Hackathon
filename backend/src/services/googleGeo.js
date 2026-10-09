function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function reverseGeocode({ lat, lon }) {
  const key = requireEnv('GOOGLE_MAPS_API_KEY');
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lon}`);
  url.searchParams.set('key', key);

  const resp = await fetch(url.toString());
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

async function placesAutocomplete({ input, lat, lon }) {
  const key = requireEnv('GOOGLE_MAPS_API_KEY');
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('key', key);
  if (lat != null && lon != null) {
    url.searchParams.set('location', `${lat},${lon}`);
    url.searchParams.set('radius', '50000');
  }

  const resp = await fetch(url.toString());
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

  const resp = await fetch(url.toString());
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

  const resp = await fetch(url.toString());
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

  const resp = await fetch(url.toString());
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

  const resp = await fetch(url.toString());
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
