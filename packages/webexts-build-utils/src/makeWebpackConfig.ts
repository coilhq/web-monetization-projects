import * as path from 'path'
import * as fs from 'fs'
import * as cp from 'child_process'

import * as webpack from 'webpack'
import { configureNodePolyfills, getPackageVersion } from '@coil/webpack-utils'

import { applyManifestPermissions } from './manifestPermissions'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CopyPlugin = require('copy-webpack-plugin')

const CHROMIUM_BASED_BROWSER = /chrome|edge/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Func = { (...args: any[]): void }

function ignoreInvocations(name: string, ignore: number, func: Func) {
  let n = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (...args: any[]) => {
    if (n++ < ignore) {
      // eslint-disable-next-line no-console
      console.warn(`IGNORING ${name} FUNCTION INVOCATION ${n}`)
      return
    } else {
      func(...args)
    }
  }
}

export function makeWebpackConfig(rootDir: string): webpack.Configuration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prettyJSON = (obj: any) => JSON.stringify(obj, null, 2)

  const API = process.env.API || 'chrome'
  const BROWSER = process.env.BROWSER || 'chrome'
  const LIVE_RELOAD =
    Boolean(process.env.LIVE_RELOAD) && !process.env.NO_LIVE_RELOAD

  // Can cut build times down from 30s to 10s on some machines
  const TS_LOADER_TRANSPILE_ONLY = Boolean(process.env.TS_LOADER_TRANSPILE_ONLY)

  // This is extended from the root IDE config
  const TEST_TSCONFIG = path.join(rootDir, '/test/tsconfig.json')
  const TSCONFIG_DEBUG_JSON = path.join(rootDir, 'tsconfig.debug.json')
  const TSCONFIG_BUILD_JSON = path.join(rootDir, 'tsconfig.build.json')

  const PACKAGE_JSON = path.join(rootDir, 'package.json')

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DEBUG_COMPILER_OPTIONS = require(TSCONFIG_DEBUG_JSON).compilerOptions

  const VERSION = getPackageVersion(PACKAGE_JSON)

  // eslint-disable-next-line no-nested-ternary
  const TSCONFIG = TS_LOADER_TRANSPILE_ONLY
    ? TEST_TSCONFIG
    : process.env.TSCONFIG_DEBUG
    ? TSCONFIG_DEBUG_JSON
    : TSCONFIG_BUILD_JSON

  const WEXT_BUILD_CONFIG: Record<string, unknown> = process.env
    .WEXT_BUILD_CONFIG
    ? JSON.parse(process.env.WEXT_BUILD_CONFIG)
    : {}

  WEXT_BUILD_CONFIG.isCI = Boolean(process.env.CI)

  // Possible to override name/version so can publish as different extension
  const WEXT_MANIFEST_SUFFIX = process.env.WEXT_MANIFEST_SUFFIX
  const WEXT_MANIFEST_SUFFIX_NO_DATE = process.env.WEXT_MANIFEST_SUFFIX_NO_DATE
  const WEXT_MANIFEST_VERSION = process.env.WEXT_MANIFEST_VERSION
  const WEXT_MANIFEST_VERSION_NAME = process.env.WEXT_MANIFEST_VERSION_NAME
  const WEXT_MANIFEST_BROWSER_SPECIFIC_SETTINGS_GECKO_ID =
    process.env.WEXT_MANIFEST_BROWSER_SPECIFIC_SETTINGS_GECKO_ID

  const copyToDist = [
    {
      from: 'manifest.json',
      to: 'manifest.json',
      transform: (content: Buffer) => {
        const manifest = JSON.parse(content.toString())
        // TODO: expand based on build target
        delete manifest['$targets']

        if (WEXT_MANIFEST_SUFFIX) {
          manifest.name += WEXT_MANIFEST_SUFFIX
          if (!WEXT_MANIFEST_SUFFIX_NO_DATE) {
            const date = new Date().toLocaleString().replace(/(\/|,|\s)+/g, '-')
            manifest.name += `-${date}`
          }
        }
        if (WEXT_MANIFEST_VERSION) {
          manifest.version = WEXT_MANIFEST_VERSION
        }
        if (WEXT_MANIFEST_VERSION_NAME) {
          manifest.version_name = WEXT_MANIFEST_VERSION_NAME
        }

        if (BROWSER === 'firefox') {
          if (WEXT_MANIFEST_BROWSER_SPECIFIC_SETTINGS_GECKO_ID) {
            manifest.browser_specific_settings.gecko.id =
              WEXT_MANIFEST_BROWSER_SPECIFIC_SETTINGS_GECKO_ID
          }
        } else {
          delete manifest['browser_specific_settings']
        }
        applyManifestPermissions(manifest)
        return prettyJSON(manifest)
      }
    },
    {
      from: 'static',
      to: 'static',
      transform: (content: Buffer, path: string) => {
        if (
          LIVE_RELOAD &&
          BROWSER.match(CHROMIUM_BASED_BROWSER) &&
          path.endsWith('background.html')
        ) {
          return content
            .toString()
            .replace(
              '<!--INSERT_HOT_RELOAD-->',
              '<script src="../hot-reload.js"></script>'
            )
        } else if (
          BROWSER.match(CHROMIUM_BASED_BROWSER) &&
          path.endsWith('popup.html')
        ) {
          return content
            .toString()
            .replace(
              '<!--INSERT_FORCE_REDRAW_SCRIPT-->',
              '<script src="./forceRedraws.js"></script>'
            )
        } else {
          return content
        }
      }
    },
    { from: 'res', to: 'res' }
  ]

  if (LIVE_RELOAD) {
    copyToDist.push({
      from: require.resolve('crx-hotreload'),
      to: 'hot-reload.js'
    })
  }

  const entry: Record<string, string> = {
    content: './src/content/content.ts',
    popup: './src/popup/popup.tsx',
    options: './src/options/options.tsx',
    background: './src/background/background.ts'
  }

  Object.keys(entry).forEach(k => {
    const entryPath = path.join(rootDir, entry[k])
    if (!fs.existsSync(entryPath)) {
      delete entry[k]
    }
  })

  const production = process.env.NODE_ENV === 'production'
  const mode = production ? 'production' : 'development'

  const config: webpack.Configuration = {
    mode: mode,
    optimization: {
      minimize: production
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      symlinks: true,
      // Only add these if using the TEST_TSCONFIG which transpile only implies
      alias: {
        ...(TS_LOADER_TRANSPILE_ONLY
          ? require('../../../webpack.tsconfig.aliases')
          : {})
      }
    },
    ignoreWarnings: [
      {
        message: /export .* was not found in/
      }
    ],

    devtool: production ? undefined : 'source-map',

    entry: entry,

    plugins: [
      new webpack.DefinePlugin({
        WEBPACK_DEFINE_API: API,
        WEBPACK_DEFINE_VERSION: JSON.stringify(VERSION),
        WEBPACK_DEFINE_BROWSER: JSON.stringify(BROWSER),
        WEBPACK_DEFINE_BUILD_CONFIG: JSON.stringify(WEXT_BUILD_CONFIG)
      }),
      new CopyPlugin({ patterns: copyToDist }),
      {
        apply: compilation => {
          const name = 'AFTER_EMIT_SHELL_CMD'
          const ignore = Number(
            process.env.AFTER_EMIT_SHELL_CMD_IGNORE_INVOCATIONS ||
              (process.argv.includes('--watch') ? 2 : 0)
          )

          compilation.hooks.afterEmit.tap(
            name,
            ignoreInvocations(name, ignore, () => {
              const cmd = process.env.AFTER_EMIT_SHELL_CMD
              if (cmd) {
                cp.spawn(cmd, { shell: true, stdio: 'inherit' })
              }
            })
          )
        }
      }
    ],

    output: {
      filename: '[name].js',
      path: path.join(rootDir, 'dist'),
      libraryTarget: 'umd'
    },

    module: {
      // noParse: [ /\bws$/ ],
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: [
            {
              // We must use require.resolve in the mono repo with
              // deduplicated dependencies
              loader: require.resolve('ts-loader'),
              // Do not check types in watch mode
              options: TS_LOADER_TRANSPILE_ONLY
                ? {
                    configFile: TSCONFIG,
                    projectReferences: false,
                    transpileOnly: true,
                    compilerOptions: process.env.TSCONFIG_DEBUG
                      ? { sourceMap: true, ...DEBUG_COMPILER_OPTIONS }
                      : { sourceMap: true }
                  }
                : {
                    configFile: TSCONFIG,
                    projectReferences: true
                  }
            }
          ]
        }
      ]
    }
  }

  return configureNodePolyfills(config)
}
