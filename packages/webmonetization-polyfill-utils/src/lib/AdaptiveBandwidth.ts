export interface AdaptiveBandwidthTiers {
  getBandwidth(url: string): Promise<number>
}

export class AdaptiveBandwidth {
  // Fields for calculation of outgoing money
  private _timeStarted!: number
  private _sentAmount!: number

  constructor(
    private _throughput: number,
    private _debug: (...args: unknown[]) => void = () => undefined
  ) {
    this.reset()
  }

  public reset() {
    this._timeStarted = Date.now()
    this._sentAmount = 0
    this._debug('reset amount parameters to 0')
  }

  addSentAmount(amount: string) {
    this._debug('adding sent amount of', amount)
    this._sentAmount += Number(amount) || 0
  }

  async getStreamSendMax(): Promise<number> {
    const elapsed = Date.now() - this._timeStarted
    return this._getLinearSendMax(elapsed)
  }

  // noinspection DuplicatedCode
  private async _getLinearSendMax(timeElapsed: number): Promise<number> {
    const secondsElapsed = timeElapsed / 1000
    const sendAmount = Math.floor(
      secondsElapsed * this._throughput - this._sentAmount
    )
    this._debug('current send amount is', sendAmount)
    return sendAmount
  }
}
