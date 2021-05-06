import { GraphQlClient } from '..'

export interface MinTipLimitResponse {
  minTipLimit: {
    code: string
    message: string
    success: boolean
    minTipLimit: string
  }
}

export const minTipLimitQuery = `{
  minTipLimit {
      code
      message
      success
      minTipLimit
  }
}`

export async function minTipLimit(this: GraphQlClient, token: string) {
  return this.query<MinTipLimitResponse>({
    query: minTipLimitQuery,
    token
  })
}
