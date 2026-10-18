import { lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import { getDef, MCU_PROGRAM_LIMIT, pinSpec, SKETCH_LIMIT } from '../components/registry'
import { runOf, useEmu } from '../emu/store'
import { compile } from '../sim/firmware'
import Icon from '../ui/Icon'
import { useLayout } from '../ui/layout'
import type { Problem } from './CodeEditor'
import { useEditor } from './store'

// CodeMirror is large, so it loads only when the Code tab is first opened.
const CodeEditor = lazy(() => import('./CodeEditor'))

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

function Serial({ id }: { id: string }) {
  const text = useEmu((s) => runOf(s.boards, id).serial)
  const clear = useEmu((s) => s.clearSerial)
  const box = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [text])

  return (
    <section className="serial" aria-label="Serial monitor">
      <header>
        <span>Serial</span>
        <button type="button" className="btn btn-icon btn-sm" onClick={() => clear(id)} disabled={!text} aria-label="Bersihkan serial" title="Bersihkan">
          <Icon name="trash" size={13} />
        </button>
      </header>
      <pre ref={box}>{text}</pre>
    </section>
  )
}

export default function CodePanel() {
  const nodes = useEditor((s) => s.nodes)
  const updateProp = useEditor((s) => s.updateProp)
  const codeTarget = useLayout((s) => s.codeTarget)
  const showCode = useLayout((s) => s.showCode)
  const runs = useEmu((s) => s.boards)

  const boards = useMemo(() => nodes.filter((n) => getDef(n.data.kind)?.board), [nodes])
  const selected = boards.find((n) => n.selected)

  // Picking a board on the canvas points the Code tab at it, and it stays there after the selection moves on.
  useEffect(() => {
    if (selected && selected.id !== codeTarget) showCode(selected.id)
  }, [selected, codeTarget, showCode])

  const node = boards.find((n) => n.id === codeTarget) ?? boards[0]
  const def = node && getDef(node.data.kind)

  const pins = useMemo(() => (def?.board ? pinSpec(def.board) : { inputs: {}, outputs: [] }), [def])
  const isUno = node?.data.kind === 'mcu-uno'
  const cppMode = isUno && node?.data.props.mode !== 'simple'
  const key = cppMode ? 'sketch' : 'program'
  const code = String(node?.data.props[key] ?? '')
  const run = runOf(runs, node?.id)

  // Compiler messages describe the text that was sent; once the editor has moved on they would point at the wrong lines.
  const current = run.compiledCode === code
  const problems: Problem[] = useMemo(() => {
    if (cppMode) return current ? run.diagnostics.map((d) => ({ line: d.line, message: d.message, severity: d.severity })) : []
    return compile(code, pins).errors.map((e) => ({ line: e.line, message: e.message, severity: 'error' as const }))
  }, [cppMode, current, run.diagnostics, code, pins])
  const shown = problems.slice(0, 3)
  const serviceMessage = cppMode && current && run.phase === 'error' && run.diagnostics.length === 0 ? run.message : undefined

  if (!node || !def) {
    return (
      <div className="code-panel code-empty">
        <p className="hint">Tambahkan papan mikrokontroler dari daftar komponen untuk menulis kodenya.</p>
      </div>
    )
  }

  let status: string
  if (run.phase === 'compiling') status = 'Mengompilasi…'
  else if (cppMode && run.phase === 'ready' && !current) status = 'Kode berubah. Reset lalu Run untuk memakainya.'
  else if (cppMode && run.phase === 'ready' && run.size) status = `Flash ${kb(run.size.flash)} dari ${kb(run.size.flashMax)} · RAM ${run.size.ram} dari ${run.size.ramMax} B`
  else status = `${code.length}/${cppMode ? SKETCH_LIMIT : MCU_PROGRAM_LIMIT}`

  return (
    <div className="code-panel">
      <div className="code-head">
        {boards.length > 1 ? (
          <select aria-label="Papan" value={node.id} onChange={(e) => showCode(e.target.value)}>
            {boards.map((b, i) => (
              <option key={b.id} value={b.id}>
                {getDef(b.data.kind)?.label} {i + 1}
              </option>
            ))}
          </select>
        ) : (
          <strong>{def.label}</strong>
        )}
        {isUno && (
          <div className="seg-ctl" role="group" aria-label="Bahasa">
            <button type="button" aria-pressed={cppMode} onClick={() => updateProp(node.id, 'mode', 'cpp')}>
              C++
            </button>
            <button type="button" aria-pressed={!cppMode} onClick={() => updateProp(node.id, 'mode', 'simple')}>
              Sederhana
            </button>
          </div>
        )}
      </div>

      <Suspense fallback={<pre className="code-fallback">{code}</pre>}>
        <CodeEditor
          key={`${node.id}-${key}`}
          value={code}
          language={cppMode ? 'cpp' : 'board'}
          pins={pins}
          maxLength={cppMode ? SKETCH_LIMIT : MCU_PROGRAM_LIMIT}
          label={cppMode ? 'Sketch Arduino' : 'Program papan'}
          problems={problems}
          onChange={(v) => updateProp(node.id, key, v)}
        />
      </Suspense>

      {(shown.length > 0 || serviceMessage) && (
        <ul className="errors" role="alert">
          {serviceMessage && (
            <li>
              <Icon name="alert" size={13} />
              <span>{serviceMessage}</span>
            </li>
          )}
          {shown.map((p) => (
            <li key={`${p.line}-${p.message}`}>
              <Icon name="alert" size={13} />
              <span>
                <strong>Baris {p.line}</strong> · {p.message}
              </span>
            </li>
          ))}
          {problems.length > shown.length && <li className="more">dan {problems.length - shown.length} lagi</li>}
        </ul>
      )}
      <p className="code-status">{status}</p>

      {cppMode && <Serial id={node.id} />}
    </div>
  )
}
