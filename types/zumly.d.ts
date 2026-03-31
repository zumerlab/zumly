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
  props: Record<string, string>
}

/** A function that receives context and returns a view. */
export type ViewFunction = (ctx: ViewContext) => string | HTMLElement | void | Promise<string | HTMLElement | void>

/** An object with a render method and optional mounted hook. */
export interface ViewObject {
  render(ctx: ViewContext): string | HTMLElement | Promise<string | HTMLElement>
  mounted?(): void | Promise<void>
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
  keepAlive?: boolean
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
  level: number
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
  /** CSS duration string. Default: '1s'. */
  duration?: string
  /** CSS easing function. Default: 'ease-in-out'. */
  ease?: string
  /** Array of 1-2 CSS filter strings for background view effects. */
  effects?: [string] | [string, string]
  /** Progressive delay (ms) between view layers during zoom. Default: 0. */
  stagger?: number
  /** Parallax intensity (0-1). Default: 0. */
  parallax?: number
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
}

/** Depth navigation UI configuration. */
export interface DepthNavOptions {
  /** Show zoom-out button. Default: true. */
  button?: boolean
  /** Show depth level dot indicators. Default: true. */
  indicator?: boolean
}

/** Input types that can be individually enabled/disabled. */
export interface InputsOptions {
  /** Enable wheel zoom-out. Default: true. */
  wheel?: boolean
  /** Enable keyboard navigation (arrow keys). Default: true. */
  keyboard?: boolean
  /** Enable click/mouseup navigation. Default: true. */
  click?: boolean
  /** Enable touch navigation. Default: true. */
  touch?: boolean
}

/** Options for goTo(). */
export interface GoToOptions {
  /** Navigation mode. Default: 'depth'. */
  mode?: 'depth' | 'lateral'
  /** Override transition duration. */
  duration?: string
  /** Override transition easing. */
  ease?: string
  /** Props to pass to the target view. */
  props?: Record<string, unknown>
}

/** Options for zoomTo(). */
export interface ZoomToOptions {
  /** Override transition duration. */
  duration?: string
  /** Override transition easing. */
  ease?: string
  /** Props to pass to the target view. */
  props?: Record<string, unknown>
}

/** Navigation bar position presets. */
export type NavPosition =
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'top-left'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'

/** Zumly constructor options. */
export interface ZumlyOptions {
  /** CSS selector for the canvas element (must have class zumly-canvas). */
  mount: string
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
  /** Depth navigation UI. true = default, false = disabled. */
  depthNav?: boolean | DepthNavOptions
  /** Navigation bar position. Default: 'bottom-center'. 'middle-left' and 'middle-right' render vertically. */
  navPosition?: NavPosition
  /** Input types to enable/disable. All enabled by default. */
  inputs?: InputsOptions
  /** Enable deferred rendering (view content inserted after zoom animation). */
  deferred?: boolean
  /** Hide trigger mode during zoom: 'fade', 'remove', or falsy. */
  hideTrigger?: string | false
}

// ─── Events ─────────────────────────────────────────────────────────

export interface ZumlyEventMap {
  viewMounted: { viewName: string; node: HTMLElement }
  beforeZoomIn: { viewName: string }
  afterZoomIn: { viewName: string; zoomLevel: number }
  beforeZoomOut: { zoomLevel: number }
  afterZoomOut: { zoomLevel: number }
  beforeLateral: { viewName: string; from: string; isBack: boolean }
  afterLateral: { viewName: string; from: string; isBack: boolean }
  destroy: Record<string, never>
}

export type ZumlyEventName = keyof ZumlyEventMap

// ─── Zumly class ────────────────────────────────────────────────────

export class Zumly {
  constructor(options: ZumlyOptions)

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

  /** Get the current zoom depth (number of stored snapshots). */
  zoomLevel(): number

  /** Alias for zoomLevel(). */
  getZoomLevel(): number

  /** Get the name of the currently active view, or null if not initialized. */
  getCurrentViewName(): string | null

  /**
   * Navigate to a view by name. Unified API for depth and lateral navigation.
   */
  goTo(viewName: string, options?: GoToOptions): Promise<void>

  /**
   * Programmatic zoom to a named view (depth navigation).
   * Uses a centered synthetic trigger for the transition.
   */
  zoomTo(viewName: string, options?: ZoomToOptions): Promise<void>

  /** Zoom into the view indicated by a trigger element with data-to="viewName". */
  zoomIn(el: HTMLElement): Promise<void>

  /** Zoom out one level. No-op at root. */
  zoomOut(): void

  /**
   * Navigate back. Pops lateral history first, then zooms out.
   * Returns a Promise when navigating laterally.
   */
  back(): Promise<void> | void
}

export default Zumly

// ─── Driver helper types ────────────────────────────────────────────
// These types describe the exports from 'zumly/driver-helpers'.
// Use: import type { MatrixComponents } from 'zumly'

export interface MatrixComponents {
  a: number; b: number; c: number; d: number; e: number; f: number
}
