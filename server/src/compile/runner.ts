import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface RunOptions {
  cwd: string
  timeoutMs: number
  env?: Record<string, string>
}

export type Runner = (cmd: string, args: string[], options: RunOptions) => Promise<RunResult>

/** A compiler that prints more than this is misbehaving; keep what we have and carry on. */
const MAX_OUTPUT = 256 * 1024

/**
 * Runs a program without a shell, in its own process group so a timeout can kill the compiler driver
 * and the cc1plus/ld processes it started. Only a minimal environment is passed on.
 */
export const spawnRunner: Runner = (cmd, args, { cwd, timeoutMs, env }) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { PATH: process.env.PATH ?? '', LANG: 'C', LC_ALL: 'C', ...env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const add = (current: string, chunk: Buffer) => (current.length >= MAX_OUTPUT ? current : (current + chunk.toString('utf8')).slice(0, MAX_OUTPUT))
    child.stdout.on('data', (c: Buffer) => (stdout = add(stdout, c)))
    child.stderr.on('data', (c: Buffer) => (stderr = add(stderr, c)))

    const killGroup = () => {
      if (child.pid === undefined) return
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    }
    const timer = setTimeout(() => {
      timedOut = true
      killGroup()
    }, timeoutMs)

    child.on('error', (err) => {
      stderr += err.message
      finish(null)
    })
    child.on('close', (code) => {
      killGroup() // sweep up anything the compiler left behind
      finish(code)
    })
  })

export function findExecutable(name: string, path = process.env.PATH ?? ''): string | null {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}

export interface ProcessLimits {
  /** Address space, bytes. */
  memory: number
  /** CPU seconds. */
  cpu: number
  /** Largest file the process may write, bytes. */
  fileSize: number
}

/** Wraps a runner so every command runs under `prlimit`, when it is installed. */
export function withProcessLimits(run: Runner, limits: ProcessLimits, prlimit = findExecutable('prlimit')): Runner {
  if (!prlimit) return run
  return (cmd, args, options) =>
    run(prlimit, [`--as=${limits.memory}`, `--cpu=${limits.cpu}`, `--fsize=${limits.fileSize}`, '--', cmd, ...args], options)
}
