import { EventEmitter } from 'events'

import { asyncUtils, PaymentScheduler } from '@webmonetization/polyfill-utils'
import { Connection } from 'ilp-protocol-stream'

import { Logger } from './utils'
import { ActiveTabLogger } from './ActiveTabLogger'

const { timeout } = asyncUtils
// The number of retries before giving up when stopping.
const STOP_RETRIES = 5

enum StreamLoopState {
  Done,
  Loop,
  Ending
}

export class StreamLoop extends EventEmitter {
  private state: StreamLoopState = StreamLoopState.Done
  private readonly schedule: PaymentScheduler
  private readonly debug: Logger
  private running = false // whether there is an active loop
  private connection?: Connection
  private tabLogger: ActiveTabLogger
  private requestId: string

  constructor(opts: {
    schedule: PaymentScheduler
    logger: Logger
    tabLogger: ActiveTabLogger
    requestId: string
  }) {
    super()
    this.schedule = opts.schedule
    this.debug = opts.logger
    this.tabLogger = opts.tabLogger
    this.requestId = opts.requestId
  }

  async run(
    attempt: (tokenFraction: number) => Promise<Connection>
  ): Promise<void> {
    this.state = StreamLoopState.Loop as StreamLoopState
    this.schedule.start()
    if (this.running) return // another 'run' loop is already active
    this.running = true
    let attempts = 0 // count of retry attempts when state=Ending
    while (this.state !== StreamLoopState.Done) {
      const isFirstMinute = this.schedule.totalSent() === 0
      let tokenPiece = 1.0
      const id = this.requestId.slice(0, 6)
      switch (this.state) {
        case StreamLoopState.Loop: // keep going; only pay full tokens
          // After the very first token payment, switch to post-payment.
          if (!isFirstMinute) {
            this.tabLogger.sendLogEvent(
              () => `StreamLoop:${id}:run:await-full-token waiting`
            )
            const hasToken = await this.schedule.awaitFullToken()
            this.tabLogger.sendLogEvent(
              () => `StreamLoop:${id}:run:await-full-token hasToken=${hasToken}`
            )
            if (!hasToken) continue // the wait was interrupted, likely because the stream was paused/stopped
          }
          break
        case StreamLoopState.Ending:
          tokenPiece = Math.min(this.schedule.unpaidTokens(), 1.0)
          tokenPiece = Math.floor(tokenPiece * 20) / 20 // don't pay tiny token pieces
          this.tabLogger.sendLogEvent(
            () => `StreamLoop:${id}:run:ending-state tokenPiece=${tokenPiece}`
          )
          if (tokenPiece === 0) {
            this.state = StreamLoopState.Done
            continue
          }
          break
      }
      try {
        const connection = (this.connection = await attempt(tokenPiece))
        await new Promise((resolve, reject) => {
          connection.once('close', resolve)
          connection.once('error', err => {
            if (!isExhaustedError(err)) {
              reject(err)
            } else {
              this.tabLogger.sendLogEvent(
                () =>
                  `StreamLoop:${id}:run:connection-error connection exhausted error`
              )
            }
          }) // "exhausted capacity" errors count as success
          // If `stop()` was called during `attempt()` and the first minute, don't wait for firstMinuteBandwidth to finish.
          if (this.state === StreamLoopState.Ending && isFirstMinute) {
            connection.destroy(new Error('monetization stopped during connect'))
          }
        })
        this.tabLogger.sendLogEvent(
          () => `StreamLoop:${id}:run:connection-finished error|close`
        )
        attempts = 0
      } catch (err) {
        this.emit('run:error', err)
        switch (this.state) {
          case StreamLoopState.Ending:
            if (++attempts === STOP_RETRIES) {
              this.tabLogger.sendLogEvent(
                () =>
                  `StreamLoop:${id}:run:catch too many errors, attempts=${attempt}`
              )
              this.debug('too many errors; giving up')
              this.state = StreamLoopState.Done
              break
            } // else fallthrough to delay
          case StreamLoopState.Loop:
            this.debug(
              'error streaming. retry in 2s. err=',
              err.message,
              err.stack
            )
            await timeout(2000)
            break
        }
      } finally {
        this.connection = undefined
      }
    }
    this.running = false
    this.emit('run:end')
  }

  async stop(): Promise<void> {
    await this._stop(StreamLoopState.Ending)
  }

  async pause(): Promise<void> {
    await this._stop(StreamLoopState.Done)
  }

  private async _stop(transitionState: StreamLoopState): Promise<void> {
    this.state = transitionState
    this.schedule.stop()
    // End the firstMinuteBandwidth payment quickly. Non-first-minute payment
    // already has called end(), so this does no harm.
    if (this.connection) void this.connection.end()
    if (this.running)
      await new Promise(resolve => this.once('run:end', resolve)) // wait for state=Done
  }
}

// Note: this does _not_ verify the error's digest, so the error may be forged.
export function isExhaustedError(err: any): boolean {
  return err['ilpReject']?.message === 'exhausted capacity.'
}
