import React, { useState } from 'react'
import { Button } from '@material-ui/core'

import { PopupProps } from '../types'
import { SendTip, SendTipResult } from '../../types/commands'

export enum TipState {
  READY = 0,
  LOADING,
  COMPLETE,
  ERROR
}

export const TipButton = (props: PopupProps) => {
  const [tipState, setTipState] = useState(TipState.READY)
  const onClickTip = async () => {
    setTipState(TipState.LOADING)

    const { success } = await sendTip()

    if (success) {
      setTipState(TipState.COMPLETE)
    } else {
      setTipState(TipState.ERROR)
    }

    setTimeout(() => {
      setTipState(TipState.READY)
    }, 1000)
  }

  const sendTip = async () => {
    const message: SendTip = { command: 'sendTip' }

    return new Promise(resolve => {
      props.context.runtime.sendMessage(message, (result: SendTipResult) => {
        resolve(result)
      })
    }) as Promise<SendTipResult>
  }

  const disabled = Object.values(props.context.store.disabling).some(Boolean)

  if (props.context.store.user.canTip && !disabled) {
    switch (tipState) {
      case TipState.READY:
        return (
          <Button
            disabled={props.context.store.monetizedTotal === 0}
            onClick={onClickTip}
          >
            Tip this creator $1!
          </Button>
        )
      case TipState.LOADING:
        return <Button disabled>Tipping...</Button>

      case TipState.COMPLETE:
        return <Button disabled>Tip complete!</Button>

      case TipState.ERROR:
        return <Button disabled>Something went wrong.</Button>
    }
  } else {
    return <></>
  }
}
