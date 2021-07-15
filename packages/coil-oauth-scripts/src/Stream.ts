/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { EventEmitter } from 'events'

import PluginBtp from 'ilp-plugin-btp'
import * as IlpStream from 'ilp-protocol-stream'
import { Injector } from 'reduct'
import {
  BackoffWaiter,
  getFarFutureExpiry,
  getSPSPResponse,
  PaymentScheduler,
  ScheduleMode,
  SPSPResponse
} from '@webmonetization/polyfill-utils'
import {
  MonetizationProgressEvent,
  MonetizationState
} from '@webmonetization/types'
import type { PackageVersion } from '@coil/webpack-utils'

import { DocumentMonetization } from './DocumentMonetization'
import { debug } from './logging'

declare const OAUTH_SCRIPTS_VERSION: PackageVersion

export interface StreamStartOpts {
  btpToken: string
  btpEndpoint?: string
  spspEndpoint: string
  paymentPointer: string
  pageUrl: string
  requestId: string
}

const BTP_ENDPOINT_DEFAULT = 'btp+wss://coil.com/btp'
// The number of seconds to pay immediately on page load.
const INITIAL_SEND_SECONDS = 5

const BTP_AUTH_FLAGS = {
  client_type: 'oauth_scripts',
  client_version: OAUTH_SCRIPTS_VERSION.version,
  client_built: OAUTH_SCRIPTS_VERSION.buildDateISO
}

export class Stream {
  // StreamStartOpts ...
  // TODO: one field
  private requestId?: string
  private spspEndpoint?: string
  private btpToken?: string
  private btpEndpoint = BTP_ENDPOINT_DEFAULT
  private paymentPointer?: string
  private pageUrl?: string

  private state: MonetizationState = 'stopped'
  private active = false

  private activeChanges: EventEmitter = new EventEmitter()
  private backoff = new BackoffWaiter()
  private lastDelivered = 0
  private loop: Promise<void> | null = null
  private existing?: Promise<void>

  private readonly monetization: DocumentMonetization
  private readonly schedule: PaymentScheduler = new PaymentScheduler(
    ScheduleMode.PrePay
  )

  private totalSentWatermark = 0 // tokens

  refreshBtpToken(btpToken: string) {
    this.btpToken = btpToken
  }

  constructor(deps: Injector) {
    this.monetization = new DocumentMonetization(document)
  }

  async start(opts: StreamStartOpts) {
    await this.finalizeExisting()
    this.active = true
    this.btpToken = opts.btpToken
    this.btpEndpoint = opts.btpEndpoint || BTP_ENDPOINT_DEFAULT
    this.requestId = opts.requestId
    this.paymentPointer = opts.paymentPointer
    this.spspEndpoint = opts.spspEndpoint
    this.pageUrl = opts.pageUrl
    this.monetization.setMonetizationRequest({
      paymentPointer: opts.paymentPointer,
      requestId: opts.requestId
    })
    this.schedule.start()

    if (!this.loop) {
      this.loop = this.streamRetryLoop()
    }
    this.activeChanges.emit('start')
  }

  async finalizeExisting() {
    if (this.existing) {
      try {
        await this.existing
      } catch (e) {
        //
      } finally {
        this.existing = undefined
      }
    }
  }

  async stop(finalized = true) {
    this.schedule.stop()
    this.active = false
    this.setState({ state: 'stopped', finalized })
    if (finalized) {
      this.monetization.setMonetizationRequest(undefined)
    }
    this.activeChanges.emit('stop')
  }

  isActive() {
    return this.active
  }

  private async streamRetryLoop(): Promise<void> {
    if (!this.spspEndpoint) {
      throw new Error('no spspEndpoint; was init called?')
    }

    if (!this.requestId) {
      throw new Error('no streamId; was init called?')
    }

    this.setState({ state: 'pending' })
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!this.isActive()) {
        this.setState({ state: 'stopped' })
        await new Promise(resolve => this.activeChanges.once('start', resolve))
        this.setState({
          state: this.schedule.totalSent() === 0 ? 'pending' : 'started'
        })
      }
      if (0 < this.schedule.totalSent()) {
        await this.schedule.awaitFullToken()
      }

      try {
        // await this.finalizeExisting()
        debug('Start streamPayment()')
        const promise = (this.existing = this.streamPayment(
          await getSPSPResponse(this.spspEndpoint, this.requestId)
        ))
        await promise
        debug('End streamPayment()')
      } catch (e) {
        // TODO: a way to toggle this?
        console.error(`streaming error; retry in ${this.backoff} ms. error=`, e)
        await this.backoff.waitAndBackoff()
      }
    }
  }

  private async streamPayment(details: SPSPResponse): Promise<void> {
    if (!this.btpToken) {
      throw new Error('no btpToken; was init called?')
    }
    if (!this.isActive()) {
      return
    }

    const throughput = btpTokenThroughput(this.btpToken)
    const plugin = new PluginBtp({
      server: this.btpEndpoint,
      btpToken: this.btpToken,
      btpAuthFlags: BTP_AUTH_FLAGS
    })

    let connection: IlpStream.Connection | undefined
    let sendTokens = 0
    try {
      await plugin.connect()
      this.backoff.reset()
      if (!this.isActive()) return

      connection = await IlpStream.createConnection({
        plugin,
        slippage: 1.0,
        exchangeRate: 1.0,
        maximumPacketAmount: '10000000',
        ...details,
        getExpiry: getFarFutureExpiry
      })
      if (!this.isActive()) return

      const stream = connection.createStream()
      stream.on('outgoing_money', (_sentAmount: string) => {
        const receipt = stream.receipt
          ? stream.receipt.toString('base64')
          : undefined
        // Wait for totalDelivered to update.
        setImmediate(() =>
          this.onOutgoingMoney(connection as IlpStream.Connection, receipt)
        )
      })

      if (0 < this.schedule.totalSent()) {
        sendTokens = this.schedule.sendMax() - this.totalSentWatermark
        await stream.sendTotal(throughput * 60 * sendTokens)
        // Wait for totalDelivered to update.
        await new Promise(resolve => setImmediate(resolve))
      } else {
        sendTokens = 1
        await firstMinuteBandwidth(stream, throughput)
      }
      stream.removeAllListeners('outgoing_money')
    } finally {
      if (connection) {
        const sentTokens = +connection.totalSent / throughput / 60
        // Cap paid tokens -- partial payment in flat-stacks may cause
        // client-visible overpayment (even though no overpayment occurred).
        this.schedule.onSent(Math.min(sendTokens, sentTokens))
      }
      this.lastDelivered = 0
      this.totalSentWatermark = this.schedule.totalSent()
      try {
        if (connection) await connection.destroy()
        await plugin.disconnect()
      } catch (err) {
        debug('error destroying connection: err=%s', err)
      }
    }
  }

  private onOutgoingMoney(connection: IlpStream.Connection, receipt?: string) {
    if (this.state === 'pending') {
      this.setState({ state: 'started' })
    }

    // WM api deals in receiver units so we need to calculate how much the
    // receiver got from this packet.
    const deliveredAmount =
      Number(connection.totalDelivered) - this.lastDelivered
    this.lastDelivered = Number(connection.totalDelivered)
    this.dispatchMonetizationProgress(
      connection,
      deliveredAmount.toString(),
      receipt
    )
  }

  private dispatchMonetizationProgress(
    connection: IlpStream.Connection,
    amount: string,
    receipt: string | undefined
  ) {
    const detail: MonetizationProgressEvent['detail'] = {
      amount,
      assetCode: connection.destinationAssetCode!,
      assetScale: connection.destinationAssetScale!,
      paymentPointer: this.paymentPointer!,
      requestId: this.requestId!,
      receipt
    }
    this.monetization.dispatchMonetizationProgressEvent(detail)
  }

  private setState({
    state,
    finalized
  }: {
    state: MonetizationState
    finalized?: boolean
  }) {
    this.state = state
    this.monetization.setState({ state, finalized })
  }

  async pause() {
    return this.stop(false)
  }
}

function btpTokenThroughput(token: string): number {
  const payload = Buffer.from(token.split('.')[1], 'base64')
  const { throughput } = JSON.parse(payload.toString())
  if (throughput === undefined) throw new Error('throughput not found')
  return throughput
}

async function firstMinuteBandwidth(
  stream: IlpStream.DataAndMoneyStream,
  throughput: number
): Promise<void> {
  // Begin paying immediately so the page knows that the user agent is monetized.
  // The initial amount is low to ensure the user doesn't deplete their balance by
  // browsing quickly from page-to-page.
  // This is the only monetization that is prepaid, everything else is post-paid.
  stream.setSendMax(INITIAL_SEND_SECONDS * throughput)

  let timer: number | undefined
  let stopped = false
  let cancelTimer = () => {}
  stream.on('close', (): void => {
    // on close, early-exit from the bandwidth loop
    stopped = true
    if (timer) clearTimeout(timer)
    cancelTimer()
  })

  let lastTime = 0 // seconds
  for (const time of [10, 30, 60]) {
    const delay = (time - lastTime) * 1e3 // milliseconds
    lastTime = time
    await new Promise<void>(
      resolve => (timer = window.setTimeout((cancelTimer = resolve), delay))
    )
    if (stopped) return
    stream.setSendMax(time * throughput)
  }
  await new Promise(resolve => {
    stream.on('end', resolve)
    setTimeout(resolve, 30_000)
    stream.end()
  })
}
