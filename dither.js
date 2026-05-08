// dither.js — pixel + dot-matrix weather illustrations.
// Two render modes:
//   block  — solid scaled-up pixels (chunky 8-bit look)
//   dot    — each "pixel" rendered as a small dot in the center
//            (the Anthropic-artifact dot-matrix / halftone look)
// Theme:
//   ink    — drawing color (defaults to near-black on cream;
//            in dark mode caller flips to cream on near-black)
//   accent — secondary color (rust)

(function () {
  const PAPER = '#f3ecd9';
  const INK   = '#1a1612';
  const RUST  = '#7a2f3a';
  const SLATE = '#5a6b76';

  // Mutable theme state.
  let _ink = INK;
  let _paper = PAPER;
  let _accent = RUST;
  let _mode = 'block'; // 'block' | 'dot'

  const BAYER8 = [
     0,32, 8,40, 2,34,10,42,
    48,16,56,24,50,18,58,26,
    12,44, 4,36,14,46, 6,38,
    60,28,52,20,62,30,54,22,
     3,35,11,43, 1,33, 9,41,
    51,19,59,27,49,17,57,25,
    15,47, 7,39,13,45, 5,37,
    63,31,55,23,61,29,53,21,
  ].map(v => v / 64);

  function setTheme({ ink, paper, accent, mode } = {}) {
    if (ink !== undefined)    _ink = ink;
    if (paper !== undefined)  _paper = paper;
    if (accent !== undefined) _accent = accent;
    if (mode !== undefined)   _mode = mode;
  }

  function pix(w, h, scale = 6) {
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    c.style.imageRendering = 'pixelated';
    c._w = w; c._h = h; c._s = scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return c;
  }

  function clear(c, fill) {
    const ctx = c.getContext('2d');
    if (!fill || fill === 'transparent' || fill === 'rgba(0,0,0,0)') {
      ctx.clearRect(0, 0, c.width, c.height);
    } else {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, c.width, c.height);
    }
  }

  // Single "pixel" — block or dot depending on mode.
  function px(c, x, y, color) {
    const ctx = c.getContext('2d');
    ctx.fillStyle = color || _ink;
    const s = c._s;
    if (_mode === 'dot') {
      // round dot in the center of the cell. Dot size scales with cell.
      const dotR = Math.max(0.6, s * 0.3);
      ctx.beginPath();
      ctx.arc(x * s + s / 2, y * s + s / 2, dotR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(x * s, y * s, s, s);
    }
  }

  function pxRect(c, x, y, w, h, color) {
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++)
        px(c, x + xx, y + yy, color);
  }

  function pxCircle(c, cx, cy, r, color, fill = true) {
    const r2 = r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d2 = x*x + y*y;
        if (fill ? d2 <= r2 : Math.abs(d2 - r2) < r) {
          px(c, cx + x, cy + y, color);
        }
      }
    }
  }

  function pxCircleDither(c, cx, cy, r, color, brightnessFn) {
    const r2 = r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x*x + y*y > r2) continue;
        const b = brightnessFn(x, y, r);
        const t = BAYER8[((y % 8) + 8) % 8 * 8 + ((x % 8) + 8) % 8];
        if (b < t) px(c, cx + x, cy + y, color);
      }
    }
  }

  function stamp(c, x, y, rows, ink, accent) {
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === '#') px(c, x + dx, y + dy, ink || _ink);
        else if (ch === '*') px(c, x + dx, y + dy, accent || _accent);
      });
    });
  }

  // ───────── ILLUSTRATIONS ─────────

  function drawSun(c, cx, cy, R, phase = 0, accent) {
    const ink = _ink;
    const acc = accent || _accent;
    const rayLen = Math.round(R * 0.8);
    for (let i = 0; i < 12; i++) {
      const a = phase + (i * Math.PI * 2) / 12;
      for (let r = R + 4; r < R + rayLen; r++) {
        const x = Math.round(cx + Math.cos(a) * r);
        const y = Math.round(cy + Math.sin(a) * r);
        const t = (r - R - 4) / rayLen;
        if (Math.random() > t * 0.85) {
          for (let w = -1; w <= 1; w++) {
            const px2 = Math.round(x + Math.cos(a + Math.PI/2) * w);
            const py2 = Math.round(y + Math.sin(a + Math.PI/2) * w);
            px(c, px2, py2, ink);
          }
        }
      }
    }
    pxCircle(c, cx, cy, R - 4, ink);
    pxCircleDither(c, cx, cy, R + 2, ink, (x, y) => {
      const d = Math.sqrt(x*x + y*y);
      if (d <= R - 4) return -1;
      return (d - (R - 4)) / 6;
    });
    // face — accent
    px(c, cx - 5, cy - 3, acc); px(c, cx - 4, cy - 3, acc);
    px(c, cx + 4, cy - 3, acc); px(c, cx + 5, cy - 3, acc);
    px(c, cx - 3, cy + 3, acc); px(c, cx - 2, cy + 4, acc);
    px(c, cx - 1, cy + 5, acc); px(c, cx,     cy + 5, acc);
    px(c, cx + 1, cy + 5, acc); px(c, cx + 2, cy + 4, acc);
    px(c, cx + 3, cy + 3, acc);
  }

  function drawCloud(c, cx, cy, w, h) {
    const ink = _ink;
    const bumps = [
      [-w*0.4, 0,   h*0.55],
      [-w*0.15, -h*0.3, h*0.7],
      [ w*0.15, -h*0.25, h*0.65],
      [ w*0.4, 0,   h*0.55],
      [ w*0.0, h*0.05, h*0.5],
    ];
    for (const [dx, dy, r] of bumps) {
      pxCircleDither(c, Math.round(cx+dx), Math.round(cy+dy+1), Math.round(r), ink,
        (x, y) => 0.65 - (y / r) * 0.4);
    }
    for (const [dx, dy, r] of bumps) {
      pxCircle(c, Math.round(cx+dx), Math.round(cy+dy), Math.round(r), ink, false);
    }
    for (let x = -Math.round(w*0.5); x <= Math.round(w*0.5); x++) {
      const y = Math.round(h*0.35 + Math.sin(x * 0.4) * 1.5);
      px(c, cx + x, cy + y, ink);
    }
  }

  function drawMoon(c, cx, cy, r, phase = 0.3) {
    const ink = _ink;
    pxCircle(c, cx, cy, r, ink, false);
    pxCircleDither(c, cx, cy, r - 1, ink, (x, y) => {
      const t = (x / r + 1) / 2;
      return Math.abs(t - phase) * 2.0;
    });
    pxCircle(c, cx - r/3, cy + r/4, 2, ink, false);
    pxCircle(c, cx + r/3, cy - r/4, 1, ink);
  }

  function drawBolt(c, x, y, accent) {
    const acc = accent || _accent;
    const rows = [
      '..##....',
      '.##.....',
      '##......',
      '###.....',
      '.####...',
      '...##...',
      '..##....',
      '.##.....',
      '##......',
    ];
    rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
      if (ch === '#') px(c, x + dx, y + dy, acc);
    }));
  }

  function drawRain(c, x0, y0, w, h, tick, color) {
    const ink = color || _ink;
    const cols = 6;
    for (let i = 0; i < cols; i++) {
      const cx = x0 + ((i * (w / cols)) | 0) + ((i * 13) % 5);
      const offset = (tick * 1.2 + i * 3) % h;
      for (let k = 0; k < 3; k++) {
        const py = y0 + ((offset + k * 4) | 0) % h;
        px(c, cx, py, ink);
        px(c, cx, py + 1, ink);
      }
    }
  }

  function drawSnow(c, x0, y0, w, h, tick, color) {
    const ink = color || _ink;
    const flakes = 14;
    for (let i = 0; i < flakes; i++) {
      const cx = x0 + ((i * 17) % w);
      const drift = Math.sin((tick + i * 30) * 0.05) * 2;
      const py = y0 + ((tick * 0.6 + i * 9) | 0) % h;
      px(c, Math.round(cx + drift), py, ink);
    }
  }

  function drawCompass(c, cx, cy, r, deg) {
    const ink = _ink, acc = _accent;
    pxCircle(c, cx, cy, r, ink, false);
    pxCircle(c, cx, cy, r - 1, ink, false);
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      const tickLen = i % 4 === 0 ? 4 : 2;
      for (let t = r - tickLen; t <= r - 1; t++) {
        const x = Math.round(cx + Math.cos(a) * t);
        const y = Math.round(cy + Math.sin(a) * t);
        px(c, x, y, ink);
      }
    }
    const a = (deg - 90) * Math.PI / 180;
    for (let t = -r + 5; t < r - 5; t++) {
      const x = Math.round(cx + Math.cos(a) * t);
      const y = Math.round(cy + Math.sin(a) * t);
      const w = t > 0 ? 2 : 1;
      for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++)
        px(c, x + dx, y + dy, t > 0 ? acc : ink);
    }
    px(c, cx, cy - r + 1, acc);
    px(c, cx, cy - r + 2, acc);
  }

  function drawMountains(c, x0, y0, w, h) {
    const ink = _ink;
    for (let x = 0; x < w; x++) {
      const y1 = Math.round(h * 0.6 + Math.sin(x * 0.08) * h * 0.15 + Math.sin(x * 0.21) * h * 0.1);
      for (let y = y1; y < h; y++) {
        const t = (y - y1) / (h - y1);
        const bx = ((x % 8) + 8) % 8, by = ((y % 8) + 8) % 8;
        if (BAYER8[by * 8 + bx] < 0.3 + t * 0.7) px(c, x0 + x, y0 + y, ink);
      }
    }
    const ridge = [];
    for (let x = 0; x < w; x++) {
      ridge.push(Math.round(h * 0.75 + Math.sin(x * 0.15) * h * 0.18 + Math.cos(x * 0.31) * 3));
    }
    for (let x = 0; x < w; x++) {
      for (let y = ridge[x]; y < h; y++) px(c, x0 + x, y0 + y, ink);
    }
  }

  // Filled silhouette via dot-matrix shading (varying density)
  function drawShape(c, x0, y0, w, h, mask, density = 0.5) {
    // mask is a fn(x,y) -> 0..1 returning fill probability
    const ink = _ink;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = mask(x / w, y / h);
        if (v <= 0) continue;
        const t = BAYER8[((y % 8) + 8) % 8 * 8 + ((x % 8) + 8) % 8];
        if (v * density > t) px(c, x0 + x, y0 + y, ink);
      }
    }
  }

  window.Dither = {
    PAPER, INK, RUST, SLATE, BAYER8,
    setTheme,
    getInk: () => _ink, getPaper: () => _paper, getAccent: () => _accent, getMode: () => _mode,
    pix, clear, px, pxCircle, pxCircleDither, pxRect, stamp,
    drawSun, drawCloud, drawMoon, drawBolt, drawRain, drawSnow,
    drawCompass, drawMountains, drawShape,
  };
})();
