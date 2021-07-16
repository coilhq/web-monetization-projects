/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { StackFrame } from '../stackframe'

const FIREFOX_SAFARI_STACK_REGEXP = /(^|@)\S+:\d+/
const CHROME_IE_STACK_REGEXP = /^\s*at .*(\S+:\d+|\(native\))/m

const SAFARI_NATIVE_CODE_REGEXP = /^(eval@)?(\[native code])?$/

type OperaError = {
  stacktrace: string
  'opera#sourceloc': string
}

function isOperaError(error: unknown): error is OperaError {
  const asOpera = error as OperaError
  return (
    typeof asOpera['opera#sourceloc'] !== 'undefined' &&
    typeof asOpera.stacktrace !== 'undefined'
  )
}

export const ErrorStackParser = {
  /**
   * Given an Error object, extract the most information from it.
   *
   * @param {Error} error object
   * @return {Array} of StackFrames
   */
  parse: function ErrorStackParser$$parse(error: Error) {
    if (isOperaError(error)) {
      return this.parseOpera(error)
    } else if (error.stack && error.stack.match(CHROME_IE_STACK_REGEXP)) {
      return this.parseV8OrIE(error)
    } else if (error.stack) {
      return this.parseFFOrSafari(error)
    } else {
      throw new Error('Cannot parse given Error object')
    }
  },

  // Separate line and column numbers from a string of the form: (URI:Line:Column)
  extractLocation: function ErrorStackParser$$extractLocation(urlLike: string) {
    // Fail-fast but return locations like "(native)"
    if (urlLike.indexOf(':') === -1) {
      return [urlLike]
    }

    const regExp = /(.+?)(?::(\d+))?(?::(\d+))?$/
    const parts = regExp.exec(urlLike.replace(/[()]/g, ''))!
    return [parts[1], parts[2] || undefined, parts[3] || undefined]
  },

  parseV8OrIE: function ErrorStackParser$$parseV8OrIE(error: Error) {
    if (!error.stack) {
      throw new Error()
    }

    const filtered = error.stack.split('\n').filter(function (line) {
      return !!line.match(CHROME_IE_STACK_REGEXP)
    }, this)

    return filtered.map(function (line) {
      if (line.indexOf('(eval ') > -1) {
        // Throw away eval information until we implement stacktrace.js/stackframe#8
        line = line
          .replace(/eval code/g, 'eval')
          .replace(/(\(eval at [^()]*)|(\),.*$)/g, '')
      }
      let sanitizedLine = line.replace(/^\s+/, '').replace(/\(eval code/g, '(')

      // capture and preseve the parenthesized location "(/foo/my bar.js:12:87)" in
      // case it has spaces in it, as the string is split on \s+ later on
      const location = sanitizedLine.match(/ (\((.+):(\d+):(\d+)\)$)/)

      // remove the parenthesized location from the line, if it was matched
      sanitizedLine = location
        ? sanitizedLine.replace(location[0], '')
        : sanitizedLine

      const tokens = sanitizedLine.split(/\s+/).slice(1)
      // if a location was matched, pass it to extractLocation() otherwise pop the last token
      const locationParts = ErrorStackParser.extractLocation(
        location ? location[1] : tokens.pop()!
      )
      const functionName = tokens.join(' ') || undefined
      const fileName =
        ['eval', '<anonymous>'].indexOf(locationParts[0]!) > -1
          ? undefined
          : locationParts[0]

      return new StackFrame({
        functionName: functionName,
        fileName: fileName,
        lineNumber: locationParts[1] as unknown as number,
        columnNumber: locationParts[2] as unknown as number,
        source: line
      })
    }, this)
  },

  parseFFOrSafari: function ErrorStackParser$$parseFFOrSafari(error: Error) {
    if (!error.stack) {
      throw new Error(`expecting stack to be defined`)
    }
    const filtered = error.stack.split('\n').filter(function (line: string) {
      return !line.match(SAFARI_NATIVE_CODE_REGEXP)
    }, this)

    return filtered.map(function (line) {
      // Throw away eval information until we implement stacktrace.js/stackframe#8
      if (line.indexOf(' > eval') > -1) {
        line = line.replace(
          / line (\d+)(?: > eval line \d+)* > eval:\d+:\d+/g,
          ':$1'
        )
      }

      if (line.indexOf('@') === -1 && line.indexOf(':') === -1) {
        // Safari eval frames only have function names and nothing else
        return new StackFrame({
          functionName: line
        })
      } else {
        const functionNameRegex = /((.*".+"[^@]*)?[^@]*)(?:@)/
        const matches = line.match(functionNameRegex)
        const functionName = matches && matches[1] ? matches[1] : undefined
        const locationParts = ErrorStackParser.extractLocation(
          line.replace(functionNameRegex, '')
        )

        return new StackFrame({
          functionName: functionName,
          fileName: locationParts[0],
          lineNumber: locationParts[1] as unknown as number,
          columnNumber: locationParts[2] as unknown as number,
          source: line
        })
      }
    }, this)
  },

  parseOpera: function ErrorStackParser$$parseOpera(e: Error & OperaError) {
    if (
      !e.stacktrace ||
      (e.message.indexOf('\n') > -1 &&
        e.message.split('\n').length > e.stacktrace.split('\n').length)
    ) {
      return this.parseOpera9(e)
    } else if (!e.stack) {
      return this.parseOpera10(e)
    } else {
      return this.parseOpera11(e)
    }
  },

  parseOpera9: function ErrorStackParser$$parseOpera9(e: Error) {
    const lineRE = /Line (\d+).*script (?:in )?(\S+)/i
    const lines = e.message.split('\n')
    const result = []

    for (let i = 2, len = lines.length; i < len; i += 2) {
      const match = lineRE.exec(lines[i])
      if (match) {
        result.push(
          new StackFrame({
            fileName: match[2],
            lineNumber: match[1] as unknown as number,
            source: lines[i]
          })
        )
      }
    }

    return result
  },

  parseOpera10: function ErrorStackParser$$parseOpera10(e: OperaError) {
    const lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i
    const lines = e.stacktrace.split('\n')
    const result = []

    for (let i = 0, len = lines.length; i < len; i += 2) {
      const match = lineRE.exec(lines[i])
      if (match) {
        result.push(
          new StackFrame({
            functionName: match[3] || undefined,
            fileName: match[2],
            lineNumber: match[1] as unknown as number,
            source: lines[i]
          })
        )
      }
    }

    return result
  },

  // Opera 10.65+ Error.stack very similar to FF/Safari
  parseOpera11: function ErrorStackParser$$parseOpera11(error: Error) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const filtered = error.stack!.split('\n').filter(function (line: string) {
      return (
        !!line.match(FIREFOX_SAFARI_STACK_REGEXP) &&
        !line.match(/^Error created at/)
      )
    }, this)

    return filtered.map(function (line) {
      const tokens = line.split('@')
      const locationParts = ErrorStackParser.extractLocation(tokens.pop()!)
      const functionCall = tokens.shift() || ''
      const functionName =
        functionCall
          .replace(/<anonymous function(: (\w+))?>/, '$2')
          .replace(/\([^)]*\)/g, '') || undefined
      let argsRaw
      if (functionCall.match(/\(([^)]*)\)/)) {
        argsRaw = functionCall.replace(/^[^(]+\(([^)]*)\)$/, '$1')
      }
      const args =
        argsRaw === undefined || argsRaw === '[arguments not available]'
          ? undefined
          : argsRaw.split(',')

      return new StackFrame({
        functionName: functionName,
        args: args,
        fileName: locationParts[0],
        lineNumber: locationParts[1] as unknown as number,
        columnNumber: locationParts[2] as unknown as number,
        source: line
      })
    }, this)
  }
}
