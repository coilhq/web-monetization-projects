import { injectable } from 'inversify'

import { timeout } from '../util/timeout'
import { debug } from '../util/logging'

export interface PollForElementParams {
  selector: string
  everyMs: number
  times: number
}

@injectable()
export class DomService {
  constructor(private document: Document) {}

  async pollForElement<T extends HTMLElement = HTMLElement>({
    selector,
    everyMs,
    times
  }: PollForElementParams): Promise<T | null> {
    let polls = 0
    while (++polls <= times) {
      debug(`poll attempt ${polls} for ${JSON.stringify(selector)}`)
      const el = this.document.querySelector<T>(selector)
      if (el) {
        return el
      } else {
        await timeout(everyMs)
      }
    }
    return null
  }

  async documentReady() {
    if (this.document.readyState !== 'complete') {
      await new Promise(resolve => {
        this.document.addEventListener(
          'DOMContentLoaded',
          () => {
            resolve()
          },
          { once: true }
        )
      })
    }
  }
}
