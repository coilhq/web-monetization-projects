import { injectable } from '@dier-makr/annotations'

import { portableFetch } from './utils/portableFetch'
import { GraphQlResponse } from './types'
import { login, queryToken, refreshBtpToken, whoAmI } from './queries'

// Reference class for DI/reduct
@injectable()
export class GraphQlClientOptions {
  public coilDomain = 'https://coil.com'
  public fetch: typeof fetch = portableFetch
}

export interface GraphQlQueryParameters {
  query: string
  token?: string | null
  variables?: {}
}

@injectable()
export class GraphQlClient {
  public static Options = GraphQlClientOptions
  protected readonly fetch: typeof fetch

  public login = login
  public refreshBtpToken = refreshBtpToken
  public queryToken = queryToken
  public whoAmI = whoAmI

  public constructor(
    private config: GraphQlClientOptions = new GraphQlClientOptions()
  ) {
    this.fetch = this.config.fetch
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async query<T = any>({
    query,
    token = null,
    variables = {}
  }: GraphQlQueryParameters) {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({ query, variables })
    }
    const res = await this.fetch(`${this.config.coilDomain}/graphql`, init)
    if (!res.ok) {
      throw new Error(
        `graphql query failed. status=${res.status} query=\`${query}\``
      )
    }
    return (await res.json()) as GraphQlResponse<T>
  }
}
