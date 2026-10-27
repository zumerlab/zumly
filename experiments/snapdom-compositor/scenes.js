// Heavy view generators for the compositor bench. Each view is VIEW_W × VIEW_H with a
// transparent background, so ancestors show through the gaps (the zoom "tunnel"), and one
// .zoom-me trigger near the centre that leads to the next level.

export const CANVAS_W = 1000
export const CANVAS_H = 700
export const VIEW_W = 640
export const VIEW_H = 440
const TRIGGER_W = 160
const TRIGGER_H = 110
const HUES = [210, 340, 140, 40, 270, 180, 10, 95]

function trigger (next, hue, label, outline) {
  if (!next) return ''
  const x = (VIEW_W - TRIGGER_W) / 2 + 40
  const y = (VIEW_H - TRIGGER_H) / 2 - 20
  return `<div class="zoom-me" data-to="${next}" style="position:absolute;left:${x}px;top:${y}px;width:${TRIGGER_W}px;height:${TRIGGER_H}px;
    border:3px solid hsl(${hue} 90% 60%);border-radius:14px;background:${outline ? 'transparent' : `hsl(${hue} 60% 20% / .85)`};color:#fff;
    font:700 18px/1 system-ui;display:grid;place-items:center">${label}</div>`
}

function frame (hue, level, body, next, live, outline, animated) {
  return `<div class="z-view" style="width:${VIEW_W}px;height:${VIEW_H}px;border:4px solid hsl(${hue} 80% 55%);border-radius:24px;box-sizing:border-box;overflow:hidden">
    <div style="position:absolute;left:14px;top:10px;font:800 22px system-ui;color:hsl(${hue} 90% 70%)">Level ${level}</div>
    ${live ? `<div class="live-clock" style="position:absolute;right:14px;top:12px;font:600 14px ui-monospace,monospace;color:#fff;background:#000;padding:2px 6px">00:00.0</div>` : ''}
    ${animated ? `<div class="live-spinner" style="position:absolute;right:24px;bottom:20px;width:36px;height:36px;box-sizing:border-box;border:4px solid hsl(${hue} 90% 65%);border-top-color:transparent;border-radius:50%;animation:spin 1.2s linear infinite"></div>` : ''}
    ${body}
    ${trigger(next, hue, `→ level ${level + 1}`, outline)}
  </div>`
}

/** Hundreds of styled cards: gradients, shadows, radii, text. */
function cards (hue, count) {
  const cols = 20
  const w = 26, h = 18, gap = 5
  let html = ''
  for (let i = 0; i < count; i++) {
    const x = 14 + (i % cols) * (w + gap)
    const y = 46 + Math.floor(i / cols) * (h + gap)
    if (y > VIEW_H - 24) break
    const hh = (hue + i * 7) % 360
    html += `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:5px;
      background:linear-gradient(135deg,hsl(${hh} 80% 60%),hsl(${(hh + 60) % 360} 70% 35%));
      box-shadow:0 2px 6px rgba(0,0,0,.45);font:600 7px system-ui;color:#fff;overflow:hidden"><span>#${i}</span><i style="display:block;height:2px;margin:2px;background:#fff8"></i></div>`
  }
  return html
}

/** Glass panels: backdrop-filter and filter blur, plus drop shadows. */
function blur (hue) {
  let html = cards(hue, 160)
  for (let i = 0; i < 24; i++) {
    const x = 20 + (i % 6) * 100
    const y = 60 + Math.floor(i / 6) * 90
    html += `<div style="position:absolute;left:${x}px;top:${y}px;width:84px;height:70px;border-radius:12px;
      background:hsl(${hue} 50% 90% / .18);backdrop-filter:blur(6px) saturate(1.4);-webkit-backdrop-filter:blur(6px);
      border:1px solid #fff4;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))">
      <div style="margin:8px;height:10px;border-radius:5px;background:#fff9;filter:blur(1px)"></div></div>`
  }
  return html
}

/** Orbit gauges with many o-arc segments; one ring spins (live, animated content). */
function orbit (hue, animated) {
  let html = ''
  const size = 120
  for (let g = 0; g < 8; g++) {
    const x = 20 + (g % 4) * 150
    const y = 50 + Math.floor(g / 4) * 200
    let arcs = ''
    for (let r = 2; r <= 5; r++) {
      arcs += `<div class="orbit-${r}"${animated && r === 5 && g === 0 ? ' style="animation:spin 4s linear infinite"' : ''}>`
      for (let a = 0; a < 6; a++) {
        const hh = (hue + g * 20 + r * 30 + a * 12) % 360
        arcs += `<o-arc value="${12 + a * 2}" style="--o-fill:hsl(${hh} 85% 58%);--o-stroke:#000a;--o-stroke-width:1"></o-arc>`
      }
      arcs += '</div>'
    }
    html += `<div class="bigbang" style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px">
      <div class="gravity-spot" style="--o-force:${size * 1.6}px">${arcs}
        <div class="orbit-0"><div class="satellite at-center"><div class="capsule" style="font:700 12px system-ui;color:#fff">${40 + g}%</div></div></div>
      </div></div>`
  }
  return html
}

export function buildViews ({ scene = 'cards', levels = 6, live = false, animated = false, outline = false } = {}) {
  const views = {}
  for (let i = 0; i < levels; i++) {
    const hue = HUES[i % HUES.length]
    const next = i < levels - 1 ? `l${i + 1}` : null
    const body = scene === 'blur' ? blur(hue) : scene === 'orbit' ? orbit(hue, animated) : cards(hue, 340)
    views[`l${i}`] = frame(hue, i, body, next, live, outline, animated)
  }
  return views
}
