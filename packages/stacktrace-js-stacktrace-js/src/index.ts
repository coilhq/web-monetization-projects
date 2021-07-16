/* eslint-disable @typescript-eslint/ban-types,prefer-rest-params */
import { ErrorStackParser } from './error-stack-parser'
import { StackFrame } from './stackframe'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const StackTraceGPS = require('stacktrace-gps')

const StackGenerator = {
  backtrace: function StackGenerator$$backtrace(opts: {
    maxStackSize?: number
  }) {
    const stack = []
    let maxStackSize = 10

    if (typeof opts === 'object' && typeof opts.maxStackSize === 'number') {
      maxStackSize = opts.maxStackSize
    }

    let curr = arguments.callee
    while (curr && stack.length < maxStackSize && curr['arguments']) {
      // Allow V8 optimizations
      const args = new Array(curr['arguments'].length)
      for (let i = 0; i < args.length; ++i) {
        args[i] = curr['arguments'][i]
      }
      if (/function(?:\s+([\w$]+))+\s*\(/.test(curr.toString())) {
        stack.push(
          new StackFrame({ functionName: RegExp.$1 || undefined, args: args })
        )
      } else {
        stack.push(new StackFrame({ args: args }))
      }

      try {
        curr = curr.caller
      } catch (e) {
        break
      }
    }
    return stack
  }
}

type InstrumentedFunction = Function & {
  __stacktraceOriginalFn?: Function
}

export interface SourceCache {
  [key: string]: string | Promise<string>
}

export interface StackTraceOptions extends Record<string, unknown> {
  filter?: (stackFrame: StackFrame) => boolean
  sourceCache?: SourceCache
  offline?: boolean
  maxStackSize?: number
}

const _options = {
  filter: function (stackframe: StackFrame) {
    // Filter out stackframes for this library by default
    return (
      (stackframe.functionName || '').indexOf('StackTrace$$') === -1 &&
      (stackframe.functionName || '').indexOf('ErrorStackParser$$') === -1 &&
      (stackframe.functionName || '').indexOf('StackTraceGPS$$') === -1 &&
      (stackframe.functionName || '').indexOf('StackGenerator$$') === -1
    )
  },
  sourceCache: {}
}

const _generateError = function StackTrace$$GenerateError() {
  try {
    // Error must be thrown to get stack in IE
    throw new Error()
  } catch (err) {
    return err
  }
}

/**
 * Merge 2 given Objects. If a conflict occurs the second object wins.
 * Does not do deep merges.
 *
 * @param {Object} first base object
 * @param {Object} second overrides
 * @returns {Object} merged first and second
 * @private
 */
function _merge(
  first: Record<string, unknown>,
  second?: Record<string, unknown>
) {
  const target: Record<string, unknown> = {}

  ;[first, second].forEach(function (obj) {
    for (const prop in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, prop)) {
        target[prop] = obj[prop]
      }
    }
    return target
  })

  return target as T
}

function _isShapedLikeParsableError(
  err: Error & { 'opera#sourceloc': unknown }
) {
  return err.stack || err['opera#sourceloc']
}

function _filtered(
  stackframes: Array<StackFrame>,
  filter?: (f: StackFrame) => boolean
) {
  if (typeof filter === 'function') {
    return stackframes.filter(filter)
  }
  return stackframes
}
const StackTrace = {
  /**
   * Get a backtrace from invocation point.
   *
   * @param {Object} opts
   * @returns {Array} of StackFrame
   */
  get: async function StackTrace$$get(opts?: StackTraceOptions) {
    const err = _generateError()
    return _isShapedLikeParsableError(err)
      ? this.fromError(err, opts)
      : this.generateArtificially(opts)
  },

  /**
   * Get a backtrace from invocation point.
   * IMPORTANT: Does not handle source maps or guess function names!
   *
   * @param {Object} opts
   * @returns {Array} of StackFrame
   */
  getSync: function StackTrace$$getSync(opts: StackTraceOptions) {
    opts = _merge<StackTraceOptions>(_options, opts)
    const err = _generateError()
    const stack = _isShapedLikeParsableError(err)
      ? ErrorStackParser.parse(err)
      : StackGenerator.backtrace(opts)
    return _filtered(stack, opts.filter)
  },

  /**
   * Given an error object, parse it.
   *
   * @param {Error} error object
   * @param {Object} opts
   * @returns {Promise} for Array[StackFrame}
   */
  fromError: async function StackTrace$$fromError(
    error: Error,
    opts?: StackTraceOptions
  ) {
    opts = _merge<StackTraceOptions>(_options, opts)
    const gps = new StackTraceGPS(opts)
    return new Promise<StackFrame[]>(resolve => {
      const stackframes = _filtered(ErrorStackParser.parse(error), opts?.filter)
      resolve(
        Promise.all(
          stackframes.map(async function (sf) {
            return new Promise<StackFrame>(function (resolve) {
              function resolveOriginal() {
                resolve(sf)
              }
              gps
                .pinpoint(sf)
                .then(resolve, resolveOriginal)
                ['catch'](resolveOriginal)
            })
          })
        )
      )
    })
  },

  /**
   * Use StackGenerator to generate a backtrace.
   *
   * @param {Object} opts
   * @returns {Promise} of Array[StackFrame]
   */
  generateArtificially: async function StackTrace$$generateArtificially(
    opts?: StackTraceOptions
  ) {
    opts = _merge(_options, opts)
    let stackFrames = StackGenerator.backtrace(opts)
    if (typeof opts.filter === 'function') {
      stackFrames = stackFrames.filter(opts.filter)
    }
    return Promise.resolve(stackFrames)
  },

  /**
   * Given a function, wrap it such that invocations trigger a callback that
   * is called with a stack trace.
   *
   * @param {Function} fn to be instrumented
   * @param {Function} callback function to call with a stack trace on invocation
   * @param {Function} errback optional function to call with error if unable to get stack trace.
   * @param {Object} thisArg optional context object (e.g. window)
   */
  instrument: function StackTrace$$instrument(
    fn: InstrumentedFunction,
    callback: any,
    errback: any,
    thisArg: any
  ) {
    if (typeof (fn as unknown) !== 'function') {
      throw new Error('Cannot instrument non-function object')
    } else if (typeof fn.__stacktraceOriginalFn === 'function') {
      // Already instrumented, return given Function
      return fn
    }

    const instrumented: InstrumentedFunction =
      function StackTrace$$instrumented(this: typeof StackTrace) {
        try {
          this.get().then(callback, errback)['catch'](errback)
          return fn.apply(thisArg || this, arguments)
        } catch (e) {
          if (_isShapedLikeParsableError(e)) {
            this.fromError(e).then(callback, errback)['catch'](errback)
          }
          throw e
        }
      }.bind(this)
    instrumented.__stacktraceOriginalFn = fn

    return instrumented
  },

  /**
   * Given a function that has been instrumented,
   * revert the function to it's original (non-instrumented) state.
   *
   * @param {Function} fn to de-instrument
   */
  deinstrument: function StackTrace$$deinstrument(fn: InstrumentedFunction) {
    if (typeof (fn as unknown) !== 'function') {
      throw new Error('Cannot de-instrument non-function object')
    } else if (typeof fn.__stacktraceOriginalFn === 'function') {
      return fn.__stacktraceOriginalFn
    } else {
      // Function not instrumented, return original
      return fn
    }
  },

  /**
   * Given an error message and Array of StackFrames, serialize and POST to given URL.
   *
   * @param {Array} stackframes
   * @param {String} url
   * @param {String} errorMsg
   * @param {Object} requestOptions
   */
  report: async function StackTrace$$report(
    stackframes: Array<StackFrame>,
    url: string,
    errorMsg?: string,
    requestOptions?: { headers: Record<string, string> }
  ) {
    return new Promise(function (resolve, reject) {
      const req = new XMLHttpRequest()
      req.onerror = reject
      req.onreadystatechange = function onreadystatechange() {
        if (req.readyState === 4) {
          if (req.status >= 200 && req.status < 400) {
            resolve(req.responseText)
          } else {
            reject(
              new Error(`POST to ${url} failed with status: ${req.status}`)
            )
          }
        }
      }
      req.open('post', url)

      // Set request headers
      req.setRequestHeader('Content-Type', 'application/json')
      if (requestOptions && typeof requestOptions.headers === 'object') {
        const headers = requestOptions.headers
        for (const header in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, header)) {
            req.setRequestHeader(header, headers[header])
          }
        }
      }

      const reportPayload: { stack: StackFrame[]; message?: string } = {
        stack: stackframes
      }
      if (errorMsg !== undefined && errorMsg !== null) {
        reportPayload.message = errorMsg
      }

      req.send(JSON.stringify(reportPayload))
    })
  }
}
