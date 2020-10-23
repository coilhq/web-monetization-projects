import React, { useState } from 'react'
import { makeStyles } from '@material-ui/core'

const useStyles = makeStyles({
  favicon: {
    marginRight: '10px',
    display: 'flex',
    width: '16px',
    height: '16px',
    flex: 1,
    justifyContent: 'center'
  }
})

const NO_FAVICON = '/res/no-favicon.svg'
const PAYMENT_POINTER = '/res/pp.svg'

export const FaviconLoader = ({
  src,
  origin
}: {
  origin: string
  src: string | undefined
}) => {
  // url or payment pointer
  const normalized = origin.replace(/^\$/, 'https://')

  const favicon = src || `${new URL(normalized).origin}/favicon.ico`
  // Start with /no-favicon
  const [imgPath, setImgPath] = useState(NO_FAVICON)
  const classes = useStyles()

  return (
    <>
      <img
        style={{ display: 'none' }}
        src={favicon}
        onLoad={() => setImgPath(favicon)}
        onError={() => {
          setImgPath(origin.startsWith('$') ? PAYMENT_POINTER : NO_FAVICON)
        }}
      />
      <img className={classes.favicon} src={imgPath} />
    </>
  )
}
