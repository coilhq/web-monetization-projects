import React from 'react'
import { styled } from '@material-ui/core'

import { Colors } from '../../shared-theme/colors'

//
// Styles
//
const PaymentDebitsWrapper = styled('div')({
  width: '100%'
})

const PaymentDebit = styled('div')({
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: Colors.Grey700,
  fontWeight: 'normal'
})

const PaymentMethod = styled('div')({
  display: 'flex',
  alignItems: 'center',
  '& > img': {
    maxHeight: '24px',
    maxWidth: '32px',
    marginRight: '8px'
  }
})

const Dot = styled('div')({
  backgroundColor: Colors.Grey700,
  width: '5px',
  height: '5px',
  borderRadius: '5px',
  marginRight: '2px',
  '&:last-of-type': {
    marginRight: '4px'
  }
})

//
// Models
//
interface ITipPaymentDebits {
  tipCreditBalance: number
  currentTipAmount: number
}

//
// Component
//
export const TipPaymentDebits = (
  props: ITipPaymentDebits
): React.ReactElement => {
  const { currentTipAmount, tipCreditBalance } = props

  const getTipCreditCharge = (): number => {
    if (tipCreditBalance >= currentTipAmount) {
      return currentTipAmount
    } else {
      return tipCreditBalance
    }
  }

  const getCreditCardCharge = (): number => {
    if (currentTipAmount > getTipCreditCharge()) {
      const chargeAmount = currentTipAmount - getTipCreditCharge()
      return chargeAmount
    } else {
      return 0
    }
  }

  //todo: need to add logos for all credit cards and logic for determining which logo to display
  return (
    <PaymentDebitsWrapper>
      {getTipCreditCharge() > 0 && ( // show the tip credits only if they have been charged
        <PaymentDebit>
          <PaymentMethod>
            <img src='/res/CoilLogo.svg' alt='coil icon' /> Tip credits
          </PaymentMethod>
          <div>-${getTipCreditCharge().toFixed(2)}</div>
        </PaymentDebit>
      )}
      {getCreditCardCharge() > 0 && ( // show the credit card only if it has been charged
        <PaymentDebit>
          <PaymentMethod>
            <img src='/res/creditcard-visa.svg' alt='credit card icon' />{' '}
            <Dot />
            <Dot />
            <Dot />
            <Dot />
            3455
          </PaymentMethod>
          <div>-${getCreditCardCharge().toFixed(2)}</div>
        </PaymentDebit>
      )}
    </PaymentDebitsWrapper>
  )
}
