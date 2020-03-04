import MessageSender = chrome.runtime.MessageSender
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
  ClosePopup,
  ContentScriptInit,
  MonetizationProgress,
  MonetizationStart,
  PauseWebMonetization,
  ResumeWebMonetization,
  SetMonetizationState,
  SetStreamControls,
  StartWebMonetization,
  ToBackgroundMessage
} from '../../types/commands'
import { LocalStorageProxy } from '../../types/storage'
import { TabState } from '../../types/TabState'

import { StreamMoneyEvent } from './Stream'
import { AuthService } from './AuthService'
import { TabStates } from './TabStates'
import { Streams } from './Streams'
import { Favicons } from './Favicons'
import { PopupBrowserAction } from './PopupBrowserAction'
import { Logger, logger } from './utils'
import { YoutubeService } from './YoutubeService'

function getTab(sender: { tab?: { id?: number } }) {
  return notNullOrUndef(notNullOrUndef(sender.tab).id)
}

@injectable()
export class BackgroundScript {
  tabsToStreams: { [tab: number]: string } = {}
  streamsToTabs: { [stream: string]: number } = {}

  constructor(
    private popup: PopupBrowserAction,
    private favIcons: Favicons,
    private streams: Streams,
    private tabStates: TabStates,
    private storage: StorageService,
    @inject(tokens.LocalStorageProxy)
    private store: LocalStorageProxy,
    private auth: AuthService,
    private youtube: YoutubeService,

    @logger('BackgroundScript')
    private log: Logger,

    private client: GraphQlClient,
    @inject(tokens.WextApi)
    private api: typeof window.chrome,
    @inject(tokens.CoilDomain)
    private coilDomain: string
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
    this.setTabsOnUpdatedListener()
    this.routeStreamsMoneyEventsToContentScript()
    this.handleStreamsAbortEvent()
    void this.auth.getTokenMaybeRefreshAndStoreState()
  }

  private setTabsOnActivatedListener() {
    // The active tab has been changed
    this.api.tabs.onActivated.addListener(activeInfo => {
      this.activeTab = activeInfo.tabId
      this.reloadTabState({ from: 'onActivated' })
    })
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
          const ignored = chrome.runtime.lastError
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
      this._closeStream(tabId)
    })
  }

  private setTabsOnUpdatedListener() {
    // Reset tab state and content script when tab changes location
    // Note: this actually runs as the pages loads as well as changes
    this.api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const { status } = changeInfo
      // Always get the url from the tab
      const { url } = tab

      if (status === 'loading') {
        this.setCoilUrlForPopupIfNeeded(tabId, url)
      }

      if (status === 'complete') {
        this.setCoilUrlForPopupIfNeeded(tabId, url)
        const from =
          `onTabsUpdated directly, windowId=${tab.windowId}, ` +
          `tab=${JSON.stringify(tab)}, ` +
          `status===complete, changeInfo=${JSON.stringify(changeInfo)}`
        // Unfortunately this event handler is run for all windows/iframes in
        // a given tab so we send the url and, inter alia, abort when the url
        // is not the same. Extremely unlikely, but likely harmless if an url
        // includes itself as an iframe hall-of-mirrors styles.
        const message: CheckAdaptedContent = {
          command: 'checkAdaptedContent',
          data: { from, url }
        }
        this.log('sending checkAdaptedContent message', message)
        this.api.tabs.sendMessage(tabId, message)
      }
    })
  }

  private routeStreamsMoneyEventsToContentScript() {
    // pass stream monetization events to the correct tab
    this.streams.on('money', (details: StreamMoneyEvent) => {
      const tab = this.streamsToTabs[details.requestId]
      if (details.packetNumber === 0) {
        const message: MonetizationStart = {
          command: 'monetizationStart',
          data: {
            paymentPointer: details.paymentPointer,
            requestId: details.requestId
          }
        }
        this.api.tabs.sendMessage(tab, message)
      }

      const message: MonetizationProgress = {
        command: 'monetizationProgress',
        data: {
          paymentPointer: details.paymentPointer,
          amount: details.amount,
          assetCode: details.assetCode,
          requestId: details.requestId,
          assetScale: details.assetScale,
          sentAmount: details.sentAmount
        }
      }
      this.handleMonetizedSite(tab, details.initiatingUrl, details)
      this.api.tabs.sendMessage(tab, message)
      this.savePacketToHistoryDb(details)
    })
  }

  private savePacketToHistoryDb(_: StreamMoneyEvent) {
    // this.db.incrementSite(details)
  }

  private setBrowserActionStateFromAuthAndTabState() {
    const token = this.auth.getStoredToken()

    if (!token || !this.store.validToken) {
      this.popup.disable()
    }

    const tabId = this.activeTab

    if (tabId) {
      const tabState = this.tabStates.getActiveOrDefault()

      if (tabState.monetized) {
        this.tabStates.setIcon(tabId, 'monetized')
      }

      if (token == null) {
        this.tabStates.setIcon(tabId, 'unavailable')
      } else if (token) {
        this.popup.enable()

        const tabState = this.tabStates.getActiveOrDefault()
        const hasStream = tabState.monetized
        const hasBeenPaid = hasStream && tabState.total > 0

        if (hasStream) {
          this.tabStates.setIcon(tabId, 'monetized')
          if (hasBeenPaid) {
            const state =
              tabState.playState === 'playing'
                ? 'streaming'
                : 'streaming-paused'
            this.tabStates.setIcon(tabId, state)
          }
        } else {
          this.tabStates.setIcon(tabId, 'inactive')
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
      case 'logout':
        sendResponse(this.logout(sender))
        break
      case 'adaptedSite':
        this.adaptedSite(request.data)
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
    this.reloadTabState({ from: 'setCoilUrlForPopupIfNeeded' })
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

  setTabMonetized(tab: number, senderUrl: string, total?: number) {
    const tabState = this.tabStates.get(tab)

    this.tabStates.set(tab, {
      monetized: true,
      total: total || tabState.total || 0
    })

    if (this.activeTab === tab) {
      this.reloadTabState()
    }

    // Channel image is provided if site is adapted
    if (this.storage.getBoolean('adapted')) {
      // Load favicon from this.runTime

      const { host } = new URL(senderUrl)
      this.favIcons
        .getFavicon(host)
        .then(favicon => {
          this.tabStates.set(tab, { favicon })
        })
        .catch(e => {
          console.error('failed to fetch favicon. e=' + e.stack)
        })
    }
  }

  mayMonetizeSite(sender: MessageSender) {
    if (!sender.tab) return
    this.setTabMonetized(
      notNullOrUndef(sender.tab.id),
      notNullOrUndef(sender.tab.url)
    )
    return true
  }

  handleMonetizedSite(
    tab: number,
    url: string,
    packet: { sentAmount: string }
  ) {
    const tabState = this.tabStates.get(tab)
    const tabTotal = (tabState && tabState.total) || 0
    const newTabTotal = tabTotal + Number(packet?.sentAmount ?? 0)
    this.setTabMonetized(tab, url, newTabTotal)
  }

  adaptedSite(data: AdaptedSite['data']) {
    this.tabStates.set(this.activeTab, {
      adapted: data.state,
      favicon: data.channelImage
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
    state && state.coilSite
      ? this.storage.set('coilSite', state.coilSite)
      : this.storage.remove('coilSite')
    this.storage.set('adapted', Boolean(state && state.adapted))
    state && state.monetized
      ? this.storage.set('monetized', true)
      : this.storage.remove('monetized')

    if (state && state.playState && state.stickyState) {
      this.store.playState = state.playState
      this.store.stickyState = state.stickyState
    } else if (state) {
      delete this.store.playState
      delete this.store.stickyState
    }

    this.storage.set('monetizedTotal', (state && state.total) || 0)
    this.storage.set(
      'monetizedFavicon',
      (state && state.favicon) || '/res/icon-page.svg'
    )
  }

  async startWebMonetization(
    request: StartWebMonetization,
    sender: MessageSender
  ) {
    const tab = getTab(sender)
    this.tabStates.logLastMonetizationCommand(tab, 'start')
    // This used to be sent from content script as a separate message
    this.mayMonetizeSite(sender)

    // This may throw so do after mayMonetizeSite has had a chance to set
    // the page as being monetized (or attempted to be)
    const spspEndpoint = resolvePaymentEndpoint(request.data.paymentPointer)

    const userBeforeReAuth = this.store.user
    let emittedPending = false
    const emitPending = () =>
      this.sendSetMonetizationStateMessage(tab, 'pending')

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
      console.warn('startWebMonetization cancelled; no token')
      this.sendSetMonetizationStateMessage(tab, 'stopped')
      return false
    }
    if (!this.store.user?.subscription?.active) {
      this.sendSetMonetizationStateMessage(tab, 'stopped')
      this.log('startWebMonetization cancelled; no active subscription')
      return false
    }

    if (!emittedPending) {
      emitPending()
    }

    const lastCommand = this.tabStates.get(tab).lastMonetization.command
    if (lastCommand !== 'start') {
      this.log('startWebMonetization cancelled via', lastCommand)
      return false
    }

    this.log('starting stream', requestId)
    this.tabsToStreams[tab] = requestId
    this.streamsToTabs[requestId] = tab
    this.streams.beginStream(requestId, {
      token,
      spspEndpoint,
      ...request.data,
      initiatingUrl: request.data.initiatingUrl
    })

    return true
  }

  private async sendTip() {
    const tab = this.activeTab
    const stream = this.streams.getStream(this.tabsToStreams[tab])
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
      return { success: true }
    } catch (e) {
      this.log(`sendTip: error. msg=${e.message}`)
      return { success: false }
    }
  }

  private doPauseWebMonetization(tab: number) {
    this.tabStates.logLastMonetizationCommand(tab, 'pause')
    const id = this.tabsToStreams[tab]
    if (id) {
      this.log('pausing stream', id)
      this.streams.pauseStream(id)
      this.sendSetMonetizationStateMessage(tab, 'stopped')
    }
    return true
  }

  private doResumeWebMonetization(tab: number) {
    this.tabStates.logLastMonetizationCommand(tab, 'resume')

    const id = this.tabsToStreams[tab]
    if (id) {
      this.log('resuming stream', id)
      this.sendSetMonetizationStateMessage(tab, 'pending')
      this.streams.resumeStream(id)
    }
    return true
  }

  // TODO: this won't handle iframes
  pauseWebMonetization(request: PauseWebMonetization, sender: MessageSender) {
    if (this.tabStates.get(getTab(sender)).stickyState === 'sticky') {
      return
    }
    return this.doPauseWebMonetization(getTab(sender))
  }

  resumeWebMonetization(request: ResumeWebMonetization, sender: MessageSender) {
    if (this.tabStates.get(getTab(sender)).playState === 'paused') {
      return
    }
    return this.doResumeWebMonetization(getTab(sender))
  }

  private handleStreamsAbortEvent() {
    this.streams.on('abort', requestId => {
      this.log('aborting monetization request', requestId)
      const tab = this.streamsToTabs[requestId]
      if (tab) {
        this.doStopWebMonetization(tab)
      }
    })
  }

  stopWebMonetization(sender: MessageSender) {
    const tab = getTab(sender)
    return this.doStopWebMonetization(tab)
  }

  private doStopWebMonetization(tab: number) {
    this.tabStates.logLastMonetizationCommand(tab, 'stop')
    const requestId = this.tabsToStreams[tab]
    const closed = this._closeStream(tab)
    // May be noop other side if stop monetization was initiated from
    // ContentScript
    this.sendSetMonetizationStateMessage(tab, 'stopped', requestId)
    // clear the tab state, and set things to default
    // no need to send checkAdaptedContent message to check for adapted sites as
    // that will happen automatically on url change (html5 push state also)
    // via the tabs.onUpdated
    if (closed) {
      this.tabStates.clear(tab)
    }
    this.reloadTabState({
      from: 'stopWebMonetization'
    })
    return true
  }

  sendSetMonetizationStateMessage(
    tabId: number,
    state: MonetizationState,
    requestId?: string
  ) {
    const message: SetMonetizationState = {
      command: 'setMonetizationState',
      data: {
        requestId: this.tabsToStreams[tabId] ?? requestId,
        state
      }
    }
    this.api.tabs.sendMessage(tabId, message)
  }

  _closeStream(tabId: number) {
    const streamId = this.tabsToStreams[tabId]
    if (streamId) {
      this.log('closing stream with id', streamId)
      this.streams.closeStream(streamId)
      delete this.streamsToTabs[streamId]
      delete this.tabsToStreams[tabId]
    }
    return !!streamId
  }

  // This feature is no longer used
  async isRateLimited() {
    return {
      limitExceeded: false
    }
  }

  private logout(_: MessageSender) {
    for (const tabId of this.tabStates.tabKeys()) {
      const requestId = this.tabsToStreams[tabId]
      this._closeStream(tabId)
      this.tabStates.clear(tabId)
      // TODO: this is hacky, but should do the trick for now
      const message: SetMonetizationState = {
        command: 'setMonetizationState',
        data: { state: 'stopped', requestId }
      }
      this.api.tabs.sendMessage(tabId, message)
    }
    // Clear the token and any other state the popup relies upon
    // reloadTabState will reset them below.
    this.storage.clear()
    this.tabStates.setIcon(this.activeTab, 'unavailable')
    this.reloadTabState()
    return true
  }

  private setStreamControls(request: SetStreamControls, _: MessageSender) {
    const tab = this.activeTab
    this.tabStates.set(tab, {
      stickyState: request.data.sticky,
      playState: request.data.play
    })
    if (request.data.action === 'togglePlayOrPause') {
      if (request.data.play === 'paused') {
        this.doPauseWebMonetization(tab)
      } else if (request.data.play === 'playing') {
        this.doResumeWebMonetization(tab)
      }
    }
    this.reloadTabState({ from: request.command })
    return true
  }

  private contentScriptInit(request: ContentScriptInit, sender: MessageSender) {
    const tabId = getTab(sender)
    // Content script used to send a stopWebMonetization message every time
    // it loaded. Noop if no stream for tab.
    this._closeStream(tabId)
    this.tabStates.clear(tabId)
    this.reloadTabState({
      from: 'onTabsUpdated status === contentScriptInit'
    })
    return true
  }
}
