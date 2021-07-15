import type { PackageVersion } from '@coil/webpack-utils'

declare const WEBPACK_DEFINE_API: any
declare const WEBPACK_DEFINE_VERSION: any
declare const WEBPACK_DEFINE_COIL_DOMAIN: any
declare const WEBPACK_DEFINE_BTP_ENDPOINT: any
declare const WEBPACK_DEFINE_BUILD_CONFIG: any

// This is to support opening the popup.html page in a normal browser tab
// so that can look at it in various states. An undefined error will be thrown
// if try to assign API directly to the DefinePlugin macro.
let api: null | typeof window.chrome = null
try {
  api = WEBPACK_DEFINE_API
} catch (e) {
  console.warn('WEBPACK_DEFINE_API not set')
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const API: typeof window.chrome = api!
export const COIL_DOMAIN: string = WEBPACK_DEFINE_COIL_DOMAIN
export const BTP_ENDPOINT: string | null = WEBPACK_DEFINE_BTP_ENDPOINT
export const BUILD_CONFIG: Record<string, unknown> = WEBPACK_DEFINE_BUILD_CONFIG
export const VERSION: PackageVersion = WEBPACK_DEFINE_VERSION
