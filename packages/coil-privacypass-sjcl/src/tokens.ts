import sjcl, { BigNumber, SjclEllipticalPoint } from 'sjcl'

import {
  blindPoint,
  newRandomPoint,
  sec1DecodeFromBase64,
  sec1EncodeToBase64
} from './crypto'

export interface BlindToken {
  data: number[]
  point: SjclEllipticalPoint
  blind: BigNumber
}

export function CreateBlindToken(): BlindToken | void {
  const randomPoint = newRandomPoint()

  if (randomPoint) {
    const blindedPoint = blindPoint(randomPoint.point)
    return {
      data: randomPoint.data,
      point: blindedPoint.point,
      blind: blindedPoint.blind
    }
  }
}

export function GenerateNewTokens(
  n: number,
  creator = CreateBlindToken
): BlindToken[] {
  const tokens: BlindToken[] = []

  for (let i = 0; i < n; ++i) {
    const blindToken = creator()

    if (!blindToken) {
      console.warn(
        '[privacy pass]: tried to generate a random point on the curve, but failed'
      )
      console.warn('[privacy pass]: will drop the null point')
      continue
    }

    tokens.push(blindToken)
  }

  return tokens
}

export interface StorableBlindToken {
  data: string // base64-encoding of BlindToken.data
  point: string
  blind: string
}

export function getTokenEncoding(
  t: BlindToken,
  curvePoint: SjclEllipticalPoint
): StorableBlindToken {
  const storablePoint = sec1EncodeToBase64(curvePoint, false)
  const storableBlind = t.blind.toString()
  const storableData = sjcl.codec.base64.fromBits(
    sjcl.codec.bytes.toBits(t.data)
  )

  return {
    data: storableData,
    point: storablePoint,
    blind: storableBlind
  }
}

export function deserializeToken(token: StorableBlindToken): BlindToken {
  const usablePoint = sec1DecodeFromBase64(token.point)
  const usableBlind = new sjcl.bn(token.blind)
  const usableData = sjcl.codec.bytes.fromBits(
    sjcl.codec.base64.toBits(token.data)
  )
  return {
    data: usableData,
    point: usablePoint,
    blind: usableBlind
  }
}
