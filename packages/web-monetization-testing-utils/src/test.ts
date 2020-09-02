import { MonetizationExtendedDocument } from '@web-monetization/types'

import { MonetizationImplTest } from './index'

function makeLogger(logElSelector: string) {
  const logEl = document.querySelector(logElSelector)
  if (!logEl) {
    throw new Error(`missing #log element in document`)
  }
  return (s: string) => (logEl.innerHTML += `${s}\n`)
}

;(async function main() {
  const log = makeLogger('#log')

  const suite = new MonetizationImplTest(
    document as MonetizationExtendedDocument,
    window,
    log
  )

  await suite.test()
})()
