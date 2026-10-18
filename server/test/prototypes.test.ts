import { describe, expect, it } from 'vitest'
import { generatePrototypes } from '../src/compile/prototypes.js'

const protos = (src: string) => generatePrototypes(src)?.text.split('\n') ?? []

describe('generatePrototypes', () => {
  it('declares helpers so they can be called before they are defined', () => {
    const src = 'void setup() { blink(2); }\nvoid blink(int n) { }\nint add(int a, int b) { return a + b; }\nvoid loop() {}'
    expect(protos(src)).toEqual(['void setup();', 'void blink(int n);', 'int add(int a, int b);', 'void loop();'])
  })

  it('puts the declarations before the first function, after earlier types and globals', () => {
    const src = 'struct P { int x; };\nconst int pin = 3;\nvoid setup() {}\nvoid loop() {}'
    expect(generatePrototypes(src)?.beforeLine).toBe(3)
  })

  it('handles pointers, references, qualifiers and multi-line signatures', () => {
    const src = 'static unsigned long ms() { return 1; }\nchar *name(const char *s) { return 0; }\nvoid f(int &r,\n       int n) {}'
    expect(protos(src)).toEqual(['unsigned long ms();', 'char *name(const char *s);', 'void f(int &r, int n);'])
  })

  it('ignores control statements, calls inside bodies and main', () => {
    const src = 'void setup() { if (x) { go(); } while (y) { } }\nint main() { return 0; }'
    expect(protos(src)).toEqual(['void setup();'])
  })

  it('leaves functions with default arguments alone, since a declaration would repeat the default', () => {
    expect(protos('void f(int a = 3) {}\nvoid g() {}')).toEqual(['void g();'])
  })

  it('does not take text from comments, strings or preprocessor lines', () => {
    const src = '// void fake() {}\n#define X void macro() {}\nconst char *s = "void str() {}";\nvoid real() {}'
    expect(protos(src)).toEqual(['void real();'])
  })

  it('returns null when there is nothing to declare', () => {
    expect(generatePrototypes('int x = 3;')).toBeNull()
    expect(generatePrototypes('')).toBeNull()
  })
})
