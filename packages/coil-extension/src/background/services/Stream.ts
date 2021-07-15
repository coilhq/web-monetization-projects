import { EventEmitter } from 'events'

import {
  Connection,
  createConnection,
  DataAndMoneyStream
} from 'ilp-protocol-stream'
import IlpPluginBtp from 'ilp-plugin-btp'
import {
  getFarFutureExpiry,
  getSPSPResponse,
  PaymentDetails,
  PaymentScheduler,
  ScheduleMode,
  SPSPError,
  SPSPResponse
} from '@webmonetization/polyfill-utils'
import { Container, inject, injectable } from 'inversify'

import { notNullOrUndef } from '../../util/nullables'
import * as tokens from '../../types/tokens'
import { BTP_ENDPOINT, VERSION } from '../../webpackDefines'

import { AnonymousTokens } from './AnonymousTokens'
import { isExhaustedError, StreamLoop } from './StreamLoop'
import { Logger, logger } from './utils'
import { ActiveTabLogger } from './ActiveTabLogger'

// The number of seconds to pay immediately on page load.
const INITIAL_SEND_SECONDS = 5

const BTP_AUTH_FLAGS = {
  client_type: 'extension',
  client_version: VERSION.version,
  client_built: VERSION.buildDateISO
}

// @sharafian explained to me that the extension popup shows source amounts,
// while the web-monetization-scripts which use the monetizationprogress
// event show received amounts.
export interface StreamMoneyEvent {
  /**
   * Currently means packet number for a given StreamAttempt.
   * Could change.
   */
  packetNumber: number

  // requestId
  requestId: string
  paymentPointer: string
  initiatingUrl: string

  msSinceLastPacket: number
  sentAmount: string

  // dest=received
  amount: string
  assetCode: string
  assetScale: number

  // source=source
  sourceAmount: string
  sourceAssetCode: string
  sourceAssetScale: number

  receipt?: string
}

@injectable()
export class Stream extends EventEmitter {
  private readonly _requestId: string
  private readonly _spspUrl: string
  private readonly _paymentPointer: string
  private readonly _authToken: string
  private readonly _server: string
  private readonly _initiatingUrl: string

  private _lastOutgoingMs!: number
  private _lastDelivered = 0
  private _packetNumber!: number
  private _paying = false
  private readonly _anonTokens: AnonymousTokens

  private _assetCode = ''
  private _assetScale = 0
  private _exchangeRate = 1
  private readonly _schedule: PaymentScheduler = new PaymentScheduler(
    ScheduleMode.PostPay
  )

  private readonly loop: StreamLoop
  private isPaused = false

  constructor(
    @logger('Stream')
    private readonly _debug: Logger,
    private tabLogger: ActiveTabLogger,
    private container: Container,
    @inject(tokens.StreamDetails)
    {
      requestId,
      spspEndpoint,
      paymentPointer,
      token,
      initiatingUrl
    }: PaymentDetails & {
      token: string
      spspEndpoint: string
      initiatingUrl: string
    }
  ) {
    super()
    this._paymentPointer = paymentPointer
    this._requestId = requestId
    this._spspUrl = spspEndpoint
    this._authToken = token
    this._anonTokens = container.get(AnonymousTokens)
    this._initiatingUrl = initiatingUrl
    this.loop = new StreamLoop({
      tabLogger: this.tabLogger,
      logger: this._debug,
      schedule: this._schedule,
      requestId: this._requestId
    })
    this.loop.on('run:error', (_err: Error) => (this._paying = false))

    const server = new URL(container.get(tokens.CoilDomain))
    server.pathname = '/btp'
    this._server = server.href.replace(/^http/, 'btp+ws')
    if (BTP_ENDPOINT) {
      this._server = BTP_ENDPOINT
    }
  }

  loops = 0

  async start(): Promise<void> {
    // reset this upon every start *before* early exit while looping
    this._packetNumber = 0
    this.isPaused = false
    const id = this._requestId.slice(0, 6)

    await this.loop.run(async (tokenFraction: number): Promise<Connection> => {
      this.loops++
      this.tabLogger.sendLogEvent(
        () => `Stream:${id}:start:get-spsp-details, loops=${this.loops}`
      )
      const spspDetails = await this._getSPSPDetails()
      this.tabLogger.sendLogEvent(
        () =>
          `Stream:${id}:start:spsp-details-response, details=${JSON.stringify(
            spspDetails
          )}`
      )
      const redeemedToken = await this._anonTokens.getToken(this._authToken)
      this._debug('redeemed token with throughput=%d', redeemedToken.throughput)
      this.tabLogger.sendLogEvent(
        () =>
          `Stream:${id}:start: redeemed token with throughput=${redeemedToken.throughput}`,
        { throughput: redeemedToken.throughput }
      )
      this._lastDelivered = 0
      this.tabLogger.sendLogEvent(() => `Stream:${id}:start: making plugin`)
      const plugin = this._makePlugin(redeemedToken.btpToken)
      this.tabLogger.sendLogEvent(
        () => `Stream:${id}:start creating connection loops=${this.loops}`
      )
      const connection = await createConnection({
        ...spspDetails,
        plugin,
        slippage: 1.0,
        exchangeRate: 1.0,
        maximumPacketAmount: '10000000',
        getExpiry: getFarFutureExpiry
      })
      this.tabLogger.sendLogEvent(
        () => `Stream:${id}:start connected loops=${this.loops}`
      )
      const stream = connection.createStream()

      const onMoney = (sentAmount: string) => {
        // Wait until `setImmediate` so that `connection.totalDelivered` has been updated.
        const receipt = stream.receipt?.toString('base64')
        setImmediate(() => {
          this.onMoney(connection, sentAmount, receipt)
          const secsThroughput = Number(sentAmount) / redeemedToken.throughput
          const rate =
            Number(connection.totalDelivered) / Number(connection.totalSent)
          this.tabLogger.sendLogEvent(
            () => {
              return `Stream:${id}:onMoney secsThroughput=${secsThroughput} sentAmount=${sentAmount}, rate=${rate}`
            },
            { rate }
          )
        })
      }
      stream.on('outgoing_money', onMoney)

      connection.on('error', async e => {
        // Delete exhausted tokens from localstorage.
        this._debug('stream connection error; err=%s', e.message)
        if (!isExhaustedError(e)) return
        if (
          !e.ilpReject?.data.equals(
            await sha256(Buffer.from(redeemedToken.btpToken))
          )
        )
          return
        this._anonTokens.removeToken(redeemedToken.btpToken)
      })

      connection.once('close', () => {
        stream.removeListener('outgoing_money', onMoney)
        // Cap paid tokens at 1.0 -- partial payment in flat-stacks may cause
        // client-apparent overpayment (even though no overpayment occurred).
        this._schedule.onSent(
          Math.min(1.0, +connection.totalSent / redeemedToken.throughput / 60)
        )
        this._debug(
          'connection closing; totalSent=%d sendMax=%d',
          +connection.totalSent / redeemedToken.throughput,
          stream.sendMax
        )
      })

      // noinspection ES6MissingAwait
      void (async () => {
        this.tabLogger.sendLogEvent(
          `schedule.totalSent() = ${this._schedule.totalSent()}`
        )
        if (this._schedule.totalSent() === 0) {
          await firstMinuteBandwidth(
            id,
            this.tabLogger,
            stream,
            redeemedToken.throughput
          )
        } else {
          const sendMax = tokenFraction * 60 * redeemedToken.throughput
          this._debug(
            'setSendMax tokenFraction=%d sendMax=%d',
            tokenFraction,
            sendMax
          )
          stream.setSendMax(sendMax)
        }

        let timer: NodeJS.Timer | undefined
        // This timeout must match (or exceed) the packet timeout, otherwise the
        // extension may try to reconnect & send packets while old packets are still
        // in-flight farther upstream.
        const waitTime = new Promise(
          (_, reject) =>
            (timer = setTimeout(() => reject(new Error('timeout')), 30e3))
        )
        // On error, destroy() was called internally by ilp-stream.
        // Resolving here isn't necessary, but it prevents an extraneous destroy() call.
        const waitFail = new Promise(resolve =>
          connection.once('error', resolve)
        )
        await Promise.race([waitFail, waitTime, connection.end()])
          .finally(() => {
            if (timer) clearTimeout(timer)
          })
          .catch(async (err): Promise<void> => {
            this._debug(
              'stream.end failed, destroying connection err=%s',
              err.message
            )
            return connection.destroy(err) // ensure the connection is closed
          })
      })()
      return connection
    })
    this._paying = false
  }

  isPaying(): boolean {
    return this._paying
  }

  hasPaidAny(): boolean {
    return !!this._lastOutgoingMs
  }

  private _makePlugin(btpToken: string): IlpPluginBtp {
    return new IlpPluginBtp({
      server: this._server,
      btpToken,
      btpAuthFlags: BTP_AUTH_FLAGS
    })
  }

  private async _getSPSPDetails(): Promise<SPSPResponse> {
    this._debug('fetching spsp details. url=', this._spspUrl)
    return getSPSPResponse(this._spspUrl, this._requestId).catch(e => {
      if (e instanceof SPSPError) {
        const status = e.response?.status
        // Abort on Bad Request 4XX
        if (!status || (status >= 400 && status < 500)) {
          this.abort()
        }
      }
      throw e
    })
  }

  private onMoney(
    connection: Connection,
    sentAmount: string,
    receipt?: string
  ): void {
    const now = Date.now()
    const delivered = +connection.totalDelivered
    const amount = delivered - this._lastDelivered
    this._debug('delivered', delivered, 'lastDelivered', this._lastDelivered)
    this._lastDelivered = delivered
    if (amount <= 0) return
    this._paying = true

    const event: StreamMoneyEvent = {
      sentAmount,
      paymentPointer: this._paymentPointer,
      packetNumber: this._packetNumber++,
      requestId: this._requestId,
      initiatingUrl: this._initiatingUrl,
      msSinceLastPacket: now - this._lastOutgoingMs,
      // dest=received
      amount: amount.toString(),
      assetCode: (this._assetCode = notNullOrUndef(
        connection.destinationAssetCode
      )),
      assetScale: (this._assetScale = notNullOrUndef(
        connection.destinationAssetScale
      )),
      receipt,
      // source=source
      sourceAmount: sentAmount,
      sourceAssetCode: connection.sourceAssetCode,
      sourceAssetScale: connection.sourceAssetScale
    }
    this._lastOutgoingMs = now
    this._exchangeRate =
      (amount / Number(event.sourceAmount)) *
      (10 ** event.assetScale / 10 ** event.sourceAssetScale)
    this.emit('money', event)
  }

  async stop(): Promise<void> {
    if (this.isPaused) {
      void this.start()
      this.isPaused = false
    }
    return this.loop.stop()
  }

  async pause(): Promise<void> {
    this.isPaused = true
    return this.loop.pause()
  }

  async resume(): Promise<void> {
    this.isPaused = false
    return this.start()
  }

  // Don't call this.stop() directly, let BackgroundScript orchestrate the stop.
  private async abort() {
    this.emit('abort', this._requestId)
  }

  getPaymentPointer() {
    return this._paymentPointer
  }

  getAssetDetails() {
    return {
      assetCode: this._assetCode,
      assetScale: this._assetScale,
      exchangeRate: this._exchangeRate
    }
  }
}

/**
 * TODO: what happens if this is commenced with a token that won't last
 *       1 minute ?
 */
async function firstMinuteBandwidth(
  requestId: string,
  logger: ActiveTabLogger,
  stream: DataAndMoneyStream,
  throughput: number
): Promise<void> {
  // Begin paying immediately so the page knows that the user agent is monetized.
  // The initial amount is low to ensure the user doesn't deplete their balance by
  // browsing quickly from page-to-page.
  // This is the only monetization that is prepaid, everything else is post-paid.
  const sendMax = INITIAL_SEND_SECONDS * throughput
  stream.setSendMax(sendMax)
  const id = requestId.slice(0, 6)
  logger.sendLogEvent(
    () => `firstMinuteBandwidth:${id}: set sendMax ${sendMax}`,
    { firstMinuteStarted: Date.now() }
  )

  let timer: number | undefined
  let stopped = false
  let cancelTimer = () => {}
  stream.on('close', (): void => {
    // on close, early-exit from the bandwidth loop
    stopped = true
    if (timer) clearTimeout(timer)
    logger.sendLogEvent(() => `firstMinuteBandwidth:${id}: cancelTimer`)
    cancelTimer()
  })

  // NOTE: in practice these times are offset from the CONNECTION time, NOT
  // the time on the page.
  // At least in testing it takes around 3.5-7 seconds to connect and send
  // the first 10 second below, wont happen until 13 seconds.
  // It will pay another 5 seconds worth
  // Should these times actually be counted from when on the page?
  // where when on the page == from when the monetization tag was found ?

  let lastTime = 0 // seconds
  for (const time of [
    // another 5 seconds worth
    10,
    // another 20 seconds worth
    30,
    // another 30 seconds worth
    60
  ]) {
    const delay = (time - lastTime) * 1e3 // milliseconds
    lastTime = time
    logger.sendLogEvent(() => `firstMinuteBandwidth:${id}: waiting ${delay}`)
    await new Promise<void>(
      resolve => (timer = window.setTimeout((cancelTimer = resolve), delay))
    )
    logger.sendLogEvent(() => `firstMinuteBandwidth:${id}: waited ${delay}`)
    if (stopped) return
    stream.setSendMax(time * throughput)
  }
}

async function sha256(preimage: Buffer): Promise<Buffer> {
  return Buffer.from(await crypto.subtle.digest({ name: 'SHA-256' }, preimage))
}
