import { inject, injectable } from 'inversify'

import { TabState } from '../../types/TabState'
import * as tokens from '../../types/tokens'
import { Colors } from '../consts/Colors'

import { TabOpener } from './TabOpener'
import { PopupIconService } from './PopupIconService'

import TabIconDetails = chrome.browserAction.TabIconDetails

type Action = (tab: chrome.tabs.Tab) => void

@injectable()
export class PopupBrowserAction {
  private readonly openLogin: () => void
  private disabled = false
  private ignoreDefaultToggling = false
  private action: Action | null = null
  // Just cache the last call, including the tab id, rather than a map of
  // {$tabId: $path} which would require bookkeeping. This does "enough"
  private lastSetIconCallArgs: TabIconDetails & { calls: number } = { calls: 0 }

  constructor(
    private tabOpener: TabOpener,
    private icons: PopupIconService,
    @inject(tokens.CoilDomain) private coilDomain: string,
    @inject(tokens.WextApi) private api = chrome
  ) {
    this.openLogin = this.tabOpener.opener(`${this.coilDomain}/login`)
    // disable popup if on android
    try {
      this.api.runtime.getPlatformInfo(result => {
        if (result?.os === 'android') {
          this.api.browserAction.setPopup({
            // See: https://bugzilla.mozilla.org/show_bug.cgi?id=1426484
            // Setting the popup to empty string which should allow onClicked
            // handlers to work is buggy on android firefox.
            // We work around this by setting a particular popup for android
            // which only uses chrome.tabs.create({url: 'coil.com/settings})
            popup: this.api.runtime.getURL('static/popupAndroid.html')
          })
          this.ignoreDefaultToggling = true
        }
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e)
    }
  }

  enable() {
    if (this.ignoreDefaultToggling) {
      return
    }
    this.clearAction()
    const api = this.api

    api.browserAction.setPopup({
      popup: api.runtime.getURL('/static/popup.html')
    })
    this.disabled = false
  }

  disable() {
    if (this.ignoreDefaultToggling || this.disabled) {
      return
    }
    this.setAction(this.openLogin)
    this.disabled = true
  }

  setDefaultInactive() {
    if (this.api.browserAction) {
      this.api.browserAction.setIcon({
        path: this.icons.getInactive()
      })
    }
  }

  setBrowserAction(tabId: number, state: TabState) {
    // In some strange cases on android these are not set
    const api = chrome // this.api

    if (api.browserAction.setIcon) {
      const args = {
        tabId,
        path: state?.icon?.path ?? this.icons.getInactive()
      }
      const changed =
        this.lastSetIconCallArgs.path !== args.path ||
        this.lastSetIconCallArgs.tabId !== args.tabId
      if (changed) {
        // Reset number of calls
        this.lastSetIconCallArgs.calls = 0
      }
      // It seems in some cases that are hard to determine, setIcon calls are
      // ignored, so the manifest declared default icon is seen instead.
      // Stop calling after the 10th call with the same tabId/path so the
      // network tab of devtools isn't littered with (*unworkable* amounts of)
      // related entries.
      if (changed || this.lastSetIconCallArgs.calls <= 10) {
        api.browserAction.setIcon(args)
        // We must ++prefix increment because we are copying
        this.lastSetIconCallArgs = {
          ...args,
          calls: ++this.lastSetIconCallArgs.calls
        }
      }
    }

    if (api.browserAction.setBadgeText) {
      api.browserAction.setBadgeText({
        tabId,
        text: state?.badge?.text ?? ''
      })
    }

    if (api.browserAction.setBadgeBackgroundColor) {
      api.browserAction.setBadgeBackgroundColor({
        tabId,
        color: state?.badge?.color ?? Colors.White
      })
    }
  }

  private setAction(action: Action) {
    this.clearAction()
    const api = this.api
    api.browserAction.setPopup({
      popup: ''
    })
    api.browserAction.onClicked.addListener(action)
    this.action = action
  }

  private clearAction() {
    if (this.action) {
      this.api.browserAction.onClicked.removeListener(this.action)
    }
  }
}
