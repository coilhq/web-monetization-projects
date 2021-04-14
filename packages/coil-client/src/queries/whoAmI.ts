import { CoilUser } from '../types'
import { GraphQlClient } from '..'

export interface WhoAmIData {
  whoami: CoilUser
}

//* replace after testing
export const whoamiQuery = `{
  whoami {
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
  }
}`

//* commented out for testing
// export const whoamiQuery = `{
//   whoami {
//     id
//     fullName
//     customerId
//     canTip

//     tipSettings {
//       id
//       dailyLimit
//       formattedDailyLimit
//     }

//     subscription {
//       active
//       endDate
//       trialEndDate
//     }

//     currencyPreferences {
//       code
//       scale
//     }
//   }
// }`

export async function whoAmI(this: GraphQlClient, token: string) {
  return this.query<WhoAmIData>({ query: whoamiQuery, token })
}
