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

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenWeather error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();

  const temperature = Math.round(data.main?.temp);
  const description = data.weather?.[0]?.description || 'unknown';
  const humidity = data.main?.humidity ?? null;
  const windSpeed = data.wind?.speed ?? null;
  const city = data.name || null;
  const icon = data.weather?.[0]?.icon || null;

  return {
    temperature,
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

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Open-Meteo error (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  const cur = data?.current || {};

  let temperature = Number(cur.temperature_2m);
  let apparentTemperature = Number(cur.apparent_temperature);
  let windSpeed = Number(cur.wind_speed_10m);
  const humidity = Number.isFinite(Number(cur.relative_humidity_2m)) ? Number(cur.relative_humidity_2m) : null;
  const description = weatherCodeToText(cur.weather_code);
  const asOf = typeof cur.time === 'string' ? cur.time : null;

  // Enrich with a human-friendly place label (no API key required)
  let city = null;
  try {
    const geoUrl = new URL('https://nominatim.openstreetmap.org/reverse');
    geoUrl.searchParams.set('format', 'jsonv2');
    geoUrl.searchParams.set('lat', String(lat));
    geoUrl.searchParams.set('lon', String(lon));
    geoUrl.searchParams.set('zoom', '10');
    geoUrl.searchParams.set('addressdetails', '1');

    const gResp = await fetch(geoUrl.toString(), {
      headers: {
        'User-Agent': 'RiseQuest/1.0 (mobile-app)',
        'Accept': 'application/json',
      },
    });

    if (gResp.ok) {
      const g = await gResp.json();
      const a = g?.address || {};
      city = a.city || a.town || a.village || a.hamlet || a.county || a.state || a.country || null;
    }
  } catch (_) {
    // ignore
  }

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

async function getCurrentWeather({ lat, lon, units = 'metric' }) {
  // Prefer OpenWeather if configured; otherwise fall back to Open-Meteo (no key).
  if (process.env.OPENWEATHER_API_KEY) {
    return getCurrentWeatherOpenWeather({ lat, lon, units });
  }
  return getCurrentWeatherOpenMeteo({ lat, lon, units });
}

module.exports = {
  getCurrentWeather,
};
