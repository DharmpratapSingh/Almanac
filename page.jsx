// page.jsx — single-page broadsheet almanac that scrolls into a celestial chart.
// Light/dark theming via [data-theme] on <html>; canvas illustrations re-render
// on theme change so ink/paper match. Uses dot-matrix render mode for the
// stippled Anthropic-artifact look.

const { useEffect, useState, useRef, useMemo, useCallback } = React;
const D = window.Dither;
const W = window.WeatherStore;

// ── theme hook ────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('almanac-theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('almanac-theme', dark ? 'dark' : 'light'); } catch {}
    // Update Dither so canvas drawings flip.
    if (dark) {
      D.setTheme({ ink: '#f3ecd9', paper: '#14110d', accent: '#e8754d', mode: 'dot' });
    } else {
      D.setTheme({ ink: '#1a1612', paper: '#f3ecd9', accent: '#c25a3a', mode: 'dot' });
    }
  }, [dark]);
  return [dark, setDark];
}

// rAF tick
function useTick(speed = 1) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, last = performance.now();
    const loop = (now) => { setT(p => p + (now - last) * 0.06 * speed); last = now; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed]);
  return t;
}

function useWeather() {
  const [s, setS] = useState(() => ({ ...W.get() }));
  useEffect(() => W.subscribe((next) => setS({ ...next })), []);
  return s;
}

function useRoll(target, dur = 1300) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target == null) return;
    let raf, start = performance.now();
    const loop = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setV(Math.round(target * e));
      if (t < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

// ── shared canvas wrapper that redraws on theme change & on tick ─────
function PixCanvas({ w, h, scale = 6, draw, deps = [], style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = ref.current;
    c.width = w * scale; c.height = h * scale;
    c._w = w; c._h = h; c._s = scale;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    D.clear(c, 'rgba(0,0,0,0)');
    draw(c);
  }, deps);
  return <canvas ref={ref} style={{ imageRendering: 'pixelated', display: 'block', ...style }} />;
}

// ── animated illustrations ─────────────────────────────────────────
function HeroScene({ kind, dark, w = 360, h = 280, scale = 5 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = ref.current; const W2 = Math.round(w / scale), H2 = Math.round(h / scale);
    c.width = W2 * scale; c.height = H2 * scale; c._w = W2; c._h = H2; c._s = scale;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    let raf, t0 = performance.now();
    const loop = (now) => {
      const t = (now - t0) / 1000;
      D.clear(c, 'rgba(0,0,0,0)');
      const cx = Math.floor(W2 / 2), cy = Math.floor(H2 / 2);
      if (kind === 'sun')        D.drawSun(c, cx - 6, cy, 18, t * 0.4);
      else if (kind === 'sun-cloud') {
        D.drawSun(c, cx - 12, cy - 4, 16, t * 0.4);
        const dx = Math.sin(t * 0.3) * 3;
        D.drawCloud(c, cx + 10 + dx, cy + 6, 26, 16);
      }
      else if (kind === 'cloud' || kind === 'overcast') {
        D.drawCloud(c, cx - 10, cy - 6, 26, 16);
        D.drawCloud(c, cx + 12, cy + 4, 22, 14);
      }
      else if (kind === 'fog') {
        D.drawCloud(c, cx, cy - 6, 28, 16);
        for (let i = 0; i < 4; i++) {
          const yy = cy + 6 + i * 3;
          const off = Math.round(Math.sin(t * 0.5 + i) * 6);
          for (let x = 0; x < W2 - 8; x += 3) D.px(c, 4 + x + off, yy);
        }
      }
      else if (kind === 'rain') {
        D.drawCloud(c, cx, cy - 8, 28, 16);
        D.drawRain(c, cx - 18, cy + 4, 36, H2 - cy - 6, t * 30);
      }
      else if (kind === 'snow') {
        D.drawCloud(c, cx, cy - 8, 28, 16);
        D.drawSnow(c, cx - 18, cy + 4, 36, H2 - cy - 6, t * 30);
      }
      else if (kind === 'storm') {
        D.drawCloud(c, cx, cy - 8, 28, 16);
        D.drawRain(c, cx - 18, cy + 6, 36, H2 - cy - 8, t * 30);
        if (Math.floor(t * 1.3) % 3 === 0 && (t % 1) < 0.4) D.drawBolt(c, cx - 4, cy);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, dark, w, h, scale]);
  return <canvas ref={ref} style={{ imageRendering: 'pixelated', width: w, height: h, display: 'block' }} />;
}

function SmallIcon({ kind, size = 28, dark }) {
  return <PixCanvas w={16} h={16} scale={Math.max(2, Math.floor(size / 16))}
    deps={[kind, size, dark]}
    style={{ width: size, height: size }}
    draw={(c) => {
      if (kind === 'sun')        D.drawSun(c, 8, 8, 4, 0);
      else if (kind === 'sun-cloud') { D.drawSun(c, 6, 6, 3, 0); D.drawCloud(c, 10, 10, 5, 4); }
      else if (kind === 'cloud') D.drawCloud(c, 8, 8, 6, 5);
      else if (kind === 'fog')   { D.drawCloud(c, 8, 6, 6, 4); for (let x = 1; x < 16; x += 3) D.px(c, x, 12); }
      else if (kind === 'rain')  { D.drawCloud(c, 8, 5, 6, 4); for (let i = 0; i < 4; i++) D.px(c, 4 + i*3, 10 + (i%2)); }
      else if (kind === 'snow')  { D.drawCloud(c, 8, 5, 6, 4); for (let i = 0; i < 4; i++) D.px(c, 4 + i*3, 11 + (i%2)); }
      else if (kind === 'storm') { D.drawCloud(c, 8, 5, 6, 4); D.drawBolt(c, 6, 8); }
    }} />;
}

function Compass({ deg, size, dark }) {
  const tick = useTick(0.4);
  const wobble = (deg || 0) + Math.sin(tick * 0.05) * 4;
  return <PixCanvas w={32} h={32} scale={Math.floor(size / 32)} deps={[wobble, dark, size]}
    style={{ width: size, height: size }}
    draw={(c) => D.drawCompass(c, 16, 16, 14, wobble)} />;
}

function MoonIcon({ phase, size = 64, dark }) {
  return <PixCanvas w={32} h={32} scale={Math.floor(size / 32)} deps={[phase, dark, size]}
    style={{ width: size, height: size }}
    draw={(c) => D.drawMoon(c, 16, 16, 13, phase)} />;
}

// ── theme toggle ───────────────────────────────────────────────────
function ThemeToggle({ dark, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle} aria-label="Toggle theme">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style={{ flexShrink: 0 }}>
        {dark
          ? <path d="M9.5 1.5a5 5 0 1 0 3 9.2A6 6 0 0 1 9.5 1.5z"/>
          : <g><circle cx="7" cy="7" r="3"/><g stroke="currentColor" strokeWidth="1.5"><line x1="7" y1="0" x2="7" y2="2"/><line x1="7" y1="12" x2="7" y2="14"/><line x1="0" y1="7" x2="2" y2="7"/><line x1="12" y1="7" x2="14" y2="7"/><line x1="2" y1="2" x2="3.4" y2="3.4"/><line x1="10.6" y1="10.6" x2="12" y2="12"/><line x1="2" y1="12" x2="3.4" y2="10.6"/><line x1="10.6" y1="3.4" x2="12" y2="2"/></g></g>}
      </svg>
      {dark ? 'NIGHT' : 'DAY'}
    </button>
  );
}

// ── Loading ────────────────────────────────────────────────────────
function Loading({ dark }) {
  const [d, setD] = useState(0);
  useEffect(() => { const id = setInterval(() => setD(x => (x + 1) % 4), 350); return () => clearInterval(id); }, []);
  return (
    <div style={{ minHeight: '100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap: 18 }}>
      <HeroScene kind="sun" dark={dark} w={120} h={120} scale={6} />
      <div style={{ fontFamily: '"VT323", monospace', fontSize: 24, letterSpacing: 1, color: 'var(--rust)' }}>
        CONSULTING THE ALMANAC{'.'.repeat(d)}
      </div>
    </div>
  );
}

// ── Masthead / Header ──────────────────────────────────────────────
function Masthead({ s }) {
  const today = (s.daily && s.daily[0]) || {};
  const date = today.date || new Date();
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const dateLine = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  return (
    <header style={{ padding: '24px 28px 12px', borderBottom: '4px double var(--ink)', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: '"VT323", monospace',
        fontSize: 14, letterSpacing: 2, marginBottom: 6, color: 'var(--slate)' }}>
        <span>VOL. MMXXVI · NO. {String(date.getDate()).padStart(2,'0')}</span>
        <span>EST. 1792</span>
        <span>{(s.current.pressure / 33.8639).toFixed(2)} INHG</span>
      </div>
      <div style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(48px, 8vw, 110px)',
        color: 'var(--rust)', lineHeight: 0.92, textAlign: 'center', letterSpacing: 4, fontWeight: 400,
        animation: 'flicker 5s infinite', textShadow: '2px 2px 0 color-mix(in srgb, var(--ink) 14%, transparent)' }}>
        THE&nbsp;WEATHER&nbsp;ALMANAC
      </div>
      <div style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 16, marginTop: 6 }}>
        A Daily Register of Atmospheric Phenomena, with Tables, Forecasts &amp; Celestial Notes
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10,
        borderTop: '1px solid var(--ink)', paddingTop: 6, fontFamily: '"VT323", monospace',
        fontSize: 16, letterSpacing: 1 }}>
        <span>{dayName} · {dateLine}</span>
        <span>{s.location?.name}</span>
      </div>
    </header>
  );
}

// ── Page 1 — Broadsheet ────────────────────────────────────────────
function BroadsheetSection({ s, dark }) {
  const c = s.current, d = s.daily || [], h = s.hourly || [];
  const today = d[0] || {};
  const tempRoll = useRoll(c.temp, 1400);
  const feelsRoll = useRoll(c.feelsLike, 1500);
  return (
    <section style={{ padding: '0 28px 22px', position: 'relative' }}>
      <div className="stipple-bg" />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
        gap: 24, position: 'relative', zIndex: 1 }}>
        {/* LEFT — hero */}
        <div className="reveal">
          <div style={{ fontFamily: '"VT323",monospace', fontSize: 14, letterSpacing: 3,
            color: 'var(--slate)', borderBottom: '1px solid var(--ink)', paddingBottom: 4, marginTop: 18 }}>
            ☼ AT THIS MOMENT ☼
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'center', marginTop: 10 }}>
            <HeroScene kind={c.wmo.icon} dark={dark} w={300} h={240} scale={6} />
            <div>
              <div style={{ fontFamily: '"VT323",monospace', fontSize: 'clamp(120px, 16vw, 220px)',
                lineHeight: 0.82, fontWeight: 400, fontFeatureSettings: '"tnum"',
                color: 'var(--ink)', textShadow: '4px 4px 0 color-mix(in srgb, var(--rust) 25%, transparent)' }}>
                {tempRoll}°
              </div>
              <div style={{ fontFamily: '"VT323", monospace', fontSize: 26, color: 'var(--rust)',
                letterSpacing: 2, marginTop: 4 }}>{c.wmo.label}</div>
              <div style={{ fontStyle: 'italic', fontSize: 18, marginTop: 4 }}>
                Feels like {feelsRoll}° · Humidity {c.humidity}%
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span className="chip">⌬ {c.wind} MPH {c.windDir}</span>
                <span className="chip">☂ {today.precipProb || 0}%</span>
                <span className="chip rust">UV {today.uv || 0}</span>
              </div>
            </div>
          </div>

          {/* Reading of the heavens — drop-cap narrative */}
          <article style={{ marginTop: 18, fontSize: 17, lineHeight: 1.5, columnCount: 2,
            columnGap: 18, columnRule: '1px solid var(--ink)', textWrap: 'pretty' }}>
            <h3 style={{ fontFamily: '"VT323", monospace', fontSize: 14, letterSpacing: 2,
              color: 'var(--slate)', margin: '0 0 4px', columnSpan: 'all' }}>
              READING OF THE HEAVENS
            </h3>
            <p style={{ margin: '0 0 10px' }}>
              <span style={{ fontFamily: '"VT323", monospace', fontSize: 56, float: 'left',
                lineHeight: 0.78, marginRight: 6, marginTop: 4, color: 'var(--rust)' }}>
                {c.wmo.label[0]}
              </span>
              he firmament reads <i>{c.wmo.label.toLowerCase()}</i>; wind comes from
              the <b>{c.windDir}</b> at {c.wind} miles per hour, gusting to {c.gusts}.
              The barometer holds {(c.pressure / 33.8639).toFixed(2)} inches of mercury,
              and {c.cloudCover}% of the heavens lie under cloud.
            </p>
            <p style={{ margin: 0 }}>
              The Sun rose at {today.sunrise?.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})},
              and shall set at {today.sunset?.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}.
              The Moon stands {s.moon.name.toLowerCase()}, illumined {s.moon.illum}%.
              Look ye downward for tomorrow's outlook, and the celestial chart entire.
            </p>
          </article>
        </div>

        {/* RIGHT — tables */}
        <aside className="reveal" style={{ animationDelay: '.15s' }}>
          <div style={{ marginTop: 18 }}>
            <div style={{ fontFamily: '"VT323",monospace', fontSize: 14, letterSpacing: 3,
              color: 'var(--slate)', borderBottom: '1px solid var(--ink)', paddingBottom: 4 }}>
              ✦ THE WEEK AHEAD ✦
            </div>
            <table className="almtable" style={{ marginTop: 4 }}>
              <tbody>
                {d.slice(0, 7).map((day, i) => (
                  <tr key={i}>
                    <td style={{ width: 56 }}>{day.date.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase()}</td>
                    <td style={{ width: 36 }}><SmallIcon kind={day.wmo.icon} size={26} dark={dark} /></td>
                    <td>{day.wmo.label}</td>
                    <td style={{ color: 'var(--rust)', textAlign: 'right' }}>{day.hi}°</td>
                    <td style={{ color: 'var(--slate)', textAlign: 'right', width: 36 }}>{day.lo}°</td>
                    <td style={{ textAlign: 'right', width: 56, fontSize: 14 }}>
                      {day.precipProb > 5 ? `${day.precipProb}%☂` : '·'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: '"VT323",monospace', fontSize: 14, letterSpacing: 3,
              color: 'var(--slate)', borderBottom: '1px solid var(--ink)', paddingBottom: 4 }}>
              ◆ OBSERVATIONS ◆
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
              {[
                ['WIND', `${c.wind} ${c.windDir}`],
                ['GUSTS', `${c.gusts} MPH`],
                ['PRESS.', `${(c.pressure/33.8639).toFixed(2)}"`],
                ['HUMID', `${c.humidity}%`],
                ['UV IDX', `${today.uv ?? 0}`],
                ['CLOUDS', `${c.cloudCover}%`],
                ['SUNRISE', today.sunrise?.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) || '—'],
                ['SUNSET',  today.sunset?.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) || '—'],
              ].map(([k, v], i) => (
                <div key={i} className="stat-block" style={{ display: 'flex', justifyContent: 'space-between',
                  borderBottom: '1px dotted var(--ink)', padding: '4px 0',
                  fontFamily: '"VT323", monospace', fontSize: 18 }}>
                  <span style={{ color: 'var(--slate)' }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center',
            borderTop: '2px solid var(--ink)', paddingTop: 10 }}>
            <Compass deg={c.windDirDeg} size={96} dark={dark} />
            <div style={{ fontFamily: '"VT323", monospace' }}>
              <div style={{ fontSize: 14, letterSpacing: 2, color: 'var(--slate)' }}>WIND ROSE</div>
              <div style={{ color: 'var(--rust)', fontSize: 36, lineHeight: 1 }}>{c.windDir}</div>
              <div style={{ fontSize: 16, color: 'var(--slate)' }}>{Math.round(c.windDirDeg)}° azimuth</div>
              <div style={{ fontSize: 16, marginTop: 2 }}>gusts {c.gusts}mph</div>
            </div>
          </div>
        </aside>
      </div>

      {/* hourly ticker */}
      <HourlyTicker hours={h} dark={dark} />
    </section>
  );
}

function HourlyTicker({ hours, dark }) {
  return (
    <div style={{ marginTop: 22, borderTop: '4px double var(--ink)', borderBottom: '1px solid var(--ink)',
      padding: '8px 0', overflow: 'hidden', position: 'relative' }}>
      <div style={{ fontFamily: '"VT323",monospace', fontSize: 12, letterSpacing: 3,
        color: 'var(--slate)', marginBottom: 4 }}>HOURLY · NEXT 24 HOURS</div>
      <div className="ticker">
        {[...hours, ...hours].map((hr, i) => {
          const wmo = (W.WMO && W.WMO[hr.code]) || { icon: 'cloud' };
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: '"VT323", monospace', fontSize: 18, minWidth: 110, color: 'var(--ink)' }}>
              <span style={{ color: 'var(--slate)', minWidth: 32 }}>
                {hr.time.getHours().toString().padStart(2,'0')}h
              </span>
              <SmallIcon kind={wmo.icon} size={22} dark={dark} />
              <span style={{ color: 'var(--rust)' }}>{hr.temp}°</span>
              {hr.precipProb > 5 && <span style={{ fontSize: 14, color: 'var(--slate)' }}>☂{hr.precipProb}%</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page 2 — Celestial Chart (scrolls into view) ───────────────────
function CelestialSection({ s, dark }) {
  const c = s.current, d = s.daily || [];
  const today = d[0] || {};
  const tick = useTick(0.6);
  const now = new Date();
  const rise = today.sunrise?.getTime() || now.getTime();
  const set  = today.sunset?.getTime()  || (now.getTime() + 12*3600*1000);
  const dayLen = (set - rise) / 1000 / 3600;
  let sunPos = (now.getTime() - rise) / (set - rise);
  sunPos = Math.max(0, Math.min(1, sunPos));

  return (
    <section style={{ padding: '36px 28px 64px', position: 'relative',
      background: 'var(--paper-2)', borderTop: '4px double var(--ink)', overflow: 'hidden' }}>
      <div className="stipple-bg" style={{ opacity: .12 }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6, fontFamily: '"VT323", monospace', fontSize: 14, letterSpacing: 2, color: 'var(--slate)' }}>
          <span>FIG. II · CHART OF THE HEAVENS</span>
          <span>FOR {now.toLocaleDateString('en-US',{ month:'short', day:'2-digit', year:'numeric' }).toUpperCase()}</span>
        </div>
        <h2 style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(40px, 6vw, 80px)',
          color: 'var(--rust)', margin: 0, lineHeight: 1, letterSpacing: 3,
          textAlign: 'center', textShadow: '3px 3px 0 color-mix(in srgb, var(--ink) 18%, transparent)' }}>
          ─── CELESTIAL CHART ───
        </h2>
        <div style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 18, marginTop: 4, marginBottom: 18 }}>
          Of the Sun, the Moon, &amp; the Disposition of Air for {s.location?.name}
        </div>

        {/* SKY ARC — full width */}
        <SkyArc sunPos={sunPos} icon={c.wmo.icon} tick={tick} dark={dark} />

        {/* sunrise/sunset/zenith line */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          fontFamily: '"VT323",monospace', fontSize: 18, marginTop: -12, padding: '0 6px' }}>
          <span>↑ {today.sunrise?.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} <span style={{ color: 'var(--slate)' }}>RISE</span></span>
          <span style={{ color: 'var(--rust)' }}>☉ {dayLen.toFixed(2)} HOURS OF SUN</span>
          <span><span style={{ color: 'var(--slate)' }}>SET</span> ↓ {today.sunset?.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
        </div>

        {/* horizon mountains */}
        <Horizon dark={dark} />

        {/* Two-column moon + 5 day */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 28, marginTop: 24 }}>
          <div className="reveal" style={{ borderRight: '1px dashed var(--ink)', paddingRight: 24 }}>
            <div style={{ fontFamily: '"VT323",monospace', fontSize: 14, letterSpacing: 3,
              color: 'var(--slate)', marginBottom: 8 }}>☾ LUNAR ☾</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <MoonIcon phase={s.moon.phase} size={120} dark={dark} />
              <div>
                <div style={{ fontFamily: '"VT323",monospace', fontSize: 28,
                  color: 'var(--rust)', letterSpacing: 1 }}>{s.moon.name.toUpperCase()}</div>
                <div style={{ fontFamily: '"VT323",monospace', fontSize: 18 }}>
                  {s.moon.illum}% illumined
                </div>
                <div style={{ fontStyle: 'italic', marginTop: 4, fontSize: 15 }}>
                  "{forecastPoetry(c)}"
                </div>
              </div>
            </div>
          </div>
          <div className="reveal" style={{ animationDelay: '.15s' }}>
            <div style={{ fontFamily: '"VT323",monospace', fontSize: 14, letterSpacing: 3,
              color: 'var(--slate)', marginBottom: 8 }}>★ FIVE DAYS HENCE ★</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {d.slice(1, 6).map((day, i) => (
                <div key={i} style={{ textAlign: 'center', fontFamily: '"VT323",monospace',
                  borderRight: i < 4 ? '1px dotted var(--ink)' : 'none', padding: '4px 6px' }}>
                  <div style={{ fontSize: 14, color: 'var(--slate)', letterSpacing: 1 }}>
                    {day.date.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                    <SmallIcon kind={day.wmo.icon} size={42} dark={dark} />
                  </div>
                  <div style={{ fontSize: 22, color: 'var(--rust)', lineHeight: 1 }}>{day.hi}°</div>
                  <div style={{ fontSize: 16, color: 'var(--slate)' }}>{day.lo}°</div>
                  {day.precipProb > 5 && <div style={{ fontSize: 12, color: 'var(--slate)' }}>☂{day.precipProb}%</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom dotted ornament */}
        <div style={{ marginTop: 28, textAlign: 'center', fontFamily: '"VT323",monospace',
          fontSize: 14, letterSpacing: 6, color: 'var(--slate)' }}>
          ☼ ☾ ★ ☄ ✦ ☼ ☾ ★ ☄ ✦ ☼ ☾ ★ ☄ ✦
        </div>
      </div>
    </section>
  );
}

function forecastPoetry(c) {
  const m = c.wmo.mood;
  if (m === 'fair') return 'Fair winds, a gentle hand upon the meadow.';
  if (m === 'wet')  return 'Heavens loose their cisterns; bring an oilskin.';
  if (m === 'cold') return 'Frost\u2019s small architecture upon every pane.';
  return 'A canopy of vapor lies upon the country.';
}

// SkyArc — full-width responsive canvas
function SkyArc({ sunPos, icon, tick, dark }) {
  const ref = useRef(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const update = () => { if (ref.current) setW(ref.current.parentElement.offsetWidth); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const c = ref.current; const W2 = Math.min(360, Math.round(w / 4)); const H2 = 80; const s = 4;
    c.width = W2 * s; c.height = H2 * s; c._w = W2; c._h = H2; c._s = s;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    D.clear(c, 'rgba(0,0,0,0)');
    // dotted arc path
    for (let t = 0; t <= 1; t += 1/240) {
      const x = Math.round(8 + t * (W2 - 16));
      const y = Math.round(H2 - 6 - Math.sin(t * Math.PI) * (H2 - 18));
      if (Math.floor(t * 80) % 2 === 0) D.px(c, x, y);
    }
    // hour ticks every 2h
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = Math.round(8 + t * (W2 - 16));
      const y = Math.round(H2 - 6 - Math.sin(t * Math.PI) * (H2 - 18));
      D.px(c, x, y + 2); D.px(c, x, y + 3);
    }
    // dithered passed-arc trail
    const acc = D.getAccent();
    for (let t = 0; t < sunPos; t += 1/300) {
      const x = Math.round(8 + t * (W2 - 16));
      const y = Math.round(H2 - 6 - Math.sin(t * Math.PI) * (H2 - 18));
      const bx = ((x % 8) + 8) % 8, by = ((y % 8) + 8) % 8;
      if (D.BAYER8[by * 8 + bx] < 0.5) {
        D.px(c, x, y - 1, acc); D.px(c, x, y, acc); D.px(c, x, y + 1, acc);
      }
    }
    // sun
    const sx = Math.round(8 + sunPos * (W2 - 16));
    const sy = Math.round(H2 - 6 - Math.sin(sunPos * Math.PI) * (H2 - 18));
    if (icon === 'rain' || icon === 'storm' || icon === 'cloud' || icon === 'fog')
      D.drawCloud(c, sx, sy - 2, 14, 9);
    else if (icon === 'sun-cloud') { D.drawSun(c, sx-3, sy-2, 6, tick * 0.05); D.drawCloud(c, sx+5, sy+1, 9, 6); }
    else D.drawSun(c, sx, sy - 2, 8, tick * 0.05);
    // moon at end
    D.drawMoon(c, W2 - 12, 12, 6, 0.35);
    // stars in dark mode
    if (dark) {
      for (let i = 0; i < 12; i++) {
        const sx2 = (i * 37 + 11) % W2;
        const sy2 = ((i * 13) % 16) + 4;
        D.px(c, sx2, sy2);
      }
    }
  }, [sunPos, icon, tick, dark, w]);
  return <canvas ref={ref} style={{ imageRendering: 'pixelated', width: '100%', height: 240, display: 'block' }} />;
}

function Horizon({ dark }) {
  const ref = useRef(null);
  const tick = useTick(0.4);
  const [w, setW] = useState(900);
  useEffect(() => {
    const update = () => { if (ref.current) setW(ref.current.parentElement.offsetWidth); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const c = ref.current;
    const W2 = Math.min(360, Math.round(w / 4)); const H2 = 30; const s = 4;
    c.width = W2 * s; c.height = H2 * s; c._w = W2; c._h = H2; c._s = s;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    D.clear(c, 'rgba(0,0,0,0)');
    D.drawMountains(c, 0, 0, W2, H2);
    // birds
    for (let i = 0; i < 3; i++) {
      const bx = Math.floor(((tick * 0.5 + i * 80) % (W2 + 20)) - 10);
      const by = 8 + Math.floor(Math.sin(tick * 0.05 + i) * 2);
      D.px(c, bx, by); D.px(c, bx + 1, by - 1); D.px(c, bx + 2, by);
      D.px(c, bx + 3, by - 1); D.px(c, bx + 4, by);
    }
  }, [tick, dark, w]);
  return <canvas ref={ref} style={{ imageRendering: 'pixelated', width: '100%', height: 90, display: 'block' }} />;
}

// ── Footer ───────────────────────────────────────────────────────
function Footer({ s }) {
  return (
    <footer style={{ borderTop: '4px double var(--ink)', padding: '14px 28px 22px',
      fontFamily: '"VT323", monospace', fontSize: 16, color: 'var(--slate)',
      display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <span>DATA · OPEN-METEO · {s.fetchedAt?.toLocaleTimeString() || '—'}</span>
      <span style={{ color: 'var(--rust)' }}>● TRANSMISSION COMPLETE</span>
      <span>{s.location?.lat?.toFixed(2)}°N {s.location?.lon?.toFixed(2)}°W</span>
    </footer>
  );
}

// ── Page ─────────────────────────────────────────────────────────
function Page() {
  const [dark, setDark] = useTheme();
  const s = useWeather();

  const Diorama = window.WeatherDiorama;
  const Instruments = window.InstrumentsSection;
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)' }}>
      <ThemeToggle dark={dark} onToggle={() => setDark(d => !d)} />
      {s.loading || !s.current
        ? <Loading dark={dark} />
        : (
          <>
            <Masthead s={s} />
            <BroadsheetSection s={s} dark={dark} />
            {Instruments && <Instruments s={s} dark={dark} />}
            {Diorama && <Diorama s={s} dark={dark} />}
            <CelestialSection s={s} dark={dark} />
            <Footer s={s} />
          </>
        )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Page />);
