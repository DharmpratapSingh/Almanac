// dayinweather.jsx — five different "A Day in the Weather" treatments with a switcher.
// Each mode draws on the same hourly forecast but presents an entirely different visual
// vocabulary. Toggle between them with the strip of buttons at the top.

const { useEffect, useRef, useState, useMemo } = React;
const Dw = window.Dither;
const WS = window.WeatherScene;
const Wstore3 = window.WeatherStore;

// ── shared timeline builder ───────────────────────────────────
function useTimeline(s, dayIdx) {
  return useMemo(() => {
    const hourly = s.hourly || [];
    const daily = s.daily || [];
    let timeline = [];
    if (dayIdx <= 1 && hourly.length) {
      const start = dayIdx === 0 ? 0 : 12;
      const slice = hourly.slice(start, start + 24);
      // 8 evenly-sampled scenes
      const step = Math.max(1, Math.floor(slice.length / 8));
      timeline = slice.filter((_, i) => i % step === 0).slice(0, 8).map((h, i) => ({
        label: i === 0 && dayIdx === 0 ? 'NOW'
          : h.time.toLocaleTimeString('en-US', { hour: 'numeric' }).toUpperCase(),
        hour: h.time.getHours(),
        time: h.time,
        code: h.code, temp: h.temp, precipProb: h.precipProb,
      }));
    } else if (daily[dayIdx]) {
      const d = daily[dayIdx];
      const labels = ['DAWN','MORN','LATE MORN','NOON','AFT.','LATE AFT.','EVE','NIGHT'];
      const hours = [6, 9, 11, 12, 14, 16, 19, 22];
      timeline = labels.map((label, i) => ({
        label, hour: hours[i], time: new Date(d.date.getTime() + hours[i]*3600*1000),
        code: d.code, temp: d.hi, precipProb: d.precipProb,
      }));
    }
    return timeline;
  }, [s, dayIdx]);
}

function useTickRaf(active = true) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf, t0 = performance.now();
    const loop = (now) => { setT(now - t0); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return t;
}

// rAF canvas that calls draw(c, tick, w, h) and resizes with parent
function PixCanvasAuto({ height, draw, deps = [], scale = 5, maxLogicalW = 600, minLogicalW = 80 }) {
  const ref = useRef(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const update = () => { if (ref.current?.parentElement) setW(ref.current.parentElement.offsetWidth); };
    update();
    const ro = new ResizeObserver(update);
    if (ref.current?.parentElement) ro.observe(ref.current.parentElement);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const c = ref.current;
    const W2 = Math.min(maxLogicalW, Math.max(minLogicalW, Math.floor(w / scale)));
    const H2 = Math.floor(height / scale);
    c.width = W2 * scale; c.height = H2 * scale; c._w = W2; c._h = H2; c._s = scale;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    let raf;
    const render = (now) => {
      Dw.clear(c, 'rgba(0,0,0,0)');
      draw(c, now * 0.06, W2, H2);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [w, height, scale, ...deps]);
  return <canvas ref={ref} style={{ imageRendering: 'pixelated', width: '100%', height, display: 'block' }} />;
}

// ── MODE A · STORYBOARD (cinematic frames of the day) ───────────────────────
// Each panel is a wide cinemascope frame with rich, weather-specific scenery.
// Hours that fall after dusk override clear/cloud kinds with a stargazing scene.

// shared per-panel helpers
const KIND_WIND = { sun: 6, 'sun-cloud': 9, cloud: 5, fog: 2, rain: 14, snow: 4, storm: 22 };
function dwShadowLen(hour) {
  // morning: long shadow to the LEFT (sun in east). evening: long to the RIGHT.
  // noon: ~zero. clamped.
  const h = hour - 12;
  return Math.max(-12, Math.min(12, Math.round(h * 1.6)));
}
function dwShadow(c, x, groundY, len) {
  if (!len) return;
  const sign = len > 0 ? 1 : -1, n = Math.abs(len);
  for (let dx = 1; dx <= n; dx++) {
    const t = dx / n;
    const halfH = Math.max(1, Math.floor((1 - t) * 1.4));
    for (let dy = 0; dy < halfH; dy++) {
      const px = x + sign * dx, py = groundY + dy;
      if (((px + py) & 1) === 0) Dw.px(c, px, py);
    }
  }
}
function dwFlag(c, fx, fy, wind, tick) {
  const acc = Dw.getAccent();
  for (let dy = 0; dy < 14; dy++) Dw.px(c, fx, fy + dy);
  const ext = Math.max(2, Math.min(11, Math.floor(wind * 0.5 + 2)));
  for (let dx = 1; dx <= ext; dx++) {
    const ripple = Math.floor(Math.sin((tick + dx * 8) * 0.08) * Math.min(2, dx * 0.3));
    for (let dy = 0; dy < 4; dy++) Dw.px(c, fx + dx, fy + dy + ripple, dx === ext ? acc : null);
  }
}
function dwWindowLights(c, W, groundY, count) {
  const acc = Dw.getAccent();
  for (let i = 0; i < count; i++) {
    const x = (i * 19 + 5) % W;
    const y = groundY - 8 - ((i * 7) % 26);
    if ((i * 13) % 5 < 3) { Dw.px(c, x, y, acc); Dw.px(c, x + 1, y, acc); }
  }
}
function dwReflection(c, W, groundY, h) {
  // dithered band below ground line for wet pavement
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const bx = ((x % 8)+8)%8, by = ((y%8)+8)%8;
      const fade = 0.45 - y / h * 0.4;
      if (Dw.BAYER8[by*8+bx] < fade && ((x * 13 + 7) % 5) < 3) {
        Dw.px(c, x, groundY + 2 + y);
      }
    }
  }
}
function dwFootprints(c, x0, x1, groundY) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  for (let x = a; x < b; x += 4) {
    Dw.px(c, x, groundY); Dw.px(c, x + 1, groundY);
    Dw.px(c, x, groundY - 1);
  }
}
function dwBreath(c, x, y, tick, idx) {
  const t = ((tick * 0.04 + idx * 23) % 26) / 26;
  if (t < 0.05) return;
  const px = Math.round(x + t * 6);
  const py = Math.round(y - t * 5);
  const r = Math.floor(t * 2.5) + 1;
  Dw.pxCircle(c, px, py, r, null, false);
}
function dwBgPaceSpeed(kind) {
  return ({ rain: 0.6, storm: 0, snow: 0.18, fog: 0.22, sun: 0.32, cloud: 0.18, 'sun-cloud': 0.3 })[kind] ?? 0.28;
}

function renderStoryPanel(c, W, H, tick, kind, hour, isLive) {
  const acc = Dw.getAccent();
  const night = hour >= 20 || hour < 5;
  const dawn = hour >= 5 && hour < 8;
  const dusk = hour >= 18 && hour < 21;

  if (night && (kind === 'sun' || kind === 'sun-cloud' || kind === 'cloud')) {
    drawNightPanel(c, W, H, tick, hour); return;
  }
  if (dawn || dusk) {
    const groundY = H - Math.floor(H * 0.18);
    for (let y = 0; y < groundY - 6; y++) {
      const top = y / Math.max(1, groundY - 6);
      for (let x = 0; x < W; x++) {
        const bx = ((x % 8)+8)%8, by = ((y%8)+8)%8;
        if (Dw.BAYER8[by*8+bx] < (1 - top) * 0.22) Dw.px(c, x, y, acc);
      }
    }
  }

  if      (kind === 'sun')        drawSunPanel(c, W, H, tick, hour, isLive);
  else if (kind === 'sun-cloud')  drawSunCloudPanel(c, W, H, tick, hour, isLive);
  else if (kind === 'cloud')      drawCloudPanel(c, W, H, tick, hour, isLive);
  else if (kind === 'fog')        drawFogPanel(c, W, H, tick, hour, isLive);
  else if (kind === 'rain')       drawRainPanel(c, W, H, tick, hour, isLive);
  else if (kind === 'snow')       drawSnowPanel(c, W, H, tick, hour, isLive);
  else if (kind === 'storm')      drawStormPanel(c, W, H, tick, hour, isLive);
  else                            drawCloudPanel(c, W, H, tick, hour, isLive);
}

function drawSunPanel(c, W, H, tick, hour, isLive) {
  const acc = Dw.getAccent();
  const groundY = H - Math.floor(H * 0.18);
  const personY = groundY - 14;
  const f = Math.floor(tick/12) % 2;
  // big sun + rotating rays
  const sunX = Math.floor(W * 0.82), sunY = Math.floor(H * 0.25);
  Dw.drawSun(c, sunX, sunY, 7, tick * 0.001);
  for (let r = 0; r < 12; r++) {
    const a = (r / 12) * Math.PI * 2 + tick * 0.0006;
    for (let d = 13; d < 22; d++) if (d % 2 === 0) {
      const x = Math.round(sunX + Math.cos(a) * d);
      const y = Math.round(sunY + Math.sin(a) * d);
      if (x >= 0 && x < W && y >= 0 && y < groundY) Dw.px(c, x, y, acc);
    }
  }
  Dw.drawCloud(c, Math.floor(W * 0.18), Math.floor(H * 0.16), 12, 6);
  Dw.drawCloud(c, Math.floor(W * 0.4),  Math.floor(H * 0.1), 8, 4);
  WS.birdsFlight(c, W, tick, 4);
  // distant hills via dither triangles
  for (let i = 0; i < 3; i++) {
    const mx = Math.floor(W * (0.18 + i * 0.3)), mh = 12 - i * 2;
    for (let dx = -mh; dx <= mh; dx++) for (let dy = 0; dy < mh - Math.abs(dx); dy++) {
      const bx = (((mx+dx) % 6) + 6) % 6, by = (((groundY - 4 - dy) % 6) + 6) % 6;
      if (Dw.BAYER8[by*8+bx] < 0.4) Dw.px(c, mx + dx, groundY - 4 - dy);
    }
  }
  WS.skyline(c, 0, groundY - 2, W, 7);
  WS.ground(c, W, H, 'grass');
  // wheat field
  for (let x = 0; x < W; x += 2) {
    const h = 2 + Math.floor((Math.sin(x * 0.4) + 1) * 1.5);
    for (let dy = 0; dy < h; dy++) Dw.px(c, x, groundY - 1 - dy);
    if (x % 6 === 0) Dw.px(c, x, groundY - h - 1, acc);
  }
  WS.bigTree(c, Math.floor(W * 0.06), groundY - 2);
  WS.picketFence(c, Math.floor(W * 0.78), Math.floor(W * 0.95), groundY);
  // wind flag on far rooftop
  dwFlag(c, Math.floor(W * 0.7), Math.floor(H * 0.42), KIND_WIND.sun, tick);
  // kite — flown by GIRL now (shared verbs across scenes)
  const kx = Math.floor(W * 0.45), ky = Math.floor(H * 0.22);
  WS.blit(c, kx, ky, WS.PROPS.kite);
  for (let q = 0; q < 6; q++) {
    const tx = Math.round(kx + 5 + Math.sin(tick * 0.04 + q) * 2);
    const ty = ky + 9 + q * 2;
    if (q % 2 === 0) Dw.px(c, tx, ty, acc); else Dw.px(c, tx, ty);
  }
  const gx = Math.floor(W * 0.4), bx = Math.floor(W * 0.6);
  for (let t = 0; t <= 1; t += 0.04) {
    const sx = Math.round(kx + 5 + (gx + 4 - kx - 5) * t);
    const sy = Math.round(ky + 8 + (personY + 4 - ky - 8) * t);
    if (Math.floor(t * 20) % 2 === 0) Dw.px(c, sx, sy);
  }
  // long character shadows angled by time of day
  const sLen = dwShadowLen(hour);
  dwShadow(c, gx + 4, groundY, sLen);
  dwShadow(c, bx + 4, groundY, sLen);
  WS.drawPerson(c, gx, personY, 'girl', 'cheer', 0);
  // boy walks alongside with the dog at his heel
  WS.drawPerson(c, bx, personY, 'boy', 'walk', f);
  WS.dog(c, bx + 12, groundY, f);
  // butterflies
  for (let i = 0; i < 3; i++) {
    const bxx = ((Math.floor(tick * 0.3 + i * 50)) % (W + 30)) - 15;
    const byy = Math.floor(personY - 8 + Math.sin((tick + i*30) * 0.04) * 6);
    Dw.px(c, bxx, byy, acc); Dw.px(c, bxx + 1, byy, acc);
  }
}

function drawSunCloudPanel(c, W, H, tick, hour, isLive) {
  const acc = Dw.getAccent();
  const groundY = H - Math.floor(H * 0.18);
  const personY = groundY - 14;
  const f = Math.floor(tick/12) % 2;
  Dw.drawSun(c, Math.floor(W * 0.7), Math.floor(H * 0.22), 6, tick * 0.001);
  // drifting clouds — visibly travel left across the sky
  const drift = Math.floor((tick * 0.3));
  const dC = (base) => ((base - drift) % (W + 60) + (W + 60)) % (W + 60) - 30;
  Dw.drawCloud(c, dC(Math.floor(W * 0.74)), Math.floor(H * 0.24), 16, 8);
  Dw.drawCloud(c, dC(Math.floor(W * 0.25)), Math.floor(H * 0.18), 14, 7);
  Dw.drawCloud(c, dC(Math.floor(W * 0.45)), Math.floor(H * 0.1),  10, 5);
  // god rays — diagonal accent dotted
  for (let r = 0; r < 5; r++) {
    const startX = Math.floor(W * 0.66 + r * 4), startY = Math.floor(H * 0.32);
    for (let d = 0; d < 26; d++) {
      const x = startX - Math.floor(d * 0.6), y = startY + d;
      if (d % 3 === 0 && x >= 0 && y < groundY) Dw.px(c, x, y, acc);
    }
  }
  WS.skyline(c, 0, groundY - 4, W, 17);
  WS.ground(c, W, H, 'grass');
  // moving cloud-shadow patch sweeping across the ground
  const shx = ((Math.floor(tick * 0.35)) % (W + 60)) - 30;
  for (let dx = 0; dx < 28; dx++) for (let dy = 0; dy < 2; dy++) {
    if ((dx + dy) % 2 === 0) Dw.px(c, shx + dx, groundY - 2 - dy);
  }
  // dotted center path
  const vpX = Math.floor(W * 0.5);
  for (let i = 0; i < 12; i++) {
    const t = i / 12, py = groundY - Math.floor(t * Math.floor(H * 0.2));
    Dw.px(c, vpX, py); Dw.px(c, vpX + 1, py);
  }
  WS.picketFence(c, Math.floor(W * 0.05), Math.floor(W * 0.32), groundY);
  WS.picketFence(c, Math.floor(W * 0.68), Math.floor(W * 0.95), groundY);
  WS.bigTree(c, Math.floor(W * 0.92), groundY - 2);
  WS.shrub(c, Math.floor(W * 0.15), groundY - 1, 3);
  WS.shrub(c, Math.floor(W * 0.85), groundY - 1, 3);
  // wind flag on right building
  dwFlag(c, Math.floor(W * 0.9), Math.floor(H * 0.34), KIND_WIND['sun-cloud'], tick);
  // softer time-of-day shadows
  const sLen2 = Math.round(dwShadowLen(hour) * 0.6);
  dwShadow(c, Math.floor(W * 0.45) + 4, groundY, sLen2);
  dwShadow(c, Math.floor(W * 0.55) + 4, groundY, sLen2);
  WS.drawPerson(c, Math.floor(W * 0.45), personY, 'boy', 'walk', f);
  WS.drawPerson(c, Math.floor(W * 0.55), personY, 'girl', 'walk', (f+1)%2);
  // hand-holding accent dot between them
  Dw.px(c, Math.floor(W * 0.5), personY + 8, acc);
  Dw.px(c, Math.floor(W * 0.5) + 1, personY + 8, acc);
  const bgX = (Math.floor(tick * dwBgPaceSpeed('sun-cloud')) % (W + 60)) - 30;
  WS.backgroundFigure(c, bgX, groundY, 'walk', f);
  WS.birdsFlight(c, W, tick, 2);
}

function drawCloudPanel(c, W, H, tick, hour, isLive) {
  const acc = Dw.getAccent();
  const groundY = H - Math.floor(H * 0.18);
  const personY = groundY - 14;
  const f = Math.floor(tick/12) % 2;
  // dense overcast — overlapping clouds
  Dw.drawCloud(c, Math.floor(W * 0.18), Math.floor(H * 0.12), 18, 8);
  Dw.drawCloud(c, Math.floor(W * 0.45), Math.floor(H * 0.16), 22, 10);
  Dw.drawCloud(c, Math.floor(W * 0.78), Math.floor(H * 0.1),  18, 8);
  Dw.drawCloud(c, Math.floor(W * 0.3),  Math.floor(H * 0.22), 16, 7);
  Dw.drawCloud(c, Math.floor(W * 0.7),  Math.floor(H * 0.26), 14, 6);
  WS.birdsFlight(c, W, tick, 3);
  WS.skyline(c, 0, groundY - 4, W, 23);
  // overcast = interior lights on in distant buildings
  dwWindowLights(c, W, groundY, 28);
  WS.ground(c, W, H, 'grass');
  // bench with girl reading
  const benchX = Math.floor(W * 0.4);
  WS.parkBench(c, benchX, groundY);
  WS.drawPerson(c, benchX + 2, groundY - 12, 'girl', 'sit', 0);
  Dw.pxRect(c, benchX + 4, groundY - 8, 4, 2);
  // boy pointing up
  const boyX = Math.floor(W * 0.62);
  WS.drawPerson(c, boyX, personY, 'boy', 'cheer', 0);
  // dog
  WS.dog(c, Math.floor(W * 0.2), groundY, f);
  WS.picketFence(c, Math.floor(W * 0.05), Math.floor(W * 0.28), groundY);
  WS.picketFence(c, Math.floor(W * 0.72), Math.floor(W * 0.95), groundY);
  WS.cat(c, Math.floor(W * 0.85), groundY - 5, f);
  WS.lamppost(c, Math.floor(W * 0.78), groundY);
  WS.shrub(c, Math.floor(W * 0.15), groundY - 1, 3);
  // limp wind flag (overcast = low wind correlation here)
  dwFlag(c, Math.floor(W * 0.93), Math.floor(H * 0.36), KIND_WIND.cloud, tick);
  // slow background pedestrian, contemplative pace
  const bgC = (Math.floor(tick * dwBgPaceSpeed('cloud')) % (W + 60)) - 30;
  WS.backgroundFigure(c, bgC, groundY, 'walk', f);
}

function drawFogPanel(c, W, H, tick, hour, isLive) {
  const acc = Dw.getAccent();
  const groundY = H - Math.floor(H * 0.18);
  const personY = groundY - 14;
  const f = Math.floor(tick/12) % 2;
  // ghostly trees
  for (let i = 0; i < 4; i++) {
    const tx = Math.floor(W * (0.1 + i * 0.27)), th = 14 + (i % 2) * 4;
    for (let dy = 0; dy < th; dy++) if (dy % 3 === 0) Dw.px(c, tx, groundY - dy);
    Dw.pxCircle(c, tx, groundY - th + 1, 4, null, false);
  }
  // distant skyline barely visible — depth fog
  for (let i = 0; i < 60; i++) {
    const x = (i * 11) % W, y = groundY - 4 - ((i * 5) % 12);
    if (i % 3 === 0) Dw.px(c, x, y);
  }
  WS.ground(c, W, H, 'grass');
  // 2 lit lampposts with halos
  const lp1 = Math.floor(W * 0.22), lp2 = Math.floor(W * 0.78);
  WS.lamppost(c, lp1, groundY);
  WS.lamppost(c, lp2, groundY);
  Dw.pxCircleDither(c, lp1, groundY - 26, 8, acc, () => 0.4);
  Dw.pxCircleDither(c, lp2, groundY - 26, 8, acc, () => 0.4);
  // fog bands rolling
  WS.fogBands(c, W, H, tick);
  // boy & girl close, sharing a lantern
  const cx = Math.floor(W * 0.5);
  WS.drawPerson(c, cx - 5, personY, 'boy', 'walk', f);
  WS.drawPerson(c, cx + 5, personY, 'girl', 'walk', f);
  Dw.pxRect(c, cx, personY + 6, 3, 4, acc);
  Dw.pxCircleDither(c, cx + 1, personY + 7, 8, acc, () => 0.3);
  // owl peering from a branch
  const owlX = Math.floor(W * 0.86), owlY = Math.floor(H * 0.42);
  Dw.pxRect(c, owlX, owlY, 4, 5);
  Dw.px(c, owlX, owlY, acc); Dw.px(c, owlX + 3, owlY, acc);
  // figures pop in/out of fog
  const phase = Math.floor(tick / 80) % 4;
  if (phase < 2) WS.backgroundFigure(c, Math.floor(W * 0.12), groundY, 'walk', f);
  if (phase === 1) WS.backgroundFigure(c, Math.floor(W * 0.88), groundY, 'walk', f);
}

function drawRainPanel(c, W, H, tick, hour, isLive) {
  const acc = Dw.getAccent();
  const groundY = H - Math.floor(H * 0.18);
  const personY = groundY - 14;
  const f = Math.floor(tick/12) % 2;
  Dw.drawCloud(c, Math.floor(W * 0.25), Math.floor(H * 0.14), 20, 9);
  Dw.drawCloud(c, Math.floor(W * 0.55), Math.floor(H * 0.12), 24, 11);
  Dw.drawCloud(c, Math.floor(W * 0.85), Math.floor(H * 0.18), 18, 8);
  Dw.drawCloud(c, Math.floor(W * 0.4),  Math.floor(H * 0.24), 16, 7);
  // angled rain when wind is strong
  const wind = KIND_WIND.rain;
  const skew = wind > 10 ? 0.4 : 0;
  for (let i = 0; i < W; i++) {
    if (i % 3 !== 0) continue;
    const baseY = ((tick * 1.4 + i * 7) | 0) % (groundY - 2);
    const xx = i + Math.floor(baseY * skew);
    Dw.px(c, xx, baseY); Dw.px(c, xx, baseY + 1);
  }
  WS.skyline(c, 0, groundY - 4, W, 13);
  WS.ground(c, W, H, 'wet');
  // wet pavement reflection
  dwReflection(c, W, groundY, Math.min(8, H - groundY - 4));
  // streetlamp lit
  const lpX = Math.floor(W * 0.16);
  WS.lamppost(c, lpX, groundY);
  Dw.pxCircleDither(c, lpX, groundY - 26, 8, acc, () => 0.3);
  // big puddles with ripples
  for (let i = 0; i < 3; i++) {
    const px = Math.floor(W * (0.28 + i * 0.22));
    WS.puddle(c, px - 6, groundY, 12);
    const r = (Math.floor(tick * 0.1) + i * 3) % 5 + 1;
    Dw.pxCircle(c, px, groundY + 1, r, null, false);
  }
  // boy & girl together under big umbrella
  const cx = Math.floor(W * 0.55);
  // wider umbrella canopy
  WS.blit(c, cx - 5, personY - 8, WS.PROPS.umbrella);
  for (let dx = -8; dx <= 8; dx++) Dw.px(c, cx + dx, personY - 5);
  for (let dx = -7; dx <= 7; dx++) Dw.px(c, cx + dx, personY - 6);
  for (let dx = -5; dx <= 5; dx++) Dw.px(c, cx + dx, personY - 7);
  for (let dy = 0; dy < 7; dy++) Dw.px(c, cx, personY - 4 + dy);
  WS.drawPerson(c, cx - 5, personY, 'boy', 'idle', 0);
  WS.drawPerson(c, cx + 3, personY, 'girl', 'idle', 0);
  // awning + drip at left
  const awnX = Math.floor(W * 0.06);
  for (let dx = 0; dx < 22; dx++) Dw.px(c, awnX + dx, groundY - 22);
  for (let dx = 0; dx < 24; dx++) Dw.px(c, awnX + dx, groundY - 23);
  const dripT = Math.floor((tick * 0.3) % 16);
  Dw.px(c, awnX + 21, groundY - 22 + dripT, acc);
  // hurried bg pedestrian also under umbrella
  const bgX = (Math.floor(tick * dwBgPaceSpeed('rain')) % (W + 30)) - 15;
  WS.backgroundFigure(c, bgX, groundY, 'walk', f);
  for (let dx = -3; dx < 4; dx++) Dw.px(c, bgX + dx, groundY - 9);
  Dw.px(c, bgX + 1, groundY - 8); Dw.px(c, bgX + 2, groundY - 8);
  // drainpipe with flowing water
  const dpX = Math.floor(W * 0.05);
  for (let dy = 0; dy < 22; dy++) Dw.px(c, dpX, groundY - 4 - dy);
  for (let dy = 0; dy < 18; dy++) {
    if ((dy + Math.floor(tick * 0.4)) % 2 === 0)
      Dw.px(c, dpX + 1, groundY - dy, acc);
  }
  Dw.px(c, dpX - 1, groundY, acc); Dw.px(c, dpX + 2, groundY, acc);
  Dw.px(c, dpX, groundY + 1, acc); Dw.px(c, dpX + 1, groundY + 1, acc);
}

function drawSnowPanel(c, W, H, tick, hour, isLive) {
  const acc = Dw.getAccent();
  const groundY = H - Math.floor(H * 0.18);
  const personY = groundY - 14;
  const f = Math.floor(tick/12) % 2;
  // soft overcast
  Dw.drawCloud(c, Math.floor(W * 0.2),  Math.floor(H * 0.12), 16, 7);
  Dw.drawCloud(c, Math.floor(W * 0.55), Math.floor(H * 0.14), 22, 10);
  Dw.drawCloud(c, Math.floor(W * 0.85), Math.floor(H * 0.1),  14, 6);
  // snow-capped hills
  for (let i = 0; i < 2; i++) {
    const mx = Math.floor(W * (0.22 + i * 0.42)), mh = 16 - i * 2;
    for (let dx = -mh; dx <= mh; dx++) {
      const colH = mh - Math.abs(dx);
      for (let dy = 0; dy < colH; dy++) {
        const bx = (((mx+dx) % 6) + 6) % 6, by = (((groundY - 4 - dy) % 6) + 6) % 6;
        if (Dw.BAYER8[by*8+bx] < 0.3) Dw.px(c, mx + dx, groundY - 4 - dy);
      }
      if (colH >= 5) for (let dy = colH - 3; dy < colH; dy++) Dw.px(c, mx + dx, groundY - 4 - dy);
    }
  }
  WS.skyline(c, 0, groundY - 4, W, 41);
  // snow caps along skyline tops
  for (let x = 0; x < W; x += 12) {
    const y = groundY - 12 - ((x * 7) % 6);
    Dw.px(c, x, y - 1); Dw.px(c, x + 1, y - 1); Dw.px(c, x + 2, y - 1);
  }
  // chimney smoke (rising)
  for (let i = 0; i < 6; i++) {
    const ph = ((tick * 0.4 + i * 30) % 60) / 60;
    const sx = Math.floor(W * 0.32) + Math.floor(Math.sin(ph * 6) * 2);
    const sy = Math.floor(H * 0.28) - Math.floor(ph * 12);
    if (sy > 0) Dw.px(c, sx, sy);
  }
  WS.ground(c, W, H, 'snow');
  WS.snowdrift(c, W, groundY);
  // pine trees with snow caps
  for (let i = 0; i < 3; i++) {
    const tx = Math.floor(W * (0.08 + i * 0.42));
    for (let dy = 0; dy < 5; dy++) Dw.px(c, tx, groundY - 2 - dy);
    for (let layer = 0; layer < 3; layer++) {
      const ly = groundY - 6 - layer * 3, lw = 4 - layer;
      for (let dx = -lw; dx <= lw; dx++) Dw.px(c, tx + dx, ly);
      for (let dx = -lw + 1; dx <= lw - 1; dx++) Dw.px(c, tx + dx, ly - 1);
    }
  }
  // FENCE + snow caps
  WS.picketFence(c, Math.floor(W * 0.78), Math.floor(W * 0.95), groundY);
  for (let x = Math.floor(W * 0.78); x <= Math.floor(W * 0.95); x += 4) {
    Dw.px(c, x, groundY - 7); Dw.px(c, x - 1, groundY - 6);
  }
  // LAMPPOST + snow on crown
  const lpsX = Math.floor(W * 0.06);
  WS.lamppost(c, lpsX, groundY);
  Dw.px(c, lpsX - 2, groundY - 31); Dw.px(c, lpsX - 1, groundY - 31);
  Dw.px(c, lpsX, groundY - 31); Dw.px(c, lpsX + 1, groundY - 31); Dw.px(c, lpsX + 2, groundY - 31);
  // snowman center — both kids are building it together
  const smX = Math.floor(W * 0.5);
  WS.blit(c, smX - 5, groundY - 10, WS.PROPS.snowman);
  Dw.px(c, smX, groundY - 6, acc); Dw.px(c, smX + 1, groundY - 6, acc);
  // boy rolling a snowball
  const bx = Math.floor(W * 0.32);
  WS.drawPerson(c, bx, personY, 'boy', 'idle', 0);
  Dw.pxCircle(c, bx + 9, groundY - 1, 2, null, false);
  // girl stacking / cheering
  const gx = Math.floor(W * 0.66);
  WS.drawPerson(c, gx, personY, 'girl', 'cheer', 0);
  // FOOTPRINTS trailing each
  dwFootprints(c, bx + 4, bx - 18, groundY);
  dwFootprints(c, gx + 4, gx + 22, groundY);
  // BREATH puffs
  dwBreath(c, bx + 5, personY + 4, tick, 0);
  dwBreath(c, gx + 5, personY + 4, tick, 1);
  WS.snowParticles(c, W, H, tick);
  // dog + paw prints behind it
  const dgx = Math.floor(W * 0.85);
  WS.dog(c, dgx, groundY, f);
  for (let i = 1; i < 6; i++) Dw.px(c, dgx - i * 3, groundY);
}

function drawStormPanel(c, W, H, tick, hour, isLive) {
  const acc = Dw.getAccent();
  // wall stipple
  for (let y = 4; y < H - 4; y += 4) for (let x = 0; x < W; x += 6) Dw.px(c, x + (y%2), y);
  const floorY = H - Math.floor(H * 0.12);
  for (let x = 0; x < W; x++) Dw.px(c, x, floorY);
  for (let i = 1; i < 6; i++) {
    const fx = Math.floor((i / 6) * W);
    for (let yy = floorY + 1; yy < H; yy += 2) Dw.px(c, fx, yy);
  }
  // bookshelf left
  const bsX = Math.floor(W * 0.04), bsY = Math.floor(H * 0.18);
  Dw.pxRect(c, bsX, bsY, 22, floorY - bsY);
  for (let s = 0; s < 4; s++) {
    const sy = bsY + 6 + s * 8;
    for (let x = 0; x <= 22; x++) Dw.px(c, bsX + x, sy);
    for (let b = 0; b < 6; b++) {
      const bx2 = bsX + 1 + b * 3, bh = 4 + (b % 3);
      for (let yy = 0; yy < bh; yy++) {
        Dw.px(c, bx2, sy - 1 - yy);
        if (b % 2 === 0) Dw.px(c, bx2 + 1, sy - 1 - yy, acc);
      }
    }
  }
  // window with rain + lightning
  const wx = Math.floor(W * 0.36), wy = Math.floor(H * 0.18);
  const ww = Math.floor(W * 0.34), wh = Math.floor(H * 0.5);
  for (let x = 0; x <= ww; x++) { Dw.px(c, wx + x, wy); Dw.px(c, wx + x, wy + wh); }
  for (let y = 0; y <= wh; y++) { Dw.px(c, wx, wy + y); Dw.px(c, wx + ww, wy + y); }
  for (let x = 1; x < ww; x++) Dw.px(c, wx + x, wy + Math.floor(wh/2));
  for (let y = 1; y < wh; y++) Dw.px(c, wx + Math.floor(ww/2), wy + y);
  // dark sky outside via dither
  for (let y = wy + 1; y < wy + wh; y++) for (let x = wx + 1; x < wx + ww; x++) {
    const bx = ((x % 8)+8)%8, by = ((y%8)+8)%8;
    if (Dw.BAYER8[by*8+bx] < 0.45) Dw.px(c, x, y);
  }
  // tree outside the window swaying in the storm wind
  const sway = Math.floor(Math.sin(tick * 0.06) * 2);
  const tox = wx + Math.floor(ww * 0.22), toy = wy + wh - 6;
  for (let dy = 0; dy < 18; dy++) {
    const t = dy / 18;
    Dw.px(c, tox + Math.floor(sway * t), toy - dy);
  }
  Dw.pxCircle(c, tox + sway, toy - 18, 4, null, false);
  // lightning flash — lights the WHOLE pane and casts a glow into the room
  const flashing = Math.floor(tick / 60) % 4 === 0 && (tick % 60) < 12;
  if (flashing) {
    for (let y = wy + 1; y < wy + wh; y++) for (let x = wx + 1; x < wx + ww; x++) {
      const bx = ((x % 8)+8)%8, by = ((y%8)+8)%8;
      if (Dw.BAYER8[by*8+bx] < 0.32) Dw.px(c, x, y, acc);
    }
    let py2 = wy + 4, px2 = wx + Math.floor(ww * 0.5);
    for (const [dx, dy] of [[1,3],[-2,4],[2,5],[0,5],[1,3]]) {
      for (let t = 0; t <= 1; t += 0.2)
        Dw.px(c, Math.round(px2 + dx*t), Math.round(py2 + dy*t), acc);
      px2 += dx; py2 += dy;
    }
    // interior brightens — accent dots scattered through the room
    for (let i = 0; i < 24; i++) {
      const ix = (i * 19) % W, iy = (i * 13) % floorY;
      Dw.px(c, ix, iy, acc);
    }
  }
  // rain streaks on window
  for (let i = 0; i < 36; i++) {
    const rx = wx + 2 + ((i * 5 + Math.floor(tick * 0.3)) % (ww - 4));
    const ry = wy + 2 + ((i * 7 + Math.floor(tick * 0.6)) % (wh - 4));
    Dw.px(c, rx, ry); Dw.px(c, rx, ry + 1);
  }
  // couch right of window
  const cfX = Math.floor(W * 0.78), cfY = floorY - 14;
  Dw.pxRect(c, cfX, cfY, 22, 10);
  for (let x = 0; x <= 22; x++) Dw.px(c, cfX + x, cfY - 4);
  for (let yy = -4; yy < 10; yy++) { Dw.px(c, cfX, cfY + yy); Dw.px(c, cfX + 22, cfY + yy); }
  WS.drawPerson(c, cfX + 2, cfY - 8, 'boy', 'sit', 0);
  WS.drawPerson(c, cfX + 14, cfY - 8, 'girl', 'sit', 0);
  // CAT curled up BETWEEN them on the couch
  const ccX = cfX + 11;
  Dw.pxCircle(c, ccX, cfY + 2, 2, null, false);
  Dw.px(c, ccX + 1, cfY); Dw.px(c, ccX + 2, cfY);
  // floor lamp — flickers (off briefly during lightning)
  const lmX = cfX - 6;
  for (let dy = 0; dy < 16; dy++) Dw.px(c, lmX, floorY - 1 - dy);
  Dw.pxRect(c, lmX - 3, floorY - 18, 7, 3);
  if (!flashing) Dw.pxCircleDither(c, lmX, floorY - 14, 7, acc, () => 0.3);
  // mug on side table + rising steam (warmth against the storm)
  const mgX = cfX - 14;
  Dw.pxRect(c, mgX, cfY + 4, 4, 4);
  Dw.px(c, mgX + 1, cfY + 3, acc); Dw.px(c, mgX + 2, cfY + 3, acc);
  for (let s = 0; s < 4; s++) {
    const ph = ((tick * 0.05 + s * 8) % 16) / 16;
    if (ph < 0.1) continue;
    const sx = mgX + 1 + Math.floor(Math.sin(ph * Math.PI * 2 + s) * 2);
    const sy = cfY + 3 - Math.floor(ph * 8);
    Dw.px(c, sx, sy); Dw.px(c, sx + 1, sy);
  }
}

function drawNightPanel(c, W, H, tick, hour) {
  const acc = Dw.getAccent();
  const groundY = H - Math.floor(H * 0.18);
  const personY = groundY - 14;
  // dark sky dither (denser at top)
  for (let y = 0; y < groundY - 2; y++) {
    for (let x = 0; x < W; x++) {
      const bx = ((x % 8)+8)%8, by = ((y%8)+8)%8;
      if (Dw.BAYER8[by*8+bx] < 0.36 - (y / Math.max(1,groundY)) * 0.22) Dw.px(c, x, y);
    }
  }
  WS.starsField(c, W, 30, hour * 7);
  Dw.drawMoon(c, Math.floor(W * 0.78), Math.floor(H * 0.22), 8, 0.4);
  WS.skyline(c, 0, groundY - 4, W, 17);
  // lit windows
  for (let i = 0; i < 25; i++) {
    const x = (i * 19) % W, y = groundY - 8 - ((i * 7) % 24);
    if (i % 2 === 0) Dw.px(c, x, y, acc);
  }
  WS.ground(c, W, H, 'grass');
  // tree with owl
  const tx = Math.floor(W * 0.12);
  for (let dy = 0; dy < 12; dy++) Dw.px(c, tx, groundY - 2 - dy);
  Dw.pxCircle(c, tx, groundY - 16, 5, null, false);
  Dw.pxRect(c, tx + 2, groundY - 14, 4, 4);
  Dw.px(c, tx + 2, groundY - 14, acc); Dw.px(c, tx + 5, groundY - 14, acc);
  // porch
  for (let x = Math.floor(W * 0.42); x < Math.floor(W * 0.7); x++) {
    Dw.px(c, x, groundY); Dw.px(c, x, groundY + 2);
  }
  // boy + girl looking up
  WS.drawPerson(c, Math.floor(W * 0.5),  personY, 'boy', 'cheer', 0);
  WS.drawPerson(c, Math.floor(W * 0.6),  personY, 'girl', 'cheer', 0);
  // fireflies near them
  for (let i = 0; i < 6; i++) {
    const fx = Math.floor(Math.sin((tick + i * 100) * 0.02) * 30 + W * 0.55);
    const fy = Math.floor(Math.cos((tick + i * 100) * 0.03) * 8 + personY - 4);
    Dw.px(c, fx, fy, acc); Dw.px(c, fx + 1, fy, acc);
  }
  // shooting star
  if (Math.floor(tick / 200) % 3 === 0 && (tick % 200) < 30) {
    const t2 = (tick % 200) / 30;
    const sx = Math.round(W * 0.2 + t2 * W * 0.4);
    const sy = Math.round(20 + t2 * 10);
    for (let d = 0; d < 6; d++) Dw.px(c, sx - d, sy - Math.floor(d/2), acc);
  }
}

function ModeStoryboard({ timeline, dark, idx, setIdx }) {
  return (
    <div className="dw-story-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 18,
    }}>
      {timeline.slice(0, 8).map((t, i) => {
        const kind = WS.codeToKind(t.code);
        const isActive = i === idx;
        return (
          <button key={i} onClick={() => setIdx(i)} aria-label={`Scene ${i+1} ${t.label}`}
            style={{
              position: 'relative',
              background: '#0a0907',
              border: 'none',
              boxShadow: isActive
                ? '0 0 0 3px var(--rust), 8px 8px 0 var(--ink)'
                : '0 0 0 2px var(--ink), 4px 4px 0 var(--ink)',
              padding: 0,
              cursor: 'pointer',
              fontFamily: '"VT323", monospace',
              color: '#f3ecd9',
              textAlign: 'left',
              transform: isActive ? 'translate(-2px,-2px)' : 'none',
              transition: 'transform .18s, box-shadow .18s',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
            {/* SLATE TOP */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#0a0907', color: '#f3ecd9',
              padding: '8px 14px', fontSize: 14, letterSpacing: 2,
              borderBottom: '2px dashed #3a3025',
            }}>
              <span style={{ display:'flex', gap: 8, alignItems:'center' }}>
                <span style={{
                  background: isActive ? 'var(--rust)' : '#2a221b',
                  color: isActive ? '#0a0907' : '#f3ecd9',
                  padding: '1px 8px', letterSpacing: 1, fontWeight: 'bold',
                }}>SCENE {String(i+1).padStart(2,'0')}</span>
                <span style={{ color:'#b89a7e' }}>· {String(t.hour).padStart(2,'0')}:00</span>
              </span>
              <span style={{ color: isActive ? 'var(--rust)' : '#b89a7e', letterSpacing: 1,
                display:'flex', alignItems:'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 0,
                  background: isActive ? 'var(--rust)' : '#b89a7e',
                  animation: isActive ? 'pulse 1.4s infinite' : 'none' }} />
                {isActive ? 'NOW PLAYING' : t.label}
              </span>
            </div>

            {/* CINEMASCOPE FRAME */}
            <div style={{ position:'relative', background: 'var(--paper-2)' }}>
              <PixCanvasAuto height={320} scale={4} maxLogicalW={200} minLogicalW={100}
                deps={[kind, t.hour, dark, isActive]}
                draw={(c, tick, W, H) => renderStoryPanel(c, W, H, tick, kind, t.hour, isActive)}
              />
              {/* letterbox bars */}
              <div style={{ position:'absolute', top: 0, left: 0, right: 0, height: 18,
                background: '#0a0907', pointerEvents:'none' }} />
              <div style={{ position:'absolute', bottom: 0, left: 0, right: 0, height: 18,
                background: '#0a0907', pointerEvents:'none' }} />
              {/* film perforation dots */}
              <div style={{ position:'absolute', top: 22, left: 6, display:'flex', flexDirection:'column', gap: 6, pointerEvents:'none' }}>
                {[0,1,2,3].map(j => <div key={j} style={{ width: 6, height: 6, background:'#2a221b' }} />)}
              </div>
              <div style={{ position:'absolute', top: 22, right: 6, display:'flex', flexDirection:'column', gap: 6, pointerEvents:'none' }}>
                {[0,1,2,3].map(j => <div key={j} style={{ width: 6, height: 6, background:'#2a221b' }} />)}
              </div>
              {/* burn-in timecode */}
              <div style={{
                position:'absolute', bottom: 22, left: 14, color:'#f3ecd9',
                fontFamily:'"VT323",monospace', fontSize: 14, letterSpacing: 1,
                textShadow:'1px 1px 0 #000', pointerEvents:'none',
              }}>
                {String(t.hour).padStart(2,'0')}:00:{String(Math.floor((i*7)%60)).padStart(2,'0')}
              </div>
              <div style={{
                position:'absolute', bottom: 22, right: 14, color:'var(--rust)',
                fontFamily:'"VT323",monospace', fontSize: 14, letterSpacing: 1,
                textShadow:'1px 1px 0 #000', pointerEvents:'none',
              }}>
                {window.formatT(t.temp).replace('°','')}° · ☂{t.precipProb}%
              </div>
              {/* reel ID top-left */}
              <div style={{
                position:'absolute', top: 22, left: 22, color:'#b89a7e',
                fontFamily:'"VT323",monospace', fontSize: 12, letterSpacing: 2,
                textShadow:'1px 1px 0 #000', pointerEvents:'none',
              }}>
                REEL {String(i+1).padStart(2,'0')}/08 · {kind.toUpperCase().replace('-',' ')}
              </div>
            </div>

            {/* SUBTITLE BAND */}
            <div style={{
              background: '#0a0907', color: '#f3ecd9', padding: '12px 16px',
              fontFamily: '"Crimson Pro", serif', fontStyle:'italic',
              fontSize: 17, lineHeight: 1.3, textAlign:'center',
              borderTop: '2px dashed #3a3025',
              textWrap: 'pretty', minHeight: 50,
            }}>
              "{storyCaption(kind, t.hour, t.temp)}"
            </div>
          </button>
        );
      })}
    </div>
  );
}

function storyCaption(kind, hour, temp) {
  const morn = hour < 11, noon = hour >= 11 && hour < 16, eve = hour >= 16 && hour < 20, night = hour >= 20 || hour < 5;
  if (kind === 'sun')        return night ? 'A clear, starlit hour.' : (morn ? 'Sun gilds the eaves.' : (noon ? 'A perfect, brazen blue.' : 'Long gold across the meadow.'));
  if (kind === 'sun-cloud')  return morn ? 'Clouds, with windows of sun.' : 'A scattering of fair weather.';
  if (kind === 'cloud')      return 'A flat ceiling of grey.';
  if (kind === 'fog')        return morn ? 'A hush; the world in cotton.' : 'Lanterns swallowed by mist.';
  if (kind === 'rain')       return 'Rain drumming on every roof.';
  if (kind === 'snow')       return 'White hush, settling slow.';
  if (kind === 'storm')      return 'Heavens loose their cisterns.';
  return 'The sky keeps its counsel.';
}

// ── reusable panel scene used by storyboard, diary, mandala center ──────
function PanelScene({ kind, hour, dark, live = false, height = 100, includeChars = true }) {
  return (
    <PixCanvasAuto height={height} scale={4} maxLogicalW={140}
      deps={[kind, hour, dark, live, includeChars]}
      draw={(c, tick, W, H) => {
        // simplified scene: sky + horizon + maybe characters
        const groundY = H - Math.floor(H * 0.22);
        // tinted sky band per hour
        const night = hour >= 20 || hour < 5;
        // far skyline
        WS.skyline(c, 0, groundY - 4, W, 7 + hour);
        // ground texture per kind
        WS.ground(c, W, H, kind === 'snow' ? 'snow' : (['rain','storm','rainbow'].includes(kind) ? 'wet' : 'grass'));
        // sky elements
        const cx = Math.floor(W * 0.78), cy = Math.floor(H * 0.18);
        if (kind === 'sun')        Dw.drawSun(c, cx, cy, 5, tick * 0.001);
        else if (kind === 'sun-cloud') { Dw.drawSun(c, cx-2, cy, 4, tick*0.001); Dw.drawCloud(c, cx+4, cy+2, 10, 5); }
        else if (kind === 'cloud') { Dw.drawCloud(c, cx-6, cy, 14, 6); Dw.drawCloud(c, Math.floor(W*0.25), cy+1, 12, 5); }
        else if (kind === 'fog')   { Dw.drawCloud(c, cx-6, cy, 14, 6); WS.fogBands(c, W, H, tick); }
        else if (kind === 'rain')  { Dw.drawCloud(c, cx-6, cy, 14, 6); Dw.drawCloud(c, Math.floor(W*0.25), cy+1, 12, 5); WS.rainParticles(c, W, H, tick, 0.8); }
        else if (kind === 'snow')  { Dw.drawCloud(c, cx-6, cy, 14, 6); WS.snowParticles(c, W, H, tick); }
        else if (kind === 'storm') { Dw.drawCloud(c, cx-6, cy, 14, 6); WS.rainParticles(c, W, H, tick, 1); WS.lightning(c, W, H, tick); }
        // moon at night
        if (night) {
          Dw.drawMoon(c, Math.floor(W * 0.2), 8, 4, 0.4);
          WS.starsField(c, W, 8, 99 + hour);
        }
        // tiny figures
        if (includeChars) {
          const f = Math.floor(tick / 12) % 2;
          const bx = Math.floor(W * 0.42), gx = Math.floor(W * 0.55);
          const py = groundY - 14;
          if (kind === 'rain') {
            WS.drawPerson(c, bx, py, 'boy', 'run', f);
            WS.drawPerson(c, gx, py, 'girl', 'umbrella', 0);
            WS.blit(c, gx-1, py-7, WS.PROPS.umbrella);
          } else if (kind === 'snow') {
            WS.drawPerson(c, bx, py, 'boy', 'idle', 0);
            WS.drawPerson(c, gx + 8, py, 'girl', 'idle', 0);
            WS.blit(c, Math.floor(W/2)-5, groundY-10, WS.PROPS.snowman);
          } else if (kind === 'sun') {
            WS.blit(c, bx-12, 4, WS.PROPS.kite);
            WS.drawPerson(c, bx, py, 'boy', 'cheer', 0);
            WS.drawPerson(c, gx, py, 'girl', 'idle', 0);
          } else if (kind === 'fog') {
            WS.drawPerson(c, bx+2, py, 'boy', 'walk', f);
            WS.drawPerson(c, bx+10, py, 'girl', 'walk', f);
          } else {
            WS.drawPerson(c, bx, py, 'boy', live?'walk':'idle', f);
            WS.drawPerson(c, gx, py, 'girl', live?'walk':'idle', (f+1)%2);
          }
        }
      }}
    />
  );
}

// ── MODE B · GRAND DIORAMA (the existing one, kept) ───────────────────
function ModeGrand({ timeline, dark, idx, setIdx, live }) {
  // big scene canvas
  return (
    <div>
      <PixCanvasAuto height={Math.min(620, 480)} scale={5} maxLogicalW={520}
        deps={[timeline[idx]?.code, dark, live]}
        draw={(c, tick, W, H) => {
          const cur = timeline[idx];
          if (!cur) return;
          const kind = WS.codeToKind(cur.code);
          WS.renderScene(c, W, H, tick, kind, 1000, null);
        }}
      />
      <div style={{ display:'flex', gap: 12, justifyContent:'center', marginTop: 10,
        fontFamily: '"VT323", monospace', flexWrap:'wrap' }}>
        {timeline.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)} style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            fontFamily: '"VT323", monospace', fontSize: 18,
            color: i === idx ? 'var(--rust)' : 'var(--slate)',
            borderBottom: i === idx ? '2px solid var(--rust)' : 'none',
            padding: '2px 6px',
          }}>{t.label}</button>
        ))}
      </div>
    </div>
  );
}

// ── MODE C · 24H MANDALA (clock-face astrolabe) ───────────────────────
function ModeMandala({ timeline, dark, idx, setIdx }) {
  const cur = timeline[idx] || timeline[0];
  return (
    <div className="dw-mandala-grid" style={{
      display:'grid', gridTemplateColumns: '1fr', gap: 16, alignItems:'center',
    }}>
      <div style={{ position: 'relative', aspectRatio: '1 / 1', maxWidth: 720, margin: '0 auto', width:'100%' }}>
        <PixCanvasAuto height={720} scale={5} maxLogicalW={144} minLogicalW={120}
          deps={[timeline.length, idx, dark]}
          draw={(c, tick, W, H) => {
            const cx = Math.floor(W/2), cy = Math.floor(H/2);
            const R = Math.min(cx, cy) - 4;
            // outer dotted ring
            for (let a = 0; a < Math.PI*2; a += 0.04) {
              const x = Math.round(cx + Math.cos(a) * R);
              const y = Math.round(cy + Math.sin(a) * R);
              if (Math.floor(a*40) % 2 === 0) Dw.px(c, x, y);
            }
            // inner dotted ring
            const Ri = R - 18;
            for (let a = 0; a < Math.PI*2; a += 0.04) {
              const x = Math.round(cx + Math.cos(a) * Ri);
              const y = Math.round(cy + Math.sin(a) * Ri);
              if (Math.floor(a*60) % 2 === 0) Dw.px(c, x, y);
            }
            // 24 hour ticks
            for (let h = 0; h < 24; h++) {
              const a = (h / 24) * Math.PI*2 - Math.PI/2;
              for (let r = R - 2; r > R - 6; r--) {
                const x = Math.round(cx + Math.cos(a) * r);
                const y = Math.round(cy + Math.sin(a) * r);
                Dw.px(c, x, y);
              }
              if (h % 6 === 0) {
                for (let r = R - 6; r > R - 9; r--) {
                  const x = Math.round(cx + Math.cos(a) * r);
                  const y = Math.round(cy + Math.sin(a) * r);
                  Dw.px(c, x, y, Dw.getAccent());
                }
              }
            }
            // sun arc (day) — accent dotted
            const dayStart = 6, dayEnd = 19;
            for (let h = dayStart; h <= dayEnd; h += 0.1) {
              const a = (h/24) * Math.PI*2 - Math.PI/2;
              const r = R - 11;
              const x = Math.round(cx + Math.cos(a) * r);
              const y = Math.round(cy + Math.sin(a) * r);
              if (Math.floor(h*10) % 2 === 0) Dw.px(c, x, y, Dw.getAccent());
            }
            // night arc — ink dotted
            for (let h = 19; h <= 30; h += 0.1) {
              const hh = h % 24;
              const a = (hh/24) * Math.PI*2 - Math.PI/2;
              const r = R - 11;
              const x = Math.round(cx + Math.cos(a) * r);
              const y = Math.round(cy + Math.sin(a) * r);
              if (Math.floor(h*10) % 2 === 0) Dw.px(c, x, y);
            }
            // hour glyph stations
            timeline.forEach((t, i) => {
              const a = (t.hour / 24) * Math.PI*2 - Math.PI/2;
              const r = R - 14;
              const x = Math.round(cx + Math.cos(a) * r);
              const y = Math.round(cy + Math.sin(a) * r);
              const kind = WS.codeToKind(t.code);
              const sz = i === idx ? 5 : 3;
              if (kind === 'sun')        Dw.drawSun(c, x, y, sz, tick * 0.001);
              else if (kind === 'sun-cloud') Dw.drawCloud(c, x, y, sz+2, sz);
              else if (kind === 'cloud') Dw.drawCloud(c, x, y, sz+2, sz);
              else if (kind === 'fog')   { Dw.drawCloud(c, x, y, sz+2, sz); }
              else if (kind === 'rain')  { Dw.drawCloud(c, x, y-1, sz+2, sz); for (let q = 0; q < 3; q++) Dw.px(c, x-1+q, y+sz, Dw.getAccent()); }
              else if (kind === 'snow')  { Dw.drawCloud(c, x, y-1, sz+2, sz); for (let q = 0; q < 3; q++) Dw.px(c, x-1+q, y+sz); }
              else if (kind === 'storm') { Dw.drawCloud(c, x, y-1, sz+2, sz); Dw.drawBolt(c, x, y+sz); }
              else                       Dw.drawCloud(c, x, y, sz+2, sz);
              if (i === idx) {
                Dw.pxCircle(c, x, y, sz + 4, Dw.getAccent(), false);
              }
            });
            // hour labels at cardinal hours via accent dots
            const cardinal = [0, 6, 12, 18];
            cardinal.forEach(h => {
              const a = (h/24)*Math.PI*2 - Math.PI/2;
              const r = R + 2;
              const x = Math.round(cx + Math.cos(a) * r);
              const y = Math.round(cy + Math.sin(a) * r);
              Dw.px(c, x, y, Dw.getAccent());
            });
            // the "hand" — pointing to the current scene hour
            if (cur) {
              const a = (cur.hour / 24)*Math.PI*2 - Math.PI/2;
              for (let r = 0; r < Ri - 16; r += 1) {
                const x = Math.round(cx + Math.cos(a) * r);
                const y = Math.round(cy + Math.sin(a) * r);
                if (r % 3 !== 0) Dw.px(c, x, y, Dw.getAccent());
              }
              // arrow tip
              const tipR = Ri - 16;
              const tx = Math.round(cx + Math.cos(a) * tipR);
              const ty = Math.round(cy + Math.sin(a) * tipR);
              for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++)
                  if (Math.abs(dx)+Math.abs(dy)<=2) Dw.px(c, tx+dx, ty+dy, Dw.getAccent());
            }
            // Inner mini scene
            const innerR = Math.floor(Ri * 0.75);
            // mask: draw a small landscape inside the inner ring
            const mw = innerR * 2 - 6, mh = innerR * 2 - 6;
            const mx = cx - innerR + 3, my = cy - innerR + 3;
            // sub-scene
            const kind = cur ? WS.codeToKind(cur.code) : 'cloud';
            // mini horizon
            const groundY = my + Math.floor(mh * 0.7);
            // simple sky
            if (kind === 'sun') Dw.drawSun(c, mx + Math.floor(mw*0.7), my + 6, 5, tick*0.001);
            else if (kind === 'rain') { Dw.drawCloud(c, mx + Math.floor(mw*0.5), my + 6, 12, 6); for (let q = 0; q < 14; q++) {
              const px = mx + 4 + q*2; const py = my + 14 + ((Math.floor(tick) + q*5) % (mh - 18));
              if (Math.hypot(px - cx, py - cy) < innerR - 4) Dw.px(c, px, py);
            }}
            else if (kind === 'snow') { Dw.drawCloud(c, mx + Math.floor(mw*0.5), my + 6, 12, 6); }
            else Dw.drawCloud(c, mx + Math.floor(mw*0.6), my + 6, 12, 6);
            // ground arc inside the circle
            for (let x = -innerR + 4; x <= innerR - 4; x++) {
              const yMax = Math.round(Math.sqrt(Math.max(0, (innerR-4)*(innerR-4) - x*x)));
              const gy = Math.min(groundY, cy + yMax);
              Dw.px(c, cx + x, gy);
            }
            // figures
            const py = groundY - 14;
            const f = Math.floor(tick/12) % 2;
            if (kind === 'rain') {
              WS.drawPerson(c, cx-4, py, 'boy', 'run', f);
              WS.drawPerson(c, cx+6, py, 'girl', 'umbrella', 0);
              WS.blit(c, cx+5, py-7, WS.PROPS.umbrella);
            } else if (kind === 'sun') {
              WS.drawPerson(c, cx-4, py, 'boy', 'cheer', 0);
              WS.drawPerson(c, cx+6, py, 'girl', 'idle', 0);
              WS.blit(c, cx-12, my + 6, WS.PROPS.kite);
            } else {
              WS.drawPerson(c, cx-4, py, 'boy', 'walk', f);
              WS.drawPerson(c, cx+6, py, 'girl', 'walk', (f+1)%2);
            }
            // center label band
            for (let x = cx - 18; x <= cx + 18; x++) Dw.px(c, x, cy + Math.floor(mh*0.05), Dw.getAccent());
          }}
        />
        {/* clickable hotspots overlaid on hour stations */}
        <div style={{ position:'absolute', inset: 0, pointerEvents:'none' }}>
          {timeline.map((t, i) => {
            const a = (t.hour / 24) * 360 - 90;
            const rad = a * Math.PI / 180;
            const r = 0.42; // ~ relative to half
            const x = 50 + Math.cos(rad) * 100 * r;
            const y = 50 + Math.sin(rad) * 100 * r;
            return (
              <button key={i} onClick={() => setIdx(i)}
                style={{
                  position:'absolute', left:`${x}%`, top:`${y}%`,
                  width: 44, height: 44, transform: 'translate(-50%,-50%)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  pointerEvents: 'auto',
                }}
                aria-label={t.label} title={t.label}
              />
            );
          })}
        </div>
      </div>
      {/* Reading panel beneath */}
      <div style={{
        margin: '0 auto', maxWidth: 640, textAlign: 'center',
        fontFamily: '"VT323", monospace',
      }}>
        <div style={{ fontSize: 14, letterSpacing: 3, color: 'var(--slate)' }}>HOUR {String(cur?.hour ?? 0).padStart(2,'0')}:00</div>
        <div style={{ fontSize: 30, color: 'var(--rust)', letterSpacing: 1 }}>{cur?.label}</div>
        <div style={{ fontFamily: '"Crimson Pro", serif', fontStyle:'italic', fontSize: 18, marginTop: 4 }}>
          {WS.KIND_LABEL[WS.codeToKind(cur?.code)] || ''}
        </div>
        <div style={{ marginTop: 6, fontSize: 18, display:'flex', justifyContent:'center', gap: 18 }}>
          <span style={{ color:'var(--rust)' }}>{window.formatT(cur?.temp)}</span>
          <span>☂{cur?.precipProb}%</span>
        </div>
      </div>
    </div>
  );
}

// ── MODE D · ALMANAC DIARY (taped polaroids on a journal page) ───────
function ModeDiary({ timeline, dark, idx, setIdx, dateLabel }) {
  // 6 scattered "polaroids" with rotations + tape
  const positions = [
    { left: '4%',  top: 0,    rot: -3, scale: 1 },
    { left: '34%', top: 30,   rot: 2,  scale: 1.05 },
    { left: '64%', top: 0,    rot: -2, scale: 1 },
    { left: '8%',  top: 280,  rot: 4,  scale: 1 },
    { left: '38%', top: 310,  rot: -2, scale: 1.05 },
    { left: '68%', top: 290,  rot: 3,  scale: 1 },
  ];
  const items = timeline.slice(0, 6);
  return (
    <div>
      <div style={{
        position: 'relative',
        background: 'var(--paper)',
        border: '1px solid var(--ink)',
        boxShadow: 'inset 0 0 0 4px var(--paper), inset 0 0 0 5px var(--ink)',
        padding: '24px 28px 40px',
        minHeight: 660,
        backgroundImage: 'repeating-linear-gradient(transparent 0 26px, color-mix(in srgb, var(--ink) 12%, transparent) 26px 27px)',
        backgroundPosition: '0 8px',
      }}>
        {/* margin red line */}
        <div style={{ position:'absolute', left: 60, top: 0, bottom: 0, width: 1,
          background: 'var(--rust)', opacity: .55 }} />
        {/* hand-written header */}
        <div style={{
          fontFamily: '"VT323", monospace', fontSize: 18, color: 'var(--rust)',
          letterSpacing: 1, paddingLeft: 80, marginBottom: 6,
        }}>
          ❒ ENTRY · {dateLabel} ❒
        </div>
        <div style={{
          fontFamily: '"Crimson Pro", serif', fontStyle:'italic', fontSize: 18,
          paddingLeft: 80, marginBottom: 16, color: 'var(--ink)', maxWidth: 540,
        }}>
          Notes from the day, taped in along the way — clip them to enlarge.
        </div>

        {/* polaroids */}
        <div style={{ position:'relative', height: 560 }}>
          {items.map((t, i) => {
            const p = positions[i] || positions[0];
            const kind = WS.codeToKind(t.code);
            const isActive = i === idx;
            return (
              <button key={i} onClick={() => setIdx(i)}
                style={{
                  position: 'absolute',
                  left: p.left,
                  top: p.top,
                  width: 230,
                  transform: `rotate(${p.rot}deg) scale(${isActive ? p.scale * 1.06 : p.scale})`,
                  transition: 'transform .25s, box-shadow .25s',
                  background: 'var(--paper-2)',
                  border: '1px solid var(--ink)',
                  boxShadow: isActive ? '6px 8px 0 var(--rust), 0 0 0 1px var(--ink)' : '4px 6px 0 color-mix(in srgb, var(--ink) 50%, transparent)',
                  padding: 8,
                  cursor: 'pointer',
                  fontFamily: '"VT323", monospace',
                  color: 'var(--ink)',
                  zIndex: isActive ? 10 : 2,
                  textAlign: 'left',
                }}>
                {/* tape */}
                <div style={{
                  position:'absolute', top: -10, left: '40%', width: 56, height: 18,
                  background: 'color-mix(in srgb, var(--rust) 30%, var(--paper))',
                  border: '1px dashed color-mix(in srgb, var(--ink) 35%, transparent)',
                  transform: `rotate(${(i%2?-6:8)}deg)`, opacity: .85,
                }} />
                <PanelScene kind={kind} hour={t.hour} dark={dark} live={isActive} height={130} includeChars />
                <div style={{
                  marginTop: 6, fontFamily: '"Caveat", "Crimson Pro", cursive', fontStyle:'italic',
                  fontSize: 16, lineHeight: 1.15, textWrap: 'pretty',
                }}>
                  <span style={{ color: 'var(--rust)' }}>{t.label}</span> — {storyCaption(kind, t.hour, t.temp)}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between',
                  fontSize: 14, marginTop: 4, color: 'var(--slate)' }}>
                  <span>{String(t.hour).padStart(2,'0')}:00</span>
                  <span style={{ color:'var(--rust)' }}>{window.formatT(t.temp)}</span>
                  <span>☂{t.precipProb}%</span>
                </div>
              </button>
            );
          })}
          {/* corner doodle */}
          <div style={{
            position:'absolute', right: 12, bottom: 8,
            fontFamily: '"VT323", monospace', fontSize: 14, color: 'var(--slate)',
            letterSpacing: 2,
          }}>~ pp. {Math.floor(Math.random()*40)+24} ~</div>
        </div>
      </div>
    </div>
  );
}

// ── MODE E · ATMOSPHERIC RIBBON (panorama strip + dataline) ─────────
function ModeRibbon({ timeline, dark, idx, setIdx, s }) {
  // Build temperature curve for 24 hours
  const hours24 = (s.hourly || []).slice(0, 24);
  const temps = hours24.map(h => h.temp ?? 0);
  const precip = hours24.map(h => h.precipProb ?? 0);
  const tMin = Math.min(...temps, 0), tMax = Math.max(...temps, 1);

  return (
    <div>
      {/* Temperature + precip ribbon at top */}
      <PixCanvasAuto height={140} scale={4} maxLogicalW={520}
        deps={[temps.join(','), precip.join(','), idx, dark]}
        draw={(c, tick, W, H) => {
          // dotted h-grid
          for (let yy = 6; yy < H - 14; yy += 8)
            for (let x = 0; x < W; x += 4) Dw.px(c, x, yy);
          // baseline
          for (let x = 0; x < W; x++) Dw.px(c, x, H - 14);
          // temperature line — dotted curve
          if (temps.length > 1) {
            const range = Math.max(1, tMax - tMin);
            for (let i = 0; i < W; i++) {
              const t = (i / (W-1)) * (temps.length - 1);
              const i0 = Math.floor(t), i1 = Math.min(temps.length-1, i0+1);
              const f = t - i0;
              const v = temps[i0] * (1-f) + temps[i1] * f;
              const y = Math.round((H - 18) - ((v - tMin) / range) * (H - 28));
              if (i % 2 === 0) Dw.px(c, i, y, Dw.getAccent());
              if (i % 3 === 0) Dw.px(c, i, y+1, Dw.getAccent());
              // shading drop
              for (let yy = y+2; yy < H - 14; yy += 3) {
                const bx = ((i % 8) + 8) % 8, by = ((yy % 8) + 8) % 8;
                if (Dw.BAYER8[by*8+bx] < 0.25) Dw.px(c, i, yy, Dw.getAccent());
              }
            }
          }
          // precip bars below baseline
          for (let i = 0; i < W; i++) {
            const t = (i / (W-1)) * (precip.length - 1);
            const v = precip[Math.round(t)] || 0;
            const h = Math.round((v / 100) * 10);
            for (let dy = 0; dy < h; dy++) Dw.px(c, i, H - 13 + dy);
          }
          // current hour marker
          const cur = timeline[idx];
          if (cur) {
            const x = Math.floor((cur.hour / 23) * (W - 1));
            for (let yy = 2; yy < H - 14; yy += 1) Dw.px(c, x, yy, Dw.getAccent());
          }
          // hour ticks
          for (let h = 0; h <= 24; h += 3) {
            const x = Math.floor((h / 24) * (W - 1));
            Dw.px(c, x, H - 13); Dw.px(c, x, H - 12); Dw.px(c, x, H - 11);
          }
        }}
      />
      {/* small labels under ribbon */}
      <div style={{ display:'flex', justifyContent:'space-between',
        fontFamily:'"VT323",monospace', fontSize: 13, letterSpacing: 1,
        color:'var(--slate)', marginTop: 2, marginBottom: 18, padding:'0 4px' }}>
        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span>
      </div>

      {/* Panorama: long horizontal strip showing the day as one continuous painting */}
      <div style={{ overflow:'hidden', border:'1px solid var(--ink)', position:'relative' }}>
        <PixCanvasAuto height={260} scale={4} maxLogicalW={520}
          deps={[timeline.length, idx, dark]}
          draw={(c, tick, W, H) => {
            // sun arc spanning whole width
            const sunRiseFrac = 0.25, sunSetFrac = 0.83;
            // sky gradient via dither — darker at edges, lighter at noon
            for (let x = 0; x < W; x++) {
              const t = x / W;
              const dayT = Math.max(0, Math.min(1, (t - sunRiseFrac) / (sunSetFrac - sunRiseFrac)));
              const brightness = Math.sin(dayT * Math.PI); // 0 at edges, 1 at noon
              for (let y = 0; y < H - 30; y++) {
                const bx = ((x % 8) + 8) % 8, by = ((y % 8) + 8) % 8;
                const top = y / (H - 30);
                const dark = (1 - brightness) * 0.5 + top * 0.4;
                if (Dw.BAYER8[by*8+bx] < dark * 0.6) Dw.px(c, x, y);
              }
            }
            // sun/moon arc
            for (let t = 0; t <= 1; t += 1/W) {
              const x = Math.round(t * (W-1));
              const a = t * Math.PI;
              const y = Math.round((H - 38) - Math.sin(a) * (H - 50));
              if (Math.floor(t * 80) % 2 === 0) {
                Dw.px(c, x, y, t > sunRiseFrac && t < sunSetFrac ? Dw.getAccent() : null);
              }
            }
            // sun position based on idx hour
            const cur = timeline[idx];
            const hourFrac = (cur?.hour ?? 12) / 24;
            const sx = Math.round(hourFrac * (W-1));
            const ay = Math.round((H - 38) - Math.sin(hourFrac * Math.PI) * (H - 50));
            if (hourFrac > 0.22 && hourFrac < 0.85) Dw.drawSun(c, sx, ay, 5, tick*0.001);
            else Dw.drawMoon(c, sx, Math.max(8, ay), 5, 0.4);

            // far skyline
            const groundY = H - 22;
            WS.skyline(c, 0, groundY - 4, W, 13);
            WS.ground(c, W, H, 'grass');
            // mid trees + houses
            WS.distantTree(c, Math.floor(W*0.06), groundY-6);
            WS.distantTree(c, Math.floor(W*0.12), groundY-5);
            WS.distantHouse(c, Math.floor(W*0.4), groundY-6);
            WS.bigTree(c, Math.floor(W*0.92), groundY-2);
            // poles + wires
            const poles = [Math.floor(W*0.06), Math.floor(W*0.32), Math.floor(W*0.68), Math.floor(W*0.96)];
            for (const px of poles) WS.telephonePole(c, px, groundY);
            for (let i = 0; i < poles.length-1; i++) WS.wireBetween(c, poles[i], poles[i+1], groundY-22, 4);

            // Vignettes — one per timeline entry, positioned along the strip
            const f = Math.floor(tick/12) % 2;
            timeline.slice(0, 8).forEach((t, i) => {
              const x = Math.floor(((t.hour) / 24) * (W - 16)) + 8;
              const py = groundY - 14;
              const kind = WS.codeToKind(t.code);
              const isCur = i === idx;
              // marker post + flag
              for (let yy = 0; yy < 16; yy++) Dw.px(c, x + 18, py + yy);
              if (isCur) {
                for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 6; xx++)
                  Dw.px(c, x + 19 + xx, py + yy, Dw.getAccent());
              } else {
                for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 5; xx++)
                  Dw.px(c, x + 19 + xx, py + yy);
              }
              // mini scene per kind near the post
              if (kind === 'rain') {
                WS.drawPerson(c, x, py, 'boy', isCur?'run':'walk', f);
                WS.drawPerson(c, x+10, py, 'girl', 'umbrella', 0);
                WS.blit(c, x+9, py-7, WS.PROPS.umbrella);
              } else if (kind === 'snow') {
                WS.drawPerson(c, x, py, 'boy', 'idle', 0);
                WS.blit(c, x-8, groundY-10, WS.PROPS.snowman);
              } else if (kind === 'sun') {
                WS.drawPerson(c, x, py, 'boy', isCur?'cheer':'walk', f);
                WS.drawPerson(c, x+10, py, 'girl', 'idle', 0);
              } else if (kind === 'fog') {
                WS.fogBands(c, W, H, tick);
                WS.drawPerson(c, x, py, 'boy', 'walk', f);
                WS.drawPerson(c, x+10, py, 'girl', 'walk', f);
              } else {
                WS.drawPerson(c, x, py, 'boy', 'walk', f);
                WS.drawPerson(c, x+10, py, 'girl', 'walk', (f+1)%2);
              }
              if (isCur) {
                Dw.pxCircle(c, x+5, py+7, 14, Dw.getAccent(), false);
              }
            });

            // overlay rain particles if any timeline-now is rain
            const cur2 = timeline[idx];
            if (cur2) {
              const k = WS.codeToKind(cur2.code);
              if (k === 'rain' || k === 'storm') WS.rainParticles(c, W, H, tick, 0.6);
              if (k === 'snow') WS.snowParticles(c, W, H, tick);
            }
          }}
        />
      </div>

      {/* Hour buttons */}
      <div style={{ display:'flex', justifyContent:'space-between', marginTop: 10,
        fontFamily:'"VT323",monospace', flexWrap:'wrap', gap: 4 }}>
        {timeline.map((t, i) => (
          <button key={i} onClick={() => setIdx(i)}
            style={{
              flex: '1 1 0',
              border: 'none', background:'transparent', cursor:'pointer',
              fontFamily: '"VT323", monospace', fontSize: 16,
              color: i === idx ? 'var(--rust)' : 'var(--slate)',
              borderTop: i === idx ? '2px solid var(--rust)' : '1px dotted var(--ink)',
              padding: '4px 2px',
            }}>
            <div>{t.label}</div>
            <div style={{ fontSize: 14, color: i === idx ? 'var(--rust)' : 'var(--ink)' }}>{window.formatT(t.temp)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── MODE WRAPPER + SWITCHER ────────────────────────────────────────
const MODES = [
  { id:'storyboard', label:'STORYBOARD', sub:'Comic of the day',     glyph:'▦' },
  { id:'grand',      label:'DIORAMA',    sub:'One stage, all hours', glyph:'◘' },
  { id:'mandala',    label:'MANDALA',    sub:'24-hour astrolabe',    glyph:'☉' },
  { id:'diary',      label:'DIARY',      sub:'Journal w/ polaroids', glyph:'❒' },
  { id:'ribbon',     label:'RIBBON',     sub:'Panorama + dataline',  glyph:'≋' },
];

function DayInWeather({ s, dark }) {
  const [dayIdx, setDayIdx] = useState(0);
  const [mode, setMode] = useState('storyboard');
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(true);

  const timeline = useTimeline(s, dayIdx);

  // auto-advance scene
  useEffect(() => {
    if (!auto || !timeline.length) return;
    const id = setInterval(() => setIdx(i => (i+1) % timeline.length), 5500);
    return () => clearInterval(id);
  }, [auto, timeline.length]);

  // bound idx
  useEffect(() => { if (idx >= timeline.length) setIdx(0); }, [timeline.length, idx]);

  if (!timeline.length) return null;
  const cur = timeline[idx] || timeline[0];
  const dateLabel = (s.daily?.[dayIdx]?.date || new Date()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <section className="pad-section" style={{ padding: '36px 28px 28px', position:'relative',
      background: 'var(--paper)', borderTop: '4px double var(--ink)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom: 6, fontFamily: '"VT323", monospace', fontSize: 14, letterSpacing: 2,
        color: 'var(--slate)' }}>
        <span>FIG. III · A LIFE IN THE FORECAST</span>
        <span>MODE · {MODES.find(m=>m.id===mode)?.label}</span>
      </div>
      <h2 style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(40px, 6vw, 80px)',
        color: 'var(--rust)', margin: 0, lineHeight: 1, letterSpacing: 3,
        textAlign: 'center', textShadow: '3px 3px 0 color-mix(in srgb, var(--ink) 18%, transparent)' }}>
        ─── A DAY IN THE WEATHER ───
      </h2>
      <div style={{ textAlign:'center', fontStyle:'italic', fontSize: 18, marginTop: 4, marginBottom: 14 }}>
        Five readings of the same day · {dateLabel}
      </div>

      {/* MODE SWITCHER */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'repeat(5, 1fr)',
        gap: 8,
        margin:'0 auto 14px', maxWidth: 920,
      }} className="dw-mode-switcher">
        {MODES.map(m => {
          const active = m.id === mode;
          return (
            <button key={m.id} onClick={() => { setMode(m.id); setIdx(0); }}
              style={{
                fontFamily:'"VT323", monospace',
                background: active ? 'var(--rust)' : 'var(--paper-2)',
                color: active ? 'var(--paper)' : 'var(--ink)',
                border: '2px solid var(--ink)',
                boxShadow: active ? '4px 4px 0 var(--ink)' : '2px 2px 0 var(--ink)',
                padding: '8px 10px',
                letterSpacing: 1,
                cursor: 'pointer',
                textAlign:'left',
                transform: active ? 'translate(-1px,-1px)' : 'none',
                transition: 'transform .12s, box-shadow .12s, background .15s',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{m.glyph}</span>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{m.label}</span>
              </div>
              <div style={{ fontSize: 13, opacity: .8, marginTop: 2 }}>{m.sub}</div>
            </button>
          );
        })}
      </div>

      {/* DAY + AUTOPLAY ROW */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        flexWrap:'wrap', gap: 10, borderTop:'1px dashed var(--ink)', borderBottom:'1px dashed var(--ink)',
        padding: '6px 4px', marginBottom: 14 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap: 0 }}>
          {(s.daily || []).slice(0, 7).map((d, i) => (
            <button key={i} onClick={() => { setDayIdx(i); setIdx(0); }}
              style={{
                fontFamily: '"VT323", monospace', fontSize: 16, letterSpacing: 1,
                border: 'none', borderRight: i < 6 ? '1px dotted var(--ink)' : 'none',
                background: 'transparent',
                color: i === dayIdx ? 'var(--rust)' : 'var(--ink)',
                padding: '4px 12px', cursor: 'pointer',
                textDecoration: i === dayIdx ? 'underline' : 'none',
                fontWeight: i === dayIdx ? 'bold' : 'normal',
              }}>
              {i === 0 ? 'TODAY' : d.date.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={() => setAuto(a => !a)}
          style={{
            fontFamily:'"VT323",monospace', fontSize: 16, letterSpacing: 1,
            border:'2px solid var(--ink)', background: auto ? 'var(--ink)' : 'var(--paper)',
            color: auto ? 'var(--paper)' : 'var(--ink)',
            padding:'2px 12px', cursor:'pointer', boxShadow:'2px 2px 0 var(--ink)',
          }}>
          {auto ? '❚❚ AUTOPLAY ON' : '▶ AUTOPLAY OFF'}
        </button>
      </div>

      {/* MODE BODY */}
      <div style={{ minHeight: 320 }}>
        {mode === 'storyboard' && <ModeStoryboard timeline={timeline} dark={dark} idx={idx} setIdx={setIdx} />}
        {mode === 'grand'      && <ModeGrand      timeline={timeline} dark={dark} idx={idx} setIdx={setIdx} live={auto} />}
        {mode === 'mandala'    && <ModeMandala    timeline={timeline} dark={dark} idx={idx} setIdx={setIdx} />}
        {mode === 'diary'      && <ModeDiary      timeline={timeline} dark={dark} idx={idx} setIdx={setIdx} dateLabel={dateLabel} />}
        {mode === 'ribbon'     && <ModeRibbon     timeline={timeline} dark={dark} idx={idx} setIdx={setIdx} s={s} />}
      </div>

      {/* Caption strip */}
      <div style={{ display:'flex', justifyContent:'space-between',
        fontFamily:'"VT323",monospace', fontSize: 18, padding:'8px 6px 0',
        borderTop:'1px dotted var(--ink)', marginTop: 14 }}>
        <span style={{ color:'var(--slate)' }}>{cur.label}</span>
        <span style={{ fontStyle:'italic', color:'var(--ink)', textAlign:'center', flex: 1 }}>
          {WS.KIND_LABEL[WS.codeToKind(cur.code)] || ''}
        </span>
        <span style={{ color:'var(--rust)' }}>{window.formatT(cur.temp)} · {cur.precipProb}%☂</span>
      </div>

      <div style={{ marginTop: 16, textAlign:'center', fontFamily:'"VT323",monospace',
        fontSize: 14, letterSpacing: 6, color:'var(--slate)' }}>
        ☼ ☾ ★ ☄ ✦ ☼ ☾ ★ ☄ ✦ ☼ ☾ ★ ☄ ✦
      </div>
    </section>
  );
}

window.DayInWeather = DayInWeather;
