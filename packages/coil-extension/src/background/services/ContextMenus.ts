import { inject, injectable } from 'inversify'
import * as tokens from '@web-monetization/wext/tokens'

@injectable()
export class ContextMenus {
  constructor(
    @inject(tokens.WextApi)
    private api = chrome
  ) {}

  bind() {
    const tryme = { id: 'tryme', title: 'Try Me!', contexts: ['all'] }
    const tryme2 = {
      id: 'tryme2',
      title: 'Try Me 2!',
      contexts: ['all'],
      parentId: tryme.id
    }
    this.api.contextMenus.create(tryme)
    this.api.contextMenus.create(tryme2)
    this.api.contextMenus.onClicked.addListener(event => {
      if (event.menuItemId === tryme.id) {
        console.log('TRY ME CLICKED!!!')
      }
    })
  }
}
