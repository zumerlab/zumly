// Type definitions for zumly/drivers

import type { TransitionSpec, DriverFunction } from '../../types/zumly.js'

export * from './driver-helpers.js'
export { animeDriver, gsapDriver, motionDriver } from '../../types/zumly.js'

export function getDriver(driver: string | DriverFunction): { runTransition: (spec: TransitionSpec, onComplete: () => void) => void }
export function cssTransition(spec: TransitionSpec, onComplete: () => void): void
export function waapiTransition(spec: TransitionSpec, onComplete: () => void): void
export function noneTransition(spec: TransitionSpec, onComplete: () => void): void
export function animeTransition(spec: TransitionSpec, onComplete: () => void, anime?: unknown): void
export function gsapTransition(spec: TransitionSpec, onComplete: () => void, gsap?: unknown): void
export function motionTransition(spec: TransitionSpec, onComplete: () => void, motion?: unknown): void
