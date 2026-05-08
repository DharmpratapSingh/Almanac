// weather.js — shared weather data store. Geolocation with Austin fallback,
// then Open-Meteo. No API key. Subscribes notify on data load.

(function () {
  const AUSTIN = { lat: 30.2672, lon: -97.7431, name: 'AUSTIN, TEXAS' };

  const WMO = {
    0:  { label: 'CLEAR',        icon: 'sun',          mood: 'fair' },
    1:  { label: 'MOSTLY CLEAR', icon: 'sun-cloud',    mood: 'fair' },
    2:  { label: 'PARTLY CLOUDY',icon: 'sun-cloud',    mood: 'fair' },
    3:  { label: 'OVERCAST',     icon: 'cloud',        mood: 'gray' },
    45: { label: 'FOG',          icon: 'fog',          mood: 'gray' },
    48: { label: 'RIME FOG',     icon: 'fog',          mood: 'gray' },
    51: { label: 'LIGHT DRIZZLE',icon: 'rain',         mood: 'wet' },
    53: { label: 'DRIZZLE',      icon: 'rain',         mood: 'wet' },
    55: { label: 'HEAVY DRIZZLE',icon: 'rain',         mood: 'wet' },
    56: { label: 'FREEZING DRIZZLE', icon: 'rain',     mood: 'wet' },
    57: { label: 'FREEZING DRIZZLE', icon: 'rain',     mood: 'wet' },
    61: { label: 'LIGHT RAIN',   icon: 'rain',         mood: 'wet' },
    63: { label: 'RAIN',         icon: 'rain',         mood: 'wet' },
    65: { label: 'HEAVY RAIN',   icon: 'rain',         mood: 'wet' },
    66: { label: 'FREEZING RAIN',icon: 'rain',         mood: 'wet' },
    67: { label: 'FREEZING RAIN',icon: 'rain',         mood: 'wet' },
    71: { label: 'LIGHT SNOW',   icon: 'snow',         mood: 'cold' },
    73: { label: 'SNOW',         icon: 'snow',         mood: 'cold' },
    75: { label: 'HEAVY SNOW',   icon: 'snow',         mood: 'cold' },
    77: { label: 'SNOW GRAINS',  icon: 'snow',         mood: 'cold' },
    80: { label: 'RAIN SHOWERS', icon: 'rain',         mood: 'wet' },
    81: { label: 'RAIN SHOWERS', icon: 'rain',         mood: 'wet' },
    82: { label: 'HEAVY SHOWERS',icon: 'rain',         mood: 'wet' },
    85: { label: 'SNOW SHOWERS', icon: 'snow',         mood: 'cold' },
    86: { label: 'SNOW SHOWERS', icon: 'snow',         mood: 'cold' },
    95: { label: 'THUNDERSTORM', icon: 'storm',        mood: 'wet' },
    96: { label: 'THUNDERSTORM', icon: 'storm',        mood: 'wet' },
    99: { label: 'HEAVY STORM',  icon: 'storm',        mood: 'wet' },
  };

  const WIND_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const dirOf = (deg) => WIND_DIRS[Math.round(((deg % 360) / 22.5)) % 16];

  // moon phase: simple algorithm
  function moonPhase(date) {
    const lp = 2551443; // synodic month in seconds
    const ref = new Date(1970, 0, 7, 20, 35, 0).getTime() / 1000; // known new moon
    const phase = (((date.getTime() / 1000) - ref) % lp) / lp;
    const names = ['New','Waxing Crescent','First Quarter','Waxing Gibbous','Full','Waning Gibbous','Last Quarter','Waning Crescent'];
    const idx = Math.floor((phase * 8 + 0.5) % 8);
    return { phase, name: names[idx], illum: Math.round(50 * (1 - Math.cos(2*Math.PI*phase))) };
  }

  const state = {
    loading: true,
    error: null,
    location: null,
    current: null,
    daily: null,
    hourly: null,
    moon: moonPhase(new Date()),
    fetchedAt: null,
  };
  const subs = new Set();
  function notify() { subs.forEach((fn) => { try { fn(state); } catch(e){} }); }

  async function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(AUSTIN);
      const t = setTimeout(() => resolve(AUSTIN), 3000);
      navigator.geolocation.getCurrentPosition(
        (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lon: p.coords.longitude, name: null }); },
        () => { clearTimeout(t); resolve(AUSTIN); },
        { timeout: 2800, maximumAge: 1000 * 60 * 30 }
      );
    });
  }

  async function reverseGeocode(lat, lon) {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`);
      const j = await r.json();
      const x = j.results && j.results[0];
      if (x) return `${x.name}, ${x.admin1 || x.country_code || ''}`.toUpperCase().replace(/,\s*$/,'');
    } catch(e){}
    return null;
  }

  async function fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
      `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant` +
      `&temperature_unit=celsius&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7&past_days=0`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('weather fetch failed');
    return r.json();
  }

  async function load() {
    try {
      const loc = await getLocation();
      let name = loc.name;
      if (!name) name = (await reverseGeocode(loc.lat, loc.lon)) || 'YOUR LOCATION';
      const data = await fetchWeather(loc.lat, loc.lon);
      const c = data.current;
      const d = data.daily;
      const h = data.hourly;
      const code = c.weather_code;
      state.location = { ...loc, name };
      state.current = {
        temp: Math.round(c.temperature_2m),
        feelsLike: Math.round(c.apparent_temperature),
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation,
        cloudCover: c.cloud_cover,
        pressure: Math.round(c.pressure_msl),
        wind: Math.round(c.wind_speed_10m),
        windDir: dirOf(c.wind_direction_10m),
        windDirDeg: c.wind_direction_10m,
        gusts: Math.round(c.wind_gusts_10m),
        isDay: !!c.is_day,
        code,
        wmo: WMO[code] || { label: 'UNKNOWN', icon: 'cloud', mood: 'gray' },
      };
      state.daily = d.time.map((t, i) => ({
        date: new Date(t),
        code: d.weather_code[i],
        wmo: WMO[d.weather_code[i]] || WMO[3],
        hi: Math.round(d.temperature_2m_max[i]),
        lo: Math.round(d.temperature_2m_min[i]),
        sunrise: new Date(d.sunrise[i]),
        sunset: new Date(d.sunset[i]),
        uv: Math.round(d.uv_index_max[i] || 0),
        precip: d.precipitation_sum[i],
        precipProb: d.precipitation_probability_max[i] || 0,
        windMax: Math.round(d.wind_speed_10m_max[i] || 0),
        windDir: dirOf(d.wind_direction_10m_dominant[i] || 0),
      }));
      state.hourly = h.time.slice(0, 24).map((t, i) => ({
        time: new Date(t),
        temp: Math.round(h.temperature_2m[i]),
        precipProb: h.precipitation_probability[i] || 0,
        code: h.weather_code[i],
        wind: Math.round(h.wind_speed_10m[i] || 0),
        windDirDeg: h.wind_direction_10m ? h.wind_direction_10m[i] : 0,
      }));
      state.fetchedAt = new Date();
      state.loading = false;
      state.error = null;
    } catch (e) {
      console.error(e);
      state.error = String(e.message || e);
      state.loading = false;
    }
    notify();
  }

  window.WeatherStore = {
    get: () => state,
    subscribe: (fn) => { subs.add(fn); fn(state); return () => subs.delete(fn); },
    reload: load,
    WMO,
    moonPhase,
    dirOf,
  };

  load();
})();
