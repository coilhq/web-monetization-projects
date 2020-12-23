import React, { FormEvent, useState } from 'react'
import {
  Divider,
  FormControlLabel,
  FormGroup,
  Grid,
  styled,
  Switch,
  Typography
} from '@material-ui/core'

import { totals } from './mockData'
import { PageHistory } from './pageHistory'

const AdaptedLogos = styled(Grid)({
  padding: '8px 0 16px 16px',
  flex: '0 1 120px'
})

const TwitchLogo = styled('img')({
  height: '24px',
  position: 'relative',
  top: '11px',
  display: 'inline-flex'
})

const YoutubeLogo = styled('img')({
  height: '18px',
  position: 'relative',
  top: '13px',
  display: 'inline-flex'
})

const LogoCircle = styled('div')({
  background: '#fff',
  borderRadius: '2rem',
  boxShadow: '1px 1px 5px #c3d3d0',
  height: '44px',
  textAlign: 'center',
  width: '44px',
  marginRight: '8px'
})

const YoutubeTwitchCheckbox = styled(Grid)({
  margin: '10px 0 16px 0',
  '& img': {
    width: '24px',
    textAlign: 'left',
    paddingLeft: '5px'
  },
  '& label': {
    padding: '0 0 0 12px',
    margin: 0
  },
  '& span': {
    fontWeight: 400
  }
})

const OptionsRow = styled(Grid)({
  margin: '16px 0'
})
export const OldOptions = () => {
  const [privacyChecked, setPrivacyChecked] = useState(false)

  const [domain, setDomain] = useState('local')

  const handlePrivacyChange = () => {
    setPrivacyChecked(!privacyChecked)
  }

  const handleDomainChange = (event: FormEvent<HTMLInputElement>) => {
    setDomain(event.currentTarget.value)
  }

  const totalSeconds = totals.reduce(
    (acc, item) => acc + item.streamingTimeTotalSeconds,
    0
  )
  const label = 'Adapt non-monetized pages by sending URL anonymously'

  return (
    <>
      <Grid item xs={12}>
        <Typography variant='h1' align='left'>
          Privacy
        </Typography>
        <Divider variant='middle' />
        <Grid container direction='column'>
          <Grid item xs={12}>
            <OptionsRow container justify='space-between' direction='row'>
              <Grid item xs={12} sm={10}>
                <Grid container direction='row'>
                  <AdaptedLogos item xs>
                    <Grid container direction='row'>
                      <LogoCircle>
                        <YoutubeLogo
                          src='../../res/youtube.svg'
                          alt='YouTube'
                        />
                      </LogoCircle>
                      <LogoCircle>
                        <TwitchLogo src='../../res/twitch.svg' alt='Twitch' />
                      </LogoCircle>
                    </Grid>
                  </AdaptedLogos>
                  <YoutubeTwitchCheckbox item xs>
                    <FormGroup row>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={privacyChecked}
                            onChange={handlePrivacyChange}
                            value='privacyChecked'
                            color='primary'
                          />
                        }
                        label={label}
                      />
                    </FormGroup>
                  </YoutubeTwitchCheckbox>
                </Grid>
              </Grid>
            </OptionsRow>
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={12}>
        <Typography variant='h1' align='left'>
          History
        </Typography>
        <Divider variant='middle' />
        <PageHistory totalStreamingTimeSeconds={totalSeconds} totals={totals} />
      </Grid>
    </>
  )
}
