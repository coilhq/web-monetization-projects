import { EventEmitter } from 'events'

import { decorate, injectable } from 'inversify'
import { inversifyModule } from '@dier-makr/inversify'
import { GlobalModule } from '@dier-makr/annotations'

export function decorateThirdPartyClasses() {
  inversifyModule(GlobalModule)
  decorate(injectable(), EventEmitter)
}
