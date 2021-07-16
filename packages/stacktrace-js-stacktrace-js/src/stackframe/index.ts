/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StackFrameOptions {
  isConstructor?: boolean
  isEval?: boolean
  isNative?: boolean
  isToplevel?: boolean
  columnNumber?: number
  lineNumber?: number
  fileName?: string
  functionName?: string
  source?: string
  args?: any[]
  evalOrigin?: StackFrame
}

function _isNumber(n: string | number) {
  // TODO: this must have worked
  return !isNaN(parseFloat(n as string)) && isFinite(n as number)
}

function _capitalize<T extends string>(str: T) {
  return (str.charAt(0).toUpperCase() + str.substring(1)) as Capitalize<T>
}

function _getter(p: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    return this[p]
  }
}

const booleanProps = [
  'isConstructor',
  'isEval',
  'isNative',
  'isToplevel'
] as const
const numericProps = ['columnNumber', 'lineNumber'] as const
const stringProps = ['fileName', 'functionName', 'source'] as const
const arrayProps = ['args'] as const
const objectProps = ['evalOrigin'] as const

const props = [
  ...booleanProps,
  ...numericProps,
  ...stringProps,
  ...arrayProps,
  ...objectProps
] as const

export class StackFrame {
  constructor(obj: StackFrameOptions) {
    if (!obj) return
    for (let i = 0; i < props.length; i++) {
      if (obj[props[i]] !== undefined) {
        const set = 'set' + _capitalize(props[i])
        const value = obj[props[i]]
        // eslint-disable-next-line @typescript-eslint/ban-types
        const thisA = this as unknown as Record<string, Function>
        thisA[set](value)
      }
    }
  }

  getArgs() {
    return this.args
  }

  setArgs(v: any[]) {
    if (Object.prototype.toString.call(v) !== '[object Array]') {
      throw new TypeError('Args must be an Array')
    }
    this.args = v
  }

  getEvalOrigin() {
    return this.evalOrigin
  }

  setEvalOrigin(v: StackFrame | StackFrameOptions) {
    if (v instanceof StackFrame) {
      this.evalOrigin = v
    } else if (typeof v === 'object') {
      this.evalOrigin = new StackFrame(v)
    } else {
      throw new TypeError('Eval Origin must be an Object or StackFrame')
    }
  }

  toString() {
    const fileName = this.getFileName() || ''
    const lineNumber = this.getLineNumber() || ''
    const columnNumber = this.getColumnNumber() || ''
    const functionName = this.getFunctionName() || ''
    if (this.getIsEval()) {
      if (fileName) {
        return `[eval] (${fileName}:${lineNumber}:${columnNumber})`
      }
      return `[eval]:${lineNumber}:${columnNumber}`
    }
    if (functionName) {
      return `${functionName} (${fileName}:${lineNumber}:${columnNumber})`
    }
    return `${fileName}:${lineNumber}:${columnNumber}`
  }

  static fromString(str: string): StackFrame {
    const argsStartIndex = str.indexOf('(')
    const argsEndIndex = str.lastIndexOf(')')

    const functionName = str.substring(0, argsStartIndex)
    const args = str.substring(argsStartIndex + 1, argsEndIndex).split(',')
    const locationString = str.substring(argsEndIndex + 1)

    let fileName: string | undefined = undefined
    let lineNumber: number | undefined = undefined
    let columnNumber: number | undefined = undefined

    if (locationString.indexOf('@') === 0) {
      const parts = /@(.+?)(?::(\d+))?(?::(\d+))?$/.exec(locationString)
      if (parts) {
        fileName = parts[1]
        lineNumber = Number(parts[2])
        columnNumber = Number(parts[3])
      }
    }

    return new StackFrame({
      functionName: functionName,
      args: args,
      fileName: fileName,
      lineNumber: lineNumber,
      columnNumber: columnNumber
    })
  }
}

export interface StackFrame {
  args?: any[]

  getArgs(): any[] | undefined

  setArgs(args: any[]): void

  evalOrigin?: StackFrame

  getEvalOrigin(): StackFrame | undefined

  setEvalOrigin(stackframe: StackFrame | StackFrameOptions): void

  isConstructor?: boolean

  getIsConstructor(): boolean | undefined

  setIsConstructor(isConstructor: boolean): void

  isEval?: boolean

  getIsEval(): boolean | undefined

  setIsEval(isEval: boolean): void

  isNative?: boolean

  getIsNative(): boolean | undefined

  setIsNative(isNative: boolean): void

  isToplevel?: boolean

  getIsToplevel(): boolean | undefined

  setIsToplevel(isToplevel: boolean): void

  columnNumber?: number

  getColumnNumber(): number | undefined

  setColumnNumber(columnNumber: number): void

  lineNumber?: number

  getLineNumber(): number | undefined

  setLineNumber(lineNumber: number): void

  fileName?: string

  getFileName(): string | undefined

  setFileName(fileName: string): void

  functionName?: string

  getFunctionName(): string | undefined

  setFunctionName(functionName: string): void

  source?: string

  getSource(): string | undefined

  setSource(source: string): void

  toString(): string
}

const prototype: any = StackFrame.prototype

for (let i = 0; i < booleanProps.length; i++) {
  prototype['get' + _capitalize(booleanProps[i])] = _getter(booleanProps[i])
  prototype['set' + _capitalize(booleanProps[i])] = (function (p) {
    return function (this: any, v: any) {
      this[p] = Boolean(v)
    }
  })(booleanProps[i])
}

for (let j = 0; j < numericProps.length; j++) {
  prototype['get' + _capitalize(numericProps[j])] = _getter(numericProps[j])
  prototype['set' + _capitalize(numericProps[j])] = (function (p) {
    return function (this: any, v: any) {
      if (!_isNumber(v)) {
        throw new TypeError(p + ' must be a Number')
      }
      this[p] = Number(v)
    }
  })(numericProps[j])
}

for (let k = 0; k < stringProps.length; k++) {
  prototype['get' + _capitalize(stringProps[k])] = _getter(stringProps[k])
  prototype['set' + _capitalize(stringProps[k])] = (function (p) {
    return function (this: any, v: any) {
      this[p] = String(v)
    }
  })(stringProps[k])
}
