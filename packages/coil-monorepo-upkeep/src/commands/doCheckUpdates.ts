import * as pathMod from 'path'

import { cmd } from '../utils/cmd'
import {
  fromRoot,
  getPackages,
  pretty,
  readFileJSON,
  readPackageJSON
} from '../utils'
import { NcuRcJson } from '../types'

const log = console.log

export function doCheckUpdates() {
  const rootPackageJSON = readPackageJSON(fromRoot('package.json'))
  const subPackages = getPackages({ withDependencies: false })
  const paths = [fromRoot('.')].concat(subPackages.map(li => li.location))

  if (rootPackageJSON.resolutions) {
    log('Using resolutions:')
    Object.keys(rootPackageJSON.resolutions).forEach(k => {
      if (rootPackageJSON.resolutions) {
        const val = rootPackageJSON.resolutions[k]
        log(`${k}: ${val}`)
      }
    })
    log()
  }

  const lines = ['feat: update dependencies', '']
  paths.forEach(path => {
    const packageFolder = pathMod.basename(path)
    const fn = pathMod.join(path, '.ncurc.json')
    const ncurc = readFileJSON<NcuRcJson>(fn)
    log(
      `Checking for updates for ${packageFolder}, rejecting ${pretty(
        ncurc.reject
      )}`
    )
    const cmdCWD = pathMod.resolve(__dirname, '..', '..')
    const upgraded = JSON.parse(
      cmd(`yarn ncu -u --jsonUpgraded --cwd '${path}'`, { cwd: cmdCWD })
    )
    // * coil-extension: @types/x: ^1.19.0
    Object.keys(upgraded).forEach(k => {
      lines.push(`* ${packageFolder}: ${k}: ${upgraded[k]}`)
    })
  })
  log(lines.join('\n'))

  log('running yarn')
  cmd('yarn', { cwd: fromRoot('.') })
  log('yarn complete')
}
