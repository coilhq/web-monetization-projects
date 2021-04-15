/*
    TipRouter
    
    The tip router is responsible for all the local state that is relative the the tipping process as well as the logic that determines which tipping view is rendered. Also will need to pass context down to the rendered components.
*/

import React, { useState } from 'react'
import { styled } from '@material-ui/core'
import { AnimatePresence } from 'framer-motion'

import { TipView } from './TipView'
import { TipConfirmView } from './TipConfirmView'
import { TipCompleteView } from './TipCompleteView'

//
// Styles
//
const OuterDiv = styled('div')({
  width: '308px',
  maxWidth: '308px',
  height: '455px',
  maxHeight: '455px',
  position: 'relative',
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #FCFCFC 86.53%, #FFFFFF 97.24%)'
})

//
// Models
//
export enum TipProcessStep {
  TIP = 'TIP',
  TIP_CONFIRM = 'TIP_CONFIRM',
  TIP_COMPLETE = 'TIP_COMPLETE'
}

export interface ITipView {
  currentTipAmount: number
  setCurrentTipAmount: (amount: number) => void
  setTipProcessStep: (step: TipProcessStep) => void
}

//
// Component
//
export const TipRouter = () => {
  const [tipProcessStep, setTipProcessStep] = useState<TipProcessStep>(
    TipProcessStep.TIP
  )
  const [currentTipAmount, setCurrentTipAmount] = useState<number>(1)

  return (
    <OuterDiv>
      <AnimatePresence initial={false}>
        {tipProcessStep === TipProcessStep.TIP && (
          <TipView
            key='tip'
            currentTipAmount={currentTipAmount}
            setCurrentTipAmount={setCurrentTipAmount}
            setTipProcessStep={setTipProcessStep}
          />
        )}
        {tipProcessStep === TipProcessStep.TIP_CONFIRM && (
          <TipConfirmView
            key='confirm'
            currentTipAmount={currentTipAmount}
            setTipProcessStep={setTipProcessStep}
          />
        )}
        {tipProcessStep === TipProcessStep.TIP_COMPLETE && (
          <TipCompleteView key='complete' currentTipAmount={currentTipAmount} />
        )}
      </AnimatePresence>
    </OuterDiv>
  )
}
