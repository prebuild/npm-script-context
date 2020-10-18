#!/usr/bin/env node
'use strict'

const pm = require('which-pm-runs')
const findRoot = require('find-root')
const detectLibc = require('detect-libc')
const origin = require('remote-origin-url')
const ghurl = require('github-url-from-git')
const napi = require('napi-build-utils')
const isForkPr = require('is-fork-pr')
const escapeStringRe = require('escape-string-regexp')
const os = require('os')
const fs = require('fs')
const path = require('path')
const hasOwnProperty = Object.prototype.hasOwnProperty

const data = {
  pm: optional(pm),
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
    uid: optional(() => process.getuid()),
    gid: optional(() => process.getgid()),
    egid: optional(() => process.getegid()),
    euid: optional(() => process.geteuid()),
    groups: optional(() => process.getgroups())
  },
  streams: {
    stdin: { isTTY: process.stdin.isTTY },
    stdout: { isTTY: process.stdout.isTTY },
    stderr: { isTTY: process.stderr.isTTY }
  },
  os: {
    type: optional(() => os.type()),
    release: optional(() => os.release()),
    version: optional(() => os.version()),
    hostname: optional(() => os.hostname()),
    tmpdir: optional(() => os.tmpdir()),
    homedir: optional(() => os.homedir()),
    userInfo: optional(() => os.userInfo())
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

function optional (fn) {
  try {
    return fn()
  } catch {
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
  const result = { root: null, git: null, path: null, pkg: null }

  try {
    const root = findRoot()
    const gitdir = path.join(root, '.git')

    result.root = root
    result.git = fs.existsSync(gitdir) ? gitdir : null
    result.path = path.join(root, 'package.json')
    result.pkg = JSON.parse(fs.readFileSync(result.path, 'utf8'))
  } catch {}

  return result
}

function gitInfo (cwd) {
  const result = {}

  // Don't pass cwd for now (jonschlinkert/parse-git-config#13)
  result.origin = optional(() => origin.sync(/* cwd */))

  if (result.origin) {
    result.github_url = optional(() => ghurl(origin))
  }

  return result
}

function ciInfo () {
  if (!process.env.CI) {
    return null
  }

  return {
    name: optional(() => isForkPr.getCiName()),
    is_fork_pr: optional(() => isForkPr.isForkPr())
  }
}
