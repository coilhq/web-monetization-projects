import { GraphQlClient } from '..'

export interface FeatureEnabledData {
  featureEnabled: boolean
}

export const featureEnabledQuery = `{
  featureEnabled(key: $key)
}`

export async function featureEnabled(this: GraphQlClient, token: string, key: string) {
  return this.query<FeatureEnabledData>({ query: featureEnabledQuery, token, variables: {key: key} })
}
