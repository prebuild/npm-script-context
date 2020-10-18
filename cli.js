#!/usr/bin/env node
'use strict'

const pm = require('which-pm-runs')
const detectLibc = require('detect-libc')
const origin = require('remote-origin-url')
const ghurl = require('github-url-from-git')
const napi = require('napi-build-utils')
const ifr = require('is-fork-pr')
const escapeStringRe = require('escape-string-regexp')
const os = require('os')
const fs = require('fs')
const path = require('path')
const hasOwnProperty = Object.prototype.hasOwnProperty

const data = {
  pm: optional(pm) || null,
  npm: {
    env: mask(
      filter(process.env, (k) => /^npm_/i.test(k) && !/^npm_config__/i.test(k)),
      {
        npm_config_email: '***',
        'npm_config_init.author.name': '***',
        'npm_config_init.author.url': '***'
      }
    )
  },
  pkg: packageInfo(),
  git: gitInfo(),
  ci: ciInfo(),
  webpack: typeof __webpack_require__ === 'function', // eslint-disable-line
  electron: !!(process.versions.electron || process.env.ELECTRON_RUN_AS_NODE),
  alpine: process.platform === 'linux' && fs.existsSync('/etc/alpine-release'),
  proxy: {
    http: process.env.http_proxy || process.env.HTTP_PROXY || null,
    https: process.env.https_proxy || process.env.HTTPS_PROXY || null
  },
  process: {
    ...filter(process, function (k, v) {
      return k !== 'moduleLoadList' && (
        typeof v === 'string' || typeof v === 'number' || Array.isArray(v)
      )
    }),
    cwd: process.cwd(),
    config: process.config,
    versions: process.versions,
    uid: optional(process.getuid, process),
    gid: optional(process.getgid, process),
    egid: optional(process.getegid, process),
    euid: optional(process.geteuid, process),
    groups: optional(process.getgroups, process)
  },
  streams: {
    stdin: { isTTY: process.stdin.isTTY },
    stdout: { isTTY: process.stdout.isTTY },
    stderr: { isTTY: process.stderr.isTTY }
  },
  os: {
    type: optional(os.type, os),
    release: optional(os.release, os),
    version: optional(os.version, os),
    hostname: optional(os.hostname, os),
    tmpdir: optional(os.tmpdir, os),
    homedir: optional(os.homedir, os),
    userInfo: optional(os.userInfo, os)
  },
  libc: {
    family: detectLibc.family || null,
    version: detectLibc.version || null
  },
  napi: napi.getNapiVersion() || null,
  path: {
    sep: path.sep,
    delimiter: path.delimiter
  },
  env: {
    ...filter(process.env, (k) => !/^(npm_|ConEmu|java_|vbox_)/i.test(k)),
    path: undefined,
    Path: undefined,
    PATH: uniq(
      (process.env.path || process.env.PATH || process.env.Path)
        .split(path.delimiter)
        .filter(Boolean)
    )
  }
}

console.log(JSON.stringify(data, replacer(), 2))

function filter (input, include) {
  const output = {}

  for (const k in input) {
    if (!hasOwnProperty.call(input, k)) continue
    if (!include(k, input[k])) continue

    output[k] = input[k]
  }

  return output
}

function mask (input, masks) {
  if (process.env.CI) return input

  for (const k in masks) {
    if (!hasOwnProperty.call(masks, k)) continue
    if (!hasOwnProperty.call(input, k)) continue
    if (!input[k]) continue

    input[k] = masks[k]
  }

  return input
}

function optional (fn, thisArg) {
  try {
    if (typeof fn === 'function') return fn.call(thisArg)
  } catch (err) {
    console.error(err)
    return null
  }
}

function uniq (arr) {
  return Array.from(new Set(arr))
}

function replacer () {
  const username = os.userInfo().username
  const hostname = os.hostname()
  const usernameRe = new RegExp(escapeStringRe(username), 'gi')
  const hostnameRe = new RegExp(escapeStringRe(hostname), 'gi')

  return function (key, value) {
    if (typeof value === 'string') {
      if (/token|password|secret/i.test(key)) return '***'
      if (process.env.CI) return value

      return value
        .replace(usernameRe, 'USERNAME')
        .replace(hostnameRe, 'HOSTNAME')
    } else {
      return value
    }
  }
}

function packageInfo () {
  const result = { path: null, pkg: null }

  if (process.env.npm_package_json) { // npm 7
    result.path = process.env.npm_package_json
  } else {
    result.path = path.resolve('package.json')
  }

  if (result.path) {
    try {
      result.pkg = JSON.parse(fs.readFileSync(result.path, 'utf8'))
    } catch {}
  }

  return result
}

function gitInfo () {
  const result = {}
  const gitdir = path.resolve('.git')

  result.gitdir = fs.existsSync(gitdir) ? gitdir : null
  result.origin = optional(origin.sync, origin)

  if (result.origin) {
    result.github_url = optional(() => ghurl(result.origin))
  }

  return result
}

function ciInfo () {
  if (!process.env.CI) {
    return null
  }

  const isForkPr = ifr.isForkPr()
  const secureEnv = !isForkPr && process.env.TRAVIS_SECURE_ENV_VARS !== 'false'

  return {
    name: ifr.getCiName(),
    is_fork_pr: isForkPr,
    secure_env: secureEnv
  }
}
