export function resolvePaymentEndpoint(
  pointerOrUrl: string,
  forLinkTag = false
) {
  const httpUrl = !forLinkTag
    ? pointerOrUrl.replace(/^\$/, 'https://')
    : pointerOrUrl

  let url: URL
  try {
    url = new URL(httpUrl)
    if (!url.protocol.match(/https?:/)) {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error(
        'SPSP endpoint must be specified as either a ' +
          'payment pointer or fully resolved https:// url '
      )
    }
  } catch (e) {
    throw new Error(
      `Invalid payment pointer/url: ${JSON.stringify(pointerOrUrl)}`
    )
  }

  const isPaymentPointer = pointerOrUrl.startsWith('$')

  if (
    isPaymentPointer &&
    (url.hash || url.search || url.port || url.username || url.password)
  ) {
    throw new Error(
      'Payment pointer must not contain ' +
        'query/fragment/port/username elements: ' +
        JSON.stringify({
          hash: url.hash,
          search: url.search,
          port: url.port,
          username: url.username,
          password: url.password
        })
    )
  }
  return isPaymentPointer && url.pathname === '/'
    ? url.href + '.well-known/pay'
    : url.href
}
