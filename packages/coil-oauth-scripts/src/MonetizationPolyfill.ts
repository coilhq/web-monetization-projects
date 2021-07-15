import { Injector } from 'reduct'
import {
  MonetizationTagObserver,
  resolvePaymentEndpoint,
  StreamControl,
  watchPageEvents
} from '@webmonetization/polyfill-utils'

import { Stream } from './Stream'
import { getDoc } from './documentExtensions'
import { debug } from './logging'

export interface MonetizationPolyfillOpts {
  btpToken: string
  btpEndpoint?: string
}

export enum InitState {
  STOPPED,
  STARTED
}

export class MonetizationPolyfill {
  private btpToken!: string
  private btpEndpoint?: string
  private resolvedEndpoint!: string
  private requestId!: string
  private paymentPointer!: string

  private state: InitState = InitState.STOPPED
  private stream: Stream

  constructor(deps: Injector) {
    debug('MonetizationPolyfill constructor!')
    this.stream = deps(Stream)
  }

  init(opts: MonetizationPolyfillOpts): void {
    if (this.state === InitState.STARTED) {
      throw new Error('coil monetization polyfill has already been initialized')
    }

    if (!getDoc().monetization) {
      throw new Error(
        'document.monetization must be set outside of this script'
      )
    }

    if (getDoc().monetizationExtensionInstalled) {
      // TODO: better logging
      console.error('monetization enabled via extension; aborting')
      return
    }

    this.state = InitState.STARTED
    this.refreshBtpToken(opts.btpToken)
    this.btpEndpoint = opts.btpEndpoint

    const streamControl: StreamControl = {
      pause: async () => this.stream.pause(),
      resume: () => {
        const selector = 'meta[name="monetization"]'
        // We don't ever expect this state to occur
        // Consider it a precondition assertion
        if (!document.head.querySelector(selector)) {
          throw new Error(`invalid_state: no "${selector}" found`)
        }
        this.stream.start({
          paymentPointer: this.paymentPointer,
          requestId: this.requestId,
          pageUrl: window.location.href,
          btpToken: this.btpToken,
          btpEndpoint: this.btpEndpoint,
          spspEndpoint: this.resolvedEndpoint
        })
      }
    }

    // stop/resume based on page events
    const { clearWatch, setWatch } = watchPageEvents()

    const monitor = new MonetizationTagObserver(
      window,
      document,
      async ({ started, stopped }) => {
        debug({ started, stopped })
        if (stopped) {
          clearWatch()
          void this.stream.stop()
        }

        if (started) {
          // May throw an Error so do this before setWatch
          this.resolvedEndpoint = resolvePaymentEndpoint(started.paymentPointer)

          setWatch(streamControl)
          this.requestId = started.requestId
          this.paymentPointer = started.paymentPointer
          streamControl.resume()
        }
      }
    )

    monitor.startWhenDocumentReady()
  }

  refreshBtpToken(btpToken: string): void {
    if (btpToken == null) {
      throw new Error(`btpToken is null, is the user subscribed?`)
    }
    this.btpToken = btpToken
    this.stream.refreshBtpToken(btpToken)
  }
}
