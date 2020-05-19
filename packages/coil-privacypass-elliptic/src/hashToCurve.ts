import crypto from 'crypto'

import * as elliptic from 'elliptic'

const p256: elliptic.ec = new elliptic.ec('p256')

export function hashAndInc(seed: Buffer): elliptic.curve.base.BasePoint {
  let h = crypto.createHash('sha256')

  // Need to match the Go curve hash, so we decode the exact bytes of the
  // string "1.2.840.100045.3.1.7 point generation seed" instead of relying
  // on the utf8 codec that didn't match.
  const separator = Buffer.from('1.2.840.10045.3.1.7 point generation seed')

  h.update(separator)

  let i = 0
  // Increased increments to decrease chance of failure
  for (i = 0; i < 20; i++) {
    // little endian uint32
    const ctr = new Uint8Array(4)
    // typecast hack: number -> Uint32, bitwise Uint8
    ctr[0] = (i >>> 0) & 0xff

    // H(s||ctr)
    h.update(seed)
    h.update(ctr)

    const bytes = h.digest()

    // attempt to decompress a point with a valid tag (don't need to try
    // 0x03 because this is just the negative version)
    // curve choice is implicit based on active curve parameters
    try {
      return p256.curve.decodePoint([0x2, ...bytes])
    } catch (e) {
      seed = bytes
      h = crypto.createHash('sha256')
    }
  }

  throw new Error('Unable to construct point using hash and increment')
}
