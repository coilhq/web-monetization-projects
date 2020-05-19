import * as crypto from 'crypto'

import * as elliptic from 'elliptic'
import * as sjcl from 'sjcl'
import BN from 'bn.js'
import {
  BlindToken,
  sec1DecodeFromBase64,
  sec1EncodeToBase64,
  StorableBlindToken
} from '@coil/privacypass-sjcl'
import { SjclEllipticalPoint } from 'sjcl'

import { hashAndInc } from './hashToCurve'

const p256 = new elliptic.ec('p256')

type Point = elliptic.curve.base.BasePoint

export interface BlindTokenEl {
  seed: Buffer
  point: Point
  blind: BN
}

export function newRandomPointEl() {
  const seed = crypto.randomBytes(32)
  return { seed, point: hashAndInc(seed) }
}

type RandomBn = BN & { __ix: number }

/**
 * @param modulus - typically order of the curve
 * TODO: optimize, though it's unlikely worth the hassle given probability
 *       of looping is practically low and this avoids any issues with
 *       distributing random bytes between 0 and modulus - 1
 *       fit for purpose
 */
export function randomBN(modulus: BN) {
  const bl = modulus.byteLength()
  let out: BN
  let ix = 0
  do {
    const buffer = crypto.randomBytes(bl)
    out = new BN(buffer)
    ix++
  } while (!out.isZero() && out.gte(modulus))
  const outed = out as RandomBn
  outed.__ix = ix
  return outed
}

export function blindPointEl(point: Point) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const bF = randomBN(p256.n!)
  const bP = point.mul(bF)
  return { point: bP, blind: bF }
}

export function CreateBlindTokenEl(): BlindTokenEl {
  const randomPoint = newRandomPointEl()
  const blindedPoint = blindPointEl(randomPoint.point)
  return {
    seed: randomPoint.seed,
    point: blindedPoint.point,
    blind: blindedPoint.blind
  }
}

// export function getTokenEncoding(
//   t: BlindToken,
//   curvePoint: SjclEllipticalPoint
// ): StorableBlindToken {
//   const storablePoint = sec1EncodeToBase64(curvePoint, false)
//   const storableBlind = t.blind.toString()
//   const storableData = sjcl.codec.base64.fromBits(
//     sjcl.codec.bytes.toBits(t.data)
//   )
//
//   return {
//     data: storableData,
//     point: storablePoint,
//     blind: storableBlind
//   }
// }
//
// export function deserializeToken(token: StorableBlindToken): BlindToken {
//   const usablePoint = sec1DecodeFromBase64(token.point)
//   const usableBlind = new sjcl.bn(token.blind)
//   const usableData = sjcl.codec.bytes.fromBits(
//     sjcl.codec.base64.toBits(token.data)
//   )
//   return {
//     data: usableData,
//     point: usablePoint,
//     blind: usableBlind
//   }
// }

export function encodeToken(token: BlindTokenEl) {}

export function decodeToken(encoded: string) {}

function BNtoSjcl(bn: BN) {
  return sjcl.bn.fromBits(sjcl.codec.bytes.toBits(bn.toArray('be')))
}

function PointToSjcl(point: Point) {
  return new sjcl.ecc.point(
    p256.curve,
    BNtoSjcl(point.getX()),
    BNtoSjcl(point.getY())
  )
}

export function CreateBlindTokenElAdapted(): BlindToken {
  const elliptic = CreateBlindTokenEl()
  return {
    blind: BNtoSjcl(elliptic.blind),
    data: [...elliptic.seed],
    point: PointToSjcl(elliptic.point)
  }
}
