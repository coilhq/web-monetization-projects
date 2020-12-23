import { PaymentDetails } from '@web-monetization/polyfill-utils'

import { PlayOrPauseState, StickyState } from './streamControls'
import { DisablingControls } from './disabling'

export type MonetizationCommand = 'pause' | 'stop' | 'start' | 'resume'

export interface FrameState {
  adapted: boolean
  monetized: boolean
  // via blocking controls
  disabled: boolean
  // started or resumed, vs paused
  // interactive means the frame hasn't idled or been made invisible
  interactive: boolean
  monetizationDetails: PaymentDetails | null
  // Tracks the total amount of `source` money sent (not was received)
  total: number
  lastMonetization: {
    command: MonetizationCommand | null
    timeMs: number
  }
}

export interface TabState {
  favicon?: string
  coilSite?: string
  disabling: DisablingControls
  stickyState: StickyState
  playState: PlayOrPauseState
  icon?: {
    path: string
  }
  badge?: {
    text: string
    color?: string
  }
  frameStates: Record<number, FrameState>
}
