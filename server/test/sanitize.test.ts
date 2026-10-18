import { describe, expect, it } from 'vitest'
import { checkSketch, joinContinuations, MAX_SKETCH_BYTES, stripNonCode } from '../src/compile/sanitize.js'

const messages = (src: string) => checkSketch(src).map((p) => p.message)
const ok = (src: string) => expect(checkSketch(src)).toEqual([])

describe('what is accepted', () => {
  it('a normal Arduino sketch', () => {
    ok(`#include <Arduino.h>
#define LED 13
const int kipas = 13;
void setup() { pinMode(LED, OUTPUT); Serial.begin(9600); }
void loop() { digitalWrite(LED, HIGH); delay(500); }`)
  })

  it('avr-libc headers and register access', () => {
    ok('#include <avr/io.h>\n#include <avr/interrupt.h>\n#include <util/delay.h>\nint main() { DDRB |= 1 << 5; for(;;) { PORTB ^= 1 << 5; _delay_ms(100); } }')
  })

  it('conditional compilation and macros with continuations', () => {
    ok('#ifdef ARDUINO\n#define SWAP(a, b) \\\n  do { int t = a; a = b; b = t; } while (0)\n#endif\nvoid setup() {}\nvoid loop() {}')
  })

  it('words like "asm" inside comments and strings', () => {
    ok('// asm is not used here\n/* __asm__ ("x") */\nvoid setup() { Serial.println("asm incbin ## #include <x.h>"); }\nvoid loop() {}')
    ok("char c = '\"'; const char *s = \"quote \\\" asm\"; void setup(){} void loop(){}")
  })

  it('identifiers that merely contain a banned word', () => {
    ok('int asmCount = 0; int myasm = 1; int basement = 2; void setup(){} void loop(){}')
  })
})

describe('what is refused', () => {
  it('inline assembly in every spelling', () => {
    for (const kw of ['asm', '__asm__', '__asm']) {
      expect(messages(`void f() { ${kw} volatile ("nop"); }`).join()).toContain(kw)
    }
  })

  it('reading a file into the firmware with .incbin', () => {
    expect(checkSketch('void f() { __asm__(".incbin \\"/etc/passwd\\""); }').length).toBeGreaterThan(0)
    expect(messages('const int x = incbin;').join()).toContain('incbin')
  })

  it('an #include of a path, a quoted file, or a macro', () => {
    expect(messages('#include </etc/passwd>').join()).toMatch(/belum didukung/)
    expect(messages('#include <../../etc/passwd>').join()).toMatch(/belum didukung/)
    expect(messages('#include "/etc/passwd"').join()).toMatch(/tanda kutip/)
    expect(messages('#include "local.h"').join()).toMatch(/tanda kutip/)
    expect(messages('#define F <stdio.h>\n#include F').join()).toMatch(/makro/)
  })

  it('a path hidden behind // inside the angle brackets', () => {
    expect(checkSketch('#include <//etc/passwd>').length).toBeGreaterThan(0)
  })

  it('libraries that are not built into the service', () => {
    expect(messages('#include <Servo.h>')).toEqual(['Library "Servo.h" belum didukung'])
    expect(messages('#include <Wire.h>').join()).toMatch(/Wire\.h/)
  })

  it('directives that can pull in files or change the compiler', () => {
    for (const d of ['#pragma GCC dependency "/etc/passwd"', '#include_next <stdio.h>', '#import "x"', '#line 5 "x"', '#ident "x"', '#assert foo(bar)']) {
      expect(checkSketch(d).length, d).toBeGreaterThan(0)
    }
  })

  it('token pasting, which could build a forbidden word', () => {
    expect(messages('#define JOIN(a, b) a##b\nvoid f() { JOIN(as, m)("nop"); }').join()).toContain('##')
  })

  it('a keyword split across lines with a backslash', () => {
    expect(checkSketch('void f() { as\\\nm("nop"); }').length).toBeGreaterThan(0)
    expect(checkSketch('void f() { __as\\\r\nm__("nop"); }').length).toBeGreaterThan(0)
    expect(checkSketch('#inc\\\nlude </etc/passwd>').length).toBeGreaterThan(0)
  })

  it('a banned word after a string that contains a quote', () => {
    expect(checkSketch('const char *s = "a\\"b"; void f() { asm("nop"); }').length).toBeGreaterThan(0)
  })

  it('a banned word after a raw string', () => {
    expect(checkSketch('const char *s = R"x( " )x"; void f() { asm("nop"); }').length).toBeGreaterThan(0)
  })

  it('oversized or binary input', () => {
    expect(messages('x'.repeat(MAX_SKETCH_BYTES + 1))[0]).toMatch(/terlalu besar/)
    expect(messages('void f(){}\0')[0]).toMatch(/tidak valid/)
  })
})

describe('line numbers', () => {
  it('point at the offending line, also after continuations and comments', () => {
    const src = '// satu\nvoid setup() {}\n/* tiga\nempat */\nvoid f() { asm("nop"); }\n'
    expect(checkSketch(src)).toEqual([{ line: 5, message: '"asm" tidak diizinkan di layanan kompilasi ini' }])
    const joined = 'int a = 1; \\\n  int b = 2;\nvoid f() { asm("nop"); }\n'
    expect(checkSketch(joined)[0]!.line).toBe(3)
  })
})

describe('helpers', () => {
  it('stripNonCode keeps length and newlines', () => {
    const src = 'a // x\nb /* y\nz */ c "s\\"t" \'q\' d'
    const out = stripNonCode(src)
    expect(out.length).toBe(src.length)
    expect(out.split('\n')).toHaveLength(src.split('\n').length)
    expect(out).not.toMatch(/[xyzst]/)
    expect(out).toMatch(/a\s+\nb/)
  })

  it('stripNonCode copes with unterminated input', () => {
    expect(() => stripNonCode('"abc')).not.toThrow()
    expect(() => stripNonCode('/* never closed')).not.toThrow()
    expect(() => stripNonCode("'x")).not.toThrow()
    expect(() => stripNonCode('R"zzz( never')).not.toThrow()
  })

  it('joinContinuations removes the pair and records the source line', () => {
    const j = joinContinuations('ab\\\ncd\nef')
    expect(j.text).toBe('abcd\nef')
    expect(Array.from(j.lines.slice(0, 4))).toEqual([1, 1, 2, 2])
  })
})
