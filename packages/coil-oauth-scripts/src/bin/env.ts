import { GraphQlClient } from '@coil/client'

export const env = (key: string, defaultValue?: string): string => {
  const value = process.env[key]
  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`expecting process.env.${key} to be defined`)
    } else {
      return defaultValue
    }
  }
  return value
}

export const COIL_DOMAIN = env('COIL_DOMAIN', 'https://coil.com')
export const COIL_USER = env('COIL_USER')
export const COIL_PASSWORD = env('COIL_PASSWORD')
export const CF_ACCESS_CLIENT_ID = env('CF_ACCESS_CLIENT_ID')
export const CF_ACCESS_CLIENT_SECRET = env('CF_ACCESS_CLIENT_SECRET')
export const CF_HEADERS: Record<string, string> =
  CF_ACCESS_CLIENT_ID && CF_ACCESS_CLIENT_SECRET
    ? {
        'CF-Access-Client-Id': CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': CF_ACCESS_CLIENT_SECRET
      }
    : {}

const ClientOptions = class Options extends GraphQlClient.Options {
  coilDomain = COIL_DOMAIN
  extraHeaders = CF_HEADERS
}

export async function login() {
  const client = new GraphQlClient(new ClientOptions())
  const token = await client.login(COIL_USER, COIL_PASSWORD)
  const btpToken = await client.refreshBtpToken(token)
  return { client, token, btpToken }
}
