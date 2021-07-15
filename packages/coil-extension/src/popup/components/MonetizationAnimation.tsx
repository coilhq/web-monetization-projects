import React from 'react'

import { useStore } from '../context/storeContext'

export const MonetizeAnimation = () => {
  const store = useStore()
  const animated = Boolean(store.isPaying)

  const hasMonetized = Number(store.monetizedTotal) > 0
  // eslint-disable-next-line no-nested-ternary
  const src = animated
    ? '/res/stream_loop.svg'
    : hasMonetized
    ? '/res/stream_still.svg'
    : '/res/stream_connect_2.svg'

  return <img key={src} alt='animation' src={src} width='171' height='22' />
}
