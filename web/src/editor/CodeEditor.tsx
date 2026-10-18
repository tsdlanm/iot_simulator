import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { cpp } from '@codemirror/lang-cpp'
import { bracketMatching, HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { linter, lintGutter, lintKeymap, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { Annotation, EditorState } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { useEffect, useRef } from 'react'
import { compile, type PinSpec } from '../sim/firmware'

/** Marks edits that came from outside (undo in the toolbar, switching nodes) so they are not echoed back. */
const External = Annotation.define<boolean>()

const up = (s: string) => s.toUpperCase()

/** Syntax highlighting for the board language. Pin names are coloured by what they are. */
function language(pins: PinSpec) {
  const inputs = new Set(Object.keys(pins.inputs).map(up))
  const outputs = new Set(pins.outputs.map(up))
  return StreamLanguage.define({
    name: 'iot-board',
    token(stream) {
      if (stream.eatSpace()) return null
      if (stream.match('#')) {
        stream.skipToEnd()
        return 'comment'
      }
      if (stream.match(/^(\d+\.?\d*|\.\d+)/)) return 'number'
      if (stream.match(/^[A-Za-z_]\w*/)) {
        const word = stream.current()
        const lower = word.toLowerCase()
        if (lower === 'and' || lower === 'or' || lower === 'not') return 'keyword'
        if (lower === 'true' || lower === 'false') return 'atom'
        if (lower === 'time') return 'variableName.special'
        if (outputs.has(up(word))) return 'variableName.definition'
        if (inputs.has(up(word))) return 'variableName'
        return 'invalid'
      }
      if (stream.match(/^(>=|<=|==|!=|&&|\|\||[-+*/%<>=!])/)) return 'operator'
      if (stream.match(/^[()]/)) return 'bracket'
      stream.next()
      return null
    },
  })
}

const highlight = HighlightStyle.define([
  { tag: t.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: t.keyword, color: 'var(--code-keyword)', fontWeight: '600' },
  { tag: t.number, color: 'var(--code-number)' },
  { tag: t.atom, color: 'var(--code-number)' },
  { tag: t.operator, color: 'var(--code-operator)' },
  { tag: t.bracket, color: 'var(--code-operator)' },
  { tag: t.variableName, color: 'var(--code-in)' },
  { tag: t.definition(t.variableName), color: 'var(--code-out)', fontWeight: '600' },
  { tag: t.special(t.variableName), color: 'var(--code-time)' },
  { tag: t.invalid, color: 'var(--danger)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--code-string)' },
  { tag: [t.typeName, t.className], color: 'var(--code-type)' },
  { tag: [t.bool, t.null], color: 'var(--code-number)' },
  { tag: [t.macroName, t.processingInstruction, t.meta], color: 'var(--code-time)' },
  { tag: [t.function(t.variableName), t.standard(t.variableName)], color: 'var(--code-in)' },
])

/** Names a sketch author reaches for most, offered as completions in C++ mode. */
const ARDUINO_WORDS: [label: string, detail: string][] = [
  ['setup', 'dipanggil sekali'],
  ['loop', 'diulang terus'],
  ['pinMode', '(pin, mode)'],
  ['digitalWrite', '(pin, HIGH/LOW)'],
  ['digitalRead', '(pin)'],
  ['analogRead', '(pin) 0..1023'],
  ['analogWrite', '(pin, 0..255)'],
  ['delay', '(ms)'],
  ['delayMicroseconds', '(us)'],
  ['millis', 'ms sejak mulai'],
  ['micros', 'us sejak mulai'],
  ['Serial.begin', '(baud)'],
  ['Serial.print', '(nilai)'],
  ['Serial.println', '(nilai)'],
  ['map', '(x, a, b, c, d)'],
  ['constrain', '(x, a, b)'],
  ['min', '(a, b)'],
  ['max', '(a, b)'],
  ['abs', '(x)'],
  ['random', '(max)'],
  ['HIGH', ''],
  ['LOW', ''],
  ['INPUT', ''],
  ['OUTPUT', ''],
  ['INPUT_PULLUP', ''],
  ['LED_BUILTIN', '13'],
  ...[0, 1, 2, 3, 4, 5].map((n): [string, string] => [`A${n}`, 'pin analog']),
  ['int', ''],
  ['long', ''],
  ['float', ''],
  ['bool', ''],
  ['byte', ''],
  ['const', ''],
  ['void', ''],
  ['if', ''],
  ['else', ''],
  ['for', ''],
  ['while', ''],
  ['return', ''],
]

function cppCompletions() {
  const options: Completion[] = ARDUINO_WORDS.map(([label, detail]) => ({ label, detail }))
  return (context: CompletionContext) => {
    const word = context.matchBefore(/[A-Za-z_][\w.]*/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    return { from: word.from, options, validFor: /^[\w.]*$/ }
  }
}

const theme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--code-bg)', fontSize: '13.5px', borderRadius: '10px', border: '1px solid var(--border)', height: '100%' },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--accent)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)' },
  '.cm-scroller': { fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace", lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 10px 0 6px' },
  '.cm-cursor': { borderLeftColor: 'var(--text)', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--code-gutter)', border: 'none', paddingLeft: '4px' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px', minWidth: '24px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--text) 5%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)', outline: 'none' },
  '.cm-placeholder': { color: 'var(--code-gutter)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--danger)', textUnderlineOffset: '3px' },
  '.cm-lint-marker-error': { content: '"●"' },
  '.cm-gutter-lint': { width: '12px' },
  '.cm-tooltip': { backgroundColor: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'inherit', maxHeight: '220px' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px', display: 'flex', alignItems: 'baseline', gap: '10px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-text)' },
  '.cm-completionLabel': { fontWeight: '600' },
  '.cm-completionDetail': { marginLeft: 'auto', fontStyle: 'normal', opacity: 0.7, fontSize: '11px' },
  '.cm-completionIcon': { display: 'none' },
  '.cm-tooltip-lint': { padding: '2px 0' },
  '.cm-diagnostic': { padding: '4px 10px', borderLeft: '3px solid var(--danger)' },
})

function completions(pins: PinSpec) {
  const options: Completion[] = [
    ...pins.outputs.map((id) => ({ label: id, detail: 'keluaran', boost: 2 })),
    ...Object.entries(pins.inputs).map(([id, type]) => ({ label: id, detail: type === 'number' ? 'masukan angka' : 'masukan ya/tidak', boost: 1 })),
    { label: 'time', detail: 'detik simulasi' },
    { label: 'and', detail: 'dan' },
    { label: 'or', detail: 'atau' },
    { label: 'not', detail: 'bukan' },
    { label: 'true', detail: 'benar' },
    { label: 'false', detail: 'salah' },
  ]
  return (context: CompletionContext) => {
    const word = context.matchBefore(/[A-Za-z_]\w*/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    return { from: word.from, options, validFor: /^[A-Za-z_]\w*$/ }
  }
}

export interface Problem {
  line: number
  message: string
  severity: 'error' | 'warning'
}

interface Props {
  value: string
  onChange: (value: string) => void
  /** board: the mini language checked here in the page. cpp: Arduino C++, checked by the server. */
  language: 'board' | 'cpp'
  pins: PinSpec
  maxLength: number
  label: string
  /** Problems from outside the editor (the compile service), drawn on their lines. */
  problems?: Problem[]
}

/** A real code editor for board programs: line numbers, colours, autocomplete and inline errors. */
export default function CodeEditor({ value, onChange, language: lang, pins, maxLength, label, problems }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // The editor is created once per board; keep the latest callback without recreating it.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          EditorView.lineWrapping,
          history(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ override: [lang === 'cpp' ? cppCompletions() : completions(pins)], icons: false }),
          lang === 'cpp' ? cpp() : language(pins),
          syntaxHighlighting(highlight),
          ...(lang === 'board'
            ? [
                linter(
                  (v): Diagnostic[] =>
                    compile(v.state.doc.toString(), pins).errors.map((e) => {
                      const line = v.state.doc.line(Math.min(e.line, v.state.doc.lines))
                      const lead = line.text.length - line.text.trimStart().length
                      return { from: line.from + lead, to: Math.max(line.to, line.from + lead + 1), severity: 'error', message: e.message }
                    }),
                  { delay: 200 },
                ),
              ]
            : []),
          lintGutter(),
          keymap.of([...closeBracketsKeymap, ...completionKeymap, ...lintKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
          // Refuse edits that would push the program past the size the simulator accepts.
          EditorState.transactionFilter.of((tr) => (tr.newDoc.length > maxLength ? [] : tr)),
          placeholder(lang === 'cpp' ? '// Tulis sketch Arduino di sini' : '# Tulis program di sini, misalnya:\n# D13 = A0 > 30'),
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || u.transactions.some((tr) => tr.annotation(External))) return
            onChangeRef.current(u.state.doc.toString())
          }),
          theme,
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
    // The pin set only changes when the board kind changes, and the parent keys this component on that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Changes made elsewhere (toolbar undo, loading a project) must show up in the editor.
  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value }, annotations: [External.of(true)] })
  }, [value])

  // Problems from the server follow the code they were found in; once the text moves on they are no longer valid.
  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const doc = editor.state.doc
    const marks: Diagnostic[] = (problems ?? []).map((p) => {
      const line = doc.line(Math.min(Math.max(1, p.line), doc.lines))
      const lead = line.text.length - line.text.trimStart().length
      return { from: line.from + lead, to: Math.max(line.to, line.from + lead + 1), severity: p.severity, message: p.message }
    })
    editor.dispatch(setDiagnostics(editor.state, marks))
    if (marks[0]) editor.dispatch({ effects: EditorView.scrollIntoView(marks[0].from, { y: 'center' }) })
  }, [problems])

  return <div ref={host} className="code-host" />
}
