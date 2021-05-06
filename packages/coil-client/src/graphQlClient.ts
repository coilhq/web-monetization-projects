import { inject, injectable } from '@dier-makr/annotations'

import { portableFetch } from './utils/portableFetch'
import { GraphQlResponse } from './types'
import {
  adaptedPage,
  login,
  queryToken,
  refreshBtpToken,
  whoAmI,
  featureEnabled,
  initiateTip,
  minTipLimit
} from './queries'

// Reference class for DI/reduct
@injectable()
export class GraphQlClientOptions {
  public coilDomain = 'https://coil.com'
  public fetch: typeof fetch = portableFetch
  public log?: typeof console.log
  public extraHeaders: Record<string, string> = {}
}

export interface GraphQlQueryParameters {
  query: string
  token?: string | null
  variables?: Record<string, unknown>
}

@injectable()
export class GraphQlClient {
  public static Options = GraphQlClientOptions
  protected readonly fetch: typeof fetch

  public login = login
  public refreshBtpToken = refreshBtpToken
  public queryToken = queryToken
  public whoAmI = whoAmI
  public adaptedPage = adaptedPage
  public featureEnabled = featureEnabled
  public initiateTip = initiateTip
  public minTipLimit = minTipLimit

  public constructor(
    @inject(GraphQlClientOptions)
    private config: GraphQlClientOptions = new GraphQlClientOptions()
  ) {
    this.fetch = this.config.fetch
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async query<T = any>({
    query,
    token = null,
    variables = {}
  }: GraphQlQueryParameters): Promise<GraphQlResponse<T>> {
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        ...this.config.extraHeaders
      },
      body: JSON.stringify({ query, variables })
    }
    if (this.config.log) {
      const serialized = JSON.stringify(
        { ...init, body: { query, variables } },
        null,
        2
      )
      const redacted = token
        ? serialized.replace(token, '<redacted>')
        : serialized
      this.config.log('Domain:', this.config.coilDomain, 'Url:', redacted)
    }
    const res = await this.fetch(`${this.config.coilDomain}/gateway`, init)
    if (!res.ok) {
      throw new Error(
        `graphql query failed. status=${res.status} query=\`${query}\``
      )
    }
    return (await res.json()) as GraphQlResponse<T>
  }
}
