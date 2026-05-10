// lighting.js — single (hour, weather) → light-model function.
// Every visual layer in the diorama reads from this. The sky-gradient stops are
// keyframed at six times of day and interpolated continuously, so the world
// never cuts between "day" and "evening" — it crossfades, the way an iOS
// Weather sky does.

(function () {
  // ── 24-color painterly palette — sampled from Kazuo Oga, Florence,
  //     Hyper Light Drifter promo art. Stays fixed; lighting picks from it.
  const PAL = {
    nightDeep:    '#070b1a',
    nightBlue:    '#101a36',
    duskIndigo:   '#2a2752',
    duskMagenta:  '#6a3066',
    duskCoral:    '#c5605c',
    dawnPeach:    '#f4a173',
    dawnSoft:     '#f9d3a3',
    dayPale:      '#cfe2ea',
    dayBlue:      '#7fb6cf',
    dayHigh:      '#a8cddd',
    cloudBright:  '#ece4d2',
    cloudShadow:  '#8a949c',
    cloudDark:    '#525a64',
    seaDeep:      '#142b48',
    seaMid:       '#2c4f74',
    seaLight:     '#5a86a3',
    seaFoam:      '#c9d8df',
    pineDark:     '#0a1a14',
    pineMid:      '#1c3528',
    grassDeep:    '#374a2c',
    grassLight:   '#7a8a48',
    pathDirt:     '#5b4329',
    woodLight:    '#9c7541',
    woodDark:     '#5a3a1f',
    windowGlow:   '#ffd17a',
    windowHalo:   '#f49a3c',
    coatDark:     '#0e0c08',
    scarfRed:     '#b03a3a',
    skin:         '#d6a984',
    starWhite:    '#f0eedf',
    moonGlow:     '#fff4cf',
    fogBody:      '#b9bdc1',
  };

  // ── color math ────────────────────────────────────────────────
  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgb = (r, g, b) => `rgb(${r|0},${g|0},${b|0})`;
  const rgba = (r, g, b, a) => `rgba(${r|0},${g|0},${b|0},${a})`;
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpHex = (h1, h2, t) => {
    const a = hex(h1), b = hex(h2);
    return rgb(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  };
  // mix returns hex string for further mixing
  const mixHex = (h1, h2, t) => {
    const a = hex(h1), b = hex(h2);
    const r = lerp(a[0], b[0], t)|0, g = lerp(a[1], b[1], t)|0, x = lerp(a[2], b[2], t)|0;
    return '#' + ((1<<24) | (r<<16) | (g<<8) | x).toString(16).slice(1);
  };
  const toHex = (r, g, b) => '#' + ((1<<24) | ((r|0)<<16) | ((g|0)<<8) | (b|0)).toString(16).slice(1);
  const desat = (h, amount = 0.35) => {
    const [r, g, b] = hex(h);
    const gray = (r * 0.299 + g * 0.587 + b * 0.114);
    return toHex(lerp(r, gray, amount), lerp(g, gray, amount), lerp(b, gray, amount));
  };
  const darken = (h, amount = 0.2) => {
    const [r, g, b] = hex(h);
    return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
  };

  // ── sky keyframes — 4-stop gradient from top to horizon ─────────
  // Each row: [hour, top, upper, lower, horizon]
  const SKY_KEYS = [
    [0,  PAL.nightDeep,    PAL.nightBlue,   PAL.nightBlue,    PAL.duskIndigo  ],  // deep night
    [4,  PAL.nightDeep,    PAL.nightBlue,   PAL.duskIndigo,   PAL.duskMagenta ],  // pre-dawn glow
    [6,  PAL.nightBlue,    PAL.duskIndigo,  PAL.duskCoral,    PAL.dawnPeach   ],  // dawn
    [8,  PAL.dayHigh,      PAL.dayBlue,     PAL.dayPale,      PAL.dawnSoft    ],  // morning
    [12, PAL.dayHigh,      PAL.dayHigh,     PAL.dayBlue,      PAL.dayPale     ],  // noon
    [16, PAL.dayHigh,      PAL.dayBlue,     PAL.dayPale,      PAL.dawnSoft    ],  // afternoon
    [18, PAL.duskIndigo,   PAL.duskMagenta, PAL.duskCoral,    PAL.dawnPeach   ],  // dusk
    [20, PAL.nightBlue,    PAL.duskIndigo,  PAL.duskMagenta,  PAL.duskCoral   ],  // late dusk
    [22, PAL.nightDeep,    PAL.nightBlue,   PAL.nightBlue,    PAL.duskIndigo  ],  // early night
    [24, PAL.nightDeep,    PAL.nightBlue,   PAL.nightBlue,    PAL.duskIndigo  ],  // wrap
  ];

  function findKey(hour) {
    let prev = SKY_KEYS[0], next = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (SKY_KEYS[i][0] <= hour && SKY_KEYS[i + 1][0] >= hour) {
        prev = SKY_KEYS[i]; next = SKY_KEYS[i + 1]; break;
      }
    }
    const span = next[0] - prev[0] || 1;
    const t = (hour - prev[0]) / span;
    return { prev, next, t };
  }

  // ── weather-code to "kind" (matches scene's WMO mapping) ────────
  function codeToKind(code) {
    if (code == null) return 'cloud';
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'partly';
    if (code === 3) return 'overcast';
    if (code === 45 || code === 48) return 'fog';
    if ([51,53,55,56,57,61,63,80,81].includes(code)) return 'rain';
    if ([65,66,67,82].includes(code)) return 'heavy-rain';
    if ([71,73,75,77,85,86].includes(code)) return 'snow';
    if ([95,96,99].includes(code)) return 'storm';
    return 'cloud';
  }

  // ── sun/moon position on a horizon arc ──────────────────────────
  // World y of the horizon line ≈ 110 (in 320×180 logical). Sun rises in east
  // (right side of screen — looking out at the sea due west the sun would be
  // at the figure's back, but for composition we keep it visible: sun arcs
  // across upper sky-half, moon takes over after 18h).
  function celestials(hour) {
    const sunAngle = ((hour - 6) / 12) * Math.PI;  // 6am=0, 12pm=PI/2, 6pm=PI
    const sunVisible = hour >= 5.5 && hour <= 18.5;
    const sunX = 320 - (Math.cos(sunAngle) * 110 + 160);
    const sunY = 90 - Math.sin(sunAngle) * 70;

    const moonAngle = (((hour - 18) % 24) / 12) * Math.PI;
    const moonVisible = hour <= 6 || hour >= 18;
    const moonX = 30 + Math.cos(moonAngle) * 110 + 130;
    const moonY = 80 - Math.abs(Math.sin(moonAngle)) * 60;

    // Warm rim factor — strongest at dawn (6h) and dusk (18h).
    const rim = Math.max(
      0,
      1 - Math.min(Math.abs(hour - 6.2), Math.abs(hour - 17.8)) / 1.4
    );
    return { sunX, sunY, sunVisible, moonX, moonY, moonVisible, rim };
  }

  // ── main entry ──────────────────────────────────────────────────
  function light(hour, weatherCode) {
    const kind = codeToKind(weatherCode);
    const { prev, next, t } = findKey(hour);
    const ease = t * t * (3 - 2 * t);

    const sky = {
      top:     mixHex(prev[1], next[1], ease),
      upper:   mixHex(prev[2], next[2], ease),
      lower:   mixHex(prev[3], next[3], ease),
      horizon: mixHex(prev[4], next[4], ease),
    };

    // Weather modulation — overcast desats and pulls top down to lower mid.
    const weatherMod = {
      clear:       { sat: 0,    mute: 0,    cloudy: 0,   fog: 0,   rain: 0,   snow: 0,   wind: 1, lightning: 0 },
      partly:      { sat: 0.05, mute: 0.04, cloudy: 0.4, fog: 0,   rain: 0,   snow: 0,   wind: 1.2, lightning: 0 },
      overcast:    { sat: 0.45, mute: 0.18, cloudy: 0.95,fog: 0.1, rain: 0,   snow: 0,   wind: 1.4, lightning: 0 },
      fog:         { sat: 0.55, mute: 0.32, cloudy: 0.5, fog: 0.85,rain: 0,   snow: 0,   wind: 0.4, lightning: 0 },
      rain:        { sat: 0.45, mute: 0.22, cloudy: 0.9, fog: 0.18,rain: 0.6, snow: 0,   wind: 1.6, lightning: 0 },
      'heavy-rain':{ sat: 0.55, mute: 0.30, cloudy: 1.0, fog: 0.25,rain: 1.0, snow: 0,   wind: 2.6, lightning: 0 },
      snow:        { sat: 0.40, mute: 0.18, cloudy: 0.7, fog: 0.3, rain: 0,   snow: 0.9, wind: 0.9, lightning: 0 },
      storm:       { sat: 0.65, mute: 0.36, cloudy: 1.0, fog: 0.2, rain: 0.95,snow: 0,   wind: 3.4, lightning: 1 },
      cloud:       { sat: 0.30, mute: 0.12, cloudy: 0.7, fog: 0.05,rain: 0,   snow: 0,   wind: 1.2, lightning: 0 },
    }[kind];

    if (weatherMod.sat) {
      sky.top     = desat(sky.top,     weatherMod.sat);
      sky.upper   = desat(sky.upper,   weatherMod.sat);
      sky.lower   = desat(sky.lower,   weatherMod.sat);
      sky.horizon = desat(sky.horizon, weatherMod.sat);
    }
    if (weatherMod.mute) {
      sky.top     = darken(sky.top,     weatherMod.mute);
      sky.upper   = darken(sky.upper,   weatherMod.mute);
      sky.lower   = darken(sky.lower,   weatherMod.mute * 0.6);
    }

    const cel = celestials(hour);

    // Ambient light tint — average of horizon + lower, used to color-shift
    // foreground silhouettes so figure/cabin don't read as flat black.
    const ambient = mixHex(sky.lower, sky.horizon, 0.5);

    // Shadow length parameterized by sun height.
    const sunHeight = Math.max(0, 1 - Math.abs(hour - 12) / 6);
    const shadowLen = sunHeight < 0.05 ? 0 : Math.round((1.2 - sunHeight) * 14);
    const shadowOpacity = sunHeight < 0.05 ? 0 : Math.min(0.55, 0.18 + (1 - sunHeight) * 0.45);

    // Window glow — none in mid-day, full at dusk → night.
    let windowGlow;
    if (hour >= 16 && hour <= 22)      windowGlow = (hour - 16) / 4;
    else if (hour >= 22 || hour <= 5)  windowGlow = 1;
    else if (hour >= 5 && hour <= 7)   windowGlow = (7 - hour) / 2;
    else                               windowGlow = 0;
    windowGlow = Math.min(1, Math.max(0, windowGlow));
    // Cloudy weather makes interior lights kick in earlier.
    if (weatherMod.cloudy > 0.7) windowGlow = Math.max(windowGlow, 0.35);

    // Lighthouse beam — always on at night, brighter in fog/storm.
    const lighthouseOn = hour <= 6.5 || hour >= 17.5 || weatherMod.fog > 0.3 || weatherMod.lightning;
    const lighthouseBeam = (lighthouseOn ? 0.6 : 0) + (weatherMod.fog * 0.4) + (weatherMod.lightning * 0.4);

    // Star density (only at deep night).
    const starDensity = hour <= 4 || hour >= 21 ? 1
      : (hour <= 6 ? (6 - hour) / 2 : (hour >= 19 ? (hour - 19) / 2 : 0));

    return {
      hour, kind, sky, cel,
      ambient,
      shadow: { len: shadowLen, opacity: shadowOpacity, signX: hour < 12 ? 1 : -1 },
      windowGlow, lighthouseOn, lighthouseBeam,
      starDensity: Math.max(0, Math.min(1, starDensity)),
      cloudy: weatherMod.cloudy,
      fog:    weatherMod.fog,
      rain:   weatherMod.rain,
      snow:   weatherMod.snow,
      wind:   weatherMod.wind,
      lightning: weatherMod.lightning,
      PAL,
    };
  }

  window.Lighting = { light, codeToKind, PAL, mixHex, lerpHex, desat, darken };
})();
