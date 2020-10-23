import '@abraham/reflection'

import ReactDOM from 'react-dom'
import React from 'react'
import { Grid, styled, Typography } from '@material-ui/core'

import { withSharedTheme } from '../shared-theme/withSharedTheme'

import { PageDisabledList } from './pageDisabledList'

const MainPanel = styled('div')(({ theme }) => ({
  marginTop: `${theme.spacing(4)}px`,
  marginBottom: `${theme.spacing(2)}px`,
  width: '100%',
  maxWidth: '1032px',
  marginLeft: `${theme.spacing(2)}px`,
  marginRight: `${theme.spacing(2)}px`,
  padding: `${theme.spacing(2)}px`,
  background: '#ffffff',
  borderRadius: '10px'
}))

function Options() {
  return (
    <Grid container justify='center' alignItems='center'>
      <MainPanel>
        <Typography variant='h1' align='left'>
          Disabled List
        </Typography>
        <PageDisabledList />
      </MainPanel>
    </Grid>
  )
}

const IndexWithRoot = withSharedTheme(Options)

function main() {
  const rootEl = document.getElementById('root')
  ReactDOM.render(<IndexWithRoot />, rootEl)
}

main()
