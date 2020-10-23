import { injectable } from 'inversify'

import { FrameState, MonetizationCommand, TabState } from '../../types/TabState'
import { IconState } from '../../types/commands'
import { Colors } from '../consts/Colors'
import { FrameSpec } from '../../types/FrameSpec'

import { PopupIconService } from './PopupIconService'

@injectable()
export class TabStates {
  activeTab: number | null = null
  private tabStates: { [tab: number]: TabState } = {}

  constructor(private icons: PopupIconService) {}

  set(tab: number, state: Partial<TabState> = {}) {
    const existingState = this.get(tab)
    this.tabStates[tab] = { ...existingState, ...state }
  }

  setFrame({ tabId, frameId }: FrameSpec, state: Partial<FrameState> = {}) {
    const frameStates = this.get(tabId).frameStates
    const existingFrameState =
      frameStates[frameId] ?? this.makeFrameStateDefault()
    this.set(tabId, {
      frameStates: {
        ...frameStates,
        ...{ [frameId]: { ...existingFrameState, ...state } }
      }
    })
  }

  clearFrame({ tabId, frameId }: FrameSpec) {
    const tabState = this.tabStates[tabId]
    if (tabState) {
      if (frameId !== 0) {
        delete tabState.frameStates[frameId]
      } else {
        // maintain default
        tabState.frameStates[0] = this.makeFrameStateDefault()
      }
    }
  }

  tabKeys(): number[] {
    return Object.keys(this.tabStates).map(Number)
  }

  getActiveOrDefault(): TabState {
    return (
      (this.activeTab != null && this.tabStates[this.activeTab]) ||
      this.makeDefault()
    )
  }

  private makeDefault() {
    const state: TabState = {
      playState: 'playing',
      stickyState: 'auto',
      disabling: {
        disableDomain: false,
        disablePaymentPointer: false,
        disableUrl: false
      },
      frameStates: {
        [0]: this.makeFrameStateDefault()
      }
    }
    return state
  }

  private makeFrameStateDefault(): FrameState {
    return {
      monetized: false,
      monetizationDetails: null,
      disabled: false,
      interactive: false,
      adapted: false,
      total: 0,
      lastMonetization: {
        command: null,
        timeMs: Date.now()
      }
    }
  }

  /**
   * Returns a non authoritative reference. Do not update it and expect updates
   * to be kept except by coincidence. Treat it as a copy.
   */
  get(tab: number, defaultValue = this.makeDefault()): TabState {
    return this.tabStates[tab] || { ...defaultValue }
  }

  getFrameOrDefault({ tabId, frameId }: FrameSpec) {
    return (
      this.tabStates[tabId].frameStates[frameId] ?? this.makeFrameStateDefault()
    )
  }

  clear(tab: number) {
    delete this.tabStates[tab]
  }

  setIcon(tab: number, state: IconState) {
    switch (state) {
      case 'inactive':
        this.set(tab, {
          icon: { path: this.icons.getInactive() },
          badge: { text: '' }
        })
        break

      case 'monetized':
        this.set(tab, {
          icon: { path: this.icons.getActive() },
          badge: { text: '' }
        })
        break

      case 'disabled':
        this.set(tab, {
          badge: { text: '🚫', color: Colors.BlackDisabledBackground }
        })
        break

      case 'unavailable':
        this.set(tab, {
          badge: { text: '!', color: Colors.Red }
        })
        break

      case 'streaming':
        this.set(tab, {
          badge: { text: '$', color: Colors.Green }
        })
        break

      case 'streaming-paused':
        this.set(tab, {
          badge: { text: '\u23F8', color: Colors.Green }
        })
        break

      default:
        break
    }
  }

  logLastMonetizationCommand(frame: FrameSpec, command: MonetizationCommand) {
    this.setFrame(frame, {
      lastMonetization: {
        command,
        timeMs: Date.now()
      }
    })
  }
}
