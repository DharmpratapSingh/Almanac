// weather.js — shared weather data store. Geolocation with Austin fallback,
// then Open-Meteo. No API key. Subscribers notify on data load.
//
// Behavior:
//   • Stale-while-revalidate: serves cached data instantly on cold load,
//     then fetches fresh in background.
//   • AbortController on every fetch — prevents stale responses from
//     overwriting fresh ones if reloads stack up.
//   • Retry with backoff (5s, 15s) on network failure.
//   • Visibility-aware polling: refresh every 10 min while tab is visible;
//     pause when hidden; force-refresh on focus return after >2 min idle.
//   • Geolocation cache: avoids re-prompting for 24h.

(function () {
  const AUSTIN = { lat: 30.2672, lon: -97.7431, name: 'AUSTIN, TEXAS' };

  const REFRESH_MS         = 10 * 60 * 1000;     // poll every 10 min while visible
  const STALE_THRESHOLD_MS = 2 * 60 * 1000;      // force refresh on focus if hidden >2 min
  const CACHE_KEY          = 'almanac-weather';
  const CACHE_MAX_AGE_MS   = 30 * 60 * 1000;     // accept cache up to 30 min on cold load
  const GEO_KEY            = 'almanac-geo';
  const GEO_TTL_MS         = 24 * 3600 * 1000;   // re-prompt geolocation after 24h

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
    refreshing: false,        // true during background refresh (cache already shown)
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

  // ───────── localStorage cache ─────────
  function rehydrateDates(obj) {
    if (!obj) return obj;
    const o = JSON.parse(JSON.stringify(obj));
    if (o.daily) o.daily.forEach((d) => {
      d.date = new Date(d.date);
      d.sunrise = new Date(d.sunrise);
      d.sunset = new Date(d.sunset);
    });
    if (o.hourly) o.hourly.forEach((h) => { h.time = new Date(h.time); });
    if (o.fetchedAt) o.fetchedAt = new Date(o.fetchedAt);
    return o;
  }

  function saveCache() {
    try {
      const payload = {
        location: state.location,
        current: state.current,
        daily: state.daily,
        hourly: state.hourly,
        moon: state.moon,
        fetchedAt: state.fetchedAt,
        savedAt: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function loadCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!raw) return null;
      if (Date.now() - (raw.savedAt || 0) > CACHE_MAX_AGE_MS) return null;
      return rehydrateDates(raw);
    } catch (e) { return null; }
  }

  // ───────── geolocation cache ─────────
  function loadGeo() {
    try {
      const raw = JSON.parse(localStorage.getItem(GEO_KEY) || 'null');
      if (!raw) return null;
      if (Date.now() - (raw.savedAt || 0) > GEO_TTL_MS) return null;
      const { lat, lon, name } = raw;
      if (typeof lat === 'number' && typeof lon === 'number') return { lat, lon, name };
    } catch (e) {}
    return null;
  }
  function saveGeo(loc) {
    try {
      localStorage.setItem(GEO_KEY, JSON.stringify({ ...loc, savedAt: Date.now() }));
    } catch (e) {}
  }

  async function getLocation() {
    const cached = loadGeo();
    if (cached) return cached;
    return new Promise((resolve) => {
      if (!navigator.geolocation) { saveGeo(AUSTIN); return resolve(AUSTIN); }
      const t = setTimeout(() => { saveGeo(AUSTIN); resolve(AUSTIN); }, 3000);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(t);
          // Don't save yet — name will be filled after reverseGeocode in load().
          resolve({ lat: p.coords.latitude, lon: p.coords.longitude, name: null });
        },
        () => { clearTimeout(t); saveGeo(AUSTIN); resolve(AUSTIN); },
        { timeout: 2800, maximumAge: 1000 * 60 * 30 }
      );
    });
  }

  // ───────── network with abort ─────────
  let activeAbort = null;

  async function reverseGeocode(lat, lon, signal) {
    try {
      const r = await fetch(
        `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`,
        { signal }
      );
      const j = await r.json();
      const x = j.results && j.results[0];
      if (x) return `${x.name}, ${x.admin1 || x.country_code || ''}`.toUpperCase().replace(/,\s*$/, '');
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }
    return null;
  }

  async function fetchWeather(lat, lon, signal) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
      `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7&past_days=0`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function loadOnce() {
    if (activeAbort) activeAbort.abort();
    activeAbort = new AbortController();
    const signal = activeAbort.signal;

    const loc = await getLocation();
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');

    let name = loc.name;
    if (!name) name = (await reverseGeocode(loc.lat, loc.lon, signal)) || 'YOUR LOCATION';
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');

    const data = await fetchWeather(loc.lat, loc.lon, signal);
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');

    const c = data.current;
    const d = data.daily;
    const h = data.hourly;
    const code = c.weather_code;

    const newLoc = { ...loc, name };
    state.location = newLoc;
    saveGeo(newLoc);

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
    state.moon = moonPhase(new Date());
    state.fetchedAt = new Date();
    state.loading = false;
    state.refreshing = false;
    state.error = null;
    saveCache();
  }

  // Retry with backoff: 0s, 5s, 15s. Aborts are not retried.
  async function load() {
    state.refreshing = !state.loading; // only "refreshing" if we already had data
    notify();

    const delays = [0, 5000, 15000];
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
      try {
        await loadOnce();
        notify();
        return;
      } catch (e) {
        if (e.name === 'AbortError') {
          // A newer load() superseded this one — exit silently, it'll handle notify.
          state.refreshing = false;
          return;
        }
        if (i === delays.length - 1) {
          console.error('weather load failed', e);
          state.error = String(e.message || e);
          state.loading = false;
          state.refreshing = false;
          notify();
          return;
        }
        // else loop and try again after backoff
      }
    }
  }

  // ───────── visibility-aware polling ─────────
  let pollTimer = null;
  let hiddenAt = 0;

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else {
      // If we were hidden for longer than the stale threshold, force-refresh now.
      if (Date.now() - hiddenAt > STALE_THRESHOLD_MS) load();
    }
  });

  // ───────── init: warm-start from cache, then load fresh ─────────
  const cached = loadCache();
  if (cached) {
    Object.assign(state, cached);
    state.loading = false;
    state.refreshing = true;        // we have data, but it's stale — refreshing in bg
  }

  window.WeatherStore = {
    get: () => state,
    subscribe: (fn) => { subs.add(fn); fn(state); return () => subs.delete(fn); },
    reload: load,
    WMO,
    moonPhase,
    dirOf,
  };

  // Notify any subscribers added before the first paint with cached data.
  if (cached) notify();

  load();
  startPolling();
})();
