import { Darp, Mapping } from '../../src/logging/records'

describe('Darp', () => {
  it('ok', () => {
    const logger = new Darp<Mapping>()
    logger.derp(
      'Stream:token-exhausted',
      // Who said the format string even needs to be evaluated locally ?
      // Is there value in seeing the format string separately?
      // A log viewer could be some other app, using WebRTC ??
      // A format string is flexible, functions can be serialized ??
      // why would you want to serialize a function? what about using variables
      // outside the closure ... what about minification ?
      // minification won't matter because it's passing a whole object in
      o => `anonymous token exhausted; retrying, err=${o.errorMessage}`,
      { errorMessage: 'error.message' }
    )
  })
})
