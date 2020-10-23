import { parseAmount } from '../util/currencyFormatting'

import { PageTotal } from './interfaces'

export function makeKey(url: string, paymentPointer: string): PageTotal['key'] {
  return {
    url,
    paymentPointer,
    origin: new URL(url).origin
  }
}

export const totals: Array<PageTotal> = [
  {
    streamingTimeTotalSeconds: 20932,
    total: parseAmount('$2.05'),
    key: makeKey(
      'https://sharafian.me/real-boy.html',
      '$twitter.xrptipbot.com/sharafian_'
    )
  },
  {
    streamingTimeTotalSeconds: 5647,
    total: parseAmount('$0.65'),
    key: makeKey(
      'https://sharafian.me/resume.html',
      '$twitter.xrptipbot.com/sharafian_'
    )
  },
  {
    streamingTimeTotalSeconds: 3449,
    favIcon: 'https://cdn.coil.com/assets/favicon.png',
    total: parseAmount('$0.42'),
    key: makeKey(
      'https://coil.com/p/WannaWanga/Kennedy-Family-Recipes/SlVNM7isL',
      '$spsp.coil.com/coil-content/creator'
    )
  },
  {
    streamingTimeTotalSeconds: 3012,
    favIcon: 'https://cdn.coil.com/assets/favicon.png',
    total: parseAmount('$0.36'),
    key: makeKey(
      'https://coil.com/p/Robert_Palmer/Darts-and-Laser-Focus/EOvsWVSAl',
      '$spsp.coil.com/coil-content/creator'
    )
  }
]
