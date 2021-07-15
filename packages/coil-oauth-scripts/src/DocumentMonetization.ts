import {
  MonetizationEvent,
  MonetizationProgressEvent,
  MonetizationStartEvent,
  MonetizationState,
  MonetizationStopEventDetail
} from '@webmonetization/types'

import { getDoc } from './documentExtensions'
import { debug } from './logging'

interface SetStateParams {
  state: MonetizationState
  /**
   * Should only be set when state === 'stopped'
   */
  finalized?: boolean
}

export class DocumentMonetization {
  // If we don't have a meta to start with it's in a final stopped state
  private finalized = true
  private state: MonetizationState = 'stopped'
  private request?: MonetizationStartEvent['detail']

  constructor(private doc: Document) {}

  setMonetizationRequest(request?: MonetizationStartEvent['detail']) {
    this.request = request
    this.finalized = true
  }

  setState({ state, finalized }: SetStateParams) {
    debug('SET STATE', 'new:', { state, finalized }, 'old:', {
      state: this.state,
      finalized: this.finalized
    })
    if (typeof finalized !== 'undefined' && state !== 'stopped') {
      throw new Error('invalid_state: finalized set when not stopped state')
    }

    finalized = Boolean(finalized)

    const changedFinalized = finalized != this.finalized
    const changedState = this.state != state
    const changed = changedState || changedFinalized
    this.state = state
    this.finalized = finalized

    if (changed) {
      if (changedState) {
        getDoc(this.doc).monetization.state = state
      }
      if (this.request) {
        const mapping = {
          pending: 'monetizationpending',
          stopped: 'monetizationstop',
          started: 'monetizationstart'
        } as const

        this.dispatchMonetizationEvent(mapping[state], this.request, finalized)
      }
    }
    return changed
  }

  private dispatchMonetizationEvent(
    type: MonetizationEvent['type'],
    detailSource: MonetizationEvent['detail'],
    finalized?: boolean
  ) {
    const detail = { ...detailSource }
    if (type === 'monetizationstop') {
      ;(detail as MonetizationStopEventDetail).finalized = Boolean(finalized)
    }

    getDoc(this.doc).monetization.dispatchEvent(
      new CustomEvent(type, { detail })
    )
  }

  dispatchMonetizationProgressEvent(
    detail: MonetizationProgressEvent['detail']
  ) {
    this.dispatchMonetizationEvent('monetizationprogress', detail)
  }
}
