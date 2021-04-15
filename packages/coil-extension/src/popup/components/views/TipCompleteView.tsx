/*
    TipCompleteView

    responsible for rendering the final tip view for users to see how much they just tipped as well as be presented with the 'undo' option.
*/

import React from 'react'
import { styled, Box } from '@material-ui/core'
import CloseIcon from '@material-ui/icons/Close'

import { Colors } from '../../../shared-theme/colors'
import { FitTextWrapper } from '../FitTextWrapper'
import { RandomThankYouMessage } from '../RandomThankYouMessage'

//
// Styles
//

const ExtensionBodyWrapper = styled('div')(({ url }: { url: string }) => ({
  display: 'flex',
  flexDirection: 'column',
  padding: '14px 24px 0px 24px',
  minHeight: '457px', // based on the first views body height to keep consistent
  maxHeight: '457px', // based on the first views body height to keep consistent
  backgroundImage: `url("${url}")`, //* the 'random' prop is needed so the gif animation replays every load
  backgroundSize: '105% 105%',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'bottom',
  textAlign: 'center',
  color: Colors.Grey800,
  fontWeight: 'normal',
  '& > img': {
    width: '24px',
    height: '24px'
  }
}))

const IconButton = styled('button')({
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
  lineHeight: '0px',
  padding: '0px',
  marginRight: '-10px',
  color: Colors.Grey500,
  '&:hover': {
    color: Colors.Grey800
  }
})

//
// Component
//
export const TipCompleteView = (props: {
  currentTipAmount: number
}): React.ReactElement => {
  const { currentTipAmount } = props

  const handleClose = () => {
    window.close()
  }

  const getBackgroundImageUrl = () => {
    let ImgUrl = '/res/Level1.gif'
    if (currentTipAmount >= 5 && currentTipAmount <= 20) {
      ImgUrl = '/res/Level2.gif'
    }
    if (currentTipAmount > 20 && currentTipAmount <= 50) {
      ImgUrl = '/res/Level3.gif'
    }
    if (currentTipAmount > 50) {
      ImgUrl = '/res/Level4.gif'
    }
    // adding a random number to the url allows it re-render the animation on the same page
    // but it is re-rendering the animation every time there is a stream transaction

    // return `${ImgUrl}?${Math.random()}`
    return `${ImgUrl}`
  }

  return (
    <div>
      <ExtensionBodyWrapper url={getBackgroundImageUrl()}>
        <Box textAlign='right' mb='25px'>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <RandomThankYouMessage />
        <Box my='30px'>
          <FitTextWrapper defaultFontSize={80}>
            $
            {Number.isInteger(currentTipAmount)
              ? currentTipAmount
              : currentTipAmount.toFixed(2)}
          </FitTextWrapper>
        </Box>
      </ExtensionBodyWrapper>
    </div>
  )
}
