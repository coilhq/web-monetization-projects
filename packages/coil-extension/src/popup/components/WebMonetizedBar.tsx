import React, { FormEvent, useState } from 'react'
import Typography from '@material-ui/core/Typography'
import { styled } from '@material-ui/core'
import Menu from '@material-ui/core/Menu'
import withStyles from '@material-ui/core/styles/withStyles'
import MenuItem from '@material-ui/core/MenuItem'
import Switch from '@material-ui/core/Switch'
import FormGroup from '@material-ui/core/FormGroup'
import FormControlLabel from '@material-ui/core/FormControlLabel'

import { Colors } from '../../shared-theme/colors'
import { PopupProps } from '../types'
import { DisablingControls } from '../../types/disabling'
import { SetDisabling } from '../../types/commands'

import { useStorage } from './util/useStorage'

const CoilBar = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  borderTop: `0.5px solid ${Colors.Grey89}`,
  backgroundColor: Colors.White,
  height: '40px',
  textAlign: 'center',
  position: 'relative',
  cursor: 'pointer'
})

const BarBadge = styled('img')({
  position: 'relative',
  marginRight: '8px',
  height: '14px',
  width: '13px'
})

const BarBlock = styled('img')({
  position: 'relative',
  marginRight: '7px',
  height: '14px',
  width: '14px'
})

const BarWrap = styled('a')({
  display: 'flex',
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%'
})

const CoilMenu = withStyles({
  paper: {
    minWidth: '113px'
  },
  list: {
    '& a': {
      paddingRight: 0
    },
    '& li': {
      paddingRight: 0,
      '& div': {
        width: '100%',
        paddingRight: 0,
        '& label': {
          width: 'calc(100% + 11px)',
          marginRight: 0,
          '& span:nth-child(2)': {
            paddingRight: '16px'
          }
        }
      }
    }
  }
})(Menu)

const MonitizedState = withStyles({
  root: {
    height: '100%'
  }
})(Typography)

const BlockSwitch = withStyles({
  switchBase: {
    color: Colors.Grey89,
    '&$checked': {
      color: Colors.Green700
    },
    '&$checked + $track': {
      backgroundColor: Colors.Green800
    }
  },
  checked: {},
  track: {}
})(Switch)

type ClickEvent = FormEvent<HTMLElement>

export const WebMonetizedBar = (props: PopupProps) => {
  const { monetized, adapted, coilSite, validToken } = props.context.store
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [hovered, setHovered] = useState(false)

  const [blockOptions, setBlockOptions] = useStorage<DisablingControls>(
    'disabling',
    {
      disableDomain: false,
      disableUrl: false,
      disablePaymentPointer: false
    }
  )

  const handleBlockOptionsChange = (event: FormEvent<HTMLInputElement>) => {
    const updated: DisablingControls = {
      ...blockOptions,
      [event.currentTarget.name]: event.currentTarget.checked
    }
    setBlockOptions(updated)
    const msg: SetDisabling = {
      command: 'setDisabling',
      data: updated
    }
    props.context.runtime.sendMessage(msg)
  }

  const handleMenuClick = (event: ClickEvent) => {
    setAnchorEl(event.currentTarget)
    setHovered(true)
  }

  const handleMenuClose = (event: ClickEvent) => {
    setAnchorEl(null)
    setHovered(false)
  }

  if (coilSite && !monetized) {
    return null
  } else {
    // TODO: adapted here should mean adaptable
    const contentOrSite = adapted ? 'content' : 'site'
    const disabled = Object.values(blockOptions).some(Boolean)
    const showDisable = validToken && (hovered || disabled)
    return (
      <CoilBar
        onMouseMove={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseEnter={() => setHovered(true)}
      >
        <MonitizedState variant='caption'>
          <BarWrap
            onClick={event => {
              if (showDisable) {
                handleMenuClick(event)
              }
            }}
          >
            {/* eslint-disable-next-line no-nested-ternary */}
            {disabled ? (
              <BarBlock src='/res/block.svg' width='14' height='14' />
            ) : hovered ? (
              <BarBlock src='/res/block-preview.svg' />
            ) : (
              <BarBadge
                src={monetized ? '/res/dollar.svg' : '/res/nodollar.svg'}
                width='13'
                height='14'
              />
            )}

            {adapted && monetized
              ? ' Coil can donate to this channel'
              : ' This ' + contentOrSite + ' is'}
            {monetized ? '' : ' not'}
            {monetized && adapted ? '' : ' Web-Monetized'}
          </BarWrap>
          <CoilMenu
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'left'
            }}
            transformOrigin={{
              vertical: 'bottom',
              horizontal: 'left'
            }}
            PaperProps={{
              style: {
                transform: 'translateX(30px)'
              }
            }}
            onClose={handleMenuClose}
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            getContentAnchorEl={null}
          >
            <MenuItem dense divider>
              <FormGroup row>
                <FormControlLabel
                  control={
                    <BlockSwitch
                      checked={blockOptions.disableDomain}
                      onChange={handleBlockOptionsChange}
                      name='disableDomain'
                    />
                  }
                  label='Disable Site'
                />
              </FormGroup>
            </MenuItem>
            <MenuItem dense divider>
              <FormGroup row>
                <FormControlLabel
                  control={
                    <BlockSwitch
                      checked={blockOptions.disableUrl}
                      onChange={handleBlockOptionsChange}
                      name='disableUrl'
                    />
                  }
                  label='Disable Page'
                />
              </FormGroup>
            </MenuItem>
            <MenuItem dense>
              <FormGroup row>
                <FormControlLabel
                  control={
                    <BlockSwitch
                      checked={blockOptions.disablePaymentPointer}
                      onChange={handleBlockOptionsChange}
                      name='disablePaymentPointer'
                    />
                  }
                  label='Disable Payment Pointer'
                />
              </FormGroup>
            </MenuItem>
          </CoilMenu>
        </MonitizedState>
      </CoilBar>
    )
  }
}
