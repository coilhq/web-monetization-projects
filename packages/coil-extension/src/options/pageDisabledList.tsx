import React, { useState } from 'react'
import {
  Button,
  Grid,
  Link,
  makeStyles,
  styled,
  Typography
} from '@material-ui/core'
import CloseIcon from '@material-ui/icons/Close'

import { Colors } from '../shared-theme/colors'

import { MOCK_BLOCK_DATA } from './MOCK_BLOCK_DATA'
import { BlockConfig } from './interfaces'
import { FaviconLoader } from './faviconLoader'

// styles for responsiveness
const useStyles = makeStyles(theme => {
  return {
    centerElement: {
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: 'center',
      flexDirection: 'row'
    },
    domainRow: {
      marginTop: '12px'
    },
    domainH4: {
      display: 'inline-flex',
      color: Colors.Grey800,
      marginTop: '5px',
      fontSize: '20px',
      '& .MuiLink-underlineHover': {
        color: 'inherit',
        textDecoration: 'none',
        transition: 'color 0.2s ease-in-out'
      },
      '&:hover': {
        color: Colors.Grey700
      }
    },
    favicon: {
      margin: '9px 8px 8px 0'
    },
    disabledListItem: {
      alignItems: 'center'
    },
    [theme.breakpoints.up('sm')]: {
      domainH4: {
        fontSize: '16px',
        margin: '6px 0'
      },
      centerElement: {
        justify: 'center',
        flexDirection: 'column'
      },
      favicon: {
        margin: '7px 8px 8px 0'
      },
      domainRow: {
        marginTop: 0
      }
    }
  } as const
})

const Row = styled('div')({
  margin: '4px 8px 0',
  padding: '8px 16px',
  borderBottom: `2px solid ${Colors.Grey50}`,
  flexDirection: 'row'
})

const DomainRow = styled(Grid)({
  flexDirection: 'row',
  alignItems: 'center'
})

const ButtonDelete = styled(Button)({
  color: Colors.Grey800,
  background: 'none',
  padding: '10px',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  transition: 'all 0.2s ease-in-out',
  '&.MuiButton-root': {
    minWidth: 'auto !important',
    alignSelf: 'flex-end'
  },
  '& svg path': {
    transition: 'fill 0.2s ease-in-out'
  },
  '&:hover': {
    '& svg path': {
      fill: Colors.Red700
    },
    background: Colors.Grey50
  },
  alignSelf: 'flex-end',
  '& .MuiButton-label': {
    transition: 'fill 0.2s ease-in-out'
  }
})

const BlockList = (props: {
  blockConfigs: BlockConfig[]
  removeBlock: (ix: number) => void
}) => {
  const { blockConfigs, removeBlock } = props
  const classes = useStyles()

  return (
    <>
      {blockConfigs &&
        blockConfigs.map((config: BlockConfig, i: number) => (
          <Row key={config.id}>
            <Grid
              container
              direction='row'
              className={classes.disabledListItem}
            >
              <Grid item xs={12} sm={6}>
                <DomainRow
                  container
                  direction='row'
                  className={classes.domainRow}
                >
                  <Grid item>
                    <FaviconLoader origin={config.value} src={config.favIcon} />
                  </Grid>
                  <Grid item>
                    <Typography variant='h4' className={classes.domainH4}>
                      <Link href={config.value}>{config.value}</Link>
                    </Typography>
                  </Grid>
                </DomainRow>
              </Grid>

              <Grid item xs={12} sm={4}>
                <Grid
                  container
                  justify='flex-start'
                  alignItems='center'
                  direction='row'
                >
                  {config.type}
                </Grid>
              </Grid>

              <Grid item xs={12} sm={2}>
                <Grid
                  container
                  justify='center'
                  alignItems='center'
                  direction='row'
                >
                  <Grid item xs={6} sm={12}>
                    <div className={classes.centerElement}>
                      <ButtonDelete onClick={() => removeBlock(i)}>
                        <CloseIcon />
                      </ButtonDelete>
                    </div>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Row>
        ))}
    </>
  )
}

export const PageDisabledList = () => {
  const [configs, setConfigs] = useState<BlockConfig[]>(MOCK_BLOCK_DATA)

  const removeBlock = (i: number) => {
    configs.splice(i, 1)
    setConfigs([...configs])
  }

  return <BlockList blockConfigs={configs} removeBlock={removeBlock} />
}
