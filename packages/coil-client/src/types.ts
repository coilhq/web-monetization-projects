export interface GraphQlResponse<T> {
  data: T
}

export interface CoilUser {
  id: string
  fullName: string
  customerId?: string
  subscription?: {
    active: boolean
    endDate?: string
    trialEndDate?: string
  }
  currencyPreferences?: {
    code: string
    scale: number
  }
  tipCredit?: {
    balanceCents: number
  }
  tipping?: {
    limitRemaining: string
  }
}
