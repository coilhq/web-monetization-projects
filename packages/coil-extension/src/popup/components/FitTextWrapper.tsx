// this will assume that any variable lengths have been added prior to this component
import React, { useEffect, useRef, useState } from 'react'
import { styled } from '@material-ui/core'

import { Colors } from '../../shared-theme/colors'

//
// Styles
//
const Text = styled('div')(({ size }: { size: number }) => ({
  width: '100%',
  height: `${size}px`,
  color: Colors.Grey800,
  textAlign: 'center',
  fontSize: `${size}px`,
  fontWeight: 'bold',
  letterSpacing: '0px',
  lineHeight: `${size}px`
}))

//
// Models
//
interface IFitText {
  children: React.ReactNode
  defaultFontSize: number
}

//
// Component
//
export const FitTextWrapper = (props: IFitText): React.ReactElement => {
  const { defaultFontSize, children } = props
  const defaultSize = defaultFontSize
  const [fontSize, setFontSize] = useState<number>(defaultSize)
  const textBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    handleAdjustFontSize()
  })

  // updates the display font size in order to keep the font size within it's container
  const handleAdjustFontSize = () => {
    const maxWidth = textBoxRef.current?.clientWidth
    const characterSpacing = 0.6
    const characterLength = textBoxRef.current?.textContent?.length

    // calculate new font size
    if (maxWidth && characterLength) {
      let newFontSize = maxWidth / characterLength / characterSpacing
      if (newFontSize > defaultFontSize) {
        newFontSize = defaultFontSize
      }
      setFontSize(newFontSize)
    }
  }

  return (
    <Text ref={textBoxRef} size={fontSize}>
      {children}
    </Text>
  )
}
