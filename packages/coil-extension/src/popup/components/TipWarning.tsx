import React from 'react'
import { styled } from '@material-ui/core'

import { Colors } from '../../shared-theme/colors'

//
// Styles
//
const WarningWrapper = styled('div')({
  color: Colors.Red700,
  textAlign: 'center',
  fontWeight: 'normal',
  height: '22px',
  '& a': {
    color: Colors.Red700,
    fontWeight: 'normal'
  }
})

//
// Models
//
interface ITipWarning {
  currentTipAmount: number
  remainingDailyAmount: number
}

//
// Component
//
export const TipWarning = (props: ITipWarning): React.ReactElement => {
  const { currentTipAmount, remainingDailyAmount } = props

  //todo - update link once billing infrastructure is complete and we have a view for changing the limit
  return (
    <WarningWrapper>
      {currentTipAmount >= remainingDailyAmount ? (
        <span>
          <a href='https://coil.com/settings/account'>
            Increase daily tipping limit
          </a>
        </span>
      ) : null}
    </WarningWrapper>
  )
}
