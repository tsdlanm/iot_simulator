import { useMemo } from 'react'
import { getDef } from '../components/registry'
import type { PropDef } from '../components/types'
import ComponentIcon from '../ui/ComponentIcon'
import Icon from '../ui/Icon'
import { useLayout } from '../ui/layout'
import { useEditor } from './store'

type Value = number | string | boolean | undefined

function Field({ id, def, value }: { id: string; def: PropDef; value: Value }) {
  const updateProp = useEditor((s) => s.updateProp)
  const inputId = `${id}-${def.key}`

  if (def.type === 'boolean') {
    return (
      <label className="field field-check" htmlFor={inputId}>
        <input id={inputId} type="checkbox" checked={value === true} onChange={(e) => updateProp(id, def.key, e.target.checked)} />
        {def.label}
      </label>
    )
  }

  if (def.type === 'select') {
    return (
      <label className="field" htmlFor={inputId}>
        {def.label}
        <select id={inputId} value={String(value ?? def.default)} onChange={(e) => updateProp(id, def.key, e.target.value)}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (def.type === 'code') return null

  return (
    <label className="field" htmlFor={inputId}>
      {def.label}
      <input
        id={inputId}
        type="number"
        value={typeof value === 'number' ? value : def.default}
        min={def.min}
        max={def.max}
        step={def.step}
        onChange={(e) => {
          // Ignore empty/partial input while typing; keep the last valid number.
          const n = e.target.valueAsNumber
          if (Number.isFinite(n)) updateProp(id, def.key, n)
        }}
      />
    </label>
  )
}

export default function PropertiesPanel() {
  // Select the stable array and derive from it; filtering inside the selector would return a new array every render.
  const nodes = useEditor((s) => s.nodes)
  const selected = useMemo(() => nodes.filter((n) => n.selected), [nodes])
  const removeNode = useEditor((s) => s.removeNode)
  const removeSelected = useEditor((s) => s.removeSelected)
  const duplicateSelected = useEditor((s) => s.duplicateSelected)
  const showCode = useLayout((s) => s.showCode)
  const node = selected.length === 1 ? selected[0] : undefined
  const def = node && getDef(node.data.kind)

  return (
    <div className="props-inner">
      {selected.length > 1 ? (
        <>
          <header className="props-head">
            <h2>{selected.length} komponen dipilih</h2>
            <p className="hint">Seret salah satunya untuk memindahkan semuanya.</p>
          </header>
          <div className="actions">
            <button type="button" className="btn" onClick={duplicateSelected}>
              <Icon name="copy" size={15} /> Duplikat
            </button>
            <button type="button" className="btn btn-danger" onClick={removeSelected}>
              <Icon name="trash" size={15} /> Hapus
            </button>
          </div>
        </>
      ) : !node || !def ? (
        <p className="hint props-empty">Pilih komponen di kanvas.</p>
      ) : (
        <>
          <header className={`props-head cat-${def.category}`}>
            <h2>
              <ComponentIcon kind={def.kind} size={17} className="head-icon" /> {def.label}
            </h2>
            <p className="hint">{def.description}</p>
          </header>
          {def.view === 'board' && (
            <button type="button" className="btn btn-block btn-code" onClick={() => showCode(node.id)}>
              <Icon name="code" size={15} /> Buka kode
            </button>
          )}
          {def.props.filter((p) => !p.hidden).map((p) => (
            <Field key={`${node.id}-${p.key}`} id={node.id} def={p} value={node.data.props[p.key]} />
          ))}
          <button type="button" className="btn btn-danger btn-block" onClick={() => removeNode(node.id)}>
            <Icon name="trash" size={15} /> Hapus komponen
          </button>
        </>
      )}
    </div>
  )
}
