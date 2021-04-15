import React from 'react'
import { styled } from '@material-ui/core'

import { Colors } from '../../shared-theme/colors'

import { TipProcessStep } from './views/TipRouter'
//
// Styles
//
const HotkeyButtonsWrapper = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
})

const HotkeyButton = styled('button')({
  cursor: 'pointer',
  border: 'none',
  borderRadius: '10px',
  backgroundColor: Colors.Grey100,
  color: Colors.Grey500,
  fontFamily: 'CircularStd',
  fontWeight: 'bold',
  fontSize: '16px',
  letterSpacing: '.5px',
  textAlign: 'center',
  padding: '10px 0px',
  width: '54px',
  flex: '1',
  '&:hover': {
    backgroundColor: Colors.Grey800,
    color: '#FFFFFF'
  },
  '&:disabled': {
    cursor: 'not-allowed',
    backgroundColor: Colors.Grey50,
    color: Colors.Grey100
  },
  '&:nth-child(2)': {
    margin: '0px 15px'
  }
})

//
// Models
//
interface IHotkeyAmountButtons {
  hotkeyTipAmounts: Array<number>
  remainingDailyAmount: number
  setCurrentTipAmount: (amount: number) => void
  setTipProcessStep: (step: TipProcessStep) => void
}

//
// Component
//
export const HotkeyAmountButtons = (
  props: IHotkeyAmountButtons
): React.ReactElement => {
  const {
    setCurrentTipAmount,
    setTipProcessStep,
    hotkeyTipAmounts,
    remainingDailyAmount
  } = props

  const handleSelectAmount = (amount: number) => {
    setCurrentTipAmount(amount)
    setTipProcessStep(TipProcessStep.TIP_CONFIRM)
  }
  return (
    <HotkeyButtonsWrapper>
      {hotkeyTipAmounts.map((amount: number, index: number) => {
        return (
          <HotkeyButton
            key={`pdt-${index}`}
            disabled={amount > remainingDailyAmount}
            onClick={() => handleSelectAmount(amount)}
          >
            ${Number.isInteger(amount) ? amount : amount.toFixed(2)}
          </HotkeyButton>
        )
      })}
    </HotkeyButtonsWrapper>
  )
}
