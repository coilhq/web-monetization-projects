export interface User {
  id: string
  fullName: string
  customerId?: string
  canTip?: boolean
  paymentPointer?: string
  subscription?: {
    active: boolean
    endDate?: string
    trialEndDate?: string
  }
  invitation?: {
    usedAt: string
  }
  currencyPreferences?: {
    code: string
    scale: number
  }
}
