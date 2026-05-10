// cinematography.js — tiny camera controller for the cinematic diorama.
// Exposes a state machine that rotates Wide → Mid → Close shots with eased
// transitions, plus a slow per-shot dolly so even held shots breathe.
//
// Coordinates are in logical-pixel space of the diorama canvas (320×180).
// Shots define a virtual camera at (cx, cy) with a zoom factor; the renderer
// applies offset = camera.cx - W/2 to layers (modulated by parallax depth).

(function () {
  const W = 320, H = 180;

  // Three shot definitions. Each gives center-of-interest + zoom.
  // Wide centers the cabin/cliff/sea horizon (lots of sky breathing).
  // Mid pushes left-and-down to frame the path/bench with cabin in BG.
  // Close drops further down-right onto the figure's silhouette.
  const SHOTS = {
    WIDE:  { cx: W * 0.50, cy: H * 0.45, zoom: 1.00, dolly: { x: 6, y: 1, period: 22 } },
    MID:   { cx: W * 0.42, cy: H * 0.62, zoom: 1.55, dolly: { x: 4, y: 0, period: 16 } },
    CLOSE: { cx: W * 0.58, cy: H * 0.70, zoom: 2.30, dolly: { x: 2, y: 1, period: 12 } },
  };

  // Day cycle is 90s. Within that, run 5 cuts so the eye doesn't get stuck.
  // Times are seconds-into-day-loop.
  const SCHEDULE = [
    { at:  0,  shot: 'WIDE'  },  // dawn establish
    { at: 18,  shot: 'MID'   },  // morning, figure on path
    { at: 36,  shot: 'CLOSE' },  // noon, intimate
    { at: 54,  shot: 'WIDE'  },  // afternoon re-establish
    { at: 70,  shot: 'MID'   },  // dusk, cabin glow visible
    { at: 84,  shot: 'CLOSE' },  // night close-up
  ];

  // Cubic ease-in-out — Disney-style, no linear cuts.
  const ease = (t) => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2);

  // Shots cross-fade over this many seconds (the brief: do not cut, crossfade).
  const TRANSITION_S = 2.4;

  function lerpShot(a, b, t) {
    return {
      cx:   a.cx   + (b.cx   - a.cx)   * t,
      cy:   a.cy   + (b.cy   - a.cy)   * t,
      zoom: a.zoom + (b.zoom - a.zoom) * t,
      dolly: a.dolly,  // dolly stays from outgoing shot for continuity
    };
  }

  // Given seconds-elapsed (0..90 wraps), return current camera transform.
  function camera(seconds) {
    const t = ((seconds % 90) + 90) % 90;

    // Find prev/next cut.
    let prev = SCHEDULE[0], next = SCHEDULE[0];
    for (let i = 0; i < SCHEDULE.length; i++) {
      if (SCHEDULE[i].at <= t) prev = SCHEDULE[i];
      else { next = SCHEDULE[i]; break; }
    }
    if (next === prev) next = SCHEDULE[0];  // wrap to dawn at end of cycle

    const tInPrev = t - prev.at;
    const a = SHOTS[prev.shot], b = SHOTS[next.shot];

    let blend;
    if (tInPrev < TRANSITION_S) {
      // Crossfading from previous-previous → prev. We don't track it; treat as held.
      blend = a;
    } else {
      // Held in `a` until close to `next.at`, then transition begins.
      const distToNext = (next.at < prev.at ? next.at + 90 : next.at) - t;
      if (distToNext < TRANSITION_S) {
        const u = ease(1 - distToNext / TRANSITION_S);
        blend = lerpShot(a, b, u);
      } else {
        blend = a;
      }
    }

    // Apply continuous dolly drift even on held shots (so the world breathes).
    const d = blend.dolly;
    const phase = (t / d.period) * Math.PI * 2;
    const cx = blend.cx + Math.sin(phase) * d.x;
    const cy = blend.cy + Math.cos(phase * 0.7) * d.y;

    return { cx, cy, zoom: blend.zoom, shot: prev.shot };
  }

  // Translate a point in scene coordinates by camera (pre-zoom).
  // Parallax depth ranges 0..1; 0 = farthest (no parallax), 1 = foreground (full).
  // Returns the screen-space point given camera + depth.
  function transform(cam, x, y, depth = 1) {
    const dx = (cam.cx - W / 2) * depth;
    const dy = (cam.cy - H / 2) * depth;
    const sx = (x - dx - W / 2) * cam.zoom + W / 2;
    const sy = (y - dy - H / 2) * cam.zoom + H / 2;
    return { x: sx, y: sy };
  }

  window.Cinema = { camera, transform, SHOTS, SCHEDULE, ease, W, H };
})();
