export interface A {
  aOne: number
}

export interface B {
  bOne: string
}

interface TokenExhausted {
  errorMessage: string
}

interface ErrorStreaming {
  error: {
    message: string
    stack: string
  }
}

type StreamLogs = {
  'token-exhausted': TokenExhausted
  'error-streaming': ErrorStreaming
}

export type Mapping = {
  a: A
  b: B
} & { [Key in keyof StreamLogs as `Stream:${Key}`]: StreamLogs[Key] }

type MappingKeys = keyof Mapping

export class Darp<M> {
  derp<T extends keyof M>(
    t: T,
    fmt: ((o: M[T]) => string) | string,
    obj: M[T]
  ) {
    if (typeof fmt === 'function') {
      const body = fmt.toString().slice(4)
      const function1 = eval(fmt.toString()) //// new Function('o', 'return ' + body)
      console.log('fmt.toString()', function1.call(null, obj))
      fmt = fmt.call(null, obj)
    }
  }
}

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
  { errorMessage: 'omg! we are all going to die!' }
)

logger.derp(
  'Stream:error-streaming',
  o => `${o.error.message} ${o.error.message}`,
  { error: { stack: '', message: '' } }
)

class BackgroundLogger {}

logger.derp('b', '', { bOne: 'Promise' })
