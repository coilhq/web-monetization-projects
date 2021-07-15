// The duration "paid" per token. Used to compute tokens from time.
const TOKEN_DURATION = 60_000 // milliseconds
// For additional privacy, obfuscate token schedules by varying delays by ±jitter (uniform distribution).
const JITTER = 3_000 // milliseconds
// Determines batch size, relative to how much has been sent.
const BATCH_RATIO = 0.1
const MAX_BATCH_SIZE = 1 // tokens
// Determines how much to prepay, relative to the actual sendMax.
const PREPAY_RATIO = 0.1
// Maximum number of tokens to prepay.
const MAX_PREPAY_SIZE = MAX_BATCH_SIZE

export enum ScheduleMode {
  PrePay,
  PostPay
}

export class PaymentScheduler {
  private sentTokens = 0 // tokens sent so far
  private batchMax = 0 // tokens; the batched high water-mark. Send while batchMax≤sendMax
  private readonly watch: Stopwatch = new Stopwatch() // accumulate pay time
  constructor(private readonly mode: ScheduleMode) {}

  totalTime(): number {
    return this.watch.time()
  }

  onSent(tokenPart: number): void {
    // tokenPart is a fractional token
    this.sentTokens += tokenPart
    if (
      this.sendMax() < this.sentTokens ||
      Math.abs(this.batchMax - this.sentTokens) < 1.0
    ) {
      // Adjust the batchMax so that partially-sent tokens don't skew the timing
      // of future batches.
      this.batchMax = this.sentTokens
    }
  }

  start(): void {
    this.watch.start()
  }

  stop(): void {
    this.watch.stop()
  }

  // Wait for the next full token.
  // Returns false when stopped before a full token is available.
  async awaitFullToken(): Promise<boolean> {
    while (!this.hasAvailableFullToken()) {
      const waited = await this.watch.wait(5_000 + randBetween(-JITTER, JITTER))
      if (!waited) return false
    }
    return true
  }

  private hasAvailableFullToken(): boolean {
    // Don't compare with exactly 1 (because e.g. `1.9-0.9=0.999…`).
    return 0.99999 <= this.sendMax() - this.sentTokens
  }

  totalSent(): number {
    return this.sentTokens
  }

  // Returns the sendMax, rounded down to the nearest batch interval.
  sendMax(): number {
    const trueSendMax = this.unbatchedSendMax()
    for (;;) {
      const targetBatchSize = 1 + Math.floor(this.batchMax * BATCH_RATIO)
      const batchSize = Math.min(MAX_BATCH_SIZE, targetBatchSize)
      if (this.batchMax + batchSize <= trueSendMax) this.batchMax += batchSize
      else break
    }
    return this.batchMax
  }

  private unbatchedSendMax(): number {
    // returns fractional tokens
    const exactSendMax = this.exactSendMax()
    const prepay =
      this.mode === ScheduleMode.PrePay
        ? Math.min(1 + Math.floor(exactSendMax * PREPAY_RATIO), MAX_PREPAY_SIZE)
        : 0
    return exactSendMax + prepay
  }

  // Does *not* include prepay. Returns fractional tokens.
  unpaidTokens(): number {
    return Math.max(0.0, this.exactSendMax() - this.sentTokens)
  }

  // The actual sendMax, without prepay or batching. Returns fractional tokens.
  private exactSendMax(): number {
    return this.watch.time() / TOKEN_DURATION
  }
}

function randBetween(a: number, b: number): number {
  return Math.random() * (b - a) + a
}

class Stopwatch {
  private totalTime = 0 // milliseconds duration
  private lastTick?: number // milliseconds time
  private timer?: NodeJS.Timer
  private cancelTimer?: () => void

  async wait(delay: number): Promise<boolean> {
    return new Promise(resolve => {
      this.timer = setTimeout(() => resolve(true), delay)
      this.cancelTimer = () => resolve(false)
    })
  }

  start() {
    if (!this.lastTick) this.lastTick = Date.now()
  }

  stop(): void {
    this.tick()
    if (this.timer) clearTimeout(this.timer)
    if (this.cancelTimer) this.cancelTimer()
    this.lastTick = this.timer = this.cancelTimer = undefined
  }

  time(): number {
    this.tick()
    return this.totalTime
  }

  private tick(): void {
    if (!this.lastTick) return
    const now = Date.now()
    this.totalTime += now - this.lastTick
    this.lastTick = now
  }
}
