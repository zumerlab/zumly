/**
 * WebGL renderer (option `webgl`). One WebGL canvas sits in Zumly's canvas, under the views.
 * While views move, each one is a texture in it and the views themselves are hidden (opacity 0,
 * so they still answer hit-tests). At rest the views behind stay textures, with the engine's
 * effects in the shader instead of a CSS filter, and only the current view is DOM. The effects
 * are the engine's strings (transitions.effects), in CSS filter syntax; any function the shader
 * knows works, CSS's or one of its own (see EFFECTS).
 *
 * Textures: a view behind comes from flatten's stream, uploading only the rects each frame
 * changed; the view coming in, or leaving, is a SnapDOM photo taken right before the motion
 * (the trigger looks pressed meanwhile). Without either, the view is photographed on the spot.
 * The geometry is the engine's: the same matrices the anime and Motion drivers interpolate,
 * applied around each view's transform-origin, from its layout position.
 *
 * Measured in labs/heavy-views (REPORT.md, experiment 7): the GPU of a zoom goes from ~40 % to
 * 5.5-8 %, and from ~65 % to 6.5-8 % with live data, for a photo of ~45 ms before it moves.
 */

import {
  parseDurationMs, showViews, applyZoomInEndState, applyZoomOutPreviousState, applyZoomOutLastState,
  removeViewFromCanvas, interpolateMatrix, lerp, cssEasing
} from './drivers/driver-helpers.js'
import { readTransitionMatrix } from './drivers/transform-matrix.js'
import { disposeView } from './view-lifecycle.js'

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
 * An effect can take up to four numbers, a #hex color counting as three (r, g, b, 0 to 1):
 * 'tint(#ff0066 .5)'. v is the first, vs all four. none is a number or a list of them.
 * animate: true keeps redrawing while the effect is on a view at rest, for one that changes
 * with time (it costs a draw each frame).
 * These are CSS's filter functions, with CSS's formulas; createWebGL takes more.
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
    dot(vec3(0.213 - k * 0.213 - s * 0.787, 0.715 - k * 0.715 + s * 0.715, 0.072 + k * 0.928 + s * 0.072), rgb));`
  }
}

const glslName = name => 'fx_' + name.replace(/[^a-zA-Z0-9]/g, '_')
const glslFloat = x => Number.isInteger(x) ? `${x}.0` : String(x)
/** An effect's value as four numbers: the rest are 0. */
const four = value => {
  const list = Array.isArray(value) ? value : [value]
  return [0, 1, 2, 3].map(i => list[i] ?? 0)
}

/** The view's fragment shader, with every effect in it: one at its none costs a comparison. */
function fragment (effects) {
  const list = Object.entries(effects).filter(([name]) => name !== 'blur')
  const uvs = list.filter(([, e]) => e.uv)
  const colors = list.filter(([, e]) => e.color)
  const on = ([name, e]) => `${glslName(name)} != vec4(${four(e.none).map(glslFloat).join(', ')})`
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
${list.map(([name]) => `uniform vec4 ${glslName(name)};`).join('\n')}
${uvs.map(([name, e]) => `void ${glslName(name)}_uv (inout vec2 st, float v, vec4 vs) {\n  ${e.uv}\n}`).join('\n')}
${colors.map(([name, e]) => `void ${glslName(name)}_color (inout vec3 rgb, inout float a, vec2 st, float v, vec4 vs) {\n  ${e.color}\n}`).join('\n')}
in vec2 uv;
out vec4 color;
void main () {
  vec2 st = uv;
${uvs.map(fx => `  if (${on(fx)}) ${glslName(fx[0])}_uv(st, ${glslName(fx[0])}.x, ${glslName(fx[0])});`).join('\n')}
  vec4 c = textureLod(tex, st, lod);
  float a = c.a;
  vec3 rgb = a > 0.0 ? c.rgb / a : vec3(0.0);
${colors.map(fx => `  if (${on(fx)}) { ${glslName(fx[0])}_color(rgb, a, st, ${glslName(fx[0])}.x, ${glslName(fx[0])}); rgb = clamp(rgb, 0.0, 1.0); }`).join('\n')}
  a = clamp(a, 0.0, 1.0);
  color = vec4(rgb * a, a) * alpha;
}`
}

const NONE = {}
const UNITS = { '': 1, px: 1, deg: 1, turn: 360, rad: 180 / Math.PI }

/** One argument of an effect as numbers: a length, angle or percentage, or a #hex color (r, g, b). */
function amounts (arg) {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(arg)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1]
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
  }
  const n = /^(-?[\d.]+)(px|%|deg|turn|rad)?$/i.exec(arg)
  if (!n) return []
  const unit = (n[2] || '').toLowerCase()
  return [unit === '%' ? n[1] / 100 : n[1] * UNITS[unit]]
}

/**
 * An effect string as amounts by name: 'blur(3px) brightness(70%) tint(#f06 .5)' →
 * { blur: 3, brightness: 0.7, tint: [1, 0, 0.4, 0.5] }. One number stays a number.
 */
export function parseEffect (value) {
  const fx = {}
  if (!value || value === 'none') return fx
  for (const [, name, args] of value.matchAll(/([a-z][\w-]*)\(([^()]*)\)/gi)) {
    const list = args.trim().split(/[\s,]+/).flatMap(amounts)
    if (list.length) fx[name.toLowerCase()] = list.length === 1 ? list[0] : list.slice(0, 4)
  }
  return fx
}

const clamp01 = x => Math.max(0, Math.min(1, x))
const rootScale = view => {
  const m = new DOMMatrix(getComputedStyle(view).transform)
  return Math.hypot(m.a, m.b) || 1
}

/**
 * A texture fed by a SnapDOM stream: uploads only the rects a frame changed. WebGL2 reads a
 * sub-rectangle of a canvas through the unpack parameters, so a patch costs its own pixels.
 * (The same as streamTexture in @zumer/snapdom-plugins/stream, without depending on it.)
 */
function streamTexture (gl) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const state = { texture, width: 0, height: 0, update }
  function update (frame) {
    const c = frame.canvas
    gl.bindTexture(gl.TEXTURE_2D, texture)
    if (frame.full || c.width !== state.width || c.height !== state.height) {
      state.width = c.width
      state.height = c.height
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
      return
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, c.width)
    for (const r of frame.rects) {
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, r.x)
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, r.y)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, r.width, r.height, gl.RGBA, gl.UNSIGNED_BYTE, c)
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0)
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0)
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0)
  }
  return state
}

/** SnapDOM options for a photo: a root scale is kept (outerTransforms: false), outlines left out. */
const PHOTO = { outerTransforms: false, outerShadows: false, fast: true, excludeStyleProps: prop => prop.startsWith('outline') }
/** While the photo of the view coming in is taken, the trigger looks pressed; past RING_AFTER_MS a ring turns over it, shown at least RING_MIN_MS. */
const RING_AFTER_MS = 300
const RING_MIN_MS = 400
const afterFrame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
/* global CSSAnimation, CSSTransition */
/** A Web Animation of the engine's own (a zoom-out's fade), not a CSS animation or transition. */
const scripted = a => !(typeof CSSAnimation === 'function' && a instanceof CSSAnimation) && !(typeof CSSTransition === 'function' && a instanceof CSSTransition)

function compile (gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

/**
 * @param {object} app - the Zumly instance
 * @param {{ snapdom: Function, effects: Record<string, { none: number, uv?: string, color?: string }>, glass: boolean }} options
 *   effects: more effects for the shader, by name (see EFFECTS); one with the name of a CSS one replaces it.
 *   glass: whether the photo of a view coming in or leaving keeps its backdrop-filter (slower to take).
 * @returns {object|null} null without WebGL2: the views stay DOM.
 */
export function createWebGL (app, { snapdom, effects: more = {}, glass: keepGlass = false, hover = false, ancestors = false }) {
  const log = msg => app.notify(`webgl: ${msg}`, 'info')
  const flattener = () => app._flattener
  const canvas = document.createElement('canvas')
  canvas.className = 'z-gl'
  canvas.setAttribute('aria-hidden', 'true')
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
  if (!gl || typeof snapdom !== 'function') {
    if (!gl) log('no WebGL2, views stay DOM.')
    return null
  }
  app.canvas.prepend(canvas)

  /**
   * A SnapDOM photo of a view. One coming in goes out of sight while SnapDOM reads it, at scale
   * 1: the engine hands it over hidden (.hide is opacity 0), and SnapDOM would copy that opacity.
   * One in place is read where it is. glass: false leaves out its backdrop-filters, the slow part.
   * options: more SnapDOM options (a clip); wait: false reads it without waiting a frame.
   */
  async function photo (view, offscreen, { glass = keepGlass, wait = true, ...options } = {}) {
    const transform = view.style.transform
    const hidden = view.classList.contains('hide')
    if (offscreen) {
      view.style.transform = 'translate(-200vw, 0)'
      view.style.contentVisibility = 'visible'
      view.classList.remove('hide')
    }
    if (!glass) view.classList.add('z-gl-noglass')
    try {
      if (wait) await afterFrame()
      const t = performance.now()
      const result = await snapdom(view, { ...PHOTO, ...options })
      const shot = await result.toCanvas()
      return { canvas: shot, ms: Math.round(performance.now() - t) }
    } finally {
      view.classList.remove('z-gl-noglass')
      view.classList.toggle('hide', hidden)
      view.style.transform = transform
      if (offscreen) view.style.removeProperty('content-visibility')
    }
  }

  let view, blurPass, u, effects, fxList
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
  /** Programs, the quad and the state everything draws with: at start, and when a lost context comes back. */
  function setup () {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    effects = { ...EFFECTS, ...more }
    try {
      view = linkView(effects)
    } catch (error) {
      // A slip in an effect's GLSL leaves CSS's effects, not a page without WebGL.
      log(`effects left out (${error.message.trim()}).`)
      effects = { ...EFFECTS }
      view = linkView(effects)
    }
    fxList = Object.entries(effects).filter(([name]) => name !== 'blur')
    blurPass = link(BLUR_VERT, BLUR_FRAG, ['tex', 'lod', 'dir', 'sigma'])
    u = view.u
    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
  }
  setup()
  const unknown = new Set()
  /** An effect into the view's shader: each one at its amount, or at none. */
  const setEffect = (effect) => {
    for (const [name, e] of fxList) gl.uniform4f(view.u[glslName(name)], ...four(effect[name] ?? e.none))
    for (const name in effect) {
      if (effects[name] || unknown.has(name)) continue
      unknown.add(name)
      log(`no effect "${name}".`)
    }
  }
  const mixEffect = (a, b, t) => {
    const out = {}
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const none = effects[name]?.none ?? 0
      const from = a[name] ?? none
      const to = b[name] ?? none
      out[name] = Array.isArray(from) || Array.isArray(to)
        ? four(from).map((x, i) => lerp(x, four(to)[i], t))
        : lerp(from, to, t)
    }
    return out
  }
  /** Whether a layer at rest has an effect that changes with time (animate: true) and is on. */
  const living = layers => layers.some(({ effect }) => Object.entries(effect).some(([name, value]) => {
    const e = effects[name]
    return e?.animate && four(value).some((x, i) => x !== four(e.none)[i])
  }))
  /** The frame that redraws the views at rest while one of them has a living effect. */
  let alive = 0

  // Each map holds textures of the current context: a lost one takes them all (see restore).
  /** view → { st }: the texture its stream keeps current. */
  let streams = new WeakMap()
  /** view → { texture, width, height, ratio, source }: a photo uploaded once. */
  let photos = new WeakMap()
  /** view behind → { texture, width, height, ratio, rect, box }: its texture with what its overflow hides. */
  let wide = new WeakMap()
  /** texture record → the two textures and framebuffers its blur passes draw into. */
  let targets = new WeakMap()
  let last = []
  let lost = false
  /** A gesture in progress (see beginScrub). */
  let scrub = null
  /** Called when a zoom WebGL draws starts and ends moving: ('start' | 'end', spec, info). For instruments. */
  let motion = null
  let dpr = devicePixelRatio || 1

  const resize = () => {
    dpr = devicePixelRatio || 1
    const width = Math.round(app.canvas.clientWidth * dpr)
    const height = Math.round(app.canvas.clientHeight * dpr)
    if (canvas.width === width && canvas.height === height) return
    canvas.width = width
    canvas.height = height
    // At rest the views behind are drawn again: one whose photo no longer fits goes to the DOM,
    // and once the resize stops, it is photographed again (retexture).
    if (app.canvas.dataset.zGlMoving || lost) draw(last)
    else sync()
    clearTimeout(retextureTimer)
    retextureTimer = setTimeout(retexture, 400)
  }
  let retextureTimer = 0
  /** Views behind without a texture (a resize, a context back) are photographed where they are, at rest. */
  async function retexture () {
    if (lost || app.blockEvents || scrub || app.canvas.dataset.zGlMoving) return
    const bare = views().filter(v => (v.classList.contains('is-previous-view') || v.classList.contains('is-last-view')) && !behind(v))
    for (const view of bare) await snapshot(view, false, true).catch(error => log(`no photo of a view behind (${error.message}).`))
    if (bare.length && !app.blockEvents && !app.canvas.dataset.zGlMoving) sync()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(app.canvas)

  // A lost context (the GPU reset, too many contexts) takes every texture: the views go back to
  // DOM, and when it comes back WebGL starts over with what flatten still has.
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    lost = true
    if (early?.node) disposeView(early.node)
    early = null
    deep = null
    deeps.length = 0
    log('context lost, views back to DOM.')
    release()
  })
  canvas.addEventListener('webglcontextrestored', () => {
    streams = new WeakMap()
    photos = new WeakMap()
    wide = new WeakMap()
    targets = new WeakMap()
    setup()
    lost = false
    resize()
    sync()
    retexture()
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

  /**
   * A photo of a view, uploaded. One already behind (back) is read where it is, at its own size
   * (its root scale undone) and without the engine's effect, which the shader draws; it keeps
   * its glass, since it is in sight while SnapDOM reads it, and that is slow (411 ms against 86
   * on the lab's board): only for a view behind that lost its texture.
   */
  async function snapshot (view, offscreen, back = false) {
    const k = offscreen ? 1 : rootScale(view)
    const options = back
      ? { scale: 1 / k, glass: true, excludeStyleProps: prop => prop.startsWith('outline') || (prop === 'filter' && view.classList.contains('has-effect')) }
      : {}
    const ratio = dpr * (back ? 1 : k)
    const { canvas: shot, ms } = await photo(view, offscreen, options)
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
      { x: sl + cw, y: st, w: x1 - sl - cw, h: ch }
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
    // An effect that changes with time keeps the views at rest redrawn; a motion draws its own frames.
    if (!alive && living(layers)) {
      alive = requestAnimationFrame(() => {
        alive = 0
        if (!app.canvas.dataset.zGlMoving && !scrub) draw(last)
      })
    }
    paint(layers)
  }

  /** The layers on the screen, or into a texture (into: { fbo, width, height, ratio }). */
  function paint (layers, into = null) {
    // Blurs first: they draw into their own framebuffers. CSS blurs a view in its own pixels,
    // before its transform, so σ is in texels of the photo.
    const textures = layers.map(({ rec, effect, alpha }) => {
      const sigma = (effect.blur || 0) * rec.ratio
      if (alpha <= 0 || sigma < 0.5) return null
      return blurred(rec, sigma)
    })
    const [width, height, ratio] = into ? [into.width, into.height, into.ratio] : [canvas.width, canvas.height, dpr]
    gl.useProgram(view.program)
    if (into) gl.bindFramebuffer(gl.FRAMEBUFFER, into.fbo)
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(u.size, width / ratio, height / ratio)
    gl.uniform1f(u.yDir, into ? 1 : -1)
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
        gl.uniform1f(u.lod, Math.max(0, Math.log2(rec.ratio / ((Math.hypot(k.a, k.b) || 1) * ratio))))
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    })
    if (into) gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /**
   * ancestors: the engine keeps three views, and a zoom-in to a fourth level takes the oldest
   * out; what showed of it around the others went blank. Instead, the views WebGL no longer
   * draws (that one, and the picture of all before it) are drawn once into one picture the size
   * of the canvas, at half the screen's pixels (it is behind, blurred), and it moves with the
   * scene, behind everything. One per level past the third: a zoom-out goes back to the one
   * before, and sync() keeps as many as views the engine took out.
   */
  let deep = null // { rec, matrix }: the picture, and where it is on the canvas (CSS px)
  const deeps = [] // the ones before it, oldest first
  // view → its layer the last time it was drawn at rest: the view a zoom-in takes out is
  // detached by then, with no layout to read.
  const rested = new WeakMap()
  const DEEP = {}
  const screenOf = (pos, origin, m) => new DOMMatrix().translate(pos[0] + origin[0], pos[1] + origin[1]).multiply(m).translate(-origin[0], -origin[1])
  const deepLayer = (d, matrix) => ({ view: DEEP, deep: true, rec: d.rec, matrix, origin: [0, 0], pos: [0, 0], box: d.rec.rect.slice(2), effect: NONE, alpha: 1, progress: 1, focus: [0, 0, 0, 0] })

  function compose (layers) {
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const ratio = Math.max(1, dpr / 2)
    const width = Math.ceil(w * ratio)
    const height = Math.ceil(h * ratio)
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(width, height))) + 1, gl.RGBA8, width, height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    paint(layers, { fbo, width, height, ratio })
    gl.deleteFramebuffer(fbo)
    return { texture, width, height, ratio, rect: [0, 0, w, h], dirty: true }
  }

  function dropDeep (d) {
    if (!d) return
    dropTargets(d.rec)
    gl.deleteTexture(d.rec.texture)
  }

  function dropDeeps () {
    for (const d of deeps) dropDeep(d)
    deeps.length = 0
    dropDeep(deep)
    deep = null
  }

  /**
   * The picture moving as the scene does: ref is a view behind that moves in this navigation
   * (from, to, its origin); the picture takes the same move on the canvas. at(t) its layer,
   * end() leaves it where the move ends.
   */
  function deepMotion (ref) {
    if (!deep || !ref) return null
    const own = deep
    const pos = [ref.view.offsetLeft, ref.view.offsetTop]
    const screen = m => screenOf(pos, ref.origin, m)
    const back = screen(ref.from).inverse()
    const start = own.matrix
    const move = t => screen(interpolateMatrix(ref.from, ref.to, t)).multiply(back).multiply(start)
    return {
      at: t => deepLayer(own, move(t)),
      end: () => { own.matrix = move(1) }
    }
  }

  const views = () => [...app.canvas.children].filter(v => v.classList.contains('z-view'))
  const restEffect = view => view.classList.contains('has-effect') ? parseEffect(view.style.getPropertyValue('--z-effect-filter')) : NONE
  /**
   * view → the effect it was last drawn with at rest. A zoom that changes the effect of a view
   * that stays behind starts from it: by then the engine has written the new one.
   */
  const shown = new WeakMap()
  const shownEffect = view => shown.get(view) || restEffect(view)

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
    scrub = null
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
      const effect = restEffect(view)
      shown.set(view, effect)
      layers.push(layer(view, rec, m, origin, effect))
      rested.set(view, layers[layers.length - 1])
    }
    if (ancestors) {
      const out = Math.max(0, app.zoomLevel() - 3)
      while (deep && deeps.length + 1 > out) {
        dropDeep(deep)
        deep = deeps.pop() || null
      }
      if (deep) layers.unshift(deepLayer(deep, deep.matrix))
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
    // The view leaving a zoom-out: its stream's texture, if flatten follows it, is already current.
    const followed = type === 'zoomOut' && flattener()?.photos.get(currentView) ? behind(currentView) : null
    // The view coming in, photographed on hover (if it still has the size it had then).
    const early = type === 'zoomIn' && readied.get(currentView)
    readied.delete(currentView)
    const fits = early && early[0] === currentView.offsetWidth && early[1] === currentView.offsetHeight && photos.get(currentView)?.ratio === dpr
    const { rec, ms } = followed || fits
      ? { rec: followed || photos.get(currentView), ms: 0 }
      : await snapshot(currentView, type === 'zoomIn')
    recs.set(currentView, rec)
    info.photoMs = ms
    if (early) info.early = !!fits
    for (const view of [previousView, lastView]) {
      if (!view) continue
      let r = behind(view)
      // flatten's photo keeps the view's glass; the zoom's own photo, as the glass option says.
      const glass = flattener()?.photos.has(view) || undefined
      if (!r) {
        // The view going behind in a zoom-in is still in front; any other is behind already.
        const shot = await snapshot(view, false, !(type === 'zoomIn' && view === previousView))
        r = shot.rec
        info.shot = (info.shot || 0) + shot.ms
      }
      // The view going behind grows: what its overflow hides comes into sight.
      if (type === 'zoomIn' && view === previousView) {
        const { backwardState: from, forwardState: to } = spec.currentStage.views[1]
        const wider = await widen(view, r, glass, from.origin, new DOMMatrix(to.transform)).catch(error => log(`no overflow (${error.message}).`))
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
        .catch(error => log(`no overflow (${error.message}).`))
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
   * engine (done), even if end() fails. A hidden tab, without frames, still ends. settle: draw
   * what is at rest a frame later, once the engine has settled the roles.
   */
  function play (total, at, end, done, settle = true) {
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
        log(error.message)
      }
      delete app.canvas.dataset.zGlMoving
      done()
      // flatten settles a microtask after the engine completes: read the roles a frame later.
      if (settle) requestAnimationFrame(sync)
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
      { view: outgoing, origin: outgoing.style.transformOrigin, from: spec.outgoingTransform, to: spec.outgoingTransformEnd, fade: [1, 0] }
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
      z: order.indexOf(view)
    })).sort((a, b) => a.z - b.z)
    const ms = parseDurationMs(spec.duration)
    const curve = cssEasing(spec.ease) || (t => t)
    const motion = ancestors ? deepMotion(layers.find(l => l.view === backView)) : null
    const at = (elapsed) => {
      const t = curve(clamp01(elapsed / ms))
      const drawn = layers.map(l => layer(l.view, l.rec, interpolateMatrix(l.from, l.to, t), l.origin, l.effect, l.fade ? lerp(l.fade[0], l.fade[1], t) : 1))
      return motion ? [motion.at(t), ...drawn] : drawn
    }
    play(ms, at, () => {
      motion?.end()
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
        if (scripted(animation)) animation.cancel()
      }
    }
    const out = forward && currentStage.views[3]?.detachedNode
    if (ancestors && out && rested.has(out)) {
      // What WebGL drew and no longer will: the view the engine took out, and the picture behind it.
      const gone = deep ? [deepLayer(deep, deep.matrix), rested.get(out)] : [rested.get(out)]
      if (deep) deeps.push(deep)
      deep = { rec: compose(gone), matrix: new DOMMatrix() }
    } else if (ancestors && deep && !forward) {
      // The view the engine puts back for a zoom-out is in the picture until it ends.
      for (const view of views()) if (!entries.some(e => e.view === view)) view.classList.add(OFF)
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
      if (forward && role === 2) fx = [shownEffect(view), engineEffect(view)]
      if (!forward && role === 1) fx = [engineEffect(view), NONE]
      if (!forward && role === 2) fx = [shownEffect(view), engineEffect(view)]
      return { view, role, from, to, origin, fx, rec: prepared.recs.get(view), z: order.indexOf(view) }
    }).sort((a, b) => a.z - b.z)

    const ms = parseDurationMs(spec.duration)
    const stagger = currentStage.stagger || 0
    const curve = cssEasing(spec.ease) || (t => t)
    const total = ms + stagger * (layers.length - 1)
    const motion = ancestors ? deepMotion(layers.find(l => l.role === 1)) : null
    const at = (elapsed) => {
      const fxT = curve(clamp01(elapsed / ms))
      const drawn = layers.map(l => {
        const t = curve(clamp01((elapsed - l.role * stagger) / ms))
        const alpha = !forward && l.role === 0 ? clamp01((1 - clamp01(elapsed / ms)) / FADE) : 1
        return layer(l.view, l.rec, interpolateMatrix(l.from, l.to, t), l.origin, mixEffect(l.fx[0], l.fx[1], fxT), alpha, forward ? fxT : 1 - fxT)
      })
      return motion ? [motion.at(curve(clamp01((elapsed - stagger) / ms))), ...drawn] : drawn
    }
    play(total, at, () => {
      motion?.end()
      if (forward) {
        // The views behind stay drawn where they end; the one in front is DOM from now on.
        const behindNow = at(total).filter(l => l.view !== currentView)
        for (const l of behindNow) if (!l.deep) rested.set(l.view, l)
        draw(behindNow)
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

  /** Feed a stream frame of a view into its texture (flatten calls it for each frame). */
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

  /** The trigger looks pressed while the zoom gets ready; a ring turns over it if that takes long. */
  /**
   * hover: a zoom-in gets ready while the pointer or the focus is on its trigger. The view it
   * opens is built then, as the engine would build it on the click, and photographed out of
   * sight; the click takes that node and its texture (take), so the zoom starts without either.
   * A view that fetches its data does it on hover, too. One at a time: another trigger, any
   * move or a lost context drops it.
   */
  let early = null
  /** view → its size when it was photographed on hover, until its zoom-in takes the photo. */
  const readied = new WeakMap()
  const propsOf = trigger => JSON.stringify(trigger.dataset)

  function dropEarly () {
    const e = early
    early = null
    // One still being photographed is dropped when its photo comes back.
    if (e?.rec) {
      gl.deleteTexture(e.rec.texture)
      disposeView(e.node)
    }
  }

  async function prepareEarly (trigger) {
    if (lost || app.blockEvents || app.canvas.dataset.zGlMoving) return
    const from = trigger.closest('.z-view')
    if (from?.parentElement !== app.canvas || !from.classList.contains('is-current-view')) return
    const to = trigger.dataset.to
    if (early?.trigger === trigger && early.to === to && early.props === propsOf(trigger)) return
    // Only what the engine builds from its views, as on the click: not a custom element or a
    // view with mounted() (both run once inserted), nor deferred content.
    const definition = Object.prototype.hasOwnProperty.call(app.views, to) ? app.views[to] : undefined
    if (definition === undefined || typeof definition?.mounted === 'function') return
    if (app.deferred || trigger.dataset.deferred !== undefined) return
    dropEarly()
    const mine = { trigger, to, props: propsOf(trigger) }
    early = mine
    mine.ready = (async () => {
      const node = await app.prefetcher.get(to, app._createViewContext({ ...trigger.dataset }, trigger))
      if (early !== mine || !(node instanceof HTMLElement)) return disposeView(node)
      // Dressed as prepareAndInsertView will dress it, in the canvas only for the photo.
      node.classList.add('z-view')
      node.dataset.viewName = to
      node.style.transformOrigin = '0 0'
      node.style.position = 'absolute'
      node.inert = true
      app.canvas.append(node)
      let shot
      const size = [node.offsetWidth, node.offsetHeight]
      try {
        shot = (await photo(node, true)).canvas
      } finally {
        node.remove()
        node.inert = false
      }
      if (early !== mine || lost) return disposeView(node)
      mine.node = node
      mine.size = size
      mine.rec = upload(shot, dpr)
      mips(mine.rec)
    })().catch((error) => {
      if (early === mine) early = null
      log(`no view ready on hover (${error.message}).`)
    })
  }

  /**
   * The view a zoom-in from this trigger opens, if it got ready on hover: the engine inserts it
   * instead of building it again. One still getting ready is waited for.
   */
  async function take (trigger, to) {
    const e = early
    if (!e) return null
    if (e.trigger !== trigger || e.to !== to || e.props !== propsOf(trigger)) {
      dropEarly()
      return null
    }
    await e.ready
    if (early !== e || !e.rec) return null
    early = null
    dropPhoto(e.node)
    photos.set(e.node, e.rec)
    readied.set(e.node, e.size)
    return e.node
  }

  const onHover = (event) => {
    const trigger = event.target.closest?.('.zoom-me[data-to]')
    if (trigger) prepareEarly(trigger)
  }
  if (hover) {
    app.canvas.addEventListener('pointerover', onHover, { passive: true })
    app.canvas.addEventListener('focusin', onHover, { passive: true })
  }

  function press (trigger) {
    const r = trigger.getBoundingClientRect()
    const c = app.canvas.getBoundingClientRect()
    const pressed = document.createElement('div')
    pressed.className = 'z-gl-press'
    pressed.setAttribute('aria-hidden', 'true')
    Object.assign(pressed.style, {
      left: `${r.left - c.left - app.canvas.clientLeft}px`,
      top: `${r.top - c.top - app.canvas.clientTop}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      borderRadius: getComputedStyle(trigger).borderRadius
    })
    const ring = document.createElement('i')
    ring.className = 'z-gl-ring'
    ring.style.animationDelay = `${RING_AFTER_MS}ms, 0ms`
    pressed.append(ring)
    app.canvas.append(pressed)
    return pressed
  }

  /**
   * The engine starts the effects of the views behind with the zoom, and the fade of a zoom-out
   * into its trigger: while the zoom gets ready they wait where they are.
   */
  function hold (held, moving) {
    for (const view of held) {
      view.style.filter = getComputedStyle(view).filter
      view.style.transition = 'none'
    }
    const fades = moving.getAnimations().filter(scripted)
    for (const fade of fades) fade.pause()
    return () => {
      for (const view of held) {
        view.style.removeProperty('filter')
        view.style.removeProperty('transition')
      }
      for (const fade of fades) fade.play()
    }
  }

  /** The textures of a zoom, with the trigger pressed and everything waiting meanwhile. Null: it moves as DOM. */
  async function ready (spec) {
    const t0 = performance.now()
    const trigger = spec.type === 'zoomIn' ? spec.previousView.querySelector('.zoom-me.zoomed') : null
    const pressed = trigger ? press(trigger) : null
    const free = hold([spec.previousView, spec.lastView].filter(Boolean), spec.currentView)
    let prepared = null
    try {
      prepared = await prepare(spec)
    } catch (error) {
      log(`${error.message}; this one moves as DOM.`)
    }
    // Once the ring shows, it stays a moment, so it does not flicker.
    const waited = performance.now() - t0
    if (waited > RING_AFTER_MS && waited < RING_AFTER_MS + RING_MIN_MS) {
      await new Promise(resolve => setTimeout(resolve, RING_AFTER_MS + RING_MIN_MS - waited))
    }
    pressed?.remove()
    free()
    return prepared
  }

  /**
   * The driver WebGL puts in front of the engine's: zooms in and out and moves to a sibling get
   * their textures and WebGL draws them. Anything else (no animation, keepAlive 'visible', a
   * texture it could not get) runs on the driver, with every view back to DOM until it ends.
   */
  function wrap (driver) {
    return {
      runTransition (spec, done) {
        const dom = () => {
          // A navigation WebGL does not draw leaves the pictures of ancestors out of step.
          if (ancestors && (spec.type === 'zoomIn' || spec.type === 'zoomOut')) dropDeeps()
          release()
          driver.runTransition(spec, () => {
            done()
            requestAnimationFrame(sync)
          })
        }
        dropEarly()
        const kinds = ['zoomIn', 'zoomOut', 'lateral']
        if (lost || !kinds.includes(spec.type) || !(parseDurationMs(spec.duration) > 0)) return dom()
        ready(spec).then((prepared) => {
          if (!prepared || lost) return dom()
          motion?.('start', spec, prepared.info)
          run(spec, prepared, () => {
            motion?.('end', spec, prepared.info)
            done()
          })
        })
      }
    }
  }

  /**
   * A zoom-out that follows a gesture: the engine moves the view under the finger, as DOM, and
   * WebGL the views behind it, from the same progress. False when it cannot (a lost context, a
   * view behind without a texture): the engine moves them as DOM then, after release().
   * stage: the stage the zoom-out leaves; lastEffect: the effect the view behind the previous one
   * takes once that one is in front.
   */
  function beginScrub ({ previous, last: lastView, stage, lastEffect }) {
    if (lost) return false
    const entries = [{ view: previous, entry: stage.views[1], to: NONE }]
    if (lastView && stage.views[2]) entries.push({ view: lastView, entry: stage.views[2], to: parseEffect(lastEffect) })
    const layers = []
    for (const { view, entry, to } of entries) {
      const rec = behind(view)
      if (!rec) return false
      // readTransitionMatrix writes the transform it reads: the engine's own stays.
      const { transform, transformOrigin } = view.style
      const origin = entry.forwardState.origin
      const from = readTransitionMatrix(view, origin, transform || 'none')
      const target = readTransitionMatrix(view, origin, entry.backwardState.transform || 'none')
      const at = getComputedStyle(view).transformOrigin.split(' ').map(parseFloat)
      view.style.transform = transform
      view.style.transformOrigin = transformOrigin
      layers.push({ view, rec, from, to: target, origin: at, fx: [shownEffect(view), to] })
    }
    for (const { view } of layers) view.classList.add(OFF)
    app.canvas.dataset.zGlMoving = 'scrub'
    scrub = { layers, progress: 0, deep: ancestors ? deepMotion(layers[0]) : null }
    draw(scrubLayers(scrub, 0))
    return true
  }

  const scrubLayers = (own, p) => {
    const drawn = own.layers.map(l => layer(l.view, l.rec, interpolateMatrix(l.from, l.to, p), l.origin, mixEffect(l.fx[0], l.fx[1], p), 1, 1 - p))
    return own.deep ? [own.deep.at(p), ...drawn] : drawn
  }

  /** The gesture moved: progress 0 (where it started) to 1 (the zoom-out done). */
  function scrubTo (progress) {
    if (!scrub || lost) return
    scrub.progress = progress
    draw(scrubLayers(scrub, progress))
  }

  /**
   * The gesture let go: the views behind go on to the end, or back, as the engine's release
   * does (same duration and curve). Resolves when they get there.
   */
  function endScrub (commit, duration, ease = 'cubic-bezier(.2,.8,.2,1)') {
    if (!scrub) return Promise.resolve()
    const own = scrub
    const from = own.progress
    const target = commit ? 1 : 0
    const curve = cssEasing(ease) || (t => t)
    return new Promise((resolve) => {
      play(duration, (elapsed) => {
        if (scrub !== own) return last
        own.progress = lerp(from, target, curve(clamp01(elapsed / duration)))
        return scrubLayers(own, own.progress)
      }, () => {
        if (scrub !== own) return
        scrub = null
        // Put back, it is at rest as before; done, it stays drawn until the engine's zoom-out,
        // instant now, hands the views to the DOM.
        if (commit) {
          draw(scrubLayers(own, 1))
          own.deep?.end()
        } else sync()
      }, resolve, false)
    })
  }

  /** The gesture ended some other way (a navigation, destroy): WebGL draws what is at rest. */
  function stopScrub () {
    if (!scrub) return
    scrub = null
    delete app.canvas.dataset.zGlMoving
    sync()
  }

  /** Everything back to DOM, the canvas out. */
  function destroy () {
    app.canvas.removeEventListener('pointerover', onHover)
    app.canvas.removeEventListener('focusin', onHover)
    dropEarly()
    dropDeeps()
    observer.disconnect()
    clearTimeout(retextureTimer)
    cancelAnimationFrame(alive)
    release()
    delete app.canvas.dataset.zGlMoving
    canvas.remove()
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  return {
    canvas,
    gl,
    feed,
    wrap,
    sync,
    release,
    beginScrub,
    scrubTo,
    endScrub,
    stopScrub,
    destroy,
    take,
    get onMotion () { return motion },
    set onMotion (fn) { motion = fn },
    get lost () { return lost },
    get layers () { return last }
  }
}
