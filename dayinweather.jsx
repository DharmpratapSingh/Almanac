// dayinweather.jsx — single cinematic diorama.
//
// One world: a small wooden cabin on a coastal cliff at the edge of a pine
// forest, view facing the sea. A wooden footpath leads down to a dock; one
// bench sits halfway along it. A solitary figure in a heavy coat and scarf
// is the only inhabitant. A distant lighthouse blinks on the headland.
//
// Time of day, weather, and camera shot all evolve continuously over a
// 90-second loop. Every visual layer reads from the lighting model
// (lighting.js) and the camera model (cinematography.js).

const { useEffect, useRef, useState, useMemo, useCallback } = React;
const L = window.Lighting;
const Cinema = window.Cinema;
const PAL = L.PAL;
const W = 320, H = 180;
const HORIZON_Y = 96;          // sea/sky meet here in scene coords
const CLIFF_Y   = 130;         // cabin sits on this elevation
const PATH_TOP  = 132;
const DOCK_Y    = 162;         // dock sits at sea level

const DAY_SECONDS = 90;        // one full 24h cycle in this many seconds

// ── color helpers (re-using lighting.js's mixer) ────────────────
const mix = L.mixHex;
const desat = L.desat;
const darken = L.darken;
function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// ── deterministic noise for particle drift / scatter ────────────
function vnoise(x, y, seed = 0) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed * 0.137) * 43758.5453;
  return v - Math.floor(v);
}
// 1-D "perlin-ish" — sum of two sines with different periods, smooth in x.
function pnoise1(x) {
  return Math.sin(x * 0.7) * 0.6 + Math.sin(x * 1.9 + 1.3) * 0.4;
}

// ── shared draw primitives (operate on logical 320×180 canvas) ──
function fr(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x|0, y|0, w|0, h|0);
}
function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x|0, y|0, 1, 1);
}
function discPix(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const r2 = r*r;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx*dx + dy*dy <= r2) ctx.fillRect((cx+dx)|0, (cy+dy)|0, 1, 1);
  }
}
function ringPix(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let a = 0; a < Math.PI * 2; a += 0.18) {
    ctx.fillRect((cx + Math.cos(a)*r)|0, (cy + Math.sin(a)*r)|0, 1, 1);
  }
}

// ════════════════════════════════════════════════════════════════
// LAYER 1 — SKY (deepest, parallax depth 0.0)
//   • 4-stop vertical gradient interpolated per-row
//   • stars at night with twinkle
//   • sun and moon
//   • drifting clouds (distant)
// ════════════════════════════════════════════════════════════════
function drawSky(ctx, light, t) {
  // Vertical gradient — 4 stops over y=[0..HORIZON_Y].
  // Stop positions: 0, 0.45, 0.78, 1.0
  const top = light.sky.top, upper = light.sky.upper;
  const lower = light.sky.lower, hor = light.sky.horizon;
  for (let y = 0; y < HORIZON_Y; y++) {
    const v = y / HORIZON_Y;
    let c;
    if (v < 0.45)      c = mix(top,   upper, v / 0.45);
    else if (v < 0.78) c = mix(upper, lower, (v - 0.45) / 0.33);
    else               c = mix(lower, hor,   (v - 0.78) / 0.22);
    fr(ctx, 0, y, W, 1, c);
  }

  // Stars — only when starDensity > 0. Deterministic positions, gentle twinkle.
  if (light.starDensity > 0.04) {
    for (let i = 0; i < 90; i++) {
      const sx = (i * 47 + 13) % W;
      const sy = ((i * 31 + 7) % 70) + 4;
      const tw = 0.5 + 0.5 * Math.sin(t * 0.0009 + i * 1.7);
      const a = light.starDensity * tw;
      if (a > 0.15) px(ctx, sx, sy, withAlpha(PAL.starWhite, a));
    }
    // Milky-way band on clear nights
    if (light.starDensity > 0.7 && light.cloudy < 0.3) {
      for (let i = 0; i < 60; i++) {
        const sx = (i * 23 + t * 0.05) % W;
        const sy = 30 + Math.sin(sx * 0.05) * 6 + (i % 3);
        if (vnoise(sx, sy, 5) > 0.6)
          px(ctx, sx, sy, withAlpha(PAL.starWhite, 0.35 * light.starDensity));
      }
    }
  }

  // Sun — soft warm halo + bright disc.
  if (light.cel.sunVisible) {
    const { sunX, sunY } = light.cel;
    // Halo (3 dithered rings, larger when low/horizon)
    const lowness = Math.max(0, 1 - sunY / 90);
    const haloR = 8 + lowness * 6;
    discPix(ctx, sunX, sunY, haloR + 2, withAlpha(PAL.dawnSoft, 0.10));
    discPix(ctx, sunX, sunY, haloR,     withAlpha(PAL.dawnPeach, 0.18));
    discPix(ctx, sunX, sunY, 5,         PAL.dawnSoft);
    discPix(ctx, sunX, sunY, 3,         '#fff7e0');
    // Lens-flare streak when low and clear
    if (lowness > 0.4 && light.cloudy < 0.4) {
      for (let dx = -16; dx <= 16; dx++) {
        const a = (1 - Math.abs(dx)/16) * 0.4;
        if (a > 0.1) px(ctx, sunX + dx, sunY, withAlpha(PAL.dawnSoft, a));
      }
    }
  }

  // Moon — at night/dusk.
  if (light.cel.moonVisible && light.starDensity > 0.2) {
    const { moonX, moonY } = light.cel;
    discPix(ctx, moonX, moonY, 6, withAlpha(PAL.moonGlow, 0.18));
    discPix(ctx, moonX, moonY, 3, PAL.moonGlow);
    // crescent shadow (subtle)
    if (light.starDensity > 0.6) px(ctx, moonX + 2, moonY - 1, darken(PAL.moonGlow, 0.5));
  }

  // Clouds — drift slowly. Density driven by light.cloudy.
  if (light.cloudy > 0.05) {
    const drift = (t * 4) | 0;          // px/s of wind
    const count = Math.round(2 + light.cloudy * 8);
    for (let i = 0; i < count; i++) {
      const seed = i * 71 + 3;
      const yPos = 12 + (seed % 50) * 0.7;
      const xRaw = (seed * 17 - drift * (0.4 + (i%3)*0.3));
      const cx = ((xRaw % (W + 80)) + (W + 80)) % (W + 80) - 40;
      const cw = 22 + (seed % 18);
      const ch = Math.max(4, cw * 0.32);
      drawCloud(ctx, cx, yPos, cw, ch, light);
    }
  }
}

function drawCloud(ctx, cx, cy, w, h, light) {
  // Painterly cloud — main body in cloudBright, soft underside in cloudShadow.
  const top = light.cloudy > 0.7 ? PAL.cloudBright : mix(PAL.cloudBright, PAL.dawnSoft, light.cel.rim * 0.4);
  const bot = light.cloudy > 0.7 ? PAL.cloudShadow : mix(PAL.cloudShadow, PAL.dayBlue, 0.3);
  // 4 lumps
  const lumps = [
    [-w*0.4, 0,      h*0.55],
    [-w*0.1, -h*0.35,h*0.7],
    [ w*0.2, -h*0.2, h*0.65],
    [ w*0.45,h*0.05, h*0.5],
  ];
  for (const [dx, dy, r] of lumps) {
    discPix(ctx, cx + dx, cy + dy + 1, r, bot);
  }
  for (const [dx, dy, r] of lumps) {
    discPix(ctx, cx + dx, cy + dy, r * 0.92, top);
  }
}

// ════════════════════════════════════════════════════════════════
// LAYER 2 — SEA + LIGHTHOUSE (depth 0.15)
// ════════════════════════════════════════════════════════════════
function drawSea(ctx, light, t, paraDx) {
  // Sea fills below horizon to cliff. We darken with depth (closer = lighter).
  const SEA_TOP = HORIZON_Y;
  const SEA_BOT = CLIFF_Y;
  // Sea base
  for (let y = SEA_TOP; y < SEA_BOT; y++) {
    const v = (y - SEA_TOP) / (SEA_BOT - SEA_TOP);
    let c = mix(PAL.seaMid, PAL.seaDeep, v);
    // Weather: overcast leadens the sea
    if (light.cloudy > 0.6) c = darken(c, 0.18);
    if (light.cel.sunVisible && light.cel.sunY > 70) {
      // golden hour glint near horizon
      c = mix(c, PAL.dawnPeach, (1 - v) * light.cel.rim * 0.35);
    }
    fr(ctx, 0, y, W, 1, c);
  }

  // Wave crests — thin horizontal dashes that drift
  const drift2 = t * 2;
  const crestColor = mix(PAL.seaLight, PAL.seaFoam, 0.5);
  for (let y = SEA_TOP + 2; y < SEA_BOT - 2; y += 2) {
    const v = (y - SEA_TOP) / (SEA_BOT - SEA_TOP);
    const segLen = 1 + (1 - v) * 4;
    const speed = 0.4 + v * 1.6;
    const wob = Math.sin(y * 0.21 + t * 0.002) * 6;
    for (let x = -((drift2 * speed + y*7) % 14)|0; x < W; x += 14) {
      if ((vnoise(x, y, 3) * 7 | 0) % 3 === 0) {
        fr(ctx, x + wob, y, segLen, 1, withAlpha(crestColor, 0.55 - v*0.3));
      }
    }
  }

  // Distant sails on clear weather
  if (light.cloudy < 0.5 && light.fog < 0.3 && light.rain < 0.1) {
    const sailDrift = ((t * 0.1) % 80) | 0;
    for (let i = 0; i < 2; i++) {
      const sx = ((i * 90 - sailDrift + 120) % (W + 60)) - 30 + paraDx * 0.3;
      const sy = SEA_TOP + 4 + i * 3;
      // tiny triangular sail
      px(ctx, sx,     sy,     PAL.cloudBright);
      px(ctx, sx,     sy + 1, PAL.cloudBright);
      px(ctx, sx + 1, sy + 1, PAL.cloudBright);
      px(ctx, sx,     sy + 2, PAL.cloudBright);
      px(ctx, sx - 1, sy + 2, mix(PAL.cloudShadow, PAL.seaDeep, 0.3));
      px(ctx, sx + 1, sy + 2, mix(PAL.cloudShadow, PAL.seaDeep, 0.3));
    }
  }

  // Lighthouse on far headland (right side, beyond cliff).
  const lhX = 268 + paraDx * 0.2, lhBaseY = HORIZON_Y - 2;
  // headland silhouette
  for (let dx = -22; dx <= 22; dx++) {
    const dh = Math.max(0, 6 - Math.abs(dx) * 0.3);
    fr(ctx, lhX + dx, HORIZON_Y - dh, 1, dh + 4, darken(PAL.pineMid, 0.2));
  }
  // tower
  fr(ctx, lhX - 1, lhBaseY - 14, 3, 12, PAL.cloudBright);
  fr(ctx, lhX,     lhBaseY - 16, 1, 2,  PAL.cloudBright);
  fr(ctx, lhX - 1, lhBaseY - 7,  3, 1,  PAL.scarfRed);  // red band
  // lamp
  if (light.lighthouseOn) {
    // Lamp cube
    fr(ctx, lhX - 1, lhBaseY - 17, 3, 2, PAL.windowGlow);
    // Beam (slow rotating)
    const beamAng = t * 0.8 + 0.4;
    const beamLen = 70 + light.fog * 40;
    for (let r = 1; r < beamLen; r += 1) {
      const bx = lhX + Math.cos(beamAng) * r;
      const by = (lhBaseY - 16) + Math.sin(beamAng) * r * 0.4;
      const beamA = (1 - r / beamLen) * light.lighthouseBeam * 0.6;
      if (beamA > 0.05 && bx > 0 && bx < W && by > 0 && by < HORIZON_Y) {
        // beam thickness widens with distance
        const wid = 0.5 + r * 0.06;
        for (let dy = -wid; dy <= wid; dy++) {
          const a = beamA * (1 - Math.abs(dy)/wid * 0.5);
          if (a > 0.03) px(ctx, bx, by + dy, withAlpha(PAL.windowGlow, a));
        }
      }
    }
    // pulsing lamp halo
    discPix(ctx, lhX, lhBaseY - 16, 2, withAlpha(PAL.windowGlow, 0.7));
  }

  // Distant rainbow over sea — only at golden hour with parted clouds.
  // Treated as a rare moment, not a default decoration.
  if (light.rain < 0.05 && light.cel.sunVisible && light.cel.rim > 0.35
      && light.cloudy > 0.3 && light.cloudy < 0.7) {
    const rbCx = 60, rbCy = 130, rbR = 70;
    const bands = [
      ['#9b59c5', 0.15], ['#5a87c8', 0.18], ['#5fa86a', 0.20],
      ['#dfca52', 0.20], ['#d97a3a', 0.18], ['#b03a3a', 0.15],
    ];
    bands.forEach(([col, a], i) => {
      for (let dx = -rbR; dx <= rbR; dx++) {
        const dy = -Math.sqrt(Math.max(0, (rbR - i)*(rbR - i) - dx*dx));
        if (dy < -10 && rbCy + dy > HORIZON_Y - 20)
          px(ctx, rbCx + dx, rbCy + dy, withAlpha(col, a));
      }
    });
  }
}

// ════════════════════════════════════════════════════════════════
// LAYER 3 — FAR PINES SILHOUETTE (depth 0.35)
// ════════════════════════════════════════════════════════════════
function drawPines(ctx, light, t, paraDx, paraDy) {
  // Pines fade in fog. Use ambient-tinted dark green silhouette.
  const baseColor = light.fog > 0.4
    ? mix(PAL.pineDark, PAL.fogBody, Math.min(0.6, light.fog * 0.7))
    : mix(PAL.pineDark, light.ambient, 0.15);

  // Rolling ridge on the LEFT side (cabin sits between pines and sea-cliff)
  for (let i = 0; i < 14; i++) {
    const baseX = -8 + i * 9 + paraDx * 0.5;
    const seed = i * 31 + 7;
    const treeH = 14 + (seed % 10);
    const top = CLIFF_Y - treeH - (seed % 4);
    drawPineTree(ctx, baseX, CLIFF_Y - 6, treeH, baseColor);
  }
  // A few mid-distance pines on right behind cabin
  for (let i = 0; i < 4; i++) {
    const x = 220 + i * 18 + paraDx * 0.4;
    drawPineTree(ctx, x, CLIFF_Y - 4, 18 + (i*7 % 8), baseColor);
  }
  // Bend pines in wind (storm/heavy rain)
  if (light.wind > 1.8) {
    const bend = Math.sin(t * 0.0035) * Math.min(3, (light.wind - 1.8) * 1.5);
    // already baked into trunk drift via vnoise — skip per-frame redraw
    // (cheap "bend" hint: extra wind streaks)
    for (let i = 0; i < 8; i++) {
      const x = ((t * 6 + i * 47) % W) | 0;
      const y = 80 + (i * 17) % 40;
      px(ctx, x + bend*2, y, withAlpha(PAL.cloudShadow, 0.3));
    }
  }
}

function drawPineTree(ctx, x, baseY, h, color) {
  // Triangular pine — multiple "tiers" stacking up.
  const trunkH = 3;
  fr(ctx, x, baseY - trunkH + 1, 1, trunkH, darken(color, 0.4));
  // foliage tiers from bottom (wide) to top (narrow)
  const tiers = Math.max(2, Math.floor(h / 4));
  for (let ti = 0; ti < tiers; ti++) {
    const tw = (tiers - ti) + 1;
    const ty = baseY - trunkH - ti * 3;
    for (let dx = -tw; dx <= tw; dx++) {
      const dh = tw - Math.abs(dx);
      for (let dy = 0; dy < dh; dy++) {
        px(ctx, x + dx, ty - dy, color);
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════
// LAYER 4 — CABIN, PATH, BENCH, DOCK (depth 0.7)
// ════════════════════════════════════════════════════════════════
function drawMidground(ctx, light, t, paraDx, paraDy) {
  // Cliff — flat horizontal bands first (cheap), then per-x edge wobble.
  // This is the largest area on screen so we paint it as full-width rows.
  const grassEdge = mix(PAL.grassLight, light.ambient, 0.2);
  for (let y = CLIFF_Y; y < HORIZON_Y + 80; y++) {
    const depth = (y - CLIFF_Y) / 30;
    let c;
    if (depth < 0.08)      c = grassEdge;
    else if (depth < 0.2)  c = PAL.grassDeep;
    else if (depth < 0.6)  c = mix(PAL.grassDeep, PAL.pathDirt, depth * 1.2);
    else                   c = darken(PAL.pathDirt, 0.2);
    if (light.snow > 0.4 && depth < 0.18) c = mix(c, '#e6e9ef', Math.min(0.85, light.snow));
    if (light.rain > 0.4 && depth < 0.3)  c = mix(c, light.sky.lower, 0.18);
    fr(ctx, 0, y, W, 1, c);
  }
  // Edge wobble — uneven grass top against sky
  for (let x = 0; x < W; x++) {
    const wob = Math.sin(x * 0.15 + paraDx * 0.05) * 0.9 | 0;
    if (wob > 0) px(ctx, x, CLIFF_Y - 1, grassEdge);
    if (wob < 0) px(ctx, x, CLIFF_Y, light.sky.horizon);
  }

  // Cabin location — left-center on the cliff
  const cbX = 92 + paraDx * 0.7;
  const cbY = CLIFF_Y - 22;
  drawCabin(ctx, cbX, cbY, light, t);

  // Footpath from cabin curving down-right to dock
  drawPath(ctx, cbX + 14, CLIFF_Y - 4, 230, DOCK_Y - 4, light, paraDx);

  // Bench halfway down the path
  const benchX = 162 + paraDx * 0.8;
  const benchY = CLIFF_Y + 10;
  drawBench(ctx, benchX, benchY, light);

  // Dock at the end (right-bottom)
  drawDock(ctx, 220 + paraDx, DOCK_Y, light, t);

  // Foreground tall grass tufts on the cliff edge
  drawGrassTufts(ctx, paraDx, light, t);
}

function drawCabin(ctx, x, y, light, t) {
  // Wood walls
  const wallLight = mix(PAL.woodLight, light.ambient, 0.15);
  const wallDark  = darken(wallLight, 0.35);
  // Snow cap on roof
  const snowCap = light.snow > 0.4;
  fr(ctx, x, y, 24, 16, wallLight);
  // wall planks (vertical lines)
  for (let dx = 0; dx < 24; dx += 3) px(ctx, x + dx, y + 8, wallDark);
  for (let dx = 0; dx < 24; dx += 4) {
    for (let dy = 1; dy < 16; dy++) px(ctx, x + dx, y + dy, darken(wallLight, 0.25));
  }
  // Roof — triangular slope
  for (let dy = 0; dy < 8; dy++) {
    const w = 30 - dy * 2;
    const startX = x - 3 + dy;
    fr(ctx, startX, y - 8 + dy, w, 1, dy === 0 ? PAL.cloudShadow : darken(PAL.woodDark, dy*0.05));
  }
  // Snow on roof
  if (snowCap) {
    for (let dy = 0; dy < 4; dy++) {
      const w = 26 - dy * 2;
      const startX = x - 1 + dy;
      fr(ctx, startX, y - 7 + dy, w, 1, mix('#e9eef2', PAL.cloudBright, dy*0.2));
    }
  }
  // Chimney with smoke
  fr(ctx, x + 16, y - 12, 2, 6, PAL.cloudShadow);
  fr(ctx, x + 15, y - 12, 4, 1, darken(PAL.cloudShadow, 0.3));
  if (light.windowGlow > 0.3) {
    // smoke puffs
    const smokeT = t * 0.5;
    for (let i = 0; i < 4; i++) {
      const sx = x + 17 + Math.sin(smokeT * 0.04 + i) * (i + 1);
      const sy = y - 14 - i * 3 - (smokeT * 2 % 8);
      const a = 0.6 - i * 0.12;
      if (a > 0.05) discPix(ctx, sx, sy, 1 + (i%2), withAlpha(PAL.cloudShadow, a));
    }
  }
  // Window — warm glow
  const winY = y + 4, winX = x + 3;
  if (light.windowGlow > 0.05) {
    // halo around window
    discPix(ctx, winX + 2, winY + 1, 5, withAlpha(PAL.windowHalo, 0.10 * light.windowGlow));
    discPix(ctx, winX + 2, winY + 1, 3, withAlpha(PAL.windowGlow, 0.30 * light.windowGlow));
  }
  fr(ctx, winX, winY, 5, 4, light.windowGlow > 0.1
    ? mix(PAL.windowGlow, '#ffe9a8', light.windowGlow)
    : darken(wallLight, 0.5));
  // mullion cross
  fr(ctx, winX, winY + 1, 5, 1, PAL.woodDark);
  fr(ctx, winX + 2, winY, 1, 4, PAL.woodDark);
  // Door
  fr(ctx, x + 18, y + 6, 4, 10, PAL.woodDark);
  px(ctx, x + 21, y + 11, PAL.windowGlow);  // doorknob
}

function drawPath(ctx, x0, y0, x1, y1, light, paraDx) {
  // Bezier-ish dirt path with wooden planks
  const steps = 60;
  let prevX = x0, prevY = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t * t * (3 - 2 * t);
    const cx = x0 + (x1 - x0) * t + Math.sin(t * Math.PI * 1.5) * 8;
    const cy = y0 + (y1 - y0) * e;
    // Width tapers (more dramatic perspective)
    const w = 5 - t * 2;
    for (let dx = -w; dx <= w; dx++) {
      let c = mix(PAL.pathDirt, light.ambient, 0.1);
      if (Math.abs(dx) >= w - 0.5) c = darken(c, 0.4);
      if (light.snow > 0.4) c = mix(c, '#e6eaf0', Math.min(0.7, light.snow));
      if (light.rain > 0.5) c = darken(c, 0.18);
      px(ctx, cx + dx, cy, c);
    }
    // Plank lines every 6 steps
    if (i % 5 === 0) {
      for (let dx = -w; dx <= w; dx++) px(ctx, cx + dx, cy, darken(PAL.woodDark, 0.1));
    }
    // Wet path reflections
    if (light.rain > 0.4 && i % 3 === 0) {
      px(ctx, cx, cy + 1, withAlpha(light.sky.horizon, 0.4));
    }
    prevX = cx; prevY = cy;
  }
}

function drawBench(ctx, x, y, light) {
  // Two wooden legs
  fr(ctx, x,     y, 1, 5, PAL.woodDark);
  fr(ctx, x + 8, y, 1, 5, PAL.woodDark);
  // Seat (3 planks)
  fr(ctx, x - 1, y - 1, 11, 1, PAL.woodLight);
  fr(ctx, x - 1, y - 2, 11, 1, mix(PAL.woodLight, PAL.woodDark, 0.4));
  // Back rest
  fr(ctx, x - 1, y - 6, 11, 1, PAL.woodLight);
  for (let i = 0; i < 4; i++) {
    fr(ctx, x + 1 + i*2, y - 5, 1, 4, PAL.woodLight);
  }
  // Snow on bench
  if (light.snow > 0.5) {
    fr(ctx, x - 1, y - 3, 11, 1, '#e9eef2');
    fr(ctx, x - 1, y - 7, 11, 1, '#e9eef2');
  }
}

function drawDock(ctx, x, y, light, t) {
  // 4 piles with planks on top
  for (let i = 0; i < 4; i++) {
    const px2 = x + i * 8;
    fr(ctx, px2, y, 1, 6, PAL.woodDark);
    fr(ctx, px2, y - 1, 1, 1, PAL.woodLight);
  }
  fr(ctx, x - 1, y, 26, 1, PAL.woodLight);
  fr(ctx, x - 1, y - 1, 26, 1, PAL.woodDark);
  // Gentle shimmer on water by dock
  for (let dx = 0; dx < 26; dx += 3) {
    const a = 0.3 + 0.2 * Math.sin(t * 0.005 + dx);
    px(ctx, x + dx, y + 4, withAlpha(PAL.seaFoam, a * 0.5));
  }
}

function drawGrassTufts(ctx, paraDx, light, t) {
  for (let i = 0; i < 18; i++) {
    const seed = i * 19 + 5;
    const tx = (seed * 7) % W + paraDx * 0.4;
    const ty = CLIFF_Y + 2 + (seed % 3);
    const sway = Math.sin(t * 0.003 + i) * Math.min(2, light.wind * 0.6);
    for (let dy = 0; dy < 3; dy++) {
      px(ctx, tx + sway * dy * 0.4, ty - dy, light.snow > 0.5
        ? mix(PAL.grassDeep, '#e6eaf0', 0.5) : PAL.grassDeep);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// LAYER 5 — FIGURE (depth 1.0)
// One solitary silhouette in heavy coat + scarf. Position varies with hour
// and weather: stays near cabin in storm/heavy-rain, walks to bench in
// clear/partly, sits on bench at dusk.
// ════════════════════════════════════════════════════════════════
function figurePosition(hour, weatherKind, paraDx) {
  // hour 0..24. Returns { x, y, action: 'walk' | 'sit' | 'stand' | 'home' }
  const stayHome = weatherKind === 'storm' || weatherKind === 'heavy-rain';
  const onBench = (hour >= 17 && hour <= 19) && !stayHome;
  const inside = (hour >= 22 || hour <= 5);

  if (inside) return { x: 100, y: CLIFF_Y - 14, action: 'home' };
  if (stayHome) {
    // Pacing near cabin door
    const sway = Math.sin(hour * 1.3) * 6;
    return { x: 110 + sway, y: CLIFF_Y - 8, action: 'stand' };
  }
  if (onBench) return { x: 162 + paraDx * 0.8, y: CLIFF_Y + 4, action: 'sit' };

  // Walking the path. Phase = 0..1 across the day's awake window.
  // Linear y descent so the figure tracks the bezier path (cabin → bench →
  // dock direction). Cap the y so they never sink below the path's last
  // visible step.
  const phase = ((hour - 6) % 12) / 12;
  const px2 = 105 + phase * 110;
  const py2 = CLIFF_Y - 10 + phase * 16;       // 120 → 136, stays above grass
  return { x: px2, y: py2, action: 'walk' };
}

function drawFigure(ctx, light, t, paraDx, hour, weatherKind) {
  const pos = figurePosition(hour, weatherKind, paraDx);
  if (pos.action === 'home') return;  // figure is inside, window glows instead
  const fx = pos.x | 0, fy = pos.y | 0;
  const walkPhase = (t * 0.005) % 1;

  // Long shadow at low sun
  if (light.shadow.opacity > 0.05) {
    const sLen = light.shadow.len;
    for (let dx = 1; dx <= sLen; dx++) {
      const taper = 1 - dx / sLen;
      for (let dy = 0; dy < Math.max(1, taper * 2); dy++) {
        if (((fx + dx + dy) & 1) === 0) {
          px(ctx, fx + dx * light.shadow.signX, fy + 9 + dy,
             withAlpha('#000000', light.shadow.opacity * taper));
        }
      }
    }
  }

  // Coat color tinted by ambient (so figure isn't flat black)
  const coat = mix(PAL.coatDark, light.ambient, 0.18);
  const coatLit = mix(coat, light.cel.rim > 0.3 ? PAL.dawnPeach : light.ambient, light.cel.rim * 0.35);
  const scarf = light.cel.rim > 0.2 ? mix(PAL.scarfRed, PAL.dawnPeach, light.cel.rim * 0.4) : PAL.scarfRed;
  const skin = mix(PAL.skin, light.ambient, 0.2);
  const hair = darken(coat, 0.3);

  // Walk bob
  const bob = pos.action === 'walk'
    ? Math.round(Math.sin(walkPhase * Math.PI * 2) * 0.8)
    : 0;

  // Body proportions:
  //   head: 3×3 px,  scarf: 4 wide,  coat body: 4 wide × 6 tall,  legs: 1×3 each
  // The figure is ~10 px tall.
  const cx = fx, cy = fy - bob;

  // Sit posture variant — knees forward
  if (pos.action === 'sit') {
    // Seated — narrow body, no leg sway
    fr(ctx, cx - 2, cy - 8, 4, 3, hair);     // head/hat
    fr(ctx, cx - 1, cy - 6, 2, 1, skin);
    fr(ctx, cx - 2, cy - 4, 5, 1, scarf);
    fr(ctx, cx - 2, cy - 3, 4, 4, coat);
    fr(ctx, cx - 2, cy - 3, 4, 1, coatLit);
    // legs forward
    fr(ctx, cx - 2, cy + 1, 5, 1, coat);
    fr(ctx, cx - 2, cy + 2, 1, 1, PAL.coatDark);
    fr(ctx, cx + 2, cy + 2, 1, 1, PAL.coatDark);
    return;
  }

  // Standing / walking
  // Head w/ scarf hood-edge
  fr(ctx, cx - 1, cy - 9, 3, 3, hair);
  px(ctx, cx,     cy - 7, skin);          // tiny face highlight
  // Scarf — overhangs neck, with a 2-frame lag in walk for "follow-through"
  const scarfDrift = pos.action === 'walk' ? Math.sin((walkPhase - 0.15) * Math.PI * 2) * 1.2 : 0;
  fr(ctx, cx - 1, cy - 6, 3, 1, scarf);
  px(ctx, cx + 1 + scarfDrift, cy - 5, scarf);
  px(ctx, cx + 2 + scarfDrift, cy - 4, darken(scarf, 0.3));
  // Coat body
  fr(ctx, cx - 2, cy - 5, 4, 4, coat);
  // Coat warm-side (rim light)
  if (light.cel.rim > 0.2) {
    fr(ctx, cx + 1, cy - 5, 1, 4, coatLit);
  }
  // Coat tail trailing in wind
  if (light.wind > 1.0) {
    const drag = Math.min(3, Math.round(light.wind * 0.7)) * (light.shadow.signX > 0 ? -1 : 1);
    fr(ctx, cx - 2 - drag, cy - 1, 1, 2, coat);
    px(ctx, cx - 2 - drag - 1, cy, coat);
  }
  // Belt
  px(ctx, cx,     cy - 2, darken(coat, 0.5));
  // Legs (walk anim — alternating)
  const stride = pos.action === 'walk' ? Math.round(Math.sin(walkPhase * Math.PI * 2) * 1.5) : 0;
  fr(ctx, cx - 1, cy - 1, 1, 3, PAL.coatDark);
  fr(ctx, cx + 1, cy - 1, 1, 3, PAL.coatDark);
  // Boot offset on lead leg
  if (pos.action === 'walk') {
    px(ctx, cx - 1 - Math.abs(stride), cy + 2, '#221a14');
    px(ctx, cx + 1 + Math.abs(stride), cy + 2, '#221a14');
  }

  // Holding a tin mug at mid-shot in cold weather (wisp of steam)
  if (light.windowGlow > 0.15 && weatherKind !== 'storm') {
    px(ctx, cx + 2, cy - 2, '#a8a4a0');
    if (Math.sin(t*0.01 + cx) > 0.3) {
      px(ctx, cx + 3, cy - 4, withAlpha(PAL.cloudBright, 0.6));
    }
  }

  // In fog/snow with lantern at night
  if ((light.fog > 0.5 || (light.starDensity > 0.3 && pos.action === 'walk')) && weatherKind !== 'storm') {
    const lx = cx + 3, ly = cy - 2;
    fr(ctx, lx, ly, 1, 2, '#3c2818');
    px(ctx, lx, ly + 1, PAL.windowGlow);
    discPix(ctx, lx, ly + 1, 4, withAlpha(PAL.windowGlow, 0.18));
    discPix(ctx, lx, ly + 1, 2, withAlpha(PAL.windowGlow, 0.45));
  }
}

// ════════════════════════════════════════════════════════════════
// LAYER 6 — LENS (foreground particles + vignette + lens FX)
// ════════════════════════════════════════════════════════════════
function drawParticles(ctx, light, t) {
  // RAIN — terminal velocity, slight angle in wind
  if (light.rain > 0.05) {
    const count = Math.floor(120 * light.rain);
    const angle = Math.min(0.55, light.wind * 0.18);
    for (let i = 0; i < count; i++) {
      const seed = i * 47 + 11;
      const baseX = (seed * 13) % (W + 60) - 30;
      const fall = (t * (90 + (seed % 30)) + i * 31) % (H + 40);
      const xx = baseX + fall * angle;
      // Speed lines (length grows with rain intensity)
      const len = 2 + light.rain * 3;
      for (let k = 0; k < len; k++) {
        const yy = fall - k;
        if (yy >= 0 && yy < H && xx >= 0 && xx < W) {
          px(ctx, xx, yy, withAlpha(PAL.cloudBright, 0.4 + light.rain * 0.4));
        }
      }
    }
    // Splash near ground
    for (let i = 0; i < 16 * light.rain; i++) {
      const seed = i * 23 + 5;
      const sx = (seed * 17 + Math.floor(t * 30)) % W;
      if ((Math.floor(t / 6) + i) % 4 === 0) {
        px(ctx, sx,     CLIFF_Y - 1, withAlpha(PAL.seaFoam, 0.6));
        px(ctx, sx - 1, CLIFF_Y,     withAlpha(PAL.seaFoam, 0.4));
        px(ctx, sx + 1, CLIFF_Y,     withAlpha(PAL.seaFoam, 0.4));
      }
    }
    // Foreground "lens" rain — large streaked drops in front of camera
    for (let i = 0; i < 6; i++) {
      const seed = i * 17 + 1;
      const xx = (seed * 23 + Math.floor(t * 60)) % W;
      const yy = (seed * 11 + Math.floor(t * 200)) % H;
      const a = 0.35 + light.rain * 0.3;
      fr(ctx, xx, yy, 1, 4, withAlpha(PAL.cloudBright, a));
      fr(ctx, xx + 1, yy + 1, 1, 2, withAlpha(PAL.cloudBright, a*0.6));
    }
  }

  // SNOW — Perlin x-velocity, eddies. Catches window light.
  if (light.snow > 0.05) {
    const count = Math.floor(80 * light.snow);
    for (let i = 0; i < count; i++) {
      const seed = i * 39 + 3;
      const driftPhase = t * 0.001 + seed * 0.07;
      const baseX = (seed * 11) % W;
      const baseY = ((seed * 17 + t * 30) % (H + 40)) - 20;
      const xx = baseX + Math.sin(driftPhase) * 6 + pnoise1(driftPhase) * 3;
      const yy = baseY;
      if (yy < 0 || yy > H) continue;
      // Catches window light
      const winX = 95, winY = CLIFF_Y - 18;
      const distWin = Math.hypot(xx - winX, yy - winY);
      const warm = distWin < 25 ? Math.max(0, 1 - distWin/25) * light.windowGlow : 0;
      const c = warm > 0.3
        ? withAlpha(PAL.windowGlow, 0.7)
        : withAlpha(PAL.cloudBright, 0.6 + light.snow * 0.3);
      px(ctx, xx, yy, c);
      if (i % 3 === 0) px(ctx, xx + 1, yy, c);
    }
  }

  // FOG — horizontal drifting bands (not falling, drifting).
  if (light.fog > 0.1) {
    const bands = Math.floor(4 + light.fog * 5);
    for (let b = 0; b < bands; b++) {
      const yBand = HORIZON_Y - 6 + b * 6 + Math.sin(t * 0.0002 + b) * 2;
      const drift = (t * (8 + b*2)) % (W + 60);
      for (let x = -drift; x < W; x += 5 + (b % 3)) {
        const a = light.fog * (0.25 + (b % 2) * 0.15);
        for (let dx = 0; dx < 6; dx++) {
          const xx = x + dx;
          const yy = yBand + Math.sin(xx * 0.3 + b) * 0.5;
          if (xx >= 0 && xx < W && yy >= 0 && yy < H)
            px(ctx, xx, yy, withAlpha(PAL.fogBody, a));
        }
      }
    }
  }
}

function drawLensEffects(ctx, light, t, lightningFlashFrames) {
  // Vignette — applied as a CSS radial-gradient overlay on the visible canvas
  // so we don't pay 57k pixel ops per frame here.
  // Heavy-rain "drops on the lens" — semi-static droplets that occasionally streak.
  if (light.rain > 0.7) {
    for (let i = 0; i < 6; i++) {
      const seed = i * 71 + 11;
      const dx = (seed * 19) % W;
      const dy = (seed * 11) % H;
      // streak down briefly
      const s = (t / 8 + seed) % 60 < 10 ? 6 : 0;
      discPix(ctx, dx, dy, 1, withAlpha(PAL.cloudBright, 0.4));
      if (s) fr(ctx, dx, dy, 1, s, withAlpha(PAL.cloudBright, 0.25));
    }
  }
  // Lightning flash — full-frame ink-white silhouette pass.
  if (lightningFlashFrames > 0) {
    fr(ctx, 0, 0, W, H, withAlpha('#f4f6f7', 0.55 + (lightningFlashFrames / 6) * 0.3));
  }
}

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
function CinemaDiorama({ s, dark }) {
  const [dayIdx, setDayIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);  // audio is stubbed; mute is always-on default
  const [t, setT] = useState(0);              // seconds elapsed in 90s loop
  const [shotLabel, setShotLabel] = useState('WIDE');
  const containerRef = useRef(null);
  const visRef = useRef(null);
  const offRef = useRef(null);
  const lightningRef = useRef({ frames: 0, nextFire: 4 + Math.random() * 8 });

  // Determine weather code per scene-time. We sample the selected day's hourly
  // forecast to allow weather to vary across the 90-second loop, matching how
  // a real day evolves.
  const dayForecast = useMemo(() => {
    const daily = (s.daily || [])[dayIdx];
    const hourly = s.hourly || [];
    const codesByHour = new Array(24).fill(daily?.code ?? 3);
    if (dayIdx === 0 && hourly.length) {
      hourly.slice(0, 24).forEach((h, i) => { codesByHour[i] = h.code; });
    } else if (dayIdx === 1 && hourly.length >= 36) {
      hourly.slice(12, 36).forEach((h, i) => { codesByHour[i] = h.code; });
    }
    return { codesByHour, daily };
  }, [s, dayIdx]);

  // rAF loop — drives `t` and renders. Decoupled so render runs even if React
  // state updates throttle.
  useEffect(() => {
    const offC = document.createElement('canvas');
    offC.width = W; offC.height = H;
    offRef.current = offC;
    const offCtx = offC.getContext('2d');
    offCtx.imageSmoothingEnabled = false;

    let raf, last = performance.now(), elapsed = 0, lastUiTick = 0;
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      if (playing) elapsed = (elapsed + dt) % DAY_SECONDS;

      const hour = (elapsed / DAY_SECONDS) * 24;
      const hourIdx = Math.floor(hour) % 24;
      const code = dayForecast.codesByHour[hourIdx];
      const light = L.light(hour, code);
      const cam = Cinema.camera(elapsed);

      // Lightning state machine — fires only in storm.
      if (light.lightning) {
        lightningRef.current.nextFire -= dt;
        if (lightningRef.current.nextFire <= 0) {
          lightningRef.current.frames = 6;
          lightningRef.current.nextFire = 4 + Math.random() * 9;
        }
      }
      const lf = lightningRef.current.frames;
      if (lightningRef.current.frames > 0) lightningRef.current.frames--;

      // Per-layer parallax — depth multiplier on (cam - center)
      const camDx = cam.cx - W/2;
      const camDy = cam.cy - H/2;

      // Defensive: re-assert canvas dimensions every frame.
      if (offC.width !== 320) offC.width = 320;
      if (offC.height !== 180) offC.height = 180;
      const visEl = visRef.current;
      if (visEl && containerRef.current) {
        const cw = containerRef.current.offsetWidth | 0;
        const targetH = Math.round(cw * 180 / 320);
        if (cw >= 10) {
          if (visEl.width !== cw) visEl.width = cw;
          if (visEl.height !== targetH) visEl.height = targetH;
          if (visEl.style.width !== cw + 'px') visEl.style.width = cw + 'px';
          if (visEl.style.height !== targetH + 'px') visEl.style.height = targetH + 'px';
        }
      }

      // Render to off-canvas at logical resolution
      offCtx.clearRect(0, 0, W, H);
      drawSky(offCtx, light, elapsed * 1000);
      drawSea(offCtx, light, elapsed * 1000, camDx * 0.15);
      drawPines(offCtx, light, elapsed * 1000, camDx * 0.35, camDy * 0.35);
      drawMidground(offCtx, light, elapsed * 1000, camDx * 0.7, camDy * 0.7);
      drawFigure(offCtx, light, elapsed * 1000, camDx * 1.0, hour, light.kind);
      drawParticles(offCtx, light, elapsed * 1000);
      drawLensEffects(offCtx, light, elapsed * 1000, lf);

      // Blit to visible with zoom — guarded against 0-sized canvases (layout race)
      const vis = visRef.current;
      const canBlit = vis && vis.width > 0 && vis.height > 0 && offC.width > 0 && offC.height > 0;
      if (canBlit) {
        const vctx = vis.getContext('2d');
        vctx.imageSmoothingEnabled = false;
        vctx.fillStyle = '#000';
        vctx.fillRect(0, 0, vis.width, vis.height);
        const z = cam.zoom;
        const sx = vis.width / W, sy = vis.height / H;
        vctx.save();
        vctx.translate(vis.width / 2, vis.height / 2);
        vctx.scale(sx * z, sy * z);
        vctx.translate(-cam.cx, -cam.cy);
        vctx.drawImage(offC, 0, 0);
        vctx.restore();
      } else if (!window.__diorama_warned) {
        window.__diorama_warned = true;
        console.warn('[diorama] skipping blit — vis=', vis?.width, 'x', vis?.height, ' offC=', offC.width, 'x', offC.height);
      }

      // Update React state ~3x/sec so the UI hour/shot readouts feel live but
      // we don't thrash the React tree at 60fps.
      if (now - lastUiTick > 333) {
        lastUiTick = now;
        setT(elapsed);
        if (cam.shot !== shotLabel) setShotLabel(cam.shot);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, dayForecast]);

  // Resize visible canvas to parent width with 16:9 aspect
  useEffect(() => {
    const vis = visRef.current;
    const onResize = () => {
      if (!vis || !containerRef.current) return;
      const cw = containerRef.current.offsetWidth;
      if (cw < 10) return;  // parent not laid out yet — ResizeObserver will retry
      vis.width = cw;
      vis.height = Math.round(cw * (H / W));
      vis.style.width = cw + 'px';
      vis.style.height = Math.round(cw * (H / W)) + 'px';
    };
    onResize();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { window.removeEventListener('resize', onResize); ro.disconnect(); };
  }, []);

  // Hour readout
  const hour = (t / DAY_SECONDS) * 24;
  const hh = Math.floor(hour) % 24;
  const mm = Math.floor((hour % 1) * 60);
  const hourStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  const today = (s.daily || [])[dayIdx] || {};
  const dayLabel = today.date
    ? today.date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
    : 'TODAY';

  return (
    <section className="pad-section" style={{ padding: '36px 28px 28px', position:'relative',
      borderTop:'4px double var(--ink)', background:'var(--paper)' }}>
      <div className="stipple-bg" />

      <div style={{ position:'relative', zIndex:1, maxWidth: 1200, margin: '0 auto' }}>
        {/* Section header */}
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between',
          fontFamily:'"VT323", monospace', fontSize: 14, letterSpacing: 2, color: 'var(--slate)',
          marginBottom: 6 }}>
          <span>FIG. III · A LIFE IN THE FORECAST</span>
          <span>{hourStr}  ·  {dayLabel}</span>
        </div>
        <h2 style={{ fontFamily:'"VT323", monospace', fontSize:'clamp(40px, 6vw, 80px)',
          color:'var(--rust)', margin: 0, lineHeight: 1, letterSpacing: 3, textAlign: 'center',
          textShadow: '3px 3px 0 color-mix(in srgb, var(--ink) 18%, transparent)' }}>
          ─── A DAY IN THE WEATHER ───
        </h2>
        <div style={{ textAlign:'center', fontStyle:'italic', fontSize: 18, marginTop: 4, marginBottom: 18 }}>
          A cabin on the cliff. One figure. The weather, all day.
        </div>

        {/* The diorama */}
        <div ref={containerRef} style={{
          position:'relative', width: '100%', maxWidth: 1280, margin: '0 auto',
          border: '2px solid var(--ink)', boxShadow: '8px 8px 0 var(--ink)',
          background: '#000', overflow:'hidden',
        }}>
          <canvas ref={visRef} style={{ display:'block', imageRendering:'pixelated' }} />
          {/* CSS vignette — focuses the eye on the cabin, free GPU-side cost */}
          <div style={{ position:'absolute', inset: 0, pointerEvents:'none',
            background: 'radial-gradient(ellipse 75% 75% at 50% 55%, transparent 60%, rgba(0,0,0,0.55) 100%)' }} />

          {/* Top-bar overlay — minimal: hour, weather, shot */}
          <div style={{ position:'absolute', top: 10, left: 12, right: 12, display:'flex',
            justifyContent: 'space-between', alignItems: 'center', pointerEvents:'none',
            fontFamily: '"VT323",monospace', fontSize: 14, letterSpacing: 2,
            color: 'rgba(243,236,217,0.85)', textShadow:'1px 1px 0 #000' }}>
            <span>{hourStr}</span>
            <span style={{ opacity: 0.6 }}>{(L.codeToKind(dayForecast.codesByHour[hh]) || '').toUpperCase()}</span>
            <span style={{ opacity: 0.6 }}>SHOT · {shotLabel}</span>
          </div>

          {/* Bottom-right corner — credit (matches the lo-fi reference) */}
          <div style={{ position:'absolute', bottom: 10, right: 14, pointerEvents:'none',
            fontFamily:'"VT323",monospace', fontSize: 13, color:'rgba(243,236,217,0.6)',
            textShadow:'1px 1px 0 #000', letterSpacing: 1 }}>
            ♪ — wind on water · saint mose
          </div>

          {/* Center play indicator on pause */}
          {!playing && (
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
              justifyContent:'center', pointerEvents:'none' }}>
              <div style={{ background:'rgba(0,0,0,0.5)', color:'#f3ecd9',
                fontFamily:'"VT323",monospace', fontSize: 28, letterSpacing: 4,
                padding: '12px 20px', border:'1px solid #f3ecd9' }}>‖ PAUSED</div>
            </div>
          )}
        </div>

        {/* Minimal controls */}
        <div style={{ marginTop: 14, display:'flex', alignItems:'center', justifyContent:'center',
          gap: 14, flexWrap:'wrap' }}>
          <button onClick={() => setPlaying(p => !p)}
            style={{ fontFamily:'"VT323",monospace', fontSize: 18, letterSpacing: 1,
              border:'2px solid var(--ink)', background: playing ? 'var(--ink)' : 'var(--paper)',
              color: playing ? 'var(--paper)' : 'var(--ink)', padding:'4px 16px',
              cursor:'pointer', boxShadow:'2px 2px 0 var(--ink)' }}>
            {playing ? '❚❚ PAUSE' : '▶ PLAY'}
          </button>
          <select value={dayIdx} onChange={e => setDayIdx(parseInt(e.target.value, 10))}
            style={{ fontFamily:'"VT323",monospace', fontSize: 18, letterSpacing: 1,
              border:'2px solid var(--ink)', background:'var(--paper)', color:'var(--ink)',
              padding:'4px 12px', cursor:'pointer', boxShadow:'2px 2px 0 var(--ink)' }}>
            {(s.daily || []).slice(0, 7).map((d, i) => (
              <option key={i} value={i}>
                {i === 0 ? 'TODAY' : d.date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                {' · '}{d.wmo.label}
              </option>
            ))}
          </select>
          <button onClick={() => setMuted(m => !m)}
            style={{ fontFamily:'"VT323",monospace', fontSize: 18, letterSpacing: 1,
              border:'2px solid var(--ink)', background:'var(--paper)', color:'var(--ink)',
              padding:'4px 16px', cursor:'pointer', boxShadow:'2px 2px 0 var(--ink)',
              opacity: 0.6 }} title="Audio loops not bundled in this build">
            {muted ? '🔇 MUTE' : '🔊 SOUND'}
          </button>
        </div>

        {/* Caption */}
        <div style={{ marginTop: 14, textAlign:'center', fontStyle:'italic', fontSize: 17,
          maxWidth: 720, margin: '14px auto 0', color: 'var(--ink)' }}>
          {captionFor(L.codeToKind(dayForecast.codesByHour[hh]), hh)}
        </div>
      </div>
    </section>
  );
}

function captionFor(kind, hour) {
  const night = hour >= 21 || hour <= 5;
  if (night && kind === 'storm') return 'The storm runs the headland. The figure stays at the door.';
  if (kind === 'storm')      return 'Wind shears the pines. The lighthouse swings and finds nothing.';
  if (kind === 'heavy-rain') return 'Sheeting rain. The sea is leaden. Water rolls off the gutter in a single rope.';
  if (kind === 'rain')       return 'Rain slants across the cliff. The figure walks slowly, hat low.';
  if (kind === 'fog')        return 'Fog walks in off the water. The lighthouse beam cuts a path.';
  if (kind === 'snow')       return 'Snow drifts in eddies. The window holds the only warmth.';
  if (kind === 'overcast')   return 'A leaden ceiling. The sea is the same color as the sky.';
  if (kind === 'partly')     return 'Cloud-shadows pass across the cliff. The figure walks on.';
  if (night)                  return 'The lighthouse blinks at distance. Stars hold their breath.';
  return 'Crisp air. Distant sails. The figure walks the path to the bench.';
}

window.DayInWeather = CinemaDiorama;
