import { resolvePaymentEndpoint } from '@web-monetization/polyfill-utils'

const fixtures = {
  invalidPaymentPointer: '%twitter.broken.com',
  invalidURL: 'http@//twitter.fool.com',
  // These will be caught at a higher level
  insecureHTTP: 'http://twitter.fool.com',
  invalidProtocol: 'ftp://host/~/foo/bar.html',
  validPaymentPointer: '$twitter.fool.com/niq',
  validPaymentPointerNoPath: '$twitter.fool.com'
}

describe('resolvePaymentEndpoint', () => {
  it('should resolve a valid paymentPointer', () => {
    expect(resolvePaymentEndpoint(fixtures.validPaymentPointer)).toBe(
      'https://twitter.fool.com/niq'
    )
  })
  it('should expand a paymentPointer empty path to .well-known/pay', () => {
    expect(resolvePaymentEndpoint(fixtures.validPaymentPointerNoPath)).toBe(
      'https://twitter.fool.com/.well-known/pay'
    )
  })
  it('will throw if the paymentPointer is invalid', () => {
    expect(() => {
      resolvePaymentEndpoint(fixtures.invalidPaymentPointer)
    }).toThrow()
  })
  it('will throw if the url is invalid', () => {
    expect(() => {
      resolvePaymentEndpoint(fixtures.invalidURL)
    }).toThrow()
  })
  it('should throw if an url is not https?:', () => {
    expect(() => {
      resolvePaymentEndpoint(fixtures.invalidProtocol)
    }).toThrow()
  })
  it('should NOT throw if an url is http', () => {
    expect(resolvePaymentEndpoint(fixtures.insecureHTTP)).toBe(
      'http://twitter.fool.com/'
    )
  })
})
