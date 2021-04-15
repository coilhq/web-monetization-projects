import React, { useState } from 'react'
import { Button } from '@material-ui/core'

import { SendTip, SendTipResult } from '../../types/commands'
import { useHost } from '../context/popupHostContext'
import { useStore } from '../context/storeContext'

export enum TipState {
  READY = 0,
  LOADING,
  COMPLETE,
  ERROR
}

export const TipButton = () => {
  const [tipState, setTipState] = useState(TipState.READY)
  const store = useStore()
  const popupHost = useHost()

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
    const message: SendTip = { command: 'sendTip', data: { amount: 1 } }
    return new Promise(resolve => {
      popupHost.runtime.sendMessage(message, (result: SendTipResult) => {
        resolve(result)
      })
    }) as Promise<SendTipResult>
  }

  if (store.user?.canTip) {
    switch (tipState) {
      case TipState.READY:
        return (
          <Button disabled={store.monetizedTotal === 0} onClick={onClickTip}>
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
