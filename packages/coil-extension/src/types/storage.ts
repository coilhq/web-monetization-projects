import { User } from './user'
import { PlayOrPauseState, StickyState } from './streamControls'

export const STORAGE_KEY = {
  // BACKGROUND/POPUP
  token: 'token',
  user: 'user',
  validToken: 'validToken',
  adapted: 'adapted',
  monetized: 'monetized',
  coilSite: 'coilSite',
  monetizedTotal: 'monetizedTotal'
}

/**
 * All values are JSON encoded unless as stored
 * unless stated otherwise
 */
export interface LocalStorageProxy {
  /**
   * The refresh token for authenticating to the coil site
   * NOT JSON encoded
   */
  token?: string | null

  /**
   * JSON serialized {@link User}
   */
  user?: User | null
  /**
   * Boolean
   */
  validToken?: boolean | null

  adapted?: boolean | null
  monetized?: boolean | null
  coilSite?: string | null

  isPaying?: boolean | null

  stickyState?: StickyState | null
  playState?: PlayOrPauseState | null

  monetizedTotal?: number | null

  extensionBuildString?: string | null
  extensionPopupFooterString?: string | null
}
