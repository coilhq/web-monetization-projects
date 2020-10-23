import { Amount } from '@web-monetization/types'

export interface PageTotal {
  total: Amount
  streamingTimeTotalSeconds: number
  favIcon?: string

  // favicon derived from this.key.url
  key: {
    origin: string
    url: string
    paymentPointer: string
  }
}

export interface BlockConfig {
  id: number
  type: 'URL' | 'Domain' | 'Payment Pointer'
  value: string
  favIcon?: string
}
