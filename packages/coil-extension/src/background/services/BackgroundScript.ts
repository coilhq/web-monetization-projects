import { inject, injectable } from 'inversify'
import { GraphQlClient } from '@coil/client'
import { MonetizationState } from '@web-monetization/types'
import { resolvePaymentEndpoint } from '@web-monetization/polyfill-utils'

import { notNullOrUndef } from '../../util/nullables'
import { StorageService } from '../../services/storage'
import * as tokens from '../../types/tokens'
import {
  AdaptedSite,
  CheckAdaptedContent,
  CheckIFrameIsAllowedFromBackground,
  ClosePopup,
  ContentScriptInit,
  MonetizationProgress,
  MonetizationStart,
  OnFrameAllowedChanged,
  PauseWebMonetization,
  ReportCorrelationIdFromIFrameContentScript,
  ReportCorrelationIdToParentContentScript,
  ResumeWebMonetization,
  SetDisabling,
  SetMonetizationState,
  SetStreamControls,
  StartWebMonetization,
  TipSent,
  ToBackgroundMessage
} from '../../types/commands'
import { LocalStorageProxy } from '../../types/storage'
import { TabState } from '../../types/TabState'
import { getFrameSpec } from '../../util/tabs'
import { FrameSpec } from '../../types/FrameSpec'
import { BuildConfig } from '../../types/BuildConfig'

import { StreamMoneyEvent } from './Stream'
import { AuthService } from './AuthService'
import { TabStates } from './TabStates'
import { Streams } from './Streams'
import { Favicons } from './Favicons'
import { PopupBrowserAction } from './PopupBrowserAction'
import { Logger, logger } from './utils'
import { YoutubeService } from './YoutubeService'
import { BackgroundFramesService } from './BackgroundFramesService'
import { DisablingService } from './DisablingService'
import { StreamAssociations } from './StreamAssociations'

import MessageSender = chrome.runtime.MessageSender

import { ContextMenus } from './ContextMenus'

@injectable()
export class BackgroundScript {
  constructor(
    private popup: PopupBrowserAction,
    private favIcons: Favicons,
    private assoc: StreamAssociations,
    private streams: Streams,
    private tabStates: TabStates,
    private storage: StorageService,
    @inject(tokens.LocalStorageProxy)
    private store: LocalStorageProxy,
    private auth: AuthService,
    private menus: ContextMenus,
    private youtube: YoutubeService,
    private framesService: BackgroundFramesService,
    @logger('BackgroundScript')
    private log: Logger,
    private client: GraphQlClient,
    private disabling: DisablingService,
    @inject(tokens.CoilDomain)
    private coilDomain: string,
    @inject(tokens.BuildConfig)
    private buildConfig: BuildConfig,
    @inject(tokens.WextApi)
    private api = chrome
  ) {}

  get activeTab() {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.tabStates.activeTab!
  }

  /**
   * See {@link setTabsOnActivatedListener}
   * See {@link setWindowsOnFocusedListener}
   * See {@link initializeActiveTab}
   */
  set activeTab(value: number) {
    this.tabStates.activeTab = value
  }

  async run() {
    this.initializeActiveTab()
    this.setRuntimeMessageListener()
    this.setTabsOnActivatedListener()
    this.setWindowsOnFocusedListener()
    this.setTabsOnRemovedListener()
    this.setFramesOnChangedListener()
    this.setFramesOnRemovedListener()
    this.routeStreamsMoneyEventsToContentScript()
    this.handleStreamsAbortEvent()
    this.popup.setDefaultInactive()
    this.framesService.monitor()
    this.menus.bind()
    // noinspection ES6MissingAwait
    void this.auth.getTokenMaybeRefreshAndStoreState()
    this.disabling.setPauseResume({
      pause: this.doPauseWebMonetization.bind(this),
      resume: this.doResumeWebMonetization.bind(this)
    })
  }

  private setTabsOnActivatedListener() {
    // The active tab has been changed
    this.api.tabs.onActivated.addListener(activeInfo => {
      if (this.buildConfig.logTabsApiEvents) {
        this.log('tabs.onActivated %o', activeInfo)
      }
      this.activeTab = activeInfo.tabId
      this.reloadTabState({ from: 'onActivated' })
    })
    if (this.buildConfig.logTabsApiEvents) {
      this.api.tabs.onActiveChanged.addListener((tabId, selectInfo) => {
        this.log('tabs.onActiveChanged %d %o', tabId, selectInfo)
      })
      this.api.tabs.onSelectionChanged.addListener((tabId, selectInfo) => {
        this.log('tabs.onSelectionChanged %d %o', tabId, selectInfo)
      })
      this.api.tabs.onCreated.addListener(activeInfo => {
        this.log('tabs.onCreated %o', activeInfo)
      })
    }
  }

  private setWindowsOnFocusedListener() {
    if (this.api.windows) {
      // The active window (and therefore active tab) has changed
      this.api.windows.onFocusChanged.addListener(windowId => {
        // We've focused a special window, e.g. inspector
        if (windowId < 0) return

        // Close the popup when window has changed
        const message: ClosePopup = {
          command: 'closePopup'
        }
        this.api.runtime.sendMessage(message, () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const ignored = this.api.runtime.lastError
        })

        this.api.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs.length === 0 || tabs[0].id == null) return
          this.activeTab = tabs[0].id
          this.reloadTabState({ from: 'onFocusChanged' })
        })
      })
    }
  }

  private setRuntimeMessageListener() {
    // A tab wants to change its state
    this.api.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const serialized = JSON.stringify(request)
      const redacted = serialized.replace(/"token":\s*".*"/, '<redacted>')
      this.log('received message. request=', redacted)

      void this.handleMessage(request, sender, sendResponse)

      // important: this tells chrome to expect an async response.
      // if `true` is not returned here then async messages don't make it back
      // see: https://developer.chrome.com/apps/runtime#event-onMessage
      return true
    })
  }

  private initializeActiveTab() {
    // initialize tab so we can set its state right away
    this.api.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs.length === 0 || tabs[0].id == null) return
      this.activeTab = tabs[0].id
      this.reloadTabState({ from: 'initial' })
    })
  }

  private setTabsOnRemovedListener() {
    // Remove tab state when the tab is closed to prevent memory leak
    this.api.tabs.onRemoved.addListener(tabId => {
      this.log('removing tab with id', tabId)
      this.tabStates.clear(tabId)

      // clean up the stream of that tab
      this._closeStreams(tabId)
    })

    if (this.buildConfig.logTabsApiEvents) {
      this.api.tabs.onReplaced.addListener((added, removed) => {
        this.log(
          'tabs.onReplaced.: replaced tab with id' +
            JSON.stringify({ added, removed })
        )
      })
      this.api.tabs.onAttached.addListener((tabId, attachInfo) => {
        this.log(
          'tabs.onAttached: onAttached' + JSON.stringify({ tabId, attachInfo })
        )
      })
      this.api.tabs.onDetached.addListener((tabId, detachInfo) => {
        this.log(
          'tabs.onDetached: replaced tab with id' +
            JSON.stringify({ tabId, detachInfo })
        )
      })
    }
  }

  private setFramesOnRemovedListener() {
    this.framesService.on('frameRemoved', event => {
      this.tabStates.clearFrame(event)
      this._closeStreams(event.tabId, event.frameId)
    })
  }

  private setFramesOnChangedListener() {
    // Reset tab state and recheck adapted content when tab changes location
    this.framesService.on('frameChanged', event => {
      // If not a top level window or its direct descendant, bail early
      if (!(event.frame.top || event.frame.parentFrameId === 0)) {
        return
      }

      const { tabId, frameId } = event
      const changedState = event.changed.state
      const isComplete = event.frame.state === 'complete'
      const becameComplete = changedState === 'complete'
      const becameLoading = changedState === 'loading'
      const changedUrl = Boolean(event.changed.href)

      // Always get the current url
      const url = event.frame.href
      if (becameLoading) {
        if (event.frame.top) {
          this.setCoilUrlForPopupIfNeeded(tabId, url)
        }
      }

      if (becameComplete || (isComplete && changedUrl)) {
        if (event.frame.top) {
          this.setCoilUrlForPopupIfNeeded(tabId, url)
        }
        const from = `onFrameChanged directly, event=${JSON.stringify(event)}, `
        this.checkAdaptedContent(from, tabId, frameId)
      }
    })
  }

  private checkAdaptedContent(from: string, tabId: number, frameId: number) {
    // Only extension apis can get callbacks for url change events
    // consistently so we report the url changes to the content script.
    const message: CheckAdaptedContent = {
      command: 'checkAdaptedContent',
      data: { from }
    }
    this.log('sending checkAdaptedContent message', message)
    this.api.tabs.sendMessage(tabId, message, { frameId }, () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const ignored = this.api.runtime.lastError
    })
  }

  private routeStreamsMoneyEventsToContentScript() {
    // pass stream monetization events to the correct tab
    this.streams.on('money', (details: StreamMoneyEvent) => {
      const frame = this.assoc.getFrame(details.requestId)
      const { tabId, frameId } = frame
      if (details.packetNumber === 0) {
        const message: MonetizationStart = {
          command: 'monetizationStart',
          data: {
            paymentPointer: details.paymentPointer,
            requestId: details.requestId
          }
        }
        this.api.tabs.sendMessage(tabId, message, { frameId })
      }

      const message: MonetizationProgress = {
        command: 'monetizationProgress',
        data: {
          paymentPointer: details.paymentPointer,
          amount: details.amount,
          assetCode: details.assetCode,
          requestId: details.requestId,
          assetScale: details.assetScale,
          sentAmount: details.sentAmount,
          receipt: details.receipt
        }
      }
      this.handleMonetizedSite(frame, details.initiatingUrl, details)
      this.api.tabs.sendMessage(tabId, message, { frameId })
      this.savePacketToHistoryDb(details)
    })
  }

  private savePacketToHistoryDb(_: StreamMoneyEvent) {
    // this.db.incrementSite(details)
  }

  async adaptedPageDetails(variables: { url: string; channelId?: string }) {
    return this.client.adaptedPage(variables.url, variables.channelId)
  }

  private setBrowserActionStateFromAuthAndTabState() {
    const token = this.auth.getStoredToken()

    if (!token || !this.store.validToken) {
      this.popup.disable()
    }

    const tabId = this.activeTab

    if (tabId) {
      const tabState = this.tabStates.getActiveOrDefault()

      if (Object.values(tabState.frameStates).find(f => f.monetized)) {
        this.tabStates.setIcon(tabId, 'monetized')
      }

      if (token == null) {
        this.tabStates.setIcon(tabId, 'unavailable')
      } else if (token) {
        this.popup.enable()

        const tabState = this.tabStates.getActiveOrDefault()
        const frameStates = Object.values(tabState.frameStates)
        const hasStream = frameStates.find(f => f.monetized)
        const hasBeenPaid = hasStream && frameStates.find(f => f.total > 0)
        const paused = tabState.playState === 'paused'
        const disabled = Object.values(tabState.disabling).some(Boolean)

        if (hasStream) {
          // this.tabStates.setIcon(tabId, 'inactive')
          this.tabStates.setIcon(tabId, 'monetized')

          if (hasBeenPaid) {
            this.tabStates.setIcon(tabId, 'streaming')
          }
          if (paused) {
            this.tabStates.setIcon(tabId, 'streaming-paused')
          }
          if (disabled) {
            this.tabStates.setIcon(tabId, 'disabled')
          }
        } else {
          this.tabStates.setIcon(tabId, 'inactive')
          if (disabled) {
            this.tabStates.setIcon(tabId, 'disabled')
          } /*else {
            this.tabStates.setIcon(tabId, 'inactive')
          }*/
        }
      }
    }
  }

  async handleMessage(
    request: ToBackgroundMessage,
    sender: MessageSender,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendResponse: (response: any) => any
  ) {
    switch (request.command) {
      case 'log':
        this.log('log command:', request.data)
        sendResponse(true)
        break
      case 'setDisabling':
        sendResponse(this.setDisabling(request, sender))
        break
      case 'logout':
        sendResponse(this.logout(sender))
        break
      case 'adaptedSite':
        this.adaptedSite(request.data, sender)
        sendResponse(true)
        break
      case 'injectToken':
        sendResponse(
          await this.injectToken(request.data.token, notNullOrUndef(sender.url))
        )
        break
      case 'startWebMonetization':
        this.log('got startwebmonetization')
        sendResponse(await this.startWebMonetization(request, sender))
        break
      case 'pauseWebMonetization':
        sendResponse(this.pauseWebMonetization(request, sender))
        break
      case 'resumeWebMonetization':
        sendResponse(this.resumeWebMonetization(request, sender))
        break
      case 'stopWebMonetization':
        sendResponse(this.stopWebMonetization(sender))
        break
      case 'isRateLimited':
        sendResponse(await this.isRateLimited())
        break
      case 'setStreamControls':
        sendResponse(this.setStreamControls(request, sender))
        break
      case 'contentScriptInit':
        sendResponse(this.contentScriptInit(request, sender))
        break
      case 'fetchYoutubeChannelId':
        sendResponse(await this.youtube.fetchChannelId(request.data.youtubeUrl))
        break
      case 'sendTip':
        sendResponse(await this.sendTip())
        break
      case 'checkIFrameIsAllowedFromIFrameContentScript':
        sendResponse(
          await this.checkIFrameIsAllowedFromIFrameContentScript(sender)
        )
        break
      case 'reportCorrelationIdFromIFrameContentScript':
        sendResponse(
          await this.reportCorrelationIdFromIFrameContentScript(request, sender)
        )
        break
      case 'onFrameAllowedChanged':
        sendResponse(await this.onFrameAllowedChanged(request, sender))
        break
      case 'adaptedPageDetails':
        sendResponse(await this.adaptedPageDetails(request.data))
        break
      default:
        sendResponse(false)
        break
    }
  }

  setCoilUrlForPopupIfNeeded(tab: number, url: string | undefined) {
    this.log('setting coil url for popup', url)
    if (url && !url.startsWith(this.coilDomain)) {
      url = undefined
    }
    this.tabStates.set(tab, {
      coilSite: url
    })
    if (url) {
      this.reloadTabState({ from: 'setCoilUrlForPopupIfNeeded' })
    }
  }

  async injectToken(siteToken: string | null, url: string) {
    const { origin } = new URL(url)
    if (origin !== this.coilDomain) {
      return null
    }
    // When logged out siteToken will be an empty string so normalize it to
    // null
    this.auth.syncSiteToken(siteToken || null)
    return this.auth.getTokenMaybeRefreshAndStoreState()
  }

  setFrameMonetized(
    { tabId, frameId }: FrameSpec,
    senderUrl: string,
    total?: number
  ) {
    const tabState = this.tabStates.get(tabId)

    this.tabStates.setFrame(
      { tabId, frameId },
      {
        monetized: true,
        total: total || (tabState.frameStates[frameId]?.total ?? 0)
      }
    )

    if (this.activeTab === tabId) {
      this.reloadTabState()
    }

    // TODO: this doesn't actually seem to be used anywhere
    // Channel image is provided if top frame is adapted
    if (tabState.frameStates[0].adapted) {
      const { host } = new URL(senderUrl)
      this.favIcons
        .getFavicon(host)
        .then(favicon => {
          this.tabStates.set(tabId, { favicon })
        })
        .catch(e => {
          console.error(`failed to fetch favicon. e=${e.stack}`)
        })
    }
  }

  mayMonetizeSite(sender: chrome.runtime.MessageSender, initiatingUrl: string) {
    this.setFrameMonetized(getFrameSpec(sender), initiatingUrl)
  }

  handleMonetizedSite(
    { tabId, frameId }: FrameSpec,
    url: string,
    packet: { sentAmount: string }
  ) {
    const tabState = this.tabStates.get(tabId)
    const frameTotal = tabState?.frameStates[frameId]?.total ?? 0
    const newFrameTotal = frameTotal + Number(packet?.sentAmount ?? 0)
    this.setFrameMonetized({ tabId, frameId }, url, newFrameTotal)
  }

  adaptedSite(data: AdaptedSite['data'], sender: MessageSender) {
    const { frameId, spec } = getFrameSpec(sender)
    if (frameId === 0 && data.channelImage) {
      this.tabStates.set(this.activeTab, {
        favicon: data.channelImage
      })
    }
    this.tabStates.setFrame(spec, {
      adapted: data.state
    })
  }

  reloadTabState(opts: { from?: string } = {}) {
    const { from } = opts

    const tab = this.activeTab
    const state = () => this.tabStates.get(tab)
    this.setLocalStorageFromState(state())
    this.setBrowserActionStateFromAuthAndTabState()
    // Don't work off stale state, set(...) creates a copy ...
    this.popup.setBrowserAction(tab, state())
    if (from) {
      this.log(
        `reloadTabState tab=${tab}`,
        `from=${from}`,
        JSON.stringify(state(), null, 2)
      )
    }
  }

  private setLocalStorageFromState(state: TabState) {
    const frameStates = Object.values(state.frameStates)

    state && state.coilSite
      ? this.storage.set('coilSite', state.coilSite)
      : this.storage.remove('coilSite')
    // TODO: Another valid case might be a singular adapted iframe inside a non
    // monetized top page.
    this.storage.set('adapted', Boolean(state?.frameStates[0]?.adapted))
    state && frameStates.find(f => f.monetized)
      ? this.storage.set('monetized', true)
      : this.storage.remove('monetized')

    if (state && state.playState && state.stickyState) {
      this.store.playState = state.playState
      this.store.stickyState = state.stickyState
    } else if (state) {
      delete this.store.playState
      delete this.store.stickyState
    }

    // TODO, move more under this if ...
    if (state) {
      const total = frameStates.reduce((acc, val) => acc + val.total, 0)
      this.storage.set('monetizedTotal', total)
      this.store.disabling = state.disabling
    }

    this.storage.set(
      'monetizedFavicon',
      (state && state.favicon) || '/res/icon-page.svg'
    )
  }

  async checkIFrameIsAllowedFromIFrameContentScript(sender: MessageSender) {
    let frame = getFrameSpec(sender) as FrameSpec
    const { tabId, frameId } = frame

    if (frameId !== 0) {
      let allowed = true
      while (allowed) {
        const frameDetails = await this.framesService.getFrameAsync(frame)
        const parentId = frameDetails?.parentFrameId
        if (typeof parentId === 'undefined') {
          throw new Error(
            `expecting ${JSON.stringify(frame)} to have parentFrameId
            frameDetails=${JSON.stringify(frameDetails)}
            tabFrames=${JSON.stringify(
              this.framesService.getFrames(frame.tabId)
            )}
            `
          )
        }
        allowed = await this.framesService.sendCommand<
          CheckIFrameIsAllowedFromBackground,
          boolean
        >(
          { tabId, frameId: parentId },
          {
            command: 'checkIFrameIsAllowedFromBackground',
            data: {
              frame
            }
          }
        )
        if (parentId === 0) {
          break
        } else {
          frame = { tabId: frame.tabId, frameId: parentId }
        }
      }
      return allowed
    } else {
      throw new Error(`sender must be non top frame`)
    }
  }

  async reportCorrelationIdFromIFrameContentScript(
    request: ReportCorrelationIdFromIFrameContentScript,
    sender: MessageSender
  ) {
    const frame = getFrameSpec(sender)
    const parentId = (await this.framesService.getFrameAsync(frame))
      ?.parentFrameId
    if (typeof parentId === 'undefined') {
      throw new Error(`expecting ${frame} to have parentFrameId`)
    }
    const message: ReportCorrelationIdToParentContentScript = {
      command: 'reportCorrelationIdToParentContentScript',
      data: {
        frame,
        correlationId: request.data.correlationId
      }
    }
    this.api.tabs.sendMessage(frame.tabId, message, { frameId: parentId })
  }

  async startWebMonetization(
    request: StartWebMonetization,
    sender: MessageSender
  ) {
    const frame = getFrameSpec(sender)
    // we can assume that it's interactive at this point (non idle, visible)
    // TODO: just default to true?
    this.tabStates.setFrame(frame, { interactive: true })
    const { tabId, frameId } = frame
    this.disabling.applyPaymentPointerBlocking(
      frame,
      request.data.paymentPointer
    )
    this.tabStates.setFrame(frame, { monetizationDetails: request.data })

    this.tabStates.logLastMonetizationCommand(frame, 'start')
    const disabled = this.disabling.checkIsFrameDisabled(frame)
    const tabState = this.tabStates.get(frame.tabId)

    if (tabState.playState === 'paused' || disabled) {
      this.tabStates.logLastMonetizationCommand(frame, 'pause')
    }

    // This used to be sent from content script as a separate message
    this.mayMonetizeSite(sender, request.data.initiatingUrl)

    // This may throw so do after mayMonetizeSite has had a chance to set
    // the page as being monetized (or attempted to be)
    const spspEndpoint = resolvePaymentEndpoint(request.data.paymentPointer)

    const userBeforeReAuth = this.store.user
    let emittedPending = false
    const emitPending = () =>
      this.sendSetMonetizationStateMessage(frame, 'pending')

    // If we are optimistic we have an active subscription (things could have
    // changed since our last cached whoami query), emit pending immediately,
    // otherwise wait until recheck auth/whoami, potentially not even emitting.
    if (userBeforeReAuth?.subscription?.active) {
      emittedPending = true
      emitPending()
    }

    this.log('startWebMonetization, request', request)
    const { requestId } = request.data

    this.log('loading token for monetization', requestId)
    const token = await this.auth.getTokenMaybeRefreshAndStoreState()
    if (!token) {
      // not signed in.
      // eslint-disable-next-line no-console
      console.warn('startWebMonetization cancelled; no token')
      this.sendSetMonetizationStateMessage(frame, 'stopped')
      return false
    }
    if (!this.store.user?.subscription?.active) {
      this.sendSetMonetizationStateMessage(frame, 'stopped')
      this.log('startWebMonetization cancelled; no active subscription')
      return false
    }

    if (!emittedPending) {
      emitPending()
    }

    const lastCommand = this.tabStates.getFrameOrDefault(frame).lastMonetization
      .command
    if (lastCommand !== 'start' && lastCommand !== 'pause') {
      this.log('startWebMonetization cancelled via', lastCommand)
      return false
    }

    this.log('starting stream', requestId)
    this.assoc.setStreamId(frame, requestId)
    this.assoc.setFrame(requestId, { tabId, frameId })
    this.streams.beginStream(requestId, {
      token,
      spspEndpoint,
      ...request.data,
      initiatingUrl: request.data.initiatingUrl
    })

    if (lastCommand === 'pause') {
      // TODO: why do we need the timeout here ?
      setTimeout(() => {
        this.doPauseWebMonetization(frame)
      }, 0)
    }
    return true
  }

  private async sendTip(): Promise<{ success: boolean }> {
    const tabId = this.activeTab
    const streamId = this.assoc.getStreamId({ tabId, frameId: 0 })
    if (!streamId) {
      this.log('can not find top frame for tabId=%d', tabId)
      return { success: false }
    }
    const stream = this.streams.getStream(streamId)
    const token = this.auth.getStoredToken()

    // TODO: return detailed errors
    if (!stream || !token) {
      this.log(
        'sendTip: no stream | token. !!stream !!token ',
        !!stream,
        !!token
      )
      return { success: false }
    }

    const receiver = stream.getPaymentPointer()
    const { assetCode, assetScale, exchangeRate } = stream.getAssetDetails()
    const amount = Math.floor(1e9 * exchangeRate).toString() // 1 USD, assetScale = 9

    try {
      this.log(`sendTip: sending tip to ${receiver}`)
      const result = await this.client.query({
        query: `
          mutation sendTip($receiver: String!) {
            sendTip(receiver: $receiver) {
              success
            }
          }
        `,
        token,
        variables: {
          receiver
        }
      })
      this.log(`sendTip: sent tip to ${receiver}`, result)
      const message: TipSent = {
        command: 'tip',
        data: {
          paymentPointer: receiver,
          amount,
          assetCode,
          assetScale
        }
      }
      this.api.tabs.sendMessage(tabId, message, { frameId: 0 })
      return { success: true }
    } catch (e) {
      this.log(`sendTip: error. msg=${e.message}`)
      return { success: false }
    }
  }

  private doPauseWebMonetization(frame: FrameSpec) {
    this.tabStates.logLastMonetizationCommand(frame, 'pause')
    const id = this.assoc.getStreamId(frame)
    if (id) {
      this.log('pausing stream', id)
      this.streams.pauseStream(id)
      this.sendSetMonetizationStateMessage(frame, 'stopped')
    }
    return true
  }

  private doResumeWebMonetization(frame: FrameSpec) {
    this.tabStates.logLastMonetizationCommand(frame, 'resume')

    const id = this.assoc.getStreamId(frame)
    if (id && !this.disabling.checkIsFrameDisabled(frame)) {
      this.log('resuming stream', id)
      this.sendSetMonetizationStateMessage(frame, 'pending')
      this.streams.resumeStream(id)
    }
    return true
  }

  pauseWebMonetization(request: PauseWebMonetization, sender: MessageSender) {
    const frame = getFrameSpec(sender)
    this.tabStates.setFrame(frame, { interactive: false })
    if (this.tabStates.get(frame.tabId).stickyState === 'sticky') {
      return
    }
    return this.doPauseWebMonetization(getFrameSpec(sender))
  }

  resumeWebMonetization(request: ResumeWebMonetization, sender: MessageSender) {
    const frame = getFrameSpec(sender)
    this.tabStates.setFrame(frame, { interactive: true })

    if (this.tabStates.get(frame.tabId).playState === 'paused') {
      return
    }
    return this.doResumeWebMonetization(getFrameSpec(sender))
  }

  private handleStreamsAbortEvent() {
    this.streams.on('abort', requestId => {
      this.log('aborting monetization request', requestId)
      const frame = this.assoc.getFrame(requestId)
      if (frame) {
        this.doStopWebMonetization(frame)
      }
    })
  }

  stopWebMonetization(sender: MessageSender) {
    const frame = getFrameSpec(sender)
    this.disabling.applyPaymentPointerBlocking(frame, null)
    this.tabStates.setFrame(frame, { monetizationDetails: null })
    return this.doStopWebMonetization(frame)
  }

  private doStopWebMonetization(frame: FrameSpec) {
    this.tabStates.logLastMonetizationCommand(frame, 'stop')
    const requestId = this.assoc.getStreamId(frame)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const closed = this._closeStreams(frame.tabId, frame.frameId)
    // May be noop other side if stop monetization was initiated from
    // ContentScript
    this.sendSetMonetizationStateMessage(frame, 'stopped', requestId)
    // TODO: why are/*were* we clearing the frame?
    // if (closed) {
    //   this.tabStates.clearFrame(frame)
    // }
    this.reloadTabState({
      from: 'stopWebMonetization'
    })
    return true
  }

  sendSetMonetizationStateMessage(
    { tabId, frameId }: FrameSpec,
    state: MonetizationState,
    requestId?: string
  ) {
    const message: SetMonetizationState = {
      command: 'setMonetizationState',
      data: {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        requestId: (this.assoc.getStreamId({ tabId, frameId }) ?? requestId)!,
        state
      }
    }
    this.api.tabs.sendMessage(tabId, message, { frameId })
  }

  _closeStreams(tabId: number, frameId?: number) {
    const streamIds = this.assoc.getTabStreams(tabId)
    const haveFrameId = typeof frameId !== 'undefined'

    let closed = 0
    if (streamIds) {
      Object.entries(streamIds).forEach(([innerFrameId, streamId]) => {
        if (haveFrameId && Number(innerFrameId) !== frameId) {
          return
        }

        this.log('closing stream with id', streamId)
        this.streams.closeStream(streamId)
        this.assoc.clearFrame(streamId)
        closed++
      })
      if (haveFrameId) {
        this.assoc.clearStream({ tabId, frameId: frameId as number })
      } else {
        this.assoc.clearTabStreams(tabId)
      }
    }
    return !!closed
  }

  // This feature is no longer used
  async isRateLimited() {
    return {
      limitExceeded: false
    }
  }

  private logout(_: MessageSender) {
    for (const tabId of this.tabStates.tabKeys()) {
      // Make a copy as _closeStreams mutates and we want to actually close
      // the streams before we set the state to stopped.
      const requestIds = { ...this.assoc.getTabStreams(tabId) }
      this._closeStreams(tabId)
      this.tabStates.clear(tabId)
      Object.entries(requestIds).forEach(([frameId, requestId]) => {
        // TODO: this is hacky, but should do the trick for now
        const message: SetMonetizationState = {
          command: 'setMonetizationState',
          data: { state: 'stopped', requestId }
        }
        this.api.tabs.sendMessage(tabId, message, { frameId: Number(frameId) })
      })
    }
    // Clear the token and any other state the popup relies upon
    // reloadTabState will reset them below.

    // Clear tokens in incognito windows too
    this.framesService.sendCommandToFramesMatching(
      { command: 'clearToken' },
      frame => frame.href?.startsWith(this.coilDomain)
    )
    this.storage.clear()
    this.tabStates.setIcon(this.activeTab, 'unavailable')
    this.reloadTabState()
    return true
  }

  private setStreamControls(request: SetStreamControls, _: MessageSender) {
    const tabId = this.activeTab
    this.log('setStreamControls', request)

    this.tabStates.set(tabId, {
      stickyState: request.data.sticky,
      playState: request.data.play
    })
    if (request.data.action === 'togglePlayOrPause') {
      const tabState = this.tabStates.get(tabId)
      const framesForTab = Object.keys(tabState.frameStates).map(Number)
      this.log({ framesForTab })
      if (request.data.play === 'paused') {
        framesForTab.forEach(frameId => {
          this.doPauseWebMonetization({ frameId, tabId })
        })
      } else if (request.data.play === 'playing') {
        framesForTab.forEach(frameId => {
          this.doResumeWebMonetization({ frameId, tabId })
        })
      }
    }
    this.reloadTabState({ from: request.command })
    return true
  }

  private contentScriptInit(request: ContentScriptInit, sender: MessageSender) {
    const { tabId, frameId, spec } = getFrameSpec(sender)
    // Content script used to send a stopWebMonetization message every time
    // it loaded. Noop if no stream for tab.
    this._closeStreams(tabId, frameId)
    this.tabStates.clearFrame(spec)
    this.reloadTabState({
      from: 'onTabsUpdated status === contentScriptInit'
    })
    return true
  }

  private async onFrameAllowedChanged(
    request: OnFrameAllowedChanged,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _: MessageSender
  ) {
    // Send message to all relevant frames in the tab
    const frames = [request.data.frame.frameId].concat(
      this.framesService.getChildren(request.data.frame).map(f => f.frameId)
    )
    frames.forEach(frameId => {
      const tabId = request.data.frame.tabId
      this.api.tabs.sendMessage(tabId, request, { frameId })
    })
  }

  private setDisabling(request: SetDisabling, sender: MessageSender) {
    const tabId = this.activeTab
    this.disabling.handleSetDisabling(tabId, request.data)
    this.reloadTabState({ from: 'setDisabling' })
  }
}
