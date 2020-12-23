import React, { useEffect, useRef, useState } from 'react'

import { PopupProps } from '../types'
import { ToPopupMessage } from '../../types/commands'
import { notNullOrUndef } from '../../util/nullables'

const ANIMATION_INTERVAL = 1800

export const MonetizeAnimation = (props: PopupProps) => {
  const [lastPacket, setLastPacket] = useState<Date | null>(null)
  const [animated, setAnimated] = useState<boolean | null>(false)
  const lastPacketRef = useRef(lastPacket)
  lastPacketRef.current = lastPacket

  useEffect(() => {
    // We use window.setTimeout later, due to @types/node setTimeout types
    let animateTimeout: number | null

    const loopHandler = () => {
      const now = new Date()
      const lastPacketPlus2s = new Date(notNullOrUndef(lastPacketRef.current))
      lastPacketPlus2s.setSeconds(lastPacketPlus2s.getSeconds() + 2)
      if (now > lastPacketPlus2s) {
        animateTimeout = null
        setAnimated(false)
      } else {
        animateTimeout = window.setTimeout(loopHandler, ANIMATION_INTERVAL)
      }
    }

    const listener = (msg: ToPopupMessage) => {
      if (
        msg.command === 'localStorageUpdate' &&
        msg.key === 'monetizedTotal' &&
        props.context.store.monetizedTotal > 0
      ) {
        setLastPacket(new Date())
        setAnimated(true)
        if (!animateTimeout) {
          window.setTimeout(loopHandler, ANIMATION_INTERVAL)
        }
      }
    }
    props.context.runtime.onMessageAddListener(listener)
    return () => {
      props.context.runtime.onMessageRemoveListener(listener)
      if (animateTimeout != null) {
        window.clearTimeout(animateTimeout)
      }
    }
  }, [])

  const isPaused = props.context.store.playState === 'paused'
  const hasMonetized = props.context.store.monetizedTotal > 0
  // eslint-disable-next-line no-nested-ternary
  const src = animated
    ? '/res/stream_loop.svg'
    : hasMonetized || isPaused
    ? '/res/stream_still.svg'
    : '/res/stream_connect_2.svg'

  return <img key={src} alt='animation' src={src} width='171' height='22' />
}
