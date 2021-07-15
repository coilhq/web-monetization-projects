import { AdaptiveBandwidth } from '../../src/lib/AdaptiveBandwidth'

const URL = 'http://example.com'
const MS = 1e3
const THROUGHPUT = 123

describe('AdaptiveBandwidth', () => {
  describe('_getLinearSendMax', () => {
    it('uses the bandwidth to compute the sendMax', async () => {
      const ab = new AdaptiveBandwidth(THROUGHPUT)
      expect(await ab['_getLinearSendMax'](456)).toStrictEqual(
        Math.floor((123 * 456) / MS)
      )
    })

    it('uses the sent amount to compute the sendMax', async () => {
      const ab = new AdaptiveBandwidth(THROUGHPUT)
      ab.addSentAmount('12')
      ab.addSentAmount('34')
      expect(await ab['_getLinearSendMax'](456)).toStrictEqual(
        Math.floor((123 * 456) / MS) - 12 - 34
      )
    })
  })
})
