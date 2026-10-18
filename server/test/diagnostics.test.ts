import { describe, expect, it } from 'vitest'
import { parseDiagnostics, scrubPaths } from '../src/compile/diagnostics.js'

describe('parseDiagnostics', () => {
  it('reads errors with line and column', () => {
    const out = "sketch.ino: In function 'void setup()':\nsketch.ino:3:36: error: expected ';' before '}' token\n"
    expect(parseDiagnostics(out)).toEqual([{ line: 3, column: 36, severity: 'error', message: "expected ';' before '}' token" }])
  })

  it('tells warnings from errors and accepts a missing column', () => {
    const out = 'sketch.ino:2:5: warning: unused variable x\nsketch.ino:9: error: oops\nsketch.ino:4:1: fatal error: nope.h: No such file or directory'
    expect(parseDiagnostics(out).map((d) => [d.line, d.severity])).toEqual([[2, 'warning'], [9, 'error'], [4, 'error']])
  })

  it('ignores notes, context lines and diagnostics in other files', () => {
    const out = '/usr/share/arduino/x.h:10:5: error: inside the core\nsketch.ino:1:1: note: candidate\n   void f();\n      ^'
    expect(parseDiagnostics(out)).toEqual([])
  })

  it('keeps link errors, which have no line, at the top', () => {
    const out = "/tmp/x/sketch.o: In function `loop':\nsketch.ino:(.text+0x4): undefined reference to `foo()'\ncollect2: error: ld returned 1 exit status"
    const d = parseDiagnostics(out)
    expect(d.every((x) => x.line === 1 && x.severity === 'error')).toBe(true)
    expect(d.some((x) => x.message.includes('undefined reference'))).toBe(true)
  })

  it('never shows the server directories', () => {
    const out = "sketch.ino:1:1: error: missing '/var/lib/secret/dir/file.h' and /home/app/x\n/tmp/abc/work/sketch.o: undefined reference to `x'"
    const text = JSON.stringify(parseDiagnostics(out, ['/tmp/abc/work']))
    expect(text).not.toMatch(/\/var\/lib|\/home\/app|\/tmp\/abc/)
    expect(text).toContain('<server>')
  })
})

describe('scrubPaths', () => {
  it('replaces the longest directories first', () => {
    expect(scrubPaths('a /srv/x/y/z b', ['/srv/x', '/srv/x/y'])).toBe('a <server>/z b')
  })
})
