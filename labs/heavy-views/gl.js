// gl=1 (experiment 7, all in): zooms drawn with WebGL. One WebGL canvas sits in Zumly's canvas,
// under the views. While views move, each one is a texture in it and the views themselves are
// hidden (opacity 0, so they still answer hit-tests). At rest the views behind stay textures,
// with the engine's effects (blur, brightness) in the shader instead of a CSS filter, and only
// the current view is DOM.
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

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D tex;
uniform float lod;
uniform float bright;
uniform float alpha;
in vec2 uv;
out vec4 color;
void main () {
  vec4 c = textureLod(tex, uv, lod);
  color = vec4(c.rgb * bright, c.a) * alpha;
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

const NONE = { blur: 0, bright: 1 }

/** The parts of an effect the shader draws: blur(px) and brightness(). */
export function parseEffect (value) {
  if (!value || value === 'none') return NONE
  const blur = /blur\(\s*([\d.]+)px\s*\)/.exec(value)
  const bright = /brightness\(\s*([\d.]+)(%?)\s*\)/.exec(value)
  return { blur: blur ? +blur[1] : 0, bright: bright ? +bright[1] / (bright[2] ? 100 : 1) : 1 }
}

const mixEffect = (a, b, t) => ({ blur: lerp(a.blur, b.blur, t), bright: lerp(a.bright, b.bright, t) })
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
 * @param {{ photo: (view: HTMLElement, offscreen: boolean, options?: object) => Promise<{canvas: HTMLCanvasElement, ms: number}>, flattener: () => object|null, log: (msg: string) => void }} deps
 */
export function createGL (app, { photo, flattener, log }) {
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
  const view = link(VERT, FRAG, ['rect', 'origin', 'm', 'move', 'pos', 'size', 'yDir', 'tex', 'lod', 'bright', 'alpha'])
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
   * Each band: x, y, w, h in the view's content (as scrolled), bx, by from its border box.
   */
  function bandsOf (el) {
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
    const box = el.getBoundingClientRect()
    const area = app.canvas.getBoundingClientRect()
    return [
      { x: x0, y: y0, w: x1 - x0, h: st - y0 },
      { x: x0, y: st + ch, w: x1 - x0, h: y1 - st - ch },
      { x: x0, y: st, w: sl - x0, h: ch },
      { x: sl + cw, y: st, w: x1 - sl - cw, h: ch },
    ].filter(b => b.w >= 1 && b.h >= 1).map(b => ({ ...b, bx: el.clientLeft - sl + b.x, by: el.clientTop - st + b.y })).filter(b => {
      const left = box.left + b.bx
      const top = box.top + b.by
      return left >= area.right - 1 || left + b.w <= area.left + 1 || top >= area.bottom - 1 || top + b.h <= area.top + 1
    })
  }

  /**
   * Photos of the bands. SnapDOM draws a view inside its box, so the view grows to its whole
   * content for a moment, moved back by its scroll so it shows the same, and its real content
   * comes back if flatten had hidden it (under the photo, so it shows the same too).
   */
  async function bandShots (el, bands, glass) {
    const { scrollLeft: sl, scrollTop: st } = el
    const props = ['width', 'height', 'box-sizing', 'overflow', 'transform']
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
    set('transform', `translate(${-sl}px, ${-st}px)${transform === 'none' ? '' : ` ${transform}`}`)
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
    gl.uniform1f(u.bright, 1)
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
   * Whether a band comes into the canvas during a zoom-in that takes the view to `to` around
   * `origin`. The way there scales and moves the view steadily, so whatever a point of the view
   * does, it does by the end: a band outside the canvas at both ends stays out all the way.
   */
  function reaches (el, band, origin, to) {
    const k = new DOMMatrix(to)
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
   * The view's texture widened with what its overflow hides, or null when it hides nothing the
   * zoom shows (state: the view's stage in the zoom-in). glass: whether the bands keep their
   * glass, as the view's texture does.
   */
  async function widen (el, base, glass, state) {
    const bands = bandsOf(el).filter(b => reaches(el, b, state.backwardState.origin, state.forwardState.transform))
    if (!bands.length) return null
    const t = performance.now()
    const ratio = dpr * rootScale(el)
    const shots = await bandShots(el, bands, glass)
    const parts = shots.map(({ band, shot }) => {
      const rec = upload(shot, ratio)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      // SnapDOM's margin, as around a view: the same on every side.
      const w = shot.width / ratio
      const h = shot.height / ratio
      return { rec, rect: [band.bx - (w - band.w) / 2, band.by - (h - band.h) / 2, w, h] }
    })
    mips(base)
    const rec = composite(base, [el.offsetWidth, el.offsetHeight], parts)
    for (const { rec: part } of parts) gl.deleteTexture(part.texture)
    return { rec, ms: Math.round(performance.now() - t) }
  }

  /** A layer to draw: a view with its texture, matrix around its origin, and effect. */
  function layer (view, rec, matrix, origin, effect, alpha = 1) {
    return { view, rec, matrix, origin, pos: [view.offsetLeft, view.offsetTop], box: [view.offsetWidth, view.offsetHeight], effect, alpha }
  }

  function draw (layers) {
    last = layers
    if (lost) return
    // Blurs first: they draw into their own framebuffers. CSS blurs a view in its own pixels,
    // before its transform, so σ is in texels of the photo.
    const textures = layers.map(({ rec, effect, alpha }) => {
      const sigma = effect.blur * rec.ratio
      if (alpha <= 0 || sigma < 0.5) return null
      return blurred(rec, sigma)
    })
    gl.useProgram(view.program)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(u.size, canvas.width / dpr, canvas.height / dpr)
    gl.uniform1f(u.yDir, -1)
    layers.forEach(({ rec, matrix: k, origin, pos, box, effect, alpha }, i) => {
      if (alpha <= 0) return
      gl.uniform4f(u.rect, ...rectOf(rec, box))
      gl.uniform2f(u.origin, origin[0], origin[1])
      gl.uniform4f(u.m, k.a, k.b, k.c, k.d)
      gl.uniform2f(u.move, k.e, k.f)
      gl.uniform2f(u.pos, pos[0], pos[1])
      gl.uniform1f(u.bright, effect.bright)
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
      const rec = current ? null : behind(view)
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
        const wider = await widen(view, r, glass, spec.currentStage.views[1]).catch(error => log(`gl: no overflow (${error.message})`))
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

  /** Draw a zoom-in or zoom-out with the prepared textures; done() once it ends. */
  function run (spec, prepared, done) {
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
        return layer(l.view, l.rec, interpolateMatrix(l.from, l.to, t), l.origin, mixEffect(l.fx[0], l.fx[1], fxT), alpha)
      })
    }
    draw(at(0))

    let raf = 0
    let start = null
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(raf)
      clearTimeout(deadline)
      try {
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
      } catch (error) {
        log(`gl: ${error.message}`)
      }
      delete app.canvas.dataset.zGlMoving
      done()
      // flatten settles a microtask after the engine completes: read the roles a frame later.
      requestAnimationFrame(sync)
    }
    // A hidden tab stops animation frames; the zoom still ends.
    const deadline = setTimeout(finish, total + 1000)
    const tick = (now) => {
      if (start === null) start = now
      const elapsed = now - start
      if (elapsed >= total) return finish()
      draw(at(elapsed))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
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
