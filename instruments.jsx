// instruments.jsx — 8 weather instrument widgets in dotted-almanac style
const { useEffect, useRef, useState } = React;
const D3 = window.Dither;

function useDraw(w, h, scale, draw, deps) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = ref.current;
    c.width = w * scale; c.height = h * scale; c._w = w; c._h = h; c._s = scale;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    let raf;
    const loop = (now) => {
      D3.clear(c, 'rgba(0,0,0,0)');
      draw(c, now * 0.06);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, deps);
  return ref;
}

function Card({ fig, title, sub, last, children, foot }) {
  return (
    <div style={{ padding: '12px 16px', borderRight: last ? 'none' : '1px dashed var(--ink)',
      display: 'flex', flexDirection: 'column', minHeight: 220 }}>
      <div style={{ fontFamily: '"VT323",monospace', fontSize: 12, letterSpacing: 2,
        color: 'var(--slate)' }}>FIG. III · {fig}</div>
      <div style={{ fontFamily: '"VT323",monospace', fontSize: 22, color: 'var(--rust)',
        letterSpacing: 2, lineHeight: 1, marginTop: 2 }}>{title}</div>
      <div style={{ fontStyle: 'italic', fontSize: 13, marginBottom: 6 }}>{sub}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative' }}>{children}</div>
      <div style={{ borderTop: '1px dotted var(--ink)', paddingTop: 4, marginTop: 4,
        fontFamily: '"VT323",monospace', fontSize: 15,
        display: 'flex', justifyContent: 'space-between' }}>{foot}</div>
    </div>
  );
}

// 1) Barometer
function Barometer({ s }) {
  const inHg = (s.current.pressure || 1013) / 33.8639;
  const t = Math.max(0, Math.min(1, (inHg - 28) / 3));
  const angle = -135 + t * 270;
  const ref = useDraw(60, 60, 3, (c, tick) => {
    const cx = 30, cy = 32;
    D3.pxCircle(c, cx, cy, 26, null, false);
    D3.pxCircle(c, cx, cy, 24, null, false);
    for (let i = 0; i < 13; i++) {
      const a = (-135 + i * 22.5) * Math.PI / 180;
      const r2 = i % 3 === 0 ? 17 : 21;
      for (let r = r2; r <= 23; r++)
        D3.px(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r));
    }
    const wob = Math.sin(tick * 0.04) * 1.5;
    const a = (angle + wob) * Math.PI / 180;
    for (let r = 0; r <= 18; r++) {
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      D3.px(c, x, y, D3.getAccent()); D3.px(c, x + 1, y, D3.getAccent());
    }
    D3.pxCircle(c, cx, cy, 2);
  }, [angle]);
  const trend = inHg > 30.05 ? 'RISING' : inHg < 29.85 ? 'FALLING' : 'STEADY';
  return (<Card fig="A" title="BAROMETER" sub="Pressure of the air"
    foot={<><span style={{color:'var(--slate)'}}>STATE</span><span style={{color:'var(--rust)'}}>{trend}</span></>}>
    <div style={{ textAlign: 'center' }}>
      <canvas ref={ref} style={{ imageRendering:'pixelated', width: 180, height: 180, display: 'block' }} />
      <div style={{ fontFamily:'"VT323",monospace', fontSize: 22, marginTop: -28 }}>{inHg.toFixed(2)}"Hg</div>
    </div>
  </Card>);
}

// 2) UV gauge
function UVGauge({ s }) {
  const uv = s.daily?.[0]?.uv ?? 3;
  const level = uv >= 11 ? 'EXTREME' : uv >= 8 ? 'VERY HIGH' : uv >= 6 ? 'HIGH' : uv >= 3 ? 'MOD.' : 'LOW';
  const burn = uv >= 11 ? '<10m' : uv >= 8 ? '15m' : uv >= 6 ? '25m' : uv >= 3 ? '45m' : '60m+';
  const ref = useDraw(60, 100, 3, (c, tick) => {
    const x0 = 24;
    // tube outline
    for (let y = 6; y < 90; y++) { D3.px(c, x0, y); D3.px(c, x0 + 12, y); }
    for (let i = 0; i <= 12; i++) D3.px(c, x0 + i, 6);
    D3.pxCircle(c, x0 + 6, 92, 6, null, false);
    // ticks
    for (let i = 0; i <= 11; i++) {
      const yy = 88 - i * 7;
      for (let xx = -3; xx <= 3; xx++) D3.px(c, x0 + 14 + xx, yy);
    }
    // mercury rise — animated
    const target = Math.min(11, uv);
    const t = (Math.sin(tick * 0.04) * 0.5 + 0.5) * 0.6 + 0.7;
    const fillTo = 88 - target * 7;
    for (let y = 91; y >= fillTo; y--)
      for (let xx = 1; xx < 12; xx++) D3.px(c, x0 + xx, y, D3.getAccent());
    D3.pxCircle(c, x0 + 6, 92, 5, D3.getAccent());
  }, [uv]);
  return (<Card fig="B" title="UV INDEX" sub="Solar radiation"
    foot={<><span style={{color:'var(--slate)'}}>BURN</span><span style={{color:'var(--rust)'}}>{burn}</span></>}>
    <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
      <canvas ref={ref} style={{ imageRendering:'pixelated', width: 100, height: 200 }} />
      <div>
        <div style={{ fontFamily:'"VT323",monospace', fontSize: 56, color: 'var(--rust)', lineHeight: 1 }}>{uv}</div>
        <div style={{ fontFamily:'"VT323",monospace', fontSize: 16, letterSpacing: 1 }}>{level}</div>
      </div>
    </div>
  </Card>);
}

// 3) Sunlight clock
function SunClock({ s }) {
  const today = s.daily?.[0] || {};
  const sunrise = today.sunrise, sunset = today.sunset;
  const now = new Date();
  const ref = useDraw(80, 80, 3, (c, tick) => {
    const cx = 40, cy = 40, R = 32;
    // 24h ring
    D3.pxCircle(c, cx, cy, R, null, false);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24 * Math.PI * 2) - Math.PI / 2;
      const r2 = i % 6 === 0 ? R - 5 : R - 3;
      for (let r = r2; r <= R - 1; r++)
        D3.px(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r));
    }
    // day arc — accent
    if (sunrise && sunset) {
      const startH = sunrise.getHours() + sunrise.getMinutes() / 60;
      const endH = sunset.getHours() + sunset.getMinutes() / 60;
      for (let h = startH; h <= endH; h += 0.05) {
        const a = (h / 24 * Math.PI * 2) - Math.PI / 2;
        for (let r = R - 6; r <= R - 4; r++)
          D3.px(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), D3.getAccent());
      }
    }
    // current hand
    const h = now.getHours() + now.getMinutes() / 60 + Math.sin(tick * 0.02) * 0.05;
    const a = (h / 24 * Math.PI * 2) - Math.PI / 2;
    for (let r = 0; r < R - 8; r++)
      D3.px(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r));
    // sun glyph at noon angle
    if (sunrise) {
      const midA = ((sunrise.getHours() + (sunset.getHours() - sunrise.getHours()) / 2) / 24 * Math.PI * 2) - Math.PI / 2;
      D3.drawSun(c, Math.round(cx + Math.cos(midA) * (R + 4)), Math.round(cy + Math.sin(midA) * (R + 4)), 4, tick * 0.02);
    }
    D3.pxCircle(c, cx, cy, 1);
  }, [sunrise?.getTime(), sunset?.getTime()]);
  const dur = sunrise && sunset
    ? `${((sunset - sunrise) / 3600000).toFixed(1)}h`
    : '—';
  return (<Card fig="C" title="SUN CLOCK" sub="Day in 24 hours"
    foot={<><span style={{color:'var(--slate)'}}>DAYLIGHT</span><span style={{color:'var(--rust)'}}>{dur}</span></>}>
    <canvas ref={ref} style={{ imageRendering:'pixelated', width: 220, height: 220 }} />
  </Card>);
}

// 4) Wind rose
function WindRose({ s }) {
  const hours = s.hourly || [];
  const buckets = new Array(16).fill(0);
  hours.forEach(h => {
    const deg = (typeof h.windDirDeg === 'number' ? h.windDirDeg : (s.current.windDirDeg || 0));
    const i = ((Math.round(deg / 22.5) % 16) + 16) % 16;
    buckets[i] += (h.wind || 1);
  });
  const max = Math.max(1, ...buckets);
  const ref = useDraw(80, 80, 3, (c, tick) => {
    const cx = 40, cy = 40, R = 30;
    D3.pxCircle(c, cx, cy, R, null, false);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16 * Math.PI * 2) - Math.PI / 2;
      const len = Math.round((buckets[i] / max) * (R - 4));
      for (let r = 0; r <= len; r++) {
        const px = Math.round(cx + Math.cos(a) * r), py = Math.round(cy + Math.sin(a) * r);
        D3.px(c, px, py, i % 2 === 0 ? D3.getAccent() : D3.getInk());
      }
    }
    // compass letters as dots
    [['N',0,-R-3],['E',R+3,0],['S',0,R+3],['W',-R-3,0]].forEach(([_, dx, dy])=>{
      D3.pxCircle(c, cx+dx, cy+dy, 1);
    });
    // current heading needle (rotates)
    const a = ((s.current.windDirDeg || 0) - 90) * Math.PI / 180 + Math.sin(tick*0.02)*0.04;
    for (let r = R - 2; r <= R + 2; r++)
      D3.px(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), D3.getAccent());
  }, [hours.length, s.current.windDirDeg]);
  return (<Card fig="D" title="WIND ROSE" sub="Direction over 24h"
    foot={<><span style={{color:'var(--slate)'}}>NOW</span><span style={{color:'var(--rust)'}}>{s.current.windDir} {s.current.wind}mph</span></>}>
    <canvas ref={ref} style={{ imageRendering:'pixelated', width: 220, height: 220 }} />
  </Card>);
}

// 5) Hygrometer (coil)
function Hygrometer({ s }) {
  const h = s.current.humidity || 50;
  const dew = Math.round((s.current.feelsLike || s.current.temp) - ((100 - h) / 5));
  const ref = useDraw(80, 100, 3, (c, tick) => {
    // raindrop top
    const cx = 40;
    D3.pxCircle(c, cx, 14, 5, D3.getAccent());
    for (let yy = 0; yy <= 6; yy++)
      for (let xx = -yy/2; xx <= yy/2; xx++) D3.px(c, Math.round(cx+xx), 6 + yy, D3.getAccent());
    // helical coil — top to bottom, x oscillates, y descends
    const turns = 5;
    const wob = Math.sin(tick * 0.03) * 0.3;
    const top = 24, bot = 84;
    for (let p = 0; p <= 1; p += 0.005) {
      const a = p * Math.PI * 2 * turns + wob;
      const xx = Math.round(cx + Math.cos(a) * 16);
      const yy = Math.round(top + p * (bot - top));
      D3.px(c, xx, yy);
      // back side dimmer
      if (Math.sin(a) < 0) {
        const xx2 = Math.round(cx + Math.cos(a) * 14);
        D3.px(c, xx2, yy + 1);
      }
    }
    // hanging weight
    D3.pxRect(c, cx - 4, bot, 8, 6);
    // animated drips on right
    for (let i = 0; i < Math.floor(h / 25); i++) {
      const yy = 30 + i * 12 + (Math.floor(tick * 0.1) % 6);
      D3.px(c, 66 + i, yy, D3.getAccent());
      D3.px(c, 66 + i, yy + 1, D3.getAccent());
    }
  }, [h]);
  return (<Card fig="E" title="HYGROMETER" sub="Moisture in the air"
    foot={<><span style={{color:'var(--slate)'}}>DEW</span><span style={{color:'var(--rust)'}}>{dew}°</span></>}>
    <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
      <canvas ref={ref} style={{ imageRendering:'pixelated', width: 180, height: 180 }} />
      <div style={{ fontFamily:'"VT323",monospace', fontSize: 56, color:'var(--rust)', lineHeight: 1 }}>{h}%</div>
    </div>
  </Card>);
}

// 6) Astronomy box
function Astronomy({ s }) {
  const m = s.moon || { phase: 0.3, name: 'WAXING', illum: 50 };
  const ref = useDraw(40, 40, 3, (c, tick) => {
    // tiny stars
    [[6,8],[34,6],[8,32],[32,30],[20,4]].forEach(([x,y])=>D3.px(c,x,y));
    D3.drawMoon(c, 20, 20, 14, m.phase);
  }, [m.phase]);
  const rows = [['VENUS', 'W. SKY'], ['MARS', 'ZENITH'], ['JUPITER', 'SE'], ['ISS', '21:14']];
  return (<Card fig="F" title="ASTRONOMY" sub="Tonight's heavens"
    foot={<><span style={{color:'var(--slate)'}}>ILLUM</span><span style={{color:'var(--rust)'}}>{m.illum}%</span></>}>
    <div style={{ width: '100%' }}>
      <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
        <canvas ref={ref} style={{ imageRendering:'pixelated', width: 96, height: 96, flexShrink: 0 }} />
        <div style={{ color: 'var(--rust)', fontFamily:'"VT323",monospace', fontSize: 18, lineHeight: 1.05 }}>
          {m.name.toUpperCase()}
        </div>
      </div>
      <div style={{ marginTop: 6, fontFamily:'"VT323",monospace', fontSize: 13 }}>
        {rows.map(([k,v], i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between',
            borderBottom: '1px dotted var(--ink)', padding: '1px 0' }}>
            <span>{k}</span><span style={{color:'var(--slate)'}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  </Card>);
}

// 7) Wardrobe advisor
function Wardrobe({ s }) {
  const t = s.current.temp;
  const wmo = s.current.wmo || {};
  let out = 'T-SHIRT'; let acc = '';
  if (t < 0)  { out = 'PARKA'; acc = '+ MITTENS, BOOTS'; }
  else if (t < 10) { out = 'COAT'; acc = '+ SCARF'; }
  else if (t < 18) { out = 'SWEATER'; acc = '+ JEANS'; }
  else if (t < 26) { out = 'SHIRT'; acc = '+ SHORTS'; }
  else { out = 'TANK'; acc = '+ SUNHAT'; }
  if (wmo.icon === 'rain' || wmo.icon === 'storm') acc += ' + UMBRELLA';
  if (wmo.icon === 'snow') acc += ' + BOOTS';
  const ref = useDraw(40, 60, 3, (c, tick) => {
    // head — circular outline + features
    D3.pxCircle(c, 20, 12, 5, null, false);
    D3.px(c, 18, 11); D3.px(c, 22, 11); // eyes
    D3.px(c, 19, 14); D3.px(c, 20, 14); D3.px(c, 21, 14); // mouth
    // torso (clothing = accent)
    for (let yy = 0; yy < 12; yy++)
      for (let xx = -6; xx <= 6; xx++)
        D3.px(c, 20 + xx, 18 + yy, D3.getAccent());
    // collar
    for (let xx = -3; xx <= 3; xx++) D3.px(c, 20 + xx, 17);
    // arms
    for (let yy = 0; yy < 10; yy++) {
      D3.px(c, 13, 19 + yy, D3.getAccent());
      D3.px(c, 14, 19 + yy, D3.getAccent());
      D3.px(c, 26, 19 + yy, D3.getAccent());
      D3.px(c, 27, 19 + yy, D3.getAccent());
    }
    // legs (pants)
    for (let yy = 0; yy < 16; yy++) {
      D3.px(c, 17, 30 + yy); D3.px(c, 18, 30 + yy);
      D3.px(c, 22, 30 + yy); D3.px(c, 23, 30 + yy);
    }
    // shoes
    D3.pxRect(c, 16, 46, 4, 2); D3.pxRect(c, 21, 46, 4, 2);
    // hat for cold
    if (t < 10) {
      for (let xx = -6; xx <= 6; xx++) D3.px(c, 20 + xx, 7, D3.getAccent());
      for (let yy = 0; yy < 4; yy++) for (let xx = -4; xx <= 4; xx++)
        D3.px(c, 20 + xx, 3 + yy, D3.getAccent());
    } else if (t > 26) {
      // sunhat brim
      for (let xx = -8; xx <= 8; xx++) D3.px(c, 20 + xx, 7);
      for (let yy = 0; yy < 3; yy++) for (let xx = -3; xx <= 3; xx++)
        D3.px(c, 20 + xx, 4 + yy);
    }
    // scarf for very cold
    if (t < 0) for (let xx = -5; xx <= 5; xx++) D3.px(c, 20 + xx, 16, D3.getAccent());
    // umbrella for rain
    if (wmo.icon === 'rain' || wmo.icon === 'storm') {
      for (let xx = -10; xx <= 10; xx++) D3.px(c, 30 + xx, 4);
      for (let xx = -8; xx <= 8; xx++) D3.px(c, 30 + xx, 3);
      for (let xx = -5; xx <= 5; xx++) D3.px(c, 30 + xx, 2);
      for (let yy = 0; yy < 18; yy++) D3.px(c, 30, 5 + yy);
    }
  }, [t, wmo.icon]);
  return (<Card fig="G" title="WARDROBE" sub="Dress for today"
    foot={<><span style={{color:'var(--slate)'}}>FEELS</span><span style={{color:'var(--rust)'}}>{s.current.feelsLike}°</span></>}>
    <div style={{ width:'100%', textAlign:'center' }}>
      <canvas ref={ref} style={{ imageRendering:'pixelated', width: 120, height: 180 }} />
      <div style={{ fontFamily:'"VT323",monospace', fontSize: 22, color:'var(--rust)', lineHeight: 1 }}>{out}</div>
      <div style={{ fontFamily:'"VT323",monospace', fontSize: 12 }}>{acc}</div>
    </div>
  </Card>);
}

// 8) On this day — historical lore
function OnThisDay({ s }) {
  const date = new Date();
  const seed = date.getMonth() * 31 + date.getDate();
  const lore = [
    { hi: 37, lo: 5,   year: 1936, q: 'A sky like beaten copper.' },
    { hi: 31, lo: 0,   year: 1888, q: 'The streets full of paper kites.' },
    { hi: 39, lo: 13,  year: 1952, q: 'Heat enough to bend a horseshoe.' },
    { hi: 22, lo: -7,  year: 1903, q: 'Frost upon the hayricks at dawn.' },
    { hi: 29, lo: 16,  year: 1971, q: 'The geese went south two weeks early.' },
    { hi: 35, lo: 9,   year: 1924, q: 'A perfect harvest moon.' },
  ][seed % 6];
  const ref = useDraw(40, 30, 3, (c, tick) => {
    // ledger book illustration
    D3.pxRect(c, 6, 4, 28, 22);
    for (let y = 8; y < 24; y += 4) for (let x = 9; x < 32; x += 2) D3.px(c, x, y, 'rgba(0,0,0,0)');
    for (let y = 7; y < 25; y += 3) for (let x = 9; x < 32; x++) if (x % 3 !== 0) D3.px(c, x, y);
    D3.px(c, 6, 4); D3.px(c, 34, 4);
    // ribbon
    for (let y = 0; y < 10; y++) D3.px(c, 28 + (y % 2), 4 + y, D3.getAccent());
  }, []);
  const dateStr = date.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return (<Card fig="H" title="ON THIS DAY" sub={dateStr}
    foot={<><span style={{color:'var(--slate)'}}>EXTREME</span><span style={{color:'var(--rust)'}}>{lore.hi}°/{lore.lo}°</span></>}>
    <div style={{ width:'100%' }}>
      <div style={{ fontFamily:'"VT323",monospace', fontSize: 13, letterSpacing: 1, color: 'var(--slate)' }}>
        ANNO {lore.year}
      </div>
      <div style={{ fontStyle:'italic', fontSize: 14, lineHeight: 1.35, marginTop: 4, textWrap: 'pretty' }}>
        "{lore.q}"
      </div>
      <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px dotted var(--ink)',
        display:'flex', justifyContent:'space-between', fontFamily:'"VT323",monospace', fontSize: 14 }}>
        <span>HI <span style={{color:'var(--rust)'}}>{lore.hi}°</span></span>
        <span>LO <span style={{color:'var(--rust)'}}>{lore.lo}°</span></span>
      </div>
    </div>
  </Card>);
}

function InstrumentsSection({ s, dark }) {
  return (
    <section style={{ padding: '36px 28px 24px', background: 'var(--paper)' }}>
      <div style={{ display:'flex', justifyContent:'space-between',
        fontFamily:'"VT323",monospace', fontSize: 14, letterSpacing: 2, color: 'var(--slate)' }}>
        <span>FIG. III · INSTRUMENTS OF THE OBSERVATORY</span>
        <span>EIGHT GAUGES</span>
      </div>
      <h2 style={{ fontFamily:'"VT323",monospace', fontSize: 'clamp(36px, 5vw, 72px)',
        color: 'var(--rust)', margin: 0, lineHeight: 1, letterSpacing: 3, textAlign: 'center' }}>
        ─── INSTRUMENT PANEL ───
      </h2>
      <div style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 18, marginTop: 4, marginBottom: 18 }}>
        Gauges, dials, and ledgers of the day
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        borderTop: '2px solid var(--ink)', borderBottom: '1px dashed var(--ink)' }}>
        <Barometer s={s} />
        <UVGauge s={s} />
        <SunClock s={s} />
        <WindRose s={s} last />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr 1fr 1.2fr',
        borderBottom: '2px solid var(--ink)' }}>
        <Hygrometer s={s} />
        <Astronomy s={s} />
        <Wardrobe s={s} />
        <OnThisDay s={s} last />
      </div>
      <div style={{ marginTop: 14, textAlign: 'center', fontFamily:'"VT323",monospace',
        fontSize: 14, letterSpacing: 6, color: 'var(--slate)' }}>
        ☼ ☾ ★ ☄ ✦ ☼ ☾ ★ ☄ ✦ ☼ ☾ ★ ☄ ✦
      </div>
    </section>
  );
}

window.InstrumentsSection = InstrumentsSection;
