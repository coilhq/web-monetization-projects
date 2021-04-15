export interface User {
  id: string
  fullName: string
  customerId?: string
  canTip?: boolean
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
  tipSettings?: {
    tipCreditBalance: number
    minimumTipLimit: number
    remainingDailyAmount: number
    hotkeyTipAmounts: Array<number>
  }
}
