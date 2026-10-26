// Type definitions for Zumly
// https://github.com/zumerlab/zumly

// ─── View sources ───────────────────────────────────────────────────

/** Context object passed to function and object view sources. */
export interface ViewContext {
  /** A fresh <div> for mounting framework components. */
  target: HTMLDivElement
  /** The trigger element that initiated the zoom (if from a click). */
  trigger?: HTMLElement
  /** The componentContext from Zumly constructor options. */
  context: Map<string, unknown> | Record<string, unknown>
  /** Data attributes from the trigger element (e.g. data-id="42" → props.id). */
  props: Record<string, unknown>
  /** Register component unmount or resource cleanup, run once when this view is discarded. */
  onCleanup(callback: () => void | Promise<void>): void
  /**
   * Run `callback` each time this view becomes current again without being
   * rendered anew: after zooming back out to it, or when a kept-alive lateral
   * view returns. Use it to repaint from state that changed meanwhile.
   */
  onActivate(callback: () => void): void
}

/** A function that receives context and returns a view. */
export type ViewFunction = (ctx: ViewContext) => string | HTMLElement | void | Promise<string | HTMLElement | void>

/** An object with a render method and optional mounted hook. */
export interface ViewObject {
  render(ctx: ViewContext): string | HTMLElement | Promise<string | HTMLElement>
  /** Human-readable name for navigation UI. A data-title on the view root wins. */
  title?: string
  /** Called after the view is inserted into the canvas, with its root node. */
  mounted?(node: HTMLElement): void | Promise<void>
}

/** All supported view source types. */
export type ViewSource = string | ViewFunction | ViewObject | HTMLElement

// ─── Options ────────────────────────────────────────────────────────

/** Built-in transition driver names. */
export type DriverName = 'css' | 'waapi' | 'none' | 'anime' | 'gsap' | 'motion'

/** Transition spec passed to custom driver functions. */
export interface TransitionSpec {
  type: 'zoomIn' | 'zoomOut' | 'lateral'
  currentView: HTMLElement
  previousView: HTMLElement
  lastView: HTMLElement | null
  currentStage: ZoomSnapshot
  duration: string
  ease: string
  canvas: HTMLElement
  /** Lateral-specific fields (present when type === 'lateral') */
  backView?: HTMLElement | null
  backViewState?: { transformStart: string; transformEnd: string } | null
  lastViewState?: { transformStart: string; transformEnd: string } | null
  incomingTransformStart?: string
  incomingTransformEnd?: string
  outgoingTransform?: string
  outgoingTransformEnd?: string
  slideDeltaX?: number
  slideDeltaY?: number
  /** When true, driver should not remove the outgoing view from DOM (lateral keepAlive). */
  keepAlive?: boolean | 'visible'
}

/** Custom driver function signature. */
export type DriverFunction = (spec: TransitionSpec, onComplete: () => void) => void

/** View state (transform + origin) stored in snapshots. */
export interface ViewState {
  origin: string
  transform: string
  duration: string
  ease: string
}

/** A single view entry in a zoom snapshot. */
export interface ViewEntry {
  viewName: string
  backwardState: ViewState
  forwardState: ViewState
  detachedNode?: HTMLElement
}

/** Zoom snapshot stored in the storedViews stack. */
export interface ZoomSnapshot {
  zoomLevel: number
  views: [ViewEntry, ViewEntry, ViewEntry | null, ViewEntry | null]
  scale?: number
  stagger?: number
  hideTriggerMode?: string
}

/** Transition configuration options. */
export interface TransitionOptions {
  /** Transition driver. Default: 'css'. */
  driver?: DriverName | DriverFunction
  /** Which dimension to use for cover scale. Default: 'width'. */
  cover?: 'width' | 'height'
  /** CSS time ('600ms', '1s') or a number of milliseconds. Default: '1s'. */
  duration?: string | number
  /**
   * CSS timing function (all drivers follow the same curve) or, for the anime,
   * gsap and motion drivers, a library ease name. Default: 'ease-in-out'.
   */
  ease?: string
  /** Array of 1-2 CSS filter strings for background view effects. */
  effects?: [string] | [string, string]
  /** Transition the effects' filter with the zoom (true) or apply it at once (false). Default: true. */
  animateEffects?: boolean
  /** Progressive delay (ms) between view layers during zoom. Default: 0. */
  stagger?: number
  /** Accepted for compatibility but not applied yet (always treated as 0). */
  parallax?: number
  /** Hide the trigger element during zoom: 'fade' (crossfade), true (hide), or false. Default: false. */
  hideTrigger?: 'fade' | boolean
}

/** Lateral navigation UI configuration. */
export interface LateralNavOptions {
  /** Display mode. 'auto' = only when view doesn't cover full canvas. 'always' = whenever siblings exist. Default: 'auto'. */
  mode?: 'auto' | 'always'
  /** Show prev/next arrow buttons. Default: true. */
  arrows?: boolean
  /** Show dot indicators. Default: true. */
  dots?: boolean
  /** Keep lateral views alive in the DOM. true = hidden, 'visible' = visible. Default: false. */
  keepAlive?: boolean | 'visible'
  /** Position of the lateral nav bar. Default: 'bottom-center'. */
  position?: 'bottom-center' | 'top-center'
  /**
   * Declared sibling order for lateral navigation. Takes precedence over
   * inferring order/slide direction from trigger positions in the parent view.
   * Array = one lateral group; map = keyed by parent view name.
   * @example ['today', 'tomorrow', 'week']
   * @example { home: ['today', 'tomorrow', 'week'] }
   */
  siblings?: string[] | Record<string, string[]>
  /** A horizontal swipe moves between siblings (left: next, right: previous) instead of zooming out. Default: false. */
  swipe?: boolean
}

/** Depth navigation UI configuration. */
export interface DepthNavOptions {
  /** Position of the back button. Default: 'bottom-left'. */
  position?: 'bottom-left' | 'top-left'
  /**
   * 'button' (default): a chevron. 'title': a dot in its ring and the title of
   * the view above. 'rings': a ring per level above around a dot; hover, a long
   * press or an arrow key opens a band per level to jump to. Rings and bands
   * carry z-depth-ring--up-N / --depth-N classes and data-view for styling.
   */
  style?: 'button' | 'title' | 'rings'
}

/** Input types that can be individually enabled/disabled. */
export interface InputsOptions {
  /** Enable wheel zoom-out. Default: true. */
  wheel?: boolean
  /** Enable keyboard navigation (Enter/Space on triggers, arrow keys for back). Default: true. */
  keyboard?: boolean
  /** Enable click/mouseup navigation. Default: true. */
  click?: boolean
  /** Enable touch navigation. Default: true. */
  touch?: boolean
  /** Closing two fingers zooms out. Default: false (it competes with page zoom). */
  pinch?: boolean
}

/** Gestures that drive the zoom-out with their progress. */
export interface GesturesOptions {
  /** Wheel/trackpad, swipe and pinch move the views as they go. Default: false. */
  follow?: boolean
  /** Progress (0–1) past which releasing finishes the zoom-out. Default: 0.5. */
  threshold?: number
}

/** Options for goTo(). */
export interface GoToOptions {
  /** Navigation mode. Default: 'depth'. */
  mode?: 'depth' | 'lateral'
  /** Override transition duration (CSS time or milliseconds). */
  duration?: string | number
  /** Override transition easing. */
  ease?: string
  /** Props to pass to the target view. */
  props?: Record<string, unknown>
}

/** A navigation label: template with {title} and {name}, a function, or false for none. */
export type NavLabel = string | ((view: { name?: string; title?: string }) => string) | false

/** Accessible names of the built-in navigation controls. */
export interface LabelsOptions {
  /** Back button. Default: 'Back to {title}' (the view above). */
  back?: NavLabel
  /** Previous-sibling arrow. Default: 'Previous sibling view'. */
  prev?: NavLabel
  /** Next-sibling arrow. Default: 'Next sibling view'. */
  next?: NavLabel
  /** Sibling dots. Default: 'Go to {title}'. */
  goTo?: NavLabel
}

/** Options for zoomOut() with an object. */
export interface ZoomOutOptions {
  /** Ancestor view to zoom out to (the nearest one with this name). */
  to?: string
  /** Levels to climb. Default: 1. */
  levels?: number
  /** Override transition duration (CSS time or milliseconds). */
  duration?: string | number
  /** Override transition easing. */
  ease?: string
}

/** A view in the stack, root first. */
export interface StackEntry {
  name: string
  title: string
  depth: number
}

/** Options for zoomTo(). */
export interface ZoomToOptions {
  /** Override transition duration (CSS time or milliseconds). */
  duration?: string | number
  /** Override transition easing. */
  ease?: string
  /** Props to pass to the target view. */
  props?: Record<string, unknown>
}

/** Depth nav position presets. */
export type DepthNavPosition = 'bottom-left' | 'top-left'

/** Lateral nav position presets. */
export type LateralNavPosition = 'bottom-center' | 'top-center'

/** Zumly constructor options. */
export interface ZumlyOptions {
  /** The canvas: a CSS selector or the element itself (e.g. a framework ref). Gets class zumly-canvas. */
  mount: string | HTMLElement
  /** Name of the first view to show. */
  initialView: string
  /** Map of view names to view sources. */
  views: Record<string, ViewSource>
  /** View names to resolve and cache on init(). */
  preload?: string[]
  /** Transition configuration. */
  transitions?: TransitionOptions
  /** Enable debug messages. Default: false. */
  debug?: boolean
  /** Context object passed to function/object view sources. */
  componentContext?: Map<string, unknown> | Record<string, unknown>
  /** Lateral navigation UI. true = default, false = disabled. */
  lateralNav?: boolean | LateralNavOptions
  /** Depth navigation UI. true = default (back button, bottom-left), false = disabled. */
  depthNav?: boolean | DepthNavOptions
  /** Input types to enable/disable. All enabled by default. */
  inputs?: boolean | InputsOptions
  /** Enable deferred rendering (view content inserted after zoom animation). */
  deferred?: boolean
  /** Zoom-out that follows the gesture. true = { follow: true }. */
  gestures?: boolean | GesturesOptions
  /** Labels of the navigation controls. false leaves them all without one. */
  labels?: false | LabelsOptions
}

// ─── Events ─────────────────────────────────────────────────────────

export interface ZumlyEventMap {
  viewMounted: { viewName: string; node: HTMLElement }
  beforeZoomIn: { viewName: string }
  afterZoomIn: { viewName: string; zoomLevel: number }
  /** viewName is the view being returned to; from is the view being left. */
  beforeZoomOut: { zoomLevel: number; viewName: string | null; from: string | null; levels?: number }
  afterZoomOut: { zoomLevel: number; viewName: string | null; from: string | null; levels?: number }
  beforeLateral: { viewName: string; from: string; isBack: boolean }
  afterLateral: { viewName: string; from: string; isBack: boolean }
  /**
   * A zoom-out driven by a gesture (gestures.follow). 'start' and 'move' carry
   * the 0–1 progress; 'commit' or 'cancel' fire on release with the time left
   * to finish or go back; 'end' when the views have settled.
   */
  zoomOutProgress: {
    phase: 'start' | 'move' | 'commit' | 'cancel' | 'end'
    progress: number
    duration?: number
    viewName: string | null
    from: string | null
    source: 'wheel' | 'swipe' | 'pinch'
  }
  /** Fired after every completed navigation, including init(). */
  viewChanged: {
    type: 'init' | 'zoomIn' | 'zoomOut' | 'lateral'
    viewName: string | null
    from: string | null
    zoomLevel: number
    node: HTMLElement | null
  }
  destroy: Record<string, never>
}

export type ZumlyEventName = keyof ZumlyEventMap

// ─── Plugin system ──────────────────────────────────────────────────

/** A Zumly plugin: object with install(), or a plain function. */
export interface ZumlyPlugin<T = unknown> {
  install(instance: Zumly, options?: T): void
}

export type ZumlyPluginFunction<T = unknown> = (instance: Zumly, options?: T) => void

// ─── Router plugin ──────────────────────────────────────────────────

export interface RouterOptions {
  /** Character used to join view path segments in the hash. Default: '/'. */
  separator?: string
  /** Prefix before the path in the hash. Default: '/'. */
  prefix?: string
}

export const ZumlyRouter: ZumlyPlugin<RouterOptions>

// ─── Library drivers (for bundlers) ─────────────────────────────────

/** Anime.js driver bound to a library instance: `import * as anime from 'animejs'` (v4) or the v3 default export. */
export function animeDriver(anime: unknown): DriverFunction
/** GSAP driver bound to a library instance: `import { gsap } from 'gsap'`. */
export function gsapDriver(gsap: unknown): DriverFunction
/** Motion driver bound to its animate function: `import { animate } from 'motion'`, then `motionDriver({ animate })`. */
export function motionDriver(motion: { animate: (...args: any[]) => any } | ((...args: any[]) => any)): DriverFunction

// ─── Zumly class ────────────────────────────────────────────────────

export class Zumly {
  constructor(options: ZumlyOptions)

  /** Static reference to the Router plugin. */
  static Router: ZumlyPlugin<RouterOptions>

  /** Whether the instance was initialized with valid options. */
  readonly isValid: boolean

  /** Initialize the zoom interface: render initial view and bind events. */
  init(): Promise<void>

  /** Clean up: remove listeners, timers, navigation UI, and nullify state. Idempotent. */
  destroy(): void

  /**
   * Subscribe to a lifecycle event.
   * @returns this (chainable)
   */
  on<E extends ZumlyEventName>(event: E, fn: (data: ZumlyEventMap[E]) => void): this

  /**
   * Unsubscribe from a lifecycle event. If fn is omitted, removes all hooks for that event.
   * @returns this (chainable)
   */
  off<E extends ZumlyEventName>(event: E, fn?: (data: ZumlyEventMap[E]) => void): this

  /**
   * Register a plugin. Plugins are installed during init(), or immediately if already initialized.
   * @returns this (chainable)
   */
  use<T>(plugin: ZumlyPlugin<T> | ZumlyPluginFunction<T>, options?: T): this

  /** Get the current zoom depth (number of stored snapshots). */
  zoomLevel(): number

  /** Alias for zoomLevel(). */
  getZoomLevel(): number

  /** Whether back() would navigate (lateral history at this level, or a level to zoom out to). */
  canGoBack(): boolean

  /** Get the name of the currently active view, or null if not initialized. */
  getCurrentViewName(): string | null

  /**
   * Navigate to a view by name. Resolves after the transition completes.
   * Calls made while another navigation is loading/animating are ignored.
   */
  goTo(viewName: string, options?: GoToOptions): Promise<void>

  /**
   * Programmatic zoom to a named view (depth navigation).
   * Uses a centered synthetic trigger for the transition. Resolves after animation.
   */
  zoomTo(viewName: string, options?: ZoomToOptions): Promise<void>

  /** Zoom into the view indicated by a trigger element with data-to="viewName". */
  zoomIn(el: HTMLElement): Promise<void>

  /**
   * Zoom out one level, `levels` levels (`zoomOut(2)`), or up to an ancestor
   * (`zoomOut({ to: 'home' })`), in one transition. Clamped to the root.
   */
  zoomOut(target?: number | ZoomOutOptions): Promise<void>

  /** Title of a view: its data-title, else `title` in its definition, else its name. */
  getViewTitle(viewName: string): string

  /** The views from the root to the current one. */
  getViewStack(): StackEntry[]

  /**
   * Navigate back. Pops lateral history first, then zooms out.
   * Resolves after the navigation completes.
   */
  back(): Promise<void>
}

export default Zumly

// ─── Driver helper types ────────────────────────────────────────────
// These types describe the exports from 'zumly/driver-helpers'.
// Use: import type { MatrixComponents } from 'zumly'

export interface MatrixComponents {
  a: number; b: number; c: number; d: number; e: number; f: number
}
