import { inject, injectable } from 'inversify'
import { StorageService } from '@web-monetization/wext/services'

import { FrameSpec } from '../../types/FrameSpec'
import { DisablingControls } from '../../types/disabling'
import * as tokens from '../../types/tokens'
import { LocalStorageProxy } from '../../types/storage'
import { notNullOrUndef } from '../../util/nullables'

import { TabStates } from './TabStates'
import { BackgroundFramesService } from './BackgroundFramesService'
import { Streams } from './Streams'
import { StreamAssociations } from './StreamAssociations'
import { logger, Logger } from './utils'

@injectable()
export class DisablingService {
  private disabled: Record<string, boolean> = {}
  private pause!: (frame: FrameSpec) => void
  private resume!: (frame: FrameSpec) => void
  private trace = true

  constructor(
    private storageService: StorageService,
    @inject(tokens.LocalStorageProxy)
    private store: LocalStorageProxy,
    @logger('DisablingService')
    private log: Logger,
    private streams: Streams,
    private assoc: StreamAssociations,
    private framesService: BackgroundFramesService,
    private tabStates: TabStates
  ) {
    this.framesService.on('frameChanged', ev => {
      if (ev.changed.href) {
        this.applyUrlBlocking(ev, ev.changed.href)
      }
    })
  }

  setDisabled(key: string, disabled: boolean) {
    this.disabled[key] = disabled
  }

  getDisabled(key: string): boolean {
    return Boolean(this.disabled[key])
  }

  setPauseResume({
    pause,
    resume
  }: {
    pause: (frame: FrameSpec) => void
    resume: (frame: FrameSpec) => void
  }) {
    this.pause = pause
    this.resume = resume
  }

  applyUrlBlocking(frame: FrameSpec, url: string): void {
    const tab = frame.tabId
    const isTopFrame = frame.frameId === 0
    const urlObject = new URL(url)
    const { href, origin } = urlObject
    const urlDisabled = this.getDisabled(href)
    const domainDisabled = this.getDisabled(origin)

    if (isTopFrame) {
      const disabling = this.tabStates.get(tab).disabling
      disabling.disableDomain = domainDisabled
      disabling.disableUrl = urlDisabled
      this.tabStates.set(tab, { disabling })
    }
  }

  /**
   * Should be called immediately upon receipt of startWM / stopWM messaging
   * so as to set the tabStates
   */
  applyPaymentPointerBlocking(frame: FrameSpec, paymentPointer: string | null) {
    const tab = frame.tabId
    const isTopFrame = frame.frameId === 0
    const disabledPaymentPointer = paymentPointer
      ? this.getDisabled(paymentPointer)
      : false
    if (isTopFrame) {
      const disabling = this.tabStates.get(tab).disabling
      disabling.disablePaymentPointer = disabledPaymentPointer
      this.tabStates.set(tab, { disabling })
    }
  }

  /**
   * Upon changes, must check all open tabs/frames to see if they apply and
   * update the tab state accordingly.
   *
   * If ANY of the controls are set to disabled, disable ALL streams for the
   * active tab, then apply the rules to other tabs (which may be backgrounded).
   *
   */
  handleSetDisabling(activeTab: number, controls: DisablingControls) {
    if (this.trace) {
      this.log(
        'handleSetDisabling activeTab before:',
        JSON.stringify(this.tabStates.get(activeTab), null, 2)
      )
    }
    const priorState = this.getFrameStates()
    this.tabStates.set(activeTab, { disabling: controls })

    const topFrame = { tabId: activeTab, frameId: 0 }
    const top = this.framesService.getFrameNotNull(topFrame)
    const paymentPointer = this.tabStates.getFrameOrDefault(topFrame)
      .monetizationDetails?.paymentPointer

    const urlObject = new URL(top.href)
    const { href, origin } = urlObject
    this.setDisabled(href, controls.disableUrl)
    this.setDisabled(origin, controls.disableDomain)
    if (paymentPointer) {
      this.setDisabled(paymentPointer, controls.disablePaymentPointer)
    }

    for (const state of priorState) {
      const frame = state.frame
      // Need to reapply
      this.applyUrlBlocking(frame, state.href)
      this.applyPaymentPointerBlocking(frame, state.paymentPointer)

      const wasDisabled = state.disabled
      const wasNotDisabled = !wasDisabled
      const nowDisabled = this.checkIsFrameDisabled(frame)
      const nowEnabled = !nowDisabled

      // this.tabStates.setFrame(frame, { disabled: nowDisabled })
      const tabState = this.tabStates.get(frame.tabId)
      const { interactive } = this.tabStates.getFrameOrDefault(frame)
      if (wasDisabled && nowEnabled) {
        if (interactive || tabState.stickyState === 'sticky') {
          if (tabState.playState === 'playing') {
            this.resume(frame)
          }
        }
      } else if (wasNotDisabled && nowDisabled) {
        if (interactive || tabState.stickyState === 'sticky') {
          if (tabState.playState === 'playing') {
            this.pause(frame)
          }
        }
      }
    }

    if (this.trace) {
      this.log(
        'handleSetDisabling activeTab after:',
        JSON.stringify(this.tabStates.get(activeTab), null, 2)
      )
    }
  }

  getFrameStates() {
    const ret: Array<{
      frame: FrameSpec
      disabled: boolean
      href: string
      paymentPointer: string | null
    }> = []
    for (const tabId of this.tabStates.tabKeys()) {
      const tabState = this.tabStates.get(tabId)
      for (const frameId of Object.keys(tabState.frameStates).map(Number)) {
        const frame: FrameSpec = { frameId, tabId }
        const state = tabState.frameStates[frameId]
        ret.push({
          frame,
          disabled: state.disabled,
          paymentPointer: state.monetizationDetails?.paymentPointer ?? null,
          href: this.framesService.getFrameNotNull(frame).href
        })
      }
    }
    return ret
  }

  isTabDisabled(tabId: number) {
    return Object.values(this.tabStates.get(tabId).disabling).some(Boolean)
  }

  checkIsFrameDisabled(frame: FrameSpec) {
    const disabled = this.doIsFrameDisabled(frame)
    this.tabStates.setFrame(frame, { disabled })
    return disabled
  }

  doIsFrameDisabled(frame: FrameSpec) {
    // For a simple mental model, if any controls are applied, apply them
    // to all frames, as it's too tricky otherwise.
    if (this.isTabDisabled(frame.tabId)) {
      return true
    }
    const paymentPointer = this.tabStates.getFrameOrDefault(frame)
      .monetizationDetails?.paymentPointer

    const urlObject = new URL(
      notNullOrUndef(this.framesService.getFrame(frame)?.href)
    )
    const { href, origin } = urlObject
    // TODO: normalize
    if (paymentPointer && this.getDisabled(paymentPointer)) {
      return true
    }
    if (this.getDisabled(href)) {
      return true
    }
    if (this.getDisabled(origin)) {
      return true
    }
  }
}
