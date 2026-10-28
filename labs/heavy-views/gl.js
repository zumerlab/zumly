// gl=1 (experiment 7, all in): zooms drawn with WebGL. One WebGL canvas sits in Zumly's canvas,
// under the views. While views move, each one is a texture in it and the views themselves are
// hidden (opacity 0, so they still answer hit-tests). At rest the views behind stay textures,
// with the engine's effects in the shader instead of a CSS filter, and only the current view is
// DOM. The effects are the engine's strings (transitions.effects), in CSS filter syntax; any
// function the shader knows works, CSS's or one of its own (see EFFECTS).
//
// Textures: a view behind comes from flatten's stream through streamTexture, which uploads only
// the rects each frame changed; the view coming in, or leaving a zoom-out, is a photo taken
// right before the motion (experiment 1). Without either, the view is photographed on the spot.
//
// The geometry is the engine's: the same matrices the anime and Motion drivers interpolate,
// applied around each view's transform-origin, from its layout position.

import { streamTexture } from '/node_modules/@zumer/snapdom-plugins/stream.js'
import {
  parseDurationMs, showViews, applyZoomInEndState, applyZoomOutPreviousState, applyZoomOutLastState,
  removeViewFromCanvas, interpolateMatrix, lerp, cssEasing,
} from '/src/drivers/driver-helpers.js'
import { readTransitionMatrix } from '/src/drivers/transform-matrix.js'

/** The engine's zoom-out fade into the trigger: the last third, linear (ZOOM_OUT_FADE in zumly.js). */
const FADE = 1 / 3
/**
 * The blur runs on the mip level where σ is at most this many texels, and never at full size:
 * same look, a fraction of the pixels. At full size a small σ, most of a zoom-out with the
 * engine's ease, cost the GPU 28 % of each frame.
 */
const BLUR_TEXELS = 2
const BLUR_MIN_LEVEL = 1
const OFF = 'z-gl-off'

const VERT = `#version 300 es
in vec2 corner;
uniform vec4 rect;   // the photo in the view's CSS px, from its border box
uniform vec2 origin; // transform-origin
uniform vec4 m;      // a, b, c, d
uniform vec2 move;   // e, f
uniform vec2 pos;    // layout position in the canvas
uniform vec2 size;   // the canvas, CSS px
uniform float yDir;  // -1 on screen; 1 into a texture, whose first row is its top
out vec2 uv;
void main () {
  vec2 p = rect.xy + corner * rect.zw - origin;
  vec2 s = pos + origin + vec2(m.x * p.x + m.z * p.y, m.y * p.x + m.w * p.y) + move;
  vec2 clip = s / size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y * yDir, 0.0, 1.0);
  uv = corner;
}`

// One pass of a separable Gaussian, into a texture the size of the mip level it reads.
const BLUR_VERT = `#version 300 es
in vec2 corner;
out vec2 uv;
void main () {
  uv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`

const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D tex;
uniform float lod;
uniform vec2 dir;    // one texel of the target, in uv, along the pass
uniform float sigma; // in texels of the target
in vec2 uv;
out vec4 color;
void main () {
  int radius = int(ceil(sigma * 3.0));
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -16; i <= 16; i++) {
    if (i < -radius || i > radius) continue;
    float w = exp(-float(i * i) / (2.0 * sigma * sigma));
    sum += textureLod(tex, uv + dir * float(i), lod) * w;
    total += w;
  }
  color = sum / total;
}`

/**
 * The effects the shader draws, by the name they take in an effect string. none: the value that
 * leaves a view as it is. blur is drawn apart, in passes of its own. The rest is GLSL run on
 * each pixel of a view, in this order, with v (the amount, on its way from none to its value),
 * photo (the view's photo, in CSS px), focus and focusSize (the trigger zoomed into: its center
 * and size, in st; without one, the middle of the view),
 * progress (how far the zoom that sends the view back has gone, 0 to 1; at rest, 1), time (s),
 * and tex and lod (the view's texture, already blurred):
 * - uv: may move st, the point of the photo read, from 0 to 1 across it;
 * - color: may change rgb and a, not premultiplied, and may read tex again around st.
 * These are CSS's filter functions, with CSS's formulas; createGL takes more.
 */
export const EFFECTS = {
  blur: { none: 0 },
  brightness: { none: 1, color: 'rgb *= v;' },
  contrast: { none: 1, color: 'rgb = (rgb - 0.5) * v + 0.5;' },
  saturate: { none: 1, color: 'rgb = mix(vec3(dot(rgb, LUMA)), rgb, v);' },
  grayscale: { none: 0, color: 'rgb = mix(rgb, vec3(dot(rgb, LUMA)), v);' },
  sepia: { none: 0, color: 'rgb = mix(rgb, mat3(0.393, 0.349, 0.272, 0.769, 0.686, 0.534, 0.189, 0.168, 0.131) * rgb, v);' },
  invert: { none: 0, color: 'rgb = mix(rgb, 1.0 - rgb, v);' },
  opacity: { none: 1, color: 'a *= v;' },
  'hue-rotate': {
    none: 0,
    color: `float k = cos(radians(v));
  float s = sin(radians(v));
  rgb = vec3(
    dot(vec3(0.213 + k * 0.787 - s * 0.213, 0.715 - k * 0.715 - s * 0.715, 0.072 - k * 0.072 + s * 0.928), rgb),
    dot(vec3(0.213 - k * 0.213 + s * 0.143, 0.715 + k * 0.285 + s * 0.140, 0.072 - k * 0.072 - s * 0.283), rgb),
    dot(vec3(0.213 - k * 0.213 - s * 0.787, 0.715 - k * 0.715 + s * 0.715, 0.072 + k * 0.928 + s * 0.072), rgb));`,
  },
}

const glslName = name => 'fx_' + name.replace(/[^a-zA-Z0-9]/g, '_')
const glslFloat = x => Number.isInteger(x) ? `${x}.0` : String(x)

/** The view's fragment shader, with every effect in it: one at its none costs a comparison. */
function fragment (effects) {
  const list = Object.entries(effects).filter(([name]) => name !== 'blur')
  const uvs = list.filter(([, e]) => e.uv)
  const colors = list.filter(([, e]) => e.color)
  const on = ([name, e]) => `${glslName(name)} != ${glslFloat(e.none)}`
  return `#version 300 es
precision highp float;
uniform sampler2D tex;
uniform float lod;
uniform float alpha;
uniform vec2 photo;
uniform vec2 focus;
uniform vec2 focusSize;
uniform float progress;
uniform float time;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
${list.map(([name]) => `uniform float ${glslName(name)};`).join('\n')}
${uvs.map(([name, e]) => `void ${glslName(name)}_uv (inout vec2 st, float v) {\n  ${e.uv}\n}`).join('\n')}
${colors.map(([name, e]) => `void ${glslName(name)}_color (inout vec3 rgb, inout float a, vec2 st, float v) {\n  ${e.color}\n}`).join('\n')}
in vec2 uv;
out vec4 color;
void main () {
  vec2 st = uv;
${uvs.map(fx => `  if (${on(fx)}) ${glslName(fx[0])}_uv(st, ${glslName(fx[0])});`).join('\n')}
  vec4 c = textureLod(tex, st, lod);
  float a = c.a;
  vec3 rgb = a > 0.0 ? c.rgb / a : vec3(0.0);
${colors.map(fx => `  if (${on(fx)}) { ${glslName(fx[0])}_color(rgb, a, st, ${glslName(fx[0])}); rgb = clamp(rgb, 0.0, 1.0); }`).join('\n')}
  a = clamp(a, 0.0, 1.0);
  color = vec4(rgb * a, a) * alpha;
}`
}

const NONE = {}
const UNITS = { '': 1, px: 1, '%': 0.01, deg: 1, turn: 360, rad: 180 / Math.PI }

/** An effect string as amounts by name: 'blur(3px) brightness(70%)' → { blur: 3, brightness: 0.7 }. */
export function parseEffect (value) {
  const fx = {}
  if (!value || value === 'none') return fx
  for (const [, name, number, unit = ''] of value.matchAll(/([a-z][\w-]*)\(\s*(-?[\d.]+)\s*(px|%|deg|turn|rad)?\s*\)/gi)) {
    fx[name.toLowerCase()] = +number * UNITS[unit.toLowerCase()]
  }
  return fx
}

const clamp01 = x => Math.max(0, Math.min(1, x))
const rootScale = view => {
  const m = new DOMMatrix(getComputedStyle(view).transform)
  return Math.hypot(m.a, m.b) || 1
}

function compile (gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

/**
 * @param {object} app - the Zumly instance
 * @param {{ photo: (view: HTMLElement, offscreen: boolean, options?: object) => Promise<{canvas: HTMLCanvasElement, ms: number}>, flattener: () => object|null, log: (msg: string) => void, effects?: Record<string, { none: number, uv?: string, color?: string }> }} deps
 *   effects: more effects for the shader, by name (see EFFECTS); one with the name of a CSS one replaces it
 */
export function createGL (app, { photo, flattener, log, effects: more = {} }) {
  const canvas = document.createElement('canvas')
  canvas.className = 'z-gl'
  canvas.setAttribute('aria-hidden', 'true')
  app.canvas.prepend(canvas)
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
  if (!gl) {
    canvas.remove()
    log('gl: no WebGL2, views stay DOM')
    return null
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  const link = (vert, frag, names) => {
    const program = gl.createProgram()
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vert))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag))
    gl.bindAttribLocation(program, 0, 'corner')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
    const uniforms = {}
    for (const name of names) uniforms[name] = gl.getUniformLocation(program, name)
    gl.useProgram(program)
    gl.uniform1i(uniforms.tex, 0)
    return { program, u: uniforms }
  }
  const base = ['rect', 'origin', 'm', 'move', 'pos', 'size', 'yDir', 'tex', 'lod', 'alpha', 'photo', 'focus', 'focusSize', 'progress', 'time']
  const linkView = fx => link(VERT, fragment(fx), [...base, ...Object.keys(fx).map(glslName)])
  let effects = { ...EFFECTS, ...more }
  let view
  try {
    view = linkView(effects)
  } catch (error) {
    // A slip in an effect's GLSL leaves CSS's effects, not a page without WebGL.
    log(`gl: effects left out (${error.message.trim()})`)
    effects = { ...EFFECTS }
    view = linkView(effects)
  }
  const fxList = Object.entries(effects).filter(([name]) => name !== 'blur')
  const unknown = new Set()
  /** An effect into the view's shader: each one at its amount, or at none. */
  const setEffect = (effect) => {
    for (const [name, e] of fxList) gl.uniform1f(view.u[glslName(name)], effect[name] ?? e.none)
    for (const name in effect) {
      if (effects[name] || unknown.has(name)) continue
      unknown.add(name)
      log(`gl: no effect "${name}"`)
    }
  }
  const mixEffect = (a, b, t) => {
    const out = {}
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const none = effects[name]?.none ?? 0
      out[name] = lerp(a[name] ?? none, b[name] ?? none, t)
    }
    return out
  }
  const blurPass = link(BLUR_VERT, BLUR_FRAG, ['tex', 'lod', 'dir', 'sigma'])
  const u = view.u
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.activeTexture(gl.TEXTURE0)

  /** view → { st }: the texture its stream keeps current. */
  const streams = new WeakMap()
  /** view → { texture, width, height, ratio, source }: a photo uploaded once. */
  const photos = new WeakMap()
  /** view behind → { texture, width, height, ratio, rect, box }: its texture with what its overflow hides. */
  const wide = new WeakMap()
  /** texture record → the two textures and framebuffers its blur passes draw into. */
  const targets = new WeakMap()
  let last = []
  let lost = false
  let dpr = devicePixelRatio || 1

  const resize = () => {
    dpr = devicePixelRatio || 1
    const width = Math.round(app.canvas.clientWidth * dpr)
    const height = Math.round(app.canvas.clientHeight * dpr)
    if (canvas.width === width && canvas.height === height) return
    canvas.width = width
    canvas.height = height
    draw(last)
  }
  new ResizeObserver(resize).observe(app.canvas)

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    lost = true
    log('gl: context lost, views back to DOM')
    release()
  })

  function mips (rec) {
    if (!rec.dirty) return
    gl.bindTexture(gl.TEXTURE_2D, rec.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.generateMipmap(gl.TEXTURE_2D)
    rec.dirty = false
  }

  function upload (source, ratio) {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    return { texture, width: source.width, height: source.height, ratio, source, dirty: true }
  }

  function dropTargets (rec) {
    const t = targets.get(rec)
    if (!t) return
    for (const pass of t.passes) {
      gl.deleteTexture(pass.texture)
      gl.deleteFramebuffer(pass.fbo)
    }
    targets.delete(rec)
  }

  function dropPhoto (view) {
    const rec = photos.get(view)
    if (rec) {
      gl.deleteTexture(rec.texture)
      dropTargets(rec)
    }
    photos.delete(view)
  }

  function dropWide (view) {
    const rec = wide.get(view)
    if (rec) {
      gl.deleteTexture(rec.texture)
      dropTargets(rec)
    }
    wide.delete(view)
  }

  function target (width, height) {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    return { texture, fbo }
  }

  /**
   * The texture blurred by σ texels, as CSS blur() does: a Gaussian in two passes, read from the
   * mip level where σ is a few texels, so a blur costs about the same at any radius.
   */
  function blurred (rec, sigma) {
    mips(rec)
    const level = Math.max(BLUR_MIN_LEVEL, Math.ceil(Math.log2(sigma / BLUR_TEXELS)))
    const width = Math.max(1, rec.width >> level)
    const height = Math.max(1, rec.height >> level)
    let t = targets.get(rec)
    if (!t || t.width !== width || t.height !== height) {
      dropTargets(rec)
      t = { width, height, passes: [target(width, height), target(width, height)] }
      targets.set(rec, t)
    }
    const [across, down] = t.passes
    gl.useProgram(blurPass.program)
    gl.disable(gl.BLEND)
    gl.viewport(0, 0, width, height)
    gl.uniform1f(blurPass.u.sigma, sigma / (1 << level))
    gl.bindFramebuffer(gl.FRAMEBUFFER, across.fbo)
    gl.bindTexture(gl.TEXTURE_2D, rec.texture)
    gl.uniform1f(blurPass.u.lod, level)
    gl.uniform2f(blurPass.u.dir, 1 / width, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, down.fbo)
    gl.bindTexture(gl.TEXTURE_2D, across.texture)
    gl.uniform1f(blurPass.u.lod, 0)
    gl.uniform2f(blurPass.u.dir, 0, 1 / height)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.enable(gl.BLEND)
    return down.texture
  }

  /**
   * The texture of a view behind, while flatten has a photo of it: its stream's, or the photo
   * uploaded once. flatten drops a view's photo on each visit and sets it when the stream is
   * ready, so a photo means the stream texture holds this visit's last frame, the one flatten
   * copied. Without one (a zoom before the stream was ready, a view flatten keeps live), the
   * photo the zoom took of it when it went behind; a view in front drops that one. With what
   * its overflow hides, when the zoom that sent it behind took that too.
   */
  function behind (view) {
    const w = wide.get(view)
    if (w && w.box[0] === view.offsetWidth && w.box[1] === view.offsetHeight) return w
    dropWide(view)
    const photo = flattener()?.photos.get(view)
    if (!photo) return photos.get(view) || null
    const s = streams.get(view)
    if (s?.rec.width) return s.rec
    let rec = photos.get(view)
    if (!rec || rec.source !== photo.canvas) {
      dropPhoto(view)
      rec = upload(photo.canvas, photo.ratio)
      photos.set(view, rec)
    }
    return rec
  }

  async function snapshot (view, offscreen) {
    const ratio = dpr * (offscreen ? 1 : rootScale(view))
    const { canvas: shot, ms } = await photo(view, offscreen)
    dropPhoto(view)
    const rec = upload(shot, ratio)
    photos.set(view, rec)
    return { rec, ms }
  }

  /** Where a texture goes on its view: x, y, width and height in CSS px from its border box. */
  function rectOf (rec, box) {
    if (rec.rect) return rec.rect
    // A photo has a margin around the border box, the same on every side.
    const w = rec.width / rec.ratio
    const h = rec.height / rec.ratio
    return [-(w - box[0]) / 2, -(h - box[1]) / 2, w, h]
  }

  /**
   * The content a view's overflow hides, in bands around what it shows, up to a canvas away (a
   * zoom never shows more). Only bands outside the canvas while the view is in front, so nothing
   * appears or goes when a zoom starts or ends; and only for a view that scrolls, or that asks
   * for it with data-gl-overflow, since overflow: hidden may be hiding something on purpose.
   * front: where the view's border box sits in the canvas when it is in front.
   * Each band: x, y, w, h in the view's content (as scrolled), bx, by from its border box.
   */
  function bandsOf (el, front) {
    const style = getComputedStyle(el)
    if (!/auto|scroll/.test(style.overflowX + style.overflowY) && !('glOverflow' in el.dataset)) return []
    const { scrollLeft: sl, scrollTop: st, scrollWidth: sw, scrollHeight: sh, clientWidth: cw, clientHeight: ch } = el
    if (sw <= cw + 1 && sh <= ch + 1) return []
    const width = app.canvas.clientWidth
    const height = app.canvas.clientHeight
    const x0 = Math.max(0, sl - width)
    const x1 = Math.min(sw, sl + cw + width)
    const y0 = Math.max(0, st - height)
    const y1 = Math.min(sh, st + ch + height)
    return [
      { x: x0, y: y0, w: x1 - x0, h: st - y0 },
      { x: x0, y: st + ch, w: x1 - x0, h: y1 - st - ch },
      { x: x0, y: st, w: sl - x0, h: ch },
      { x: sl + cw, y: st, w: x1 - sl - cw, h: ch },
    ].filter(b => b.w >= 1 && b.h >= 1).map(b => ({ ...b, bx: el.clientLeft - sl + b.x, by: el.clientTop - st + b.y })).filter(b => {
      const left = front[0] + b.bx
      const top = front[1] + b.by
      return left >= width - 1 || left + b.w <= 1 || top >= height - 1 || top + b.h <= 1
    })
  }

  /**
   * Photos of the bands. SnapDOM draws a view inside its box, so the view grows to its whole
   * content for a moment, and its real content comes back if flatten had hidden it. In front,
   * it stays where it is, moved back by its scroll: it shows the same, its real content under
   * flatten's photo. Behind (offscreen), it is hidden and WebGL draws it: it goes out of sight,
   * at its own size, and shows itself there to SnapDOM.
   */
  async function bandShots (el, bands, glass, offscreen) {
    const { scrollLeft: sl, scrollTop: st } = el
    const props = ['width', 'height', 'box-sizing', 'overflow', 'transform', 'opacity']
    const kept = props.map(p => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)])
    const transform = getComputedStyle(el).transform
    const flat = el.classList.contains('z-flat')
    const width = el.scrollWidth + el.offsetWidth - el.clientWidth
    const height = el.scrollHeight + el.offsetHeight - el.clientHeight
    const set = (p, v) => el.style.setProperty(p, v, 'important')
    set('width', `${width}px`)
    set('height', `${height}px`)
    set('box-sizing', 'border-box')
    set('overflow', 'visible')
    if (offscreen) {
      set('transform', 'translate(-200vw, 0)')
      set('opacity', '1')
    } else {
      set('transform', `translate(${-sl}px, ${-st}px)${transform === 'none' ? '' : ` ${transform}`}`)
    }
    el.classList.remove('z-flat')
    try {
      const box = el.getBoundingClientRect()
      const shots = []
      for (const band of bands) {
        const clip = { x: box.left + scrollX + el.clientLeft + band.x, y: box.top + scrollY + el.clientTop + band.y, width: band.w, height: band.h }
        const { canvas: shot } = await photo(el, false, { clip, glass, wait: false, exclude: ['.z-flat-layer'], excludeMode: 'remove' })
        shots.push({ band, shot })
      }
      return shots
    } finally {
      for (const [p, v, priority] of kept) v ? el.style.setProperty(p, v, priority) : el.style.removeProperty(p)
      if (flat) el.classList.add('z-flat')
      el.scrollLeft = sl
      el.scrollTop = st
    }
  }

  /**
   * One texture with a view and the bands around it, drawn in the GPU: the bands first, then the
   * view over them, whose margin is clear. Blurred as one, there is no seam where they meet.
   */
  function composite (base, box, parts) {
    const rects = [rectOf(base, box), ...parts.map(p => p.rect)]
    const x0 = Math.min(...rects.map(r => r[0]))
    const y0 = Math.min(...rects.map(r => r[1]))
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    const span = [Math.max(...rects.map(r => r[0] + r[2])) - x0, Math.max(...rects.map(r => r[1] + r[3])) - y0]
    const ratio = Math.min(base.ratio, max / span[0], max / span[1])
    const width = Math.ceil(span[0] * ratio)
    const height = Math.ceil(span[1] * ratio)
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(width, height))) + 1, gl.RGBA8, width, height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(view.program)
    gl.uniform2f(u.size, width / ratio, height / ratio)
    gl.uniform1f(u.yDir, 1)
    gl.uniform2f(u.pos, -x0, -y0)
    gl.uniform2f(u.origin, 0, 0)
    gl.uniform4f(u.m, 1, 0, 0, 1)
    gl.uniform2f(u.move, 0, 0)
    setEffect(NONE)
    gl.uniform1f(u.progress, 1)
    gl.uniform1f(u.alpha, 1)
    gl.uniform1f(u.lod, 0)
    for (const { rec, rect } of [...parts, { rec: base, rect: rects[0] }]) {
      gl.bindTexture(gl.TEXTURE_2D, rec.texture)
      gl.uniform4f(u.rect, ...rect)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fbo)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.generateMipmap(gl.TEXTURE_2D)
    return { texture, width, height, ratio, rect: [x0, y0, width / ratio, height / ratio], box: [...box], dirty: false }
  }

  /**
   * Whether a band comes into the canvas on the way to k (around origin). The way there scales
   * and moves the view steadily, so whatever a point of the view does, it does by the end: a
   * band outside the canvas at both ends stays out all the way.
   */
  function reaches (el, band, origin, k) {
    const [ox, oy] = origin.split(' ').map(parseFloat)
    const xs = []
    const ys = []
    for (const [x, y] of [[band.bx, band.by], [band.bx + band.w, band.by], [band.bx, band.by + band.h], [band.bx + band.w, band.by + band.h]]) {
      xs.push(el.offsetLeft + ox + k.a * (x - ox) + k.c * (y - oy) + k.e)
      ys.push(el.offsetTop + oy + k.b * (x - ox) + k.d * (y - oy) + k.f)
    }
    return Math.max(...xs) > 0 && Math.min(...xs) < app.canvas.clientWidth && Math.max(...ys) > 0 && Math.min(...ys) < app.canvas.clientHeight
  }

  /**
   * The view's texture (base) widened with what its overflow hides, or null when a move to k
   * (around origin) shows nothing it lacks. glass: whether the bands keep their glass, as the
   * view's texture does. offscreen: the view is behind, hidden (see bandShots).
   */
  async function widen (el, base, glass, origin, k, offscreen = false) {
    const box = [el.offsetWidth, el.offsetHeight]
    // In front, where it is; behind, where it was in front, as a view that fills the canvas is.
    let front = [el.offsetLeft, el.offsetTop]
    if (!offscreen) {
      const r = el.getBoundingClientRect()
      const area = app.canvas.getBoundingClientRect()
      front = [r.left - area.left, r.top - area.top]
    }
    const [rx, ry, rw, rh] = rectOf(base, box)
    const has = b => b.bx >= rx && b.by >= ry && b.bx + b.w <= rx + rw && b.by + b.h <= ry + rh
    const bands = bandsOf(el, front).filter(b => !has(b) && reaches(el, b, origin, k))
    if (!bands.length) return null
    const t = performance.now()
    const ratio = dpr * (offscreen ? 1 : rootScale(el))
    const shots = await bandShots(el, bands, glass, offscreen)
    const parts = shots.map(({ band, shot }) => {
      const rec = upload(shot, ratio)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      // SnapDOM's margin, as around a view: the same on every side.
      const w = shot.width / ratio
      const h = shot.height / ratio
      return { rec, rect: [band.bx - (w - band.w) / 2, band.by - (h - band.h) / 2, w, h] }
    })
    mips(base)
    const rec = composite(base, box, parts)
    for (const { rec: part } of parts) gl.deleteTexture(part.texture)
    return { rec, ms: Math.round(performance.now() - t) }
  }

  /** view → its trigger's center and size, in CSS px from its border box (see focusOf). */
  const focuses = new WeakMap()

  /**
   * Where the trigger zoomed into sits in a view, kept for later: the engine unmarks it before a
   * zoom-out moves. Read while the view only scales and moves.
   */
  function focusOf (view) {
    const trigger = view.querySelector('.zoom-me.zoomed')
    if (trigger) {
      const v = view.getBoundingClientRect()
      const t = trigger.getBoundingClientRect()
      const scale = rootScale(view)
      focuses.set(view, [(t.left + t.width / 2 - v.left) / scale, (t.top + t.height / 2 - v.top) / scale, t.width / scale, t.height / scale])
    }
    return focuses.get(view)
  }

  /** A layer to draw: a view with its texture, matrix around its origin, effect and how far its zoom has gone. */
  function layer (view, rec, matrix, origin, effect, alpha = 1, progress = 1) {
    const box = [view.offsetWidth, view.offsetHeight]
    const focus = focuses.get(view) || [box[0] / 2, box[1] / 2, 0, 0]
    return { view, rec, matrix, origin, pos: [view.offsetLeft, view.offsetTop], box, effect, alpha, progress, focus }
  }

  function draw (layers) {
    last = layers
    if (lost) return
    // Blurs first: they draw into their own framebuffers. CSS blurs a view in its own pixels,
    // before its transform, so σ is in texels of the photo.
    const textures = layers.map(({ rec, effect, alpha }) => {
      const sigma = (effect.blur || 0) * rec.ratio
      if (alpha <= 0 || sigma < 0.5) return null
      return blurred(rec, sigma)
    })
    gl.useProgram(view.program)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(u.size, canvas.width / dpr, canvas.height / dpr)
    gl.uniform1f(u.yDir, -1)
    gl.uniform1f(u.time, performance.now() / 1000)
    layers.forEach(({ rec, matrix: k, origin, pos, box, effect, alpha, progress, focus }, i) => {
      if (alpha <= 0) return
      const rect = rectOf(rec, box)
      gl.uniform4f(u.rect, ...rect)
      gl.uniform2f(u.photo, rect[2], rect[3])
      gl.uniform2f(u.focus, (focus[0] - rect[0]) / rect[2], (focus[1] - rect[1]) / rect[3])
      gl.uniform2f(u.focusSize, focus[2] / rect[2], focus[3] / rect[3])
      gl.uniform1f(u.progress, progress)
      gl.uniform2f(u.origin, origin[0], origin[1])
      gl.uniform4f(u.m, k.a, k.b, k.c, k.d)
      gl.uniform2f(u.move, k.e, k.f)
      gl.uniform2f(u.pos, pos[0], pos[1])
      setEffect(effect)
      gl.uniform1f(u.alpha, alpha)
      if (textures[i]) {
        gl.bindTexture(gl.TEXTURE_2D, textures[i])
        gl.uniform1f(u.lod, 0)
      } else {
        // Sharp: the mip level the screen scale needs, so a view that shrinks does not shimmer.
        mips(rec)
        gl.bindTexture(gl.TEXTURE_2D, rec.texture)
        gl.uniform1f(u.lod, Math.max(0, Math.log2(rec.ratio / ((Math.hypot(k.a, k.b) || 1) * dpr))))
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    })
  }

  const views = () => [...app.canvas.children].filter(v => v.classList.contains('z-view'))
  const restEffect = view => view.classList.contains('has-effect') ? parseEffect(view.style.getPropertyValue('--z-effect-filter')) : NONE

  /**
   * A view back to DOM with its effect where WebGL left it. Hidden, it had no filter, so the
   * engine's filter transition would start over from none.
   */
  function show (view) {
    if (!view.classList.contains(OFF)) return
    const transition = view.style.transition
    view.style.transition = 'none'
    view.classList.remove(OFF)
    getComputedStyle(view).filter // eslint-disable-line no-unused-expressions
    view.style.transition = transition
  }

  /** Every view back to DOM, nothing drawn: for a transition WebGL does not draw. */
  function release () {
    for (const view of views()) show(view)
    draw([])
  }

  /** At rest: the views behind are textures with their effects, the current view is DOM. */
  function sync () {
    if (lost) return release()
    const layers = []
    for (const view of views()) {
      const current = view.classList.contains('is-current-view')
      if (current) {
        dropPhoto(view)
        dropWide(view)
      }
      // Only the views behind: a sibling keepAlive hid is not drawn either.
      const back = view.classList.contains('is-previous-view') || view.classList.contains('is-last-view')
      const rec = back ? behind(view) : null
      if (!rec) {
        show(view)
        continue
      }
      view.classList.add(OFF)
      const style = getComputedStyle(view)
      const m = new DOMMatrix(style.transform)
      const origin = style.transformOrigin.split(' ').map(parseFloat)
      layers.push(layer(view, rec, m, origin, restEffect(view)))
    }
    draw(layers)
  }

  /**
   * The textures a zoom needs, before it moves: the view coming in (or leaving) photographed
   * now, the views behind from their streams. Resolves to null when WebGL cannot draw it.
   */
  async function prepare (spec) {
    if (lost) return null
    if (spec.type === 'lateral') return prepareLateral(spec)
    const { type, currentView, previousView, lastView } = spec
    const recs = new Map()
    const info = { photoMs: 0 }
    const { rec, ms } = await snapshot(currentView, type === 'zoomIn')
    recs.set(currentView, rec)
    info.photoMs = ms
    for (const view of [previousView, lastView]) {
      if (!view) continue
      let r = behind(view)
      // flatten's photo keeps the view's glass; the zoom's own photo, the demo's choice.
      const glass = flattener()?.photos.has(view) || undefined
      if (!r) {
        const shot = await snapshot(view, false)
        r = shot.rec
        info.shot = (info.shot || 0) + shot.ms
      }
      // The view going behind grows: what its overflow hides comes into sight.
      if (type === 'zoomIn' && view === previousView) {
        const { backwardState: from, forwardState: to } = spec.currentStage.views[1]
        const wider = await widen(view, r, glass, from.origin, new DOMMatrix(to.transform)).catch(error => log(`gl: no overflow (${error.message})`))
        if (wider) {
          wide.set(view, wider.rec)
          r = wider.rec
          info.overflowMs = wider.ms
        }
      }
      recs.set(view, r)
    }
    // Mip levels now, while the trigger looks pressed, rather than in the first frame.
    for (const rec of recs.values()) mips(rec)
    return { recs, info }
  }

  /**
   * A move to a sibling: the sibling coming in photographed out of sight, the view leaving from
   * its stream (or photographed where it is), the views behind as they are drawn. With keepAlive
   * 'visible' the view leaving stays where it is, in the DOM, over everything WebGL draws: the
   * real driver runs it.
   */
  async function prepareLateral (spec) {
    const { currentView: incoming, previousView: outgoing, backView, lastView } = spec
    if (spec.keepAlive === 'visible') return null
    const recs = new Map()
    const info = { photoMs: 0 }
    for (const view of [backView, lastView]) {
      if (!view) continue
      const r = behind(view)
      if (!r) return null
      recs.set(view, r)
    }
    const { rec, ms } = await snapshot(incoming, true)
    recs.set(incoming, rec)
    info.photoMs = ms
    let r = behind(outgoing)
    if (!r) {
      const shot = await snapshot(outgoing, false)
      r = shot.rec
      info.shot = shot.ms
    }
    recs.set(outgoing, r)
    // The move can take the view behind somewhere its zoom-in did not show: what its overflow
    // hides there is photographed now.
    if (backView && spec.backViewState) {
      const old = wide.get(backView)
      const glass = flattener()?.photos.has(backView) || undefined
      const origin = getComputedStyle(backView).transformOrigin
      const wider = await widen(backView, recs.get(backView), glass, origin, new DOMMatrix(spec.backViewState.transformEnd), true)
        .catch(error => log(`gl: no overflow (${error.message})`))
      if (wider) {
        wide.set(backView, wider.rec)
        recs.set(backView, wider.rec)
        info.overflowMs = wider.ms
        if (old) {
          gl.deleteTexture(old.texture)
          dropTargets(old)
        }
      }
    }
    for (const rec of recs.values()) mips(rec)
    return { recs, info }
  }

  /**
   * Draw at(elapsed) every frame for total ms, then end() and hand over to the DOM and the
   * engine (done), even if end() fails. A hidden tab, without frames, still ends.
   */
  function play (total, at, end, done) {
    let raf = 0
    let start = null
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(raf)
      clearTimeout(deadline)
      try {
        end()
      } catch (error) {
        log(`gl: ${error.message}`)
      }
      delete app.canvas.dataset.zGlMoving
      done()
      // flatten settles a microtask after the engine completes: read the roles a frame later.
      requestAnimationFrame(sync)
    }
    const deadline = setTimeout(finish, total + 1000)
    const tick = (now) => {
      if (start === null) start = now
      const elapsed = now - start
      if (elapsed >= total) return finish()
      draw(at(elapsed))
      raf = requestAnimationFrame(tick)
    }
    draw(at(0))
    raf = requestAnimationFrame(tick)
  }

  /**
   * Draw a move to a sibling, as the drivers do: the sibling comes in and fades in, the view
   * leaving goes and fades out, the views behind shift with their effects as they are.
   */
  function runLateral (spec, prepared, done) {
    const { currentView: incoming, previousView: outgoing, backView, backViewState, lastView, lastViewState, currentStage } = spec
    const v0 = currentStage.views[0]
    const incomingEnd = spec.incomingTransformEnd || v0.forwardState.transform
    const moves = [
      { view: incoming, origin: v0.forwardState.origin, from: spec.incomingTransformStart, to: incomingEnd, fade: [0, 1] },
      { view: outgoing, origin: outgoing.style.transformOrigin, from: spec.outgoingTransform, to: spec.outgoingTransformEnd, fade: [1, 0] },
    ]
    if (backView && backViewState) moves.push({ view: backView, origin: backView.style.transformOrigin, from: backViewState.transformStart, to: backViewState.transformEnd })
    if (lastView && lastViewState) moves.push({ view: lastView, origin: lastView.style.transformOrigin, from: lastViewState.transformStart, to: lastViewState.transformEnd })
    for (const { view } of moves) view.classList.add(OFF)
    app.canvas.dataset.zGlMoving = 'lateral'
    // The engine hands the sibling over hidden and still new, as to every driver.
    showViews(incoming)
    incoming.classList.replace('is-new-current-view', 'is-current-view')
    incoming.classList.remove('zoom-current-view', 'has-no-events')
    const order = views()
    for (const { view } of moves) focusOf(view)
    const layers = moves.map(({ view, origin, from, to, fade }) => ({
      view,
      fade,
      from: readTransitionMatrix(view, origin, from),
      to: readTransitionMatrix(view, origin, to),
      origin: getComputedStyle(view).transformOrigin.split(' ').map(parseFloat),
      effect: fade ? NONE : restEffect(view),
      rec: prepared.recs.get(view),
      z: order.indexOf(view),
    })).sort((a, b) => a.z - b.z)
    const ms = parseDurationMs(spec.duration)
    const curve = cssEasing(spec.ease) || (t => t)
    const at = (elapsed) => {
      const t = curve(clamp01(elapsed / ms))
      return layers.map(l => layer(l.view, l.rec, interpolateMatrix(l.from, l.to, t), l.origin, l.effect, l.fade ? lerp(l.fade[0], l.fade[1], t) : 1))
    }
    play(ms, at, () => {
      // The views behind stay drawn where they end; the sibling is DOM from now on.
      draw(at(ms).filter(l => l.view !== incoming && l.view !== outgoing))
      incoming.style.transform = incomingEnd
      incoming.style.removeProperty('opacity')
      if (backView && backViewState) backView.style.transform = backViewState.transformEnd
      if (lastView && lastViewState) lastView.style.transform = lastViewState.transformEnd
      // keepAlive keeps the view leaving, and the engine hides it (display: none).
      if (spec.keepAlive) {
        outgoing.style.opacity = ''
        outgoing.style.transform = spec.outgoingTransformEnd
      } else {
        removeViewFromCanvas(outgoing, spec.canvas)
      }
      show(incoming)
      show(outgoing)
      dropPhoto(incoming)
      dropPhoto(outgoing)
    }, done)
  }

  /** Draw a zoom-in, a zoom-out or a move to a sibling with the prepared textures; done() once it ends. */
  function run (spec, prepared, done) {
    if (spec.type === 'lateral') return runLateral(spec, prepared, done)
    const { type, currentView, previousView, lastView, currentStage, canvas: zCanvas } = spec
    const forward = type === 'zoomIn'
    const [v0, v1, v2] = currentStage.views
    const engineEffect = view => parseEffect(view.style.getPropertyValue('--z-effect-filter'))
    const entries = [{ view: currentView, state: v0, role: 0 }, { view: previousView, state: v1, role: 1 }]
    if (lastView && v2) entries.push({ view: lastView, state: v2, role: 2 })
    // Hidden first, so nothing below reads a style with the engine's filter transition in it.
    for (const { view } of entries) view.classList.add(OFF)
    app.canvas.dataset.zGlMoving = type
    // WebGL draws the engine's fade of a zoom-out into its trigger: the engine's own, on a view
    // that is hidden anyway, goes.
    if (!forward) {
      for (const animation of currentView.getAnimations()) {
        if (!(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)) animation.cancel()
      }
    }
    const order = views()
    for (const { view } of entries) focusOf(view)
    const layers = entries.map(({ view, state, role }) => {
      const { backwardState: back, forwardState: front } = state
      const originStr = forward ? back.origin : front.origin
      const from = readTransitionMatrix(view, originStr, forward ? back.transform : front.transform)
      const to = readTransitionMatrix(view, originStr, forward ? front.transform : back.transform)
      const origin = getComputedStyle(view).transformOrigin.split(' ').map(parseFloat)
      // Effects: zoom-in, none → previous effect → last effect; zoom-out, the other way.
      let fx = [NONE, NONE]
      if (forward && role === 1) fx = [NONE, engineEffect(view)]
      if (forward && role === 2) fx = [restEffect(view), engineEffect(view)]
      if (!forward && role === 1) fx = [engineEffect(view), NONE]
      if (!forward && role === 2) fx = [restEffect(view), engineEffect(view)]
      return { view, role, from, to, origin, fx, rec: prepared.recs.get(view), z: order.indexOf(view) }
    }).sort((a, b) => a.z - b.z)

    const ms = parseDurationMs(spec.duration)
    const stagger = currentStage.stagger || 0
    const curve = cssEasing(spec.ease) || (t => t)
    const total = ms + stagger * (layers.length - 1)
    const at = (elapsed) => {
      const fxT = curve(clamp01(elapsed / ms))
      return layers.map(l => {
        const t = curve(clamp01((elapsed - l.role * stagger) / ms))
        const alpha = !forward && l.role === 0 ? clamp01((1 - clamp01(elapsed / ms)) / FADE) : 1
        return layer(l.view, l.rec, interpolateMatrix(l.from, l.to, t), l.origin, mixEffect(l.fx[0], l.fx[1], fxT), alpha, forward ? fxT : 1 - fxT)
      })
    }
    play(total, at, () => {
      if (forward) {
        // The views behind stay drawn where they end; the one in front is DOM from now on.
        draw(at(total).filter(l => l.view !== currentView))
        showViews(currentView, previousView, lastView)
        for (const { view } of entries) applyZoomInEndState(view, currentStage)
        show(currentView)
        dropPhoto(currentView)
      } else {
        // The view coming back stays drawn until sync() hands it to the DOM, after flatten
        // has put the real one back.
        draw(at(total))
        dropPhoto(currentView)
        removeViewFromCanvas(currentView, zCanvas)
        applyZoomOutPreviousState(previousView, v1.backwardState)
        if (lastView && v2) applyZoomOutLastState(lastView, v2.backwardState)
      }
    }, done)
  }

  /** Feed a stream frame of a view into its texture (from the demo's stream wrapper). */
  function feed (view, frame, options) {
    if (lost) return
    let s = streams.get(view)
    if (!s) {
      const st = streamTexture(gl)
      const rec = { get texture () { return st.texture }, get width () { return st.width }, get height () { return st.height }, ratio: 1, dirty: true }
      s = { st, rec }
      streams.set(view, s)
    }
    // The stream reads the view at scale × dpr, with the view's own scale undone.
    if (frame.reason === 'start') s.rec.ratio = (options.scale ?? 1) * (options.dpr ?? dpr) * rootScale(view)
    s.st.update(frame)
    s.rec.dirty = true
  }

  return { canvas, gl, feed, prepare, run, sync, release, get lost () { return lost }, get layers () { return last } }
}
