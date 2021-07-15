import { formatAmount, parseAmount } from '../../src/util/currencyFormatting'
import { debounce } from '../../src/util/debounce'

describe('Currency utils', () => {
  it('should parse an amount and reformat to same string', () => {
    const testAmount = '$1.23'
    expect(formatAmount(parseAmount(testAmount))).toBe(testAmount)
  })
  it('should format an amount', () => {
    expect(
      formatAmount({
        amount: '1' + '170' + '341' + '242',
        assetCode: 'USD',
        assetScale: 9
      })
    ).toBe('$1.17')
  })
})

describe('debounce', () => {
  it('call immediately, then wait until a pause', async () => {
    const res: number[] = []
    const f = debounce((a: number) => res.push(a), 10)
    for (let i = 0; i < 20; i++) {
      f(i)
      expect(res).toStrictEqual([0])
      await wait(5)
    }
    await wait(15)
    expect(res).toStrictEqual([0, 19])
  })
})

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
