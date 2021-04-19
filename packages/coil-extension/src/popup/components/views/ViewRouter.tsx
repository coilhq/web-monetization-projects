import React from 'react'

import { useStore } from '../../context/storeContext'

import { LoggedOutView } from './LoggedOutView'
import { UnsubscribedView } from './UnsubscribedView'
import { CoilExploreView } from './CoilExploreView'
import { CoilPopupView } from './CoilPopupView'
import { MonetizedRouter } from './MonetizedRouter'
import { UnmonetizedPageView } from './UnmonetizedPageView'

export function ViewRouter(): React.ReactElement {
  const { validToken, user, monetized, coilSite } = useStore()

  //* Moved all the render logic from Status, PaidViews, CoilViews, and MonetizedPage here to Index
  //* Not sure how I feel about the readability vs the original method.

  //
  // Invalid user views
  //
  if (!validToken && !user) {
    return <LoggedOutView />
  }
  if (!user?.subscription || (user.subscription && !user.subscription.active)) {
    return <UnsubscribedView />
  }

  //
  // Paid views
  //

  // Coil views
  if (coilSite && !monetized) {
    // CoilViews
    const { pathname } = new URL(coilSite)

    if (pathname === '/explore') {
      return <CoilExploreView />
    } else {
      return <CoilPopupView />
    }
  }

  // Monetized views
  if (monetized) {
    return <MonetizedRouter /> // handles the monetized views based on local state
  } else {
    // Non Monetized Page
    return <UnmonetizedPageView />
  }
}