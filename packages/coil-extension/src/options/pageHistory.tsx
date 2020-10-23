import React from 'react'
import { Grid, Hidden, Typography, styled, makeStyles } from '@material-ui/core'

import { formatAmount } from '../util/currencyFormatting'
import { Colors } from '../shared-theme/colors'

import { PageTimeBar } from './pageTimeBar'
import { PageTotal } from './interfaces'

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
      fontSize: '20px'
    },
    favicon: {
      margin: '9px 8px 8px 0'
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

const PageHistoryH4 = styled(Typography)(({ theme }) => ({
  margin: `${theme.spacing(2)}px 0`
}))

const MobileHeading = styled(Typography)({
  margin: '12px 0 12px 0',
  display: 'inline-flex'
})

const Favicon = styled('img')({
  width: '16px'
})

const Headings = styled('div')({
  margin: '16px 24px'
})

const Row = styled('div')({
  margin: '4px 8px 0',
  padding: '8px 16px',
  borderBottom: `2px solid ${Colors.Grey50}`,
  flexDirection: 'row'
})

const DomainRow = styled(Grid)({
  flexDirection: 'row'
})

const PageHistoryAmount = styled('div')({
  borderRadius: '20px',
  background: Colors.Grey900,
  color: Colors.White,
  fontSize: '14px',
  padding: '2px 16px',
  margin: '2px 0 2px 0',
  display: 'inline-flex',
  justifyItems: 'center',
  alignContent: 'center'
})

export const PageHistory = (props: {
  totalStreamingTimeSeconds: number
  totals: Array<PageTotal>
}) => {
  const classes = useStyles()

  return (
    <>
      <Hidden xsDown>
        <Headings>
          <Grid container>
            <Grid item sm={5}>
              <PageHistoryH4 variant='h4'>DOMAIN</PageHistoryH4>
            </Grid>
            <Grid item sm={4}>
              <PageHistoryH4 variant='h4'>TIME</PageHistoryH4>
            </Grid>
            <Grid item sm={3}>
              <Grid container justify='center'>
                <PageHistoryH4 variant='h4'>RECEIVED</PageHistoryH4>
              </Grid>
            </Grid>
          </Grid>
        </Headings>
      </Hidden>
      {props.totals.map((total: PageTotal, i: number) => {
        return (
          <Row key={`pageTotal-${i}`}>
            <Grid container direction='row'>
              <Grid item xs={12} sm={5}>
                <DomainRow
                  container
                  direction='row'
                  className={classes.domainRow}
                >
                  <Grid item>
                    <Favicon
                      className={classes.favicon}
                      width='16'
                      src={
                        total.favIcon
                          ? total.favIcon
                          : '../../res/no-favicon.png'
                      }
                      alt={total.key.origin}
                    />
                  </Grid>
                  <Grid item>
                    <Typography variant='h4' className={classes.domainH4}>
                      {total.key.origin}
                    </Typography>
                  </Grid>
                </DomainRow>
              </Grid>

              <Grid item xs={12} sm={4}>
                <Grid
                  container
                  justify='center'
                  alignItems='center'
                  direction='row'
                >
                  <Hidden smUp>
                    <Grid item xs={6}>
                      <MobileHeading variant='h4'>TIME</MobileHeading>
                    </Grid>
                  </Hidden>
                  <Grid item xs={6} sm={12}>
                    <PageTimeBar
                      total={props.totalStreamingTimeSeconds}
                      fraction={total.streamingTimeTotalSeconds}
                    />
                  </Grid>
                </Grid>
              </Grid>

              <Grid item xs={12} sm={3}>
                <Grid
                  container
                  justify='center'
                  alignItems='center'
                  direction='row'
                >
                  <Hidden smUp>
                    <Grid item xs={6}>
                      <MobileHeading variant='h4'>RECEIVED</MobileHeading>
                    </Grid>
                  </Hidden>
                  <Grid item xs={6} sm={12}>
                    <div className={classes.centerElement}>
                      <PageHistoryAmount>
                        {formatAmount(total.total)}
                      </PageHistoryAmount>
                    </div>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Row>
        )
      })}
    </>
  )
}
