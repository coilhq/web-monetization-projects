import { EventEmitter } from 'events'

import { PaymentDetails } from '@webmonetization/polyfill-utils'
import { Container, injectable } from 'inversify'

import * as tokens from '../../types/tokens'

import { Stream } from './Stream'
import { ActiveTabLogger } from './ActiveTabLogger'

@injectable()
export class Streams extends EventEmitter {
  private readonly _streams: { [id: string]: Stream }

  constructor(private container: Container) {
    super()
    this._streams = {}
  }

  /*
   * Note re: `initiatingUrl`. A monetization request may persist throughout
   * different urls in the case of HTML5 history.pushState and a site wide
   * meta tag.
   */
  beginStream(
    id: string,
    options: PaymentDetails & {
      spspEndpoint: string
      token: string
      initiatingUrl: string
    }
  ) {
    const child = this.container.createChild()
    child.bind(tokens.StreamDetails).toConstantValue({ ...options })
    this._streams[id] = child.get(Stream)
    this._streams[id].on('money', details => {
      this.emit('money', { url: options.initiatingUrl, id, ...details })
    })
    this._streams[id].on('abort', requestId => {
      this.emit('abort', requestId)
    })
    void this._streams[id].start()
  }

  pauseStream(id: string) {
    if (this._streams[id]) {
      void this._streams[id].pause()
    }
  }

  resumeStream(id: string) {
    if (this._streams[id]) {
      void this._streams[id].resume()
    }
  }

  closeStream(id: string) {
    if (this._streams[id]) {
      this._streams[id].stop().then(() => {
        this.container
          .get(ActiveTabLogger)
          .sendLogEvent(() => `Streams:closeStream:${id.slice(0, 6)}`)
      })
      this._streams[id].removeAllListeners()
      delete this._streams[id]
    }
  }

  getStream(id: string) {
    return this._streams[id]
  }
}
