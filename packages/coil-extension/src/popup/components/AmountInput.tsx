import React, { useState, useRef, useEffect } from 'react'
import { styled } from '@material-ui/core'

import { Colors } from '../../shared-theme/colors'

import { IncDecButton, IncDec } from './IncDecButton'
import { ITipView } from './views/TipRouter'

//
// Styles
//
const CurrentAmountWrapper = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-around',
  height: '62px'
})

const Amount = styled('div')(({ size }: { size: number }) => ({
  cursor: 'pointer',
  fontSize: `${size}px`,
  fontWeight: 'bold',
  color: Colors.Grey800,
  letterSpacing: '0px'
}))

const InputWrapper = styled('div')(({ size }: { size: number }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',

  '& > *': {
    fontSize: `${size}px`,
    fontWeight: 'bold',
    color: Colors.Grey800,
    letterSpacing: '0px'
  }
}))

const Input = styled('input')({
  fontFamily: 'CircularStd',
  fontWeight: 'bold',
  textAlign: 'center',
  minWidth: '50px',
  width: '50px',
  maxWidth: '100%',
  transition: 'width 0s',
  color: Colors.Grey800,
  letterSpacing: '0px',
  backgroundColor: 'transparent',
  border: 'none',
  '&:focus, &:active': {
    outline: 'none'
  },
  '&::placeholder': {
    color: Colors.Grey100,
    opacity: 1 /* Firefox */
  }
})

//
// Models
//
interface IAmountInput extends Omit<ITipView, 'context' | 'setTipProcessStep'> {
  minimumTipLimit: number
  remainingDailyAmount: number
}

//
// Component
//
export const AmountInput = (props: IAmountInput): React.ReactElement => {
  const defaultFontSize = 64
  const characterSpacing = 0.6
  const maxAmountWidth = 160
  const [displayFontSize, setDisplayFontSize] =
    useState<number>(defaultFontSize)
  const [isUserInput, setIsUserInput] = useState<boolean>(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    currentTipAmount,
    setCurrentTipAmount,
    minimumTipLimit,
    remainingDailyAmount
  } = props

  // set focus to the input field when it loads. Cannot use 'autoFocus' because eslint-plugin-jsx-a11y
  useEffect(() => {
    if (isUserInput && inputRef.current) {
      inputRef.current.focus()
      // Make sure the input width is correct on focus.
      inputRef.current.style.width = `${
        currentTipAmount.toString().length * 40
      }px`
    }
  }, [isUserInput])

  // adjust the amount displayed font size
  useEffect(() => {
    handleAdjustFontSize(currentTipAmount)
  }, [currentTipAmount])

  // validates the manual input and updates the state with the current amount
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Mask input value to ensure only digits.
    // ensure that the input is a valid number input
    const re = new RegExp('^[0-9]*.?[0-9]{0,2}$')
    if (re.test(e.target.value) == false) {
      e.target.value = e.target.value.slice(0, -1)
      return
    }

    // check to see if the current value ends with a decimal so we can calculate the container width including the decimal
    // doing this here because once we change from string to number we lose the proper character count
    // this is all done for the instances when someone is in the process of typing a fractional amount and the last character was the '.'
    let containsDecimal = false
    if (e.target.value.toString().includes('.')) {
      containsDecimal = true
    }

    // handle if the value is above the minimum
    let value = Number(e.target.value)
    if (value < minimumTipLimit || isNaN(value)) {
      value = minimumTipLimit
    }

    // handle if the input is higher than the remaining daily limit
    if (value > remainingDailyAmount) {
      value = remainingDailyAmount
      if (isUserInput && inputRef.current) {
        inputRef.current.value = value.toString()
      }
    }

    // set the value length if it is a demical number
    // calculate with an additional characters if there is a trailing period
    let valueLength: number
    if (containsDecimal) {
      valueLength = value.toFixed(2).length
    } else {
      valueLength = value.toString().length
    }

    const newWidth = valueLength * 40

    if (newWidth < maxAmountWidth) {
      e.target.style.width = `${newWidth}px`
    } else {
      e.target.style.width = `${maxAmountWidth}px`
    }

    // update state
    setCurrentTipAmount(value)
  }

  // updates the display font size in order to keep the font size within it's container
  const handleAdjustFontSize = (currentValue: number) => {
    let value: string

    // limit to two decimal places only
    if (currentValue % 1 != 0) {
      value = currentValue.toFixed(2)
    } else {
      value = currentValue.toString()
    }

    // calculate new font size
    let newFontSize = maxAmountWidth / value.length / characterSpacing
    if (newFontSize > defaultFontSize) {
      newFontSize = defaultFontSize
    }
    setDisplayFontSize(newFontSize)
  }

  return (
    <CurrentAmountWrapper>
      <IncDecButton
        type={IncDec.Dec}
        currentTipAmount={currentTipAmount}
        setCurrentTipAmount={setCurrentTipAmount}
        minimumTipLimit={minimumTipLimit}
        remainingDailyAmount={remainingDailyAmount}
      />
      {isUserInput ? (
        // render tip manual input
        <InputWrapper size={displayFontSize}>
          <span>$</span>
          <Input
            ref={inputRef}
            type='numerical'
            maxLength={10}
            size={1}
            placeholder={currentTipAmount.toString()}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleInputChange(e)
            }
            onBlur={() => setIsUserInput(false)}
          />
        </InputWrapper>
      ) : (
        // render tip display
        <Amount size={displayFontSize} onClick={() => setIsUserInput(true)}>
          $
          {Number.isInteger(currentTipAmount)
            ? currentTipAmount
            : currentTipAmount.toFixed(2)}
        </Amount>
      )}
      <IncDecButton
        type={IncDec.Inc}
        currentTipAmount={currentTipAmount}
        setCurrentTipAmount={setCurrentTipAmount}
        minimumTipLimit={minimumTipLimit}
        remainingDailyAmount={remainingDailyAmount}
      />
    </CurrentAmountWrapper>
  )
}
