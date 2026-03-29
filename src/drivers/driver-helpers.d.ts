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
export function createFinishGuard(
  cleanup: () => void,
  timeoutMs: number
): { finish: () => void; safetyTimer: number }
export function identityMatrix(): MatrixComponents
export function parseMatrixString(mStr: string): MatrixComponents
export function matrixToString(m: MatrixComponents): string
export function lerp(a: number, b: number, t: number): number
export function interpolateMatrix(from: MatrixComponents, to: MatrixComponents, t: number): MatrixComponents
export function readComputedMatrix(element: HTMLElement, origin: string, transformStr: string): MatrixComponents
