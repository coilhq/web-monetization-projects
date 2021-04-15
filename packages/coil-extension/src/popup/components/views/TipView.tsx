/*
    TipView

    responsible for rendering the initial tip view for users to select the amount they would like to tip to the current site.
*/

// todo: Currently the AccountBar and WebMonetizedBar are done in the Index, need to extract those into a Layout component so views can handle their own layouts

import React from 'react'
import { styled, Box } from '@material-ui/core'
import { motion } from 'framer-motion'

import { AmountInput } from '../AmountInput'
import { HotkeyAmountButtons } from '../HotkeyAmountButtons'
import { AccountBar } from '../AccountBar'
import { WebMonetizedBar } from '../WebMonetizedBar'
import { TipWarning } from '../TipWarning'
import { Colors } from '../../../shared-theme/colors'
import { useStore } from '../../context/storeContext'

import { TipProcessStep, ITipView } from './TipRouter'

//
// Styles
//
const ExtensionBodyWrapper = styled('div')({
  padding: '24px 24px 16px 24px',
  minHeight: '352px', // based on the first views body height to keep consistent
  background: 'linear-gradient(180deg, #FCFCFC 86.53%, #FFFFFF 97.24%)'
})

const Button = styled('button')({
  position: 'relative',
  overflow: 'hidden',
  cursor: 'pointer',
  width: '100%',
  height: '48px',
  backgroundColor: Colors.Grey800,
  color: '#FFFFFF',
  fontFamily: 'CircularStd',
  fontWeight: 'bold',
  fontSize: '16px',
  letterSpacing: '.5px',
  border: 'none',
  borderRadius: '10px',
  '&:hover': {
    backgroundColor: '#000000'
  },
  '&:disabled': {
    cursor: 'not-allowed',
    backgroundColor: Colors.Grey500,
    color: Colors.Grey100
  }
})

//
// Component
//
export const TipView: React.FC<ITipView> = (
  props: React.PropsWithChildren<ITipView>
) => {
  const { user } = useStore()
  const { hotkeyTipAmounts, remainingDailyAmount, minimumTipLimit } =
    user?.tipSettings || {}
  const { currentTipAmount, setCurrentTipAmount, setTipProcessStep } = props

  const handleTip = () => {
    setTipProcessStep(TipProcessStep.TIP_CONFIRM)
  }

  // Animation Settings
  const transitionDetails = {
    type: 'tween',
    duration: 0.5
  }

  const bodyVariants = {
    hidden: { translateX: '-308px' },
    visible: {
      translateX: '0px',
      transition: { ...transitionDetails }
    },
    exit: {
      translateX: '-308px',
      transition: { ...transitionDetails }
    }
  }

  const headerVariants = {
    hidden: { translateY: '-56px' },
    visible: {
      translateY: '0px',
      transition: { ...transitionDetails }
    },
    exit: {
      zIndex: 0,
      translateY: '-56px',
      transition: { ...transitionDetails }
    }
  }
  const footerVariants = {
    hidden: { translateY: '40px' },
    visible: {
      translateY: '0px',
      transition: { ...transitionDetails }
    },
    exit: {
      translateY: '40px',
      transition: { ...transitionDetails }
    }
  }

  // Render
  return (
    <Box style={{ position: 'absolute', width: '100%' }}>
      <motion.div
        initial='hidden'
        animate='visible'
        exit='exit'
        variants={headerVariants}
        key='header'
      >
        <AccountBar />
      </motion.div>
      <motion.div
        initial='hidden'
        animate='visible'
        exit='exit'
        variants={bodyVariants}
        key='tip'
      >
        <ExtensionBodyWrapper>
          <Box
            mb='24px'
            textAlign='center'
            color={Colors.Grey800}
            fontWeight='normal'
            fontSize='18px'
            pt='5px'
          >
            Support to this site
          </Box>
          <AmountInput
            currentTipAmount={currentTipAmount}
            setCurrentTipAmount={setCurrentTipAmount}
            remainingDailyAmount={remainingDailyAmount || 0}
            minimumTipLimit={minimumTipLimit || 1}
          />
          <Box m='20px 0px 35px 0px'>
            <HotkeyAmountButtons
              hotkeyTipAmounts={hotkeyTipAmounts || []}
              remainingDailyAmount={remainingDailyAmount || 0}
              setCurrentTipAmount={setCurrentTipAmount}
              setTipProcessStep={setTipProcessStep}
            />
          </Box>
          <Box mb='35px'>
            <TipWarning
              currentTipAmount={currentTipAmount}
              remainingDailyAmount={remainingDailyAmount || 0}
            />
          </Box>
          <Button
            onClick={handleTip}
            disabled={currentTipAmount > (remainingDailyAmount || 0)}
          >
            Send $
            {Number.isInteger(currentTipAmount)
              ? currentTipAmount
              : currentTipAmount.toFixed(2)}
          </Button>
        </ExtensionBodyWrapper>
      </motion.div>
      <motion.div
        initial='hidden'
        animate='visible'
        exit='exit'
        variants={footerVariants}
        key='footer'
      >
        <WebMonetizedBar />
      </motion.div>
    </Box>
  )
}
