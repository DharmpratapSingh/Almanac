// scene.jsx — weather-driven pixel diorama. A boy and a girl live their day
// according to the forecast: kite-flying in sun, umbrella in rain, snowman in
// snow, watching storms through a window, picking flowers, etc. Cycles through
// the next several hours so it always evolves with upcoming weather.

const { useEffect, useRef, useState } = React;
const D2 = window.Dither;
const Wstore = window.WeatherStore;

// ── Sprite library ──────────────────────────────────────────────
// Each pose is an array of strings, # = ink, * = accent, . = transparent.
// Width 8, height 14 unless noted. Frame index handles 2-frame animations.

const SPR = {
  // BOY — cap, shirt, pants. Accent (*) = shirt
  boy: {
    idle: [
      '..####..',
      '.######.',
      '.######.',
      '.##.##.',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '*.****.*',
      '..####..',
      '..#..#..',
      '..#..#..',
      '..#..#..',
      '.##..##.',
    ],
    walk: [[
      '..####..',
      '.######.',
      '.######.',
      '.##.##..',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '*.****.*',
      '..####..',
      '..#..#..',
      '..#...#.',
      '.##....#',
      '##......',
    ], [
      '..####..',
      '.######.',
      '.######.',
      '.##.##..',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '*.****.*',
      '..####..',
      '..#..#..',
      '.#...#..',
      '#....##.',
      '......##',
    ]],
    run: [[
      '..####..',
      '.######.',
      '.######.',
      '..####..',
      '.******.',
      '*******.',
      '*.****..',
      '*.####..',
      '..####..',
      '.##..#..',
      '#....#..',
      '......#.',
      '.......#',
      '........',
    ], [
      '..####..',
      '.######.',
      '.######.',
      '..####..',
      '.******.',
      '.*******',
      '..****.*',
      '..####.*',
      '..####..',
      '..#..##.',
      '..#....#',
      '.#......',
      '#.......',
      '........',
    ]],
    umbrella: [
      '..####..',
      '.######.',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '*.****.*',
      '..####.#',
      '..####.#',
      '..#..#..',
      '..#..#..',
      '..#..#..',
      '..#..#..',
      '.##..##.',
    ],
    sit: [
      '........',
      '..####..',
      '.######.',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '*.****.*',
      '..####..',
      '..####...',
      '..#####.',
      '..####..',
      '..#..#..',
      '.##..##.',
    ],
    cheer: [
      '#......#',
      '##....##',
      '.######.',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '*.****.*',
      '..####..',
      '..#..#..',
      '..#..#..',
      '..#..#..',
      '..#..#..',
      '.##..##.',
    ],
  },
  // GIRL — long hair, dress. Accent (*) = dress
  girl: {
    idle: [
      '.######.',
      '########',
      '########',
      '.##.##..',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '********',
      '*.****.*',
      '*.****.*',
      '..#..#..',
      '..#..#..',
      '.##..##.',
    ],
    walk: [[
      '.######.',
      '########',
      '########',
      '.##.##..',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '********',
      '*.****.*',
      '*.****.*',
      '..#..#..',
      '..#...#.',
      '.##....#',
    ], [
      '.######.',
      '########',
      '########',
      '.##.##..',
      '.######.',
      '..####..',
      '.******.',
      '********',
      '********',
      '*.****.*',
      '*.****.*',
      '..#..#..',
      '.#...#..',
      '#....##.',
    ]],
    run: [[
      '.######.',
      '########',
      '########',
      '..####..',
      '.******.',
      '********',
      '*.****.*',
      '*.****.*',
      '..####..',
      '.##..##.',
      '#.....#.',
      '......#.',
      '.......#',
      '........',
    ], [
      '.######.',
      '########',
      '########',
      '..####..',
      '.******.',
      '********',
      '*.****.*',
      '*.****.*',
      '..####..',
      '.##..##.',
      '..##....',
      '...##...',
      '....##..',
      '........',
    ]],
    umbrella: [
      '.######.',
      '########',
      '########',
      '..####..',
      '.******.',
      '********',
      '********',
      '*.####.#',
      '*.####.#',
      '..#..#..',
      '..#..#..',
      '..#..#..',
      '..#..#..',
      '.##..##.',
    ],
    sit: [
      '........',
      '.######.',
      '########',
      '########',
      '..####..',
      '.******.',
      '********',
      '********',
      '..####..',
      '..#####.',
      '..#####.',
      '..####..',
      '..#..#..',
      '.##..##.',
    ],
    cheer: [
      '#.####.#',
      '########',
      '########',
      '########',
      '..####..',
      '.******.',
      '********',
      '********',
      '*.****.*',
      '..####..',
      '..#..#..',
      '..#..#..',
      '..#..#..',
      '.##..##.',
    ],
  },
};

// ── small props ─────────────────────────────────────────────────
const PROPS = {
  umbrella: [
    '.#######.',
    '########.',
    '#########',
    '.#######.',
    '....#....',
    '....#....',
    '....#....',
    '....#....',
    '....#....',
    '...##....',
  ],
  kite: [
    '.....#.....',
    '....###....',
    '...#####...',
    '..#######..',
    '.#########.',
    '..#######..',
    '...#####...',
    '....###....',
    '.....#.....',
  ],
  snowman: [
    '...####...',
    '..######..',
    '..#.##.#..',
    '..######..',
    '...####...',
    '.########.',
    '##########',
    '##########',
    '##########',
    '.########.',
  ],
  flower: [
    '.*.',
    '***',
    '.*.',
    '.#.',
    '.#.',
  ],
  bench: [
    '##########',
    '##########',
    '#........#',
    '#........#',
  ],
  windowFrame: [
    '##############',
    '#............#',
    '#............#',
    '#.....##.....#',
    '#.....##.....#',
    '##############',
    '#.....##.....#',
    '#.....##.....#',
    '#............#',
    '##############',
  ],
  bird: [
    '.##....##',
    '..######.',
    '...####..',
  ],
  birdAlt: [
    '##.....##',
    '.#######.',
    '..#####..',
  ],
};

function dark2() { try { return document.documentElement.dataset.theme === 'dark'; } catch { return false; } }

function blit(c, x, y, rows, accent) {
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
    if (ch === '#') D2.px(c, x + dx, y + dy);
    else if (ch === '*') D2.px(c, x + dx, y + dy, accent || D2.getAccent());
  }));
}

function drawPerson(c, x, y, type, pose, frame, accent) {
  const set = SPR[type];
  const rows = pose === 'walk' || pose === 'run'
    ? set[pose][frame % 2]
    : set[pose] || set.idle;
  blit(c, x, y, rows, accent);
}

// ── scene library — each renders a frame for a weather kind ──────
// Args: c (canvas), W (logical width), H (logical height), tick (ms), accent
function ground(c, W, H, fill = 'grass') {
  const ink = D2.getInk();
  const yGround = H - 8;
  // ground baseline
  for (let x = 0; x < W; x++) D2.px(c, x, yGround);
  // texture
  if (fill === 'grass') {
    for (let x = 0; x < W; x += 3) {
      const off = (x * 7) % 5;
      D2.px(c, x + (off % 2), yGround - 1);
    }
  } else if (fill === 'snow') {
    for (let x = 0; x < W; x += 2) {
      D2.px(c, x, yGround - 1);
      if ((x * 13) % 7 === 0) D2.px(c, x, yGround - 2);
    }
  } else if (fill === 'wet') {
    // puddles
    for (let x = 0; x < W; x++) D2.px(c, x, yGround);
    for (let i = 0; i < 5; i++) {
      const px = (i * 47) % (W - 12) + 6;
      for (let dx = 0; dx < 8; dx++) D2.px(c, px + dx, yGround + 1);
    }
  }
}

function distantTree(c, x, y) {
  D2.pxCircle(c, x, y, 4, null, false);
  D2.pxCircle(c, x + 5, y - 1, 3, null, false);
  D2.pxCircle(c, x - 4, y, 3, null, false);
  for (let i = 0; i < 4; i++) D2.px(c, x, y + 4 + i);
}

function distantHouse(c, x, y) {
  // outline only
  for (let i = 0; i < 12; i++) D2.px(c, x + i, y + 6);
  for (let i = 0; i < 12; i++) D2.px(c, x + i, y);
  for (let i = 0; i <= 6; i++) { D2.px(c, x, y + i); D2.px(c, x + 11, y + i); }
  // roof
  for (let i = 0; i <= 6; i++) { D2.px(c, x + 5 - Math.floor(i/2), y - i); D2.px(c, x + 6 + Math.floor(i/2), y - i); }
}

function bigTree(c, x, y) {
  for (let dy = 0; dy < 8; dy++) D2.px(c, x, y + dy);
  D2.pxCircle(c, x, y - 3, 5, null, false);
  D2.pxCircleDither(c, x, y - 3, 5, null, (xx, yy) => 0.4);
}

function rainParticles(c, W, H, tick, density = 1) {
  const cols = Math.floor(W / 4 * density);
  for (let i = 0; i < cols; i++) {
    const cx = (i * 11) % W;
    const cy = ((tick * 1.4 + i * 7) | 0) % (H - 8);
    D2.px(c, cx, cy); D2.px(c, cx, cy + 1);
  }
}

function snowParticles(c, W, H, tick) {
  for (let i = 0; i < 18; i++) {
    const cx = (i * 13 + Math.floor(Math.sin((tick + i*40) * 0.04) * 3)) % W;
    const cy = ((tick * 0.7 + i * 5) | 0) % (H - 8);
    D2.px(c, cx, cy);
  }
}

function fogBands(c, W, H, tick) {
  for (let i = 0; i < 5; i++) {
    const yy = 14 + i * 8 + Math.floor(Math.sin(tick*0.04 + i) * 1);
    const off = Math.floor(tick * 0.3 + i * 30);
    for (let x = 0; x < W; x += 3) {
      const v = ((x + off + i * 11) % 17);
      if (v < 8) D2.px(c, x, yy);
    }
  }
}

function lightning(c, W, H, tick) {
  // sporadic flash
  if (Math.floor(tick / 60) % 4 !== 0) return false;
  const phase = (tick / 60) % 1;
  if (phase > 0.15) return false;
  const x = Math.floor(W * 0.55);
  const path = [[0,0],[1,2],[-1,4],[2,7],[0,10],[3,13],[1,16]];
  let px = x, py = 4;
  for (const [dx, dy] of path) {
    const nx = px + dx, ny = py + dy;
    for (let t = 0; t <= 1; t += 0.2) {
      D2.px(c, Math.round(px + (nx-px)*t), Math.round(py + (ny-py)*t), D2.getAccent());
    }
    px = nx; py = ny;
  }
  return true;
}

function rainbow(c, cx, cy, R, alpha) {
  // dotted arc bands
  const ink = D2.getInk(), acc = D2.getAccent();
  for (let band = 0; band < 5; band++) {
    const r = R - band;
    const color = (band === 0 || band === 4) ? acc : ink;
    for (let a = -Math.PI; a <= 0; a += 0.04) {
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (Math.random() < alpha) D2.px(c, x, y, color);
    }
  }
}

function birdsFlight(c, W, tick, count = 4) {
  for (let i = 0; i < count; i++) {
    const startX = -10 - i * 14;
    const x = Math.floor(startX + tick * 0.5) % (W + 30);
    if (x > W) continue;
    const y = 6 + Math.floor(Math.sin((tick + i * 30) * 0.08) * 2) + i;
    const flap = Math.floor(tick / 8 + i) % 2;
    blit(c, x, y, flap ? PROPS.bird : PROPS.birdAlt);
  }
}

// ── DENSE environment helpers ──────────────────────────────────
// All silhouettes/outlines drawn with current ink color.

function skyline(c, x0, y0, w, seed) {
  // dotted-outline silhouettes of buildings, varied heights/widths
  let x = x0;
  let i = seed;
  while (x < x0 + w) {
    const bw = 12 + (i * 7) % 18;
    const bh = 14 + (i * 11) % 30;
    const top = y0 - bh;
    // outline
    for (let xx = 0; xx < bw; xx++) D2.px(c, x + xx, top);
    for (let yy = 0; yy <= bh; yy++) { D2.px(c, x, top + yy); D2.px(c, x + bw - 1, top + yy); }
    // windows — dotted grid
    for (let yy = top + 3; yy < y0 - 2; yy += 4) {
      for (let xx = x + 2; xx < x + bw - 2; xx += 3) D2.px(c, xx, yy);
    }
    // antenna sometimes
    if (i % 3 === 0) {
      for (let yy = 0; yy < 4; yy++) D2.px(c, x + Math.floor(bw/2), top - yy);
    }
    x += bw - 1;
    i = (i * 31 + 17) & 255;
  }
}

function lamppost(c, x, groundY) {
  for (let yy = 0; yy < 22; yy++) D2.px(c, x, groundY - yy);
  for (let yy = 22; yy < 25; yy++) { D2.px(c, x - 1, groundY - yy); D2.px(c, x + 1, groundY - yy); }
  // lamp head
  D2.pxRect(c, x - 2, groundY - 28, 5, 3);
  // glow ring
  D2.pxCircle(c, x, groundY - 26, 4, D2.getAccent(), false);
}

function picketFence(c, x0, x1, y) {
  for (let x = x0; x <= x1; x += 4) {
    for (let yy = 0; yy < 5; yy++) D2.px(c, x, y - yy);
    D2.px(c, x, y - 6);
  }
  for (let x = x0; x <= x1; x++) D2.px(c, x, y - 2);
}

function telephonePole(c, x, groundY) {
  for (let yy = 0; yy < 28; yy++) D2.px(c, x, groundY - yy);
  for (let i = -4; i <= 4; i++) D2.px(c, x + i, groundY - 24);
  for (let i = -4; i <= 4; i++) D2.px(c, x + i, groundY - 26);
}

function wireBetween(c, x1, x2, y1, sag = 3) {
  for (let x = x1; x <= x2; x++) {
    const t = (x - x1) / (x2 - x1);
    const yy = Math.round(y1 + Math.sin(t * Math.PI) * sag);
    D2.px(c, x, yy);
  }
}

function mailbox(c, x, groundY) {
  for (let yy = 0; yy < 8; yy++) D2.px(c, x, groundY - yy);
  D2.pxRect(c, x - 3, groundY - 12, 7, 4);
  D2.px(c, x + 4, groundY - 11, D2.getAccent());
}

function shrub(c, x, y, r) {
  D2.pxCircle(c, x, y, r, null, false);
  D2.pxCircle(c, x - r, y + 1, r - 1, null, false);
  D2.pxCircle(c, x + r, y + 1, r - 1, null, false);
  for (let xx = -r; xx <= r; xx++) D2.px(c, x + xx, y + r);
}

function parkBench(c, x, groundY) {
  for (let xx = 0; xx < 14; xx++) D2.px(c, x + xx, groundY - 4);
  for (let xx = 0; xx < 14; xx++) D2.px(c, x + xx, groundY - 5);
  D2.px(c, x + 1, groundY - 1); D2.px(c, x + 1, groundY - 2); D2.px(c, x + 1, groundY - 3);
  D2.px(c, x + 12, groundY - 1); D2.px(c, x + 12, groundY - 2); D2.px(c, x + 12, groundY - 3);
}

function sign(c, x, groundY, label) {
  for (let yy = 0; yy < 8; yy++) D2.px(c, x, groundY - yy);
  D2.pxRect(c, x - 6, groundY - 14, 13, 5);
  // letters as accent dots
  for (let xx = -4; xx <= 5; xx++) D2.px(c, x + xx, groundY - 12, D2.getAccent());
}

function cat(c, x, groundY, frame) {
  // body
  D2.pxRect(c, x, groundY - 3, 6, 3);
  // head
  D2.pxRect(c, x + 5, groundY - 5, 3, 3);
  // ears
  D2.px(c, x + 5, groundY - 6); D2.px(c, x + 7, groundY - 6);
  // tail (curls)
  D2.px(c, x - 1, groundY - 4); D2.px(c, x - 2, groundY - 5 - (frame ? 1 : 0));
  D2.px(c, x - 2, groundY - 6 - (frame ? 1 : 0));
  // legs
  D2.px(c, x + 1, groundY); D2.px(c, x + 4, groundY);
}

function dog(c, x, groundY, frame) {
  D2.pxRect(c, x, groundY - 3, 7, 3);
  D2.pxRect(c, x + 6, groundY - 5, 3, 3);
  D2.px(c, x + 8, groundY - 6);
  // tail wag
  D2.px(c, x - 1, groundY - 4 - (frame ? 1 : 0));
  D2.px(c, x + (frame ? 0 : 1), groundY); D2.px(c, x + 5, groundY);
}

function puddle(c, x, groundY, w) {
  for (let xx = 0; xx < w; xx++) D2.px(c, x + xx, groundY + 1);
  for (let xx = 1; xx < w - 1; xx += 2) D2.px(c, x + xx, groundY + 2);
}

function street(c, W, groundY) {
  // road below ground line — dashed center
  for (let x = 0; x < W; x++) D2.px(c, x, groundY);
  for (let x = 0; x < W; x++) D2.px(c, x, groundY + 4);
  for (let x = 6; x < W; x += 12) { D2.px(c, x, groundY + 2); D2.px(c, x + 1, groundY + 2); }
}

function starsField(c, W, count, seed) {
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const x = s % W;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const y = s % 40;
    D2.px(c, x, y);
  }
}

function snowdrift(c, W, groundY) {
  for (let x = 0; x < W; x++) {
    const h = Math.floor(2 + Math.sin(x * 0.18) * 1.5 + Math.sin(x * 0.05) * 2);
    for (let yy = 0; yy < h; yy++) D2.px(c, x, groundY - yy);
  }
}

function backgroundFigure(c, x, groundY, type, frame) {
  // smaller, simplified person silhouettes (5 wide, 8 tall)
  const idle = ['.###.', '.###.', '..#..', '.###.', '##.##', '..#..', '..#..', '.#.#.'];
  const walkA = ['.###.', '.###.', '..#..', '.###.', '##.##', '..#..', '.#...', '#....'];
  const walkB = ['.###.', '.###.', '..#..', '.###.', '##.##', '..#..', '...#.', '....#'];
  const rows = type === 'walk' ? (frame ? walkA : walkB) : idle;
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => { if (ch === '#') D2.px(c, x + dx, groundY - 8 + dy); }));
}

function lightWindows(c, buildings) {
  // optional lit windows in a building (already drawn as outlined)
}

// ── per-weather scene renderers ──────────────────────────────────
// kind ∈ {sun, sun-cloud, cloud, fog, rain, snow, storm, rainbow}
function renderScene(c, W, H, tick, kind, sceneAge, prevKind) {
  const ink = D2.getInk(), acc = D2.getAccent();
  const groundY = H - 18;
  const personY = groundY - 14;
  const boyX = Math.floor(W * 0.42);
  const girlX = Math.floor(W * 0.52);

  // baseline horizon
  if (kind === 'storm') {
    // interior — window scene
    drawWindowScene(c, W, H, tick);
    return;
  }

  // Sky elements
  if (kind === 'sun') {
    D2.drawSun(c, Math.floor(W * 0.78), 14, 6, tick * 0.001);
    // a couple of small clouds
    D2.drawCloud(c, Math.floor(W * 0.18), 12, 12, 6);
  } else if (kind === 'sun-cloud') {
    D2.drawSun(c, Math.floor(W * 0.75), 13, 6, tick * 0.001);
    D2.drawCloud(c, Math.floor(W * 0.78), 16, 14, 8);
    D2.drawCloud(c, Math.floor(W * 0.22), 12, 14, 7);
  } else if (kind === 'cloud') {
    D2.drawCloud(c, Math.floor(W * 0.25), 12, 18, 8);
    D2.drawCloud(c, Math.floor(W * 0.65), 14, 22, 9);
    D2.drawCloud(c, Math.floor(W * 0.85), 10, 12, 6);
  } else if (kind === 'fog') {
    D2.drawCloud(c, Math.floor(W * 0.4), 10, 28, 8);
    fogBands(c, W, H, tick);
  } else if (kind === 'rain') {
    D2.drawCloud(c, Math.floor(W * 0.3), 10, 22, 9);
    D2.drawCloud(c, Math.floor(W * 0.7), 12, 26, 10);
    rainParticles(c, W, H, tick, 1);
  } else if (kind === 'snow') {
    D2.drawCloud(c, Math.floor(W * 0.4), 10, 26, 9);
    D2.drawCloud(c, Math.floor(W * 0.75), 13, 16, 7);
    snowParticles(c, W, H, tick);
  } else if (kind === 'rainbow') {
    // post-rain: rainbow + scattered drops fading
    D2.drawCloud(c, Math.floor(W * 0.85), 12, 14, 7);
    D2.drawSun(c, Math.floor(W * 0.18), 12, 5, tick * 0.001);
    const t = Math.min(1, sceneAge / 1800);
    rainbow(c, Math.floor(W / 2), groundY, Math.floor(W * 0.45), 0.4 * t);
    if (sceneAge < 1500) rainParticles(c, W, H, tick, 0.3 * (1 - sceneAge/1500));
    birdsFlight(c, W, tick, 3);
  }

  // ── DENSE MIDGROUND ─────────────────────────────────────────
  // far skyline (buildings)
  skyline(c, 0, groundY - 4, Math.floor(W * 0.45), 7);
  skyline(c, Math.floor(W * 0.55), groundY - 4, Math.floor(W * 0.45), 23);
  // mid trees
  distantTree(c, Math.floor(W * 0.05), groundY - 8);
  distantTree(c, Math.floor(W * 0.16), groundY - 6);
  bigTree(c, Math.floor(W * 0.93), groundY - 2);
  // mid house with chimney
  distantHouse(c, Math.floor(W * 0.34), groundY - 6);
  // ground line + texture
  ground(c, W, H, kind === 'snow' ? 'snow' : (kind === 'rain' || kind === 'rainbow' || kind === 'storm' ? 'wet' : 'grass'));
  // ── FOREGROUND PROPS ────────────────────────────────────────
  // telephone poles + wires across full width
  const poles = [Math.floor(W * 0.08), Math.floor(W * 0.28), Math.floor(W * 0.72), Math.floor(W * 0.96)];
  for (let i = 0; i < poles.length; i++) telephonePole(c, poles[i], groundY);
  for (let i = 0; i < poles.length - 1; i++) {
    wireBetween(c, poles[i], poles[i + 1], groundY - 24, 4);
    wireBetween(c, poles[i], poles[i + 1], groundY - 26, 5);
  }
  // birds on the wire (always)
  for (let i = 0; i < 5; i++) {
    const px = Math.floor(W * 0.34) + i * 6;
    const py = groundY - 24 + Math.floor(Math.sin(i + tick * 0.02) * 0);
    D2.px(c, px, py - 1); D2.px(c, px + 1, py - 1); D2.px(c, px, py - 2);
  }
  // picket fence segments
  picketFence(c, Math.floor(W * 0.0), Math.floor(W * 0.18), groundY);
  picketFence(c, Math.floor(W * 0.78), Math.floor(W * 0.99), groundY);
  // lampposts (lit at night/storm/fog)
  if (kind === 'fog' || kind === 'storm' || kind === 'rain' || dark2()) {
    lamppost(c, Math.floor(W * 0.22), groundY);
    lamppost(c, Math.floor(W * 0.78), groundY);
  }
  // mailbox + sign + bench + shrubs
  mailbox(c, Math.floor(W * 0.04), groundY);
  parkBench(c, Math.floor(W * 0.66), groundY);
  shrub(c, Math.floor(W * 0.14), groundY - 1, 3);
  shrub(c, Math.floor(W * 0.86), groundY - 1, 3);
  shrub(c, Math.floor(W * 0.48), groundY - 1, 2);
  sign(c, Math.floor(W * 0.92), groundY);
  // background pedestrians
  const bgF = Math.floor(tick / 14) % 2;
  const bgX1 = (Math.floor(tick * 0.3) % (W + 60)) - 30;
  const bgX2 = (W + 30) - (Math.floor(tick * 0.25) % (W + 60));
  backgroundFigure(c, bgX1, groundY, 'walk', bgF);
  backgroundFigure(c, bgX2, groundY, 'walk', (bgF + 1) % 2);
  // a cat trotting
  const catX = (Math.floor(tick * 0.4) % (W + 20)) - 10;
  cat(c, catX, groundY, bgF);
  // dog occasionally
  const dogX = (W + 10) - (Math.floor(tick * 0.5) % (W + 30));
  dog(c, dogX, groundY, bgF);
  // puddles in wet weather
  if (kind === 'rain' || kind === 'rainbow') {
    puddle(c, Math.floor(W * 0.18), groundY, 8);
    puddle(c, Math.floor(W * 0.62), groundY, 10);
    puddle(c, Math.floor(W * 0.82), groundY, 6);
  }
  // stars in dark mode
  if (dark2()) starsField(c, W, 30, 99);
  // snow drifts
  if (kind === 'snow') snowdrift(c, W, groundY);

  // Characters and their behaviors
  const f = Math.floor(tick / 12) % 2; // 5 fps walk

  if (kind === 'sun') {
    // boy flies kite, girl picks flowers
    blit(c, boyX - 18, 4, PROPS.kite);
    // string from kite to boy hand
    for (let t = 0; t <= 1; t += 0.05) {
      const sx = Math.round((boyX - 13) + ((boyX) - (boyX - 13)) * t);
      const sy = Math.round(13 + (personY + 5 - 13) * t);
      if (Math.floor(t * 20) % 2 === 0) D2.px(c, sx, sy);
    }
    drawPerson(c, boyX, personY, 'boy', 'cheer', 0, acc);
    drawPerson(c, girlX, personY, 'girl', 'idle', 0, acc);
    // flowers near girl
    blit(c, girlX - 6, groundY - 5, PROPS.flower);
    blit(c, girlX + 12, groundY - 5, PROPS.flower);
    blit(c, girlX + 4, groundY - 4, PROPS.flower);
  } else if (kind === 'sun-cloud') {
    // both walking
    drawPerson(c, boyX + (f ? 1 : 0), personY, 'boy', 'walk', f, acc);
    drawPerson(c, girlX + (f ? 0 : 1), personY, 'girl', 'walk', (f + 1) % 2, acc);
  } else if (kind === 'cloud') {
    drawPerson(c, boyX, personY, 'boy', 'idle', 0, acc);
    drawPerson(c, girlX, personY, 'girl', 'walk', f, acc);
  } else if (kind === 'fog') {
    // both walking close together
    drawPerson(c, boyX + 4, personY, 'boy', 'walk', f, acc);
    drawPerson(c, boyX + 14, personY, 'girl', 'walk', f, acc);
    // small lantern between them (warm dot)
    D2.px(c, boyX + 12, personY + 8, acc);
    D2.px(c, boyX + 13, personY + 8, acc);
  } else if (kind === 'rain') {
    // running for shelter — both run with umbrella above girl
    const dx = Math.floor(Math.sin(tick * 0.04) * 1);
    drawPerson(c, boyX + dx, personY, 'boy', 'run', f, acc);
    drawPerson(c, girlX + dx, personY, 'girl', 'umbrella', 0, acc);
    blit(c, girlX - 1, personY - 7, PROPS.umbrella);
  } else if (kind === 'snow') {
    // building snowman
    drawPerson(c, boyX, personY, 'boy', 'idle', 0, acc);
    drawPerson(c, girlX + 14, personY, 'girl', 'idle', 0, acc);
    blit(c, Math.floor(W/2) - 5, groundY - 10, PROPS.snowman);
  } else if (kind === 'rainbow') {
    // both cheering & looking up
    drawPerson(c, boyX, personY, 'boy', 'cheer', 0, acc);
    drawPerson(c, girlX, personY, 'girl', 'cheer', 0, acc);
  }
}

function drawWindowScene(c, W, H, tick) {
  const ink = D2.getInk(), acc = D2.getAccent();
  // interior wall texture
  for (let y = 4; y < H - 4; y += 4) {
    for (let x = 0; x < W; x += 6) D2.px(c, x, y);
  }
  // window centered, larger
  const wx = Math.floor(W * 0.42), wy = 8;
  const ww = Math.floor(W * 0.32), wh = H - 24;
  // frame
  for (let x = 0; x <= ww; x++) { D2.px(c, wx + x, wy); D2.px(c, wx + x, wy + wh); }
  for (let y = 0; y <= wh; y++) { D2.px(c, wx, wy + y); D2.px(c, wx + ww, wy + y); }
  D2.px(c, wx + Math.floor(ww/2), wy); for (let y = 1; y < wh; y++) D2.px(c, wx + Math.floor(ww/2), wy + y);
  for (let x = 1; x < ww; x++) D2.px(c, wx + x, wy + Math.floor(wh/2));
  // outside view: rain through window
  rainParticles(c, ww - 2, wh - 2, tick, 1.4);
  // small dim cloud silhouette
  D2.drawCloud(c, wx + Math.floor(ww*0.3), wy + 5, 8, 4);
  D2.drawCloud(c, wx + Math.floor(ww*0.7), wy + 8, 10, 5);
  // lightning flash through window
  if (lightning(c, ww, wh, tick)) {
    // a soft full-pane flash
    for (let x = wx + 1; x < wx + ww; x += 2)
      for (let y = wy + 1; y < wy + wh; y += 2)
        if (Math.random() < 0.3) D2.px(c, x, y, acc);
  }
  // characters sitting on bench facing window
  const groundY = H - 8;
  // bench
  blit(c, Math.floor(W * 0.18), groundY - 2, PROPS.bench);
  blit(c, Math.floor(W * 0.78), groundY - 2, PROPS.bench);
  drawPerson(c, Math.floor(W * 0.2), groundY - 14, 'boy', 'sit', 0, acc);
  drawPerson(c, Math.floor(W * 0.8), groundY - 14, 'girl', 'sit', 0, acc);
  // floor line
  for (let x = 0; x < W; x++) D2.px(c, x, groundY);
}

// ── code → scene kind ────────────────────────────────────────────
function codeToKind(code, prevCode) {
  if (code == null) return 'cloud';
  if (code === 0) return 'sun';
  if ([1, 2].includes(code)) return 'sun-cloud';
  if (code === 3) return 'cloud';
  if ([45, 48].includes(code)) return 'fog';
  if ([95, 96, 99].includes(code)) return 'storm';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    // if previous was rain and this is light, show rainbow as a transition
    return 'rain';
  }
  return 'cloud';
}

const KIND_LABEL = {
  'sun':       'A sunny stroll · he flies a kite, she gathers wildflowers.',
  'sun-cloud': 'Mostly fair · a walk through the long afternoon.',
  'cloud':     'Overcast · pace down the lane, an unhurried hour.',
  'fog':       'A fog has come in · they walk close, lantern between them.',
  'rain':      'A downpour! He runs ahead — she shares the umbrella.',
  'snow':      'Snowfall settles · a snowman rises in the silence.',
  'storm':     'Tempest abroad · they watch the lightning from the window.',
  'rainbow':   'The rain is past · a rainbow, and birds upon the wing.',
};

// ── React component ─────────────────────────────────────────────
function WeatherDiorama({ s, dark }) {
  const ref = useRef(null);
  const labelRef = useRef(null);
  const [w, setW] = useState(900);
  const [idx, setIdx] = useState(0);
  const sceneStartRef = useRef(performance.now());
  const prevKindRef = useRef(null);

  const [dayIdx, setDayIdx] = useState(0);

  // Build timeline based on selected day.
  // Day 0 (today) and Day 1 (tomorrow) use the 24-hour hourly buffer (0-23 / 24-47 if available).
  // Days 2+ fall back to the daily forecast: 6 synthesized "scenes" using that day's code.
  const hourly = s.hourly || [];
  const daily = s.daily || [];
  let timeline = [];
  if (dayIdx <= 1 && hourly.length) {
    const start = dayIdx === 0 ? 0 : 12;
    const slice = hourly.slice(start, start + 12);
    const step = Math.max(1, Math.floor(slice.length / 6));
    timeline = slice.filter((_, i) => i % step === 0).slice(0, 6).map((h, i) => ({
      label: i === 0 && dayIdx === 0 ? 'NOW'
        : h.time.toLocaleTimeString('en-US', { hour: 'numeric' }).toUpperCase(),
      code: h.code, temp: h.temp, precipProb: h.precipProb,
    }));
  } else if (daily[dayIdx]) {
    const d = daily[dayIdx];
    const labels = ['DAWN', 'MORN', 'NOON', 'AFT.', 'EVE', 'NIGHT'];
    timeline = labels.map((label) => ({
      label, code: d.code, temp: d.hi, precipProb: d.precipProb,
    }));
  }

  // post-rain: insert rainbow scene if rain → not-rain transition
  const enriched = [];
  for (let i = 0; i < timeline.length; i++) {
    enriched.push(timeline[i]);
    const cur = codeToKind(timeline[i].code);
    const next = i + 1 < timeline.length ? codeToKind(timeline[i + 1].code) : null;
    if (cur === 'rain' && (next === 'sun' || next === 'sun-cloud' || next === 'cloud')) {
      enriched.push({ label: 'AFTER', code: -1, _kind: 'rainbow', temp: timeline[i + 1].temp, precipProb: 0 });
    }
  }

  // Scene cycling — every ~6.5s
  useEffect(() => {
    if (!enriched.length) return;
    sceneStartRef.current = performance.now();
    const id = setInterval(() => {
      setIdx(i => (i + 1) % enriched.length);
      sceneStartRef.current = performance.now();
    }, 6500);
    return () => clearInterval(id);
  }, [enriched.length]);

  // Resize observer
  useEffect(() => {
    const update = () => { if (ref.current) setW(ref.current.parentElement.offsetWidth); };
    update();
    const ro = new ResizeObserver(update);
    if (ref.current?.parentElement) ro.observe(ref.current.parentElement);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  // rAF render loop
  useEffect(() => {
    if (!ref.current || !enriched.length) return;
    const c = ref.current;
    const scale = 5;
    const W2 = Math.min(560, Math.max(280, Math.floor(w / scale)));
    const H2 = 140;
    c.width = W2 * scale; c.height = H2 * scale; c._w = W2; c._h = H2; c._s = scale;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;

    let raf;
    const render = (now) => {
      const tick = now * 0.06;
      const sceneAge = now - sceneStartRef.current;
      D2.clear(c, 'rgba(0,0,0,0)');
      const cur = enriched[idx];
      const kind = cur._kind || codeToKind(cur.code);
      renderScene(c, W2, H2, tick, kind, sceneAge, prevKindRef.current);
      prevKindRef.current = kind;
      // update label
      if (labelRef.current) {
        labelRef.current.textContent = KIND_LABEL[kind] || '';
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [w, idx, dark, enriched.length]);

  if (!enriched.length) return null;
  const cur = enriched[idx];
  const kind = cur._kind || codeToKind(cur.code);

  return (
    <section style={{ padding: '36px 28px 24px', position: 'relative', overflow: 'hidden',
      background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6, fontFamily: '"VT323", monospace', fontSize: 14, letterSpacing: 2,
        color: 'var(--slate)' }}>
        <span>FIG. III · A LIFE IN THE FORECAST</span>
        <span>SCENE {idx + 1} / {enriched.length}</span>
      </div>
      <h2 style={{ fontFamily: '"VT323", monospace', fontSize: 'clamp(40px, 6vw, 80px)',
        color: 'var(--rust)', margin: 0, lineHeight: 1, letterSpacing: 3,
        textAlign: 'center', textShadow: '3px 3px 0 color-mix(in srgb, var(--ink) 18%, transparent)' }}>
        ─── A DAY IN THE WEATHER ───
      </h2>
      <div style={{ textAlign: 'center', fontStyle: 'italic', fontSize: 18, marginTop: 4, marginBottom: 14 }}>
        Two souls and the hours of their day · {(s.daily?.[dayIdx]?.date || new Date()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>

      {/* Day selector — dotted underline matches celestial */}
      <div style={{ display: 'flex', gap: 0, justifyContent: 'center', marginBottom: 10,
        borderBottom: '1px dashed var(--ink)', paddingBottom: 8, flexWrap: 'wrap' }}>
        {(s.daily || []).slice(0, 7).map((d, i) => (
          <button key={i} onClick={() => { setDayIdx(i); setIdx(0); sceneStartRef.current = performance.now(); }}
            style={{
              fontFamily: '"VT323", monospace', fontSize: 18, letterSpacing: 1,
              border: 'none', borderRight: i < 6 ? '1px dotted var(--ink)' : 'none',
              background: 'transparent',
              color: i === dayIdx ? 'var(--rust)' : 'var(--ink)',
              padding: '4px 14px', cursor: 'pointer',
              textDecoration: i === dayIdx ? 'underline' : 'none',
              fontWeight: i === dayIdx ? 'bold' : 'normal',
            }}>
            {i === 0 ? 'TODAY' : d.date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
          </button>
        ))}
      </div>

      {/* Hour pips */}
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 8,
        fontFamily: '"VT323", monospace', fontSize: 16, letterSpacing: 1, flexWrap: 'wrap' }}>
        {enriched.map((h, i) => (
          <span key={i} onClick={() => { setIdx(i); sceneStartRef.current = performance.now(); }}
            style={{ cursor: 'pointer',
              color: i === idx ? 'var(--rust)' : 'var(--slate)',
              borderBottom: i === idx ? '2px solid var(--rust)' : 'none' }}>
            {h.label}
          </span>
        ))}
      </div>

      <canvas ref={ref} style={{ imageRendering: 'pixelated', width: '100%',
        height: 'clamp(360px, 50vw, 620px)', display: 'block' }} />

      {/* Caption strip — matches celestial sunrise/zenith line style */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        fontFamily: '"VT323", monospace', fontSize: 18, padding: '8px 6px 0',
        borderTop: '1px dotted var(--ink)', marginTop: 6 }}>
        <span style={{ color: 'var(--slate)' }}>{cur.label}</span>
        <span ref={labelRef} style={{ fontStyle: 'italic', color: 'var(--ink)', textAlign: 'center', flex: 1 }}>
          {KIND_LABEL[kind] || ''}
        </span>
        <span style={{ color: 'var(--rust)' }}>{cur.temp}° · {cur.precipProb}%☂</span>
      </div>

      {/* Bottom dotted ornament — matches celestial */}
      <div style={{ marginTop: 16, textAlign: 'center', fontFamily: '"VT323",monospace',
        fontSize: 14, letterSpacing: 6, color: 'var(--slate)' }}>
        ☼ ☾ ★ ☄ ✦ ☼ ☾ ★ ☄ ✦ ☼ ☾ ★ ☄ ✦
      </div>
    </section>
  );
}

window.WeatherDiorama = WeatherDiorama;
