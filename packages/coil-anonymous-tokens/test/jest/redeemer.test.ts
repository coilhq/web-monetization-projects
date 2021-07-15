import * as jwt from 'jsonwebtoken'

import { AnonymousTokens } from '../../src/index'
import { MockStore } from '../mocks/store'

const APP_SECRET = process.env.APP_SECRET || 'test'
const BTP_SECRET = process.env.BTP_SECRET || 'btp_test'

const TOKENS_SERVICE_TEST = Boolean(process.env.TOKENS_SERVICE_TEST)

// Integration test against the redeemer service running locally
;(TOKENS_SERVICE_TEST ? describe : describe.skip)(
  'Anonymous tokens service',
  () => {
    let tokens: AnonymousTokens
    let coilAuthToken: string

    beforeEach(() => {
      coilAuthToken = jwt.sign(
        {
          agg: 1000000000000,
          userId: 'abcdefg'
        },
        APP_SECRET,
        {
          expiresIn: 3600 * 24
        }
      )

      tokens = new AnonymousTokens({
        redeemerUrl: 'http://localhost:8081/redeemer',
        signerUrl: 'http://localhost:8080/issuer',
        store: new MockStore(),
        // eslint-disable-next-line no-console
        debug: console.debug,
        batchSize: 10
      })
    })

    it('should successfully get tokens issued & redeemed', async () => {
      await tokens['populateTokens'](coilAuthToken)

      const redeemed = await tokens.getToken(coilAuthToken)
      const decoded = jwt.verify(redeemed.btpToken, BTP_SECRET) as any

      expect(decoded.userId).toMatch(/^anon:/)
      expect(decoded.anon).toBe(true)
    })

    it('should redeem twice', async () => {
      await tokens['populateTokens'](coilAuthToken)

      const redeemed = await tokens.getToken(coilAuthToken)
      const redeemed2 = await tokens.getToken(coilAuthToken)
      const decoded = jwt.verify(redeemed.btpToken, BTP_SECRET) as any
      const decoded2 = jwt.verify(redeemed2.btpToken, BTP_SECRET) as any

      expect(decoded.userId).toEqual(decoded2.userId)
    })
  }
)
