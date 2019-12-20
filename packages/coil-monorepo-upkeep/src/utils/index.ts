import { inspect } from 'util'
import { readFileSync, writeFileSync } from 'fs'
import * as pathModule from 'path'

import { sortPackageJson } from 'sort-package-json'

import { LernaListItem, PackageJSON } from '../types'

import { packageJSONKeysOrder } from './packageJSONKeysOrder'
import { cmd } from './cmd'

const JSON2016: typeof JSON = require('JSON2016/JSON2016.js')

export const pretty = (val: any) => inspect(val, { depth: Infinity })

export function readFileJSON<T = any>(path: string) {
  return JSON2016.parse(readFileSync(path, { encoding: 'utf8' })) as T
}

export function writeFileJSON(
  path: string,
  val: any,
  opts: { prefix?: string; suffix?: string } = {}
) {
  const { prefix = '', suffix = '' } = opts
  return writeFileSync(
    path,
    `${prefix}${JSON.stringify(val, null, 2)}
${suffix}`
  )
}

export function writePackageJSON(
  path: string,
  val: any,
  options?: { sortOrder: string[] }
) {
  const sortPackageJsonOptions = options || { sortOrder: packageJSONKeysOrder }
  return writeFileSync(
    path,
    JSON.stringify(sortPackageJson(val, sortPackageJsonOptions), null, 2) +
      // add trailing new line
      '\n'
  )
}

export function readPackageFile(packageSpec: LernaListItem, path: string) {
  const filePath = pathModule.join(packageSpec.location, path)
  return readFileSync(filePath, { encoding: 'utf8' })
}

export function readPackageJSON(path: string): PackageJSON {
  return readFileJSON(path)
}

export const fromRoot = (path: string) => {
  return pathModule.resolve(__dirname, '../../../..', path)
}

export const relativeToRoot = (path: string) => {
  return pathModule.relative(fromRoot('.'), path)
}

export interface GetPackagesParameters {
  withDependencies?: boolean
}

export function getPackages({
  withDependencies = true
}: GetPackagesParameters = {}): LernaListItem[] {
  const opts = { cwd: fromRoot('.') }

  const topPackages = cmd('npx lerna list -a --toposort --ndjson', opts)
    .split('\n')
    .map(v => JSON.parse(v) as LernaListItem)

  if (!withDependencies) {
    return topPackages
  }

  return topPackages.map(li => {
    const command = `npx lerna list -a --scope ${li.name} --toposort --include-dependencies --ndjson`
    const deps = cmd(command, opts)
      .split('\n')
      .map(v => JSON.parse(v) as LernaListItem)

    li.dependencies = topPackages.filter(
      tp => tp.name !== li.name && deps.find(d => d.name === tp.name)
    )
    return li
  })
}
