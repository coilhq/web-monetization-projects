import { inject, injectable } from 'inversify'
import * as tokens from '@webmonetization/wext/tokens'

@injectable()
export class GpcService {
  /*

  "id" as declared in manifest.json

  "declarative_net_request" : {
    "rule_resources": [{
      "id" : "gpc_header",
      "enabled": true,
      "path": "gpc.json"
    }]
  },

  **/
  static RULE_ID = 'gpc_header'

  constructor(
    @inject(tokens.WextApi)
    private api = chrome
  ) {}

  async enable(): Promise<void> {
    await this.api.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [GpcService.RULE_ID.toString()]
    })
  }

  async disable(): Promise<void> {
    await this.api.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: [GpcService.RULE_ID.toString()]
    })
  }
}
