import { CoilUser } from '../types'
import { GraphQlClient } from '..'

export interface WhoAmIData {
  whoami: CoilUser
}

export const whoamiQuery = `{
  whoami {
    id
    fullName
    customerId
    canTip

    tipSettings {
      id
      dailyLimit
      formattedDailyLimit
    }

    subscription {
      active
      endDate
      trialEndDate
    }

    currencyPreferences {
      code
      scale
    }
  }
}`

export async function whoAmI(this: GraphQlClient, token: string) {
  return this.query<WhoAmIData>({ query: whoamiQuery, token })
}
