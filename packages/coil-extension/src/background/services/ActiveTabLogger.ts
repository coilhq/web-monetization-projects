import { inject, injectable } from 'inversify'

import * as tokens from '../../types/tokens'

import { TabStates } from './TabStates'

@injectable()
export class ActiveTabLogger {
  sendLogs = false
  sendLogEvents = true

  constructor(
    private tabStates: TabStates,
    @inject(tokens.WextApi)
    private api = chrome
  ) {}

  log(log: string) {
    if (!this.sendLogs) {
      return
    }
    this.api.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs[0]
      if (tab?.id != null) {
        const message = {
          command: 'logInActiveTab',
          data: {
            log: log
          }
        }
        this.api.tabs.sendMessage(tab.id, message)
      }
    })
  }

  sendLogEvent(message: string | (() => string), extra: any = {}) {
    const active = this.tabStates.activeTab
    if (active && this.sendLogEvents) {
      if (typeof message !== 'string') {
        message = message()
      }
      // language=JavaScript
      const code = `
        document.dispatchEvent(new CustomEvent('coil_log',
          { detail: { message: ${JSON.stringify(
            message
          )}, extra: ${JSON.stringify(extra)} } }))
      `
      this.api.tabs.executeScript(active, { frameId: 0, code: code }, () => {
        console.log('ERROR', this.api.runtime.lastError)
      })
    }
  }
}
