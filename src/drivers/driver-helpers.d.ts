// Type definitions for zumly/driver-helpers

import type { ZoomSnapshot, ViewState, TransitionSpec, MatrixComponents } from '../../types/zumly.js'

export function parseDurationMs(duration: string | number): number
export function parseDurationSec(duration: string | number): number
export function applyZoomInEndState(element: HTMLElement, currentStage: ZoomSnapshot): void
export function applyZoomOutPreviousState(element: HTMLElement, backwardState: ViewState): void
export function applyZoomOutLastState(element: HTMLElement, backwardState: ViewState): void
export function removeViewFromCanvas(element: HTMLElement, canvas: HTMLElement): void
export function showViews(...elements: (HTMLElement | null | undefined)[]): void
export function runLateralInstant(spec: TransitionSpec, onComplete: () => void): void
export const SAFETY_BUFFER_MS: number
/** What createFinishGuard() returns. */
export interface FinishGuard {
  /** Run cleanup once and clear the safety timer. Later calls do nothing. */
  finish: () => void
  /**
   * Re-arm the safety timer to fire `ms` from now. Call it when the animation
   * really starts (its first painted frame), so a slow first frame does not cut
   * the animation short. Does nothing once the guard has finished.
   */
  extend: (ms: number) => void
  /** Id of the timer armed at creation. extend() replaces that timer; this id is not updated. */
  safetyTimer: number
}

/**
 * A finish-once guard: `finish()` runs `cleanup` the first time it is called,
 * and a safety timer runs it after `timeoutMs` if nothing else did.
 */
export function createFinishGuard(
  cleanup: () => void,
  timeoutMs: number
): FinishGuard
export function identityMatrix(): MatrixComponents
export function parseMatrixString(mStr: string): MatrixComponents
export function matrixToString(m: MatrixComponents): string
export function lerp(a: number, b: number, t: number): number
export function interpolateMatrix(from: MatrixComponents, to: MatrixComponents, t: number): MatrixComponents
export function readComputedMatrix(element: HTMLElement, origin: string, transformStr: string): MatrixComponents

/** CSS timing function → f(progress). Null for non-CSS names such as 'power2.out'. */
export function cssEasing(ease: string): ((progress: number) => number) | null
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (progress: number) => number
export function steps(count: number, position?: 'start' | 'end' | 'jump-start' | 'jump-end' | 'jump-none' | 'jump-both'): (progress: number) => number
