import { User } from './user'
import { PlayOrPauseState, StickyState } from './streamControls'
import { DisablingControls } from './disabling'

export const STORAGE_KEY = {
  // BACKGROUND/POPUP
  token: 'token',
  user: 'user',
  validToken: 'validToken',
  adapted: 'adapted',
  monetized: 'monetized',
  coilSite: 'coilSite',
  monetizedTotal: 'monetizedTotal',
  monetizedFavicon: 'monetizedFavicon'
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
   * JSON serialized {@link DisablingControls}
   */
  disabling?: DisablingControls | null

  /**
   * Boolean
   */
  validToken?: boolean | null

  adapted?: boolean | null
  monetized?: boolean | null
  coilSite?: string | null

  stickyState?: StickyState | null
  playState?: PlayOrPauseState | null

  monetizedTotal?: number | null
  monetizedFavicon?: string | null
}
