import { CoilUser } from '../types'
import type { GraphQlClient } from '../graphQlClient'

export interface WhoAmIData {
  whoami: CoilUser
}

export const whoamiSelection = `
    id
    fullName
    customerId
    canTip

    subscription {
      active
      endDate
      trialEndDate
    }

    currencyPreferences {
      code
      scale
    }
`

export const whoamiQuery = `{
  whoami {
    ${whoamiSelection}
  }
}`

export async function whoAmI(this: GraphQlClient, token: string) {
  return this.query<WhoAmIData>({ query: whoamiQuery, token })
}
