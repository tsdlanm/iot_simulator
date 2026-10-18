import { useRef } from 'react'
import { SPEEDS, useSim } from '../sim/runner'
import Icon from '../ui/Icon'
import { useLayout } from '../ui/layout'
import { useTheme } from '../ui/theme'
import { toast } from '../ui/toast'
import { EXAMPLES } from './example'
import { parseProject, toProject, type Project } from './serialize'
import { downloadProject } from './storage'
import { useEditor } from './store'

export default function Toolbar() {
  const name = useEditor((s) => s.name)
  const setName = useEditor((s) => s.setName)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const load = useEditor((s) => s.load)
  const clear = useEditor((s) => s.clear)
  const { status, speed, time, start, pause, reset, setSpeed } = useSim()
  const { leftOpen, rightOpen, toggleLeft, toggleRight } = useLayout()
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggle)
  const fileRef = useRef<HTMLInputElement>(null)

  const replaceProject = (p: Project) => {
    reset()
    load(p)
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const project = parseProject(JSON.parse(await file.text()))
      if (!project) throw new Error('invalid')
      replaceProject(project)
      toast.info(`Proyek "${project.name}" dimuat`)
    } catch {
      toast.error('File tidak valid. Pilih file .iot.json yang diekspor dari aplikasi ini.')
    }
  }

  const label = status === 'running' ? 'Berjalan' : status === 'paused' ? 'Dijeda' : 'Berhenti'

  return (
    <header className="toolbar">
      <button
        type="button"
        className={`btn btn-icon ${leftOpen ? 'is-on' : ''}`}
        onClick={toggleLeft}
        aria-pressed={leftOpen}
        aria-label="Panel komponen"
        title={`${leftOpen ? 'Tutup' : 'Buka'} panel komponen ( [ )`}
      >
        <Icon name="panelLeft" />
      </button>
      <input className="name" aria-label="Nama proyek" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />

      <div className="group" role="group" aria-label="Riwayat">
        <button type="button" className="btn btn-icon" onClick={undo} disabled={!canUndo} title="Urungkan (Ctrl+Z)" aria-label="Urungkan">
          <Icon name="undo" />
        </button>
        <button type="button" className="btn btn-icon" onClick={redo} disabled={!canRedo} title="Ulangi (Ctrl+Shift+Z)" aria-label="Ulangi">
          <Icon name="redo" />
        </button>
      </div>

      <div className="group" role="group" aria-label="Simulasi">
        {status === 'running' ? (
          <button type="button" className="btn" onClick={pause}>
            <Icon name="pause" /> Pause
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={start}>
            <Icon name="play" /> {status === 'paused' ? 'Lanjut' : 'Run'}
          </button>
        )}
        <button type="button" className="btn btn-icon" onClick={reset} disabled={status === 'stopped'} title="Reset simulasi" aria-label="Reset">
          <Icon name="stop" />
        </button>
        <label className="speed" title="Kecepatan simulasi">
          <select aria-label="Kecepatan" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <span className={`status status-${status}`} role="status">
          <i aria-hidden="true" /> {label} · {(time / 1000).toFixed(1)} s
        </span>
      </div>

      <div className="group group-end" role="group" aria-label="Proyek">
        <label className="btn select-btn" title="Muat contoh rangkaian">
          <Icon name="book" />
          <select
            aria-label="Muat contoh"
            value=""
            onChange={(e) => {
              const example = EXAMPLES.find((x) => x.id === e.target.value)
              if (example) replaceProject(example.build())
            }}
          >
            <option value="" disabled>
              Contoh
            </option>
            {EXAMPLES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-icon"
          title="Kosongkan kanvas"
          aria-label="Kosongkan"
          onClick={() => {
            reset()
            clear()
            toast.info('Kanvas dikosongkan', { label: 'Urungkan', run: useEditor.getState().undo })
          }}
        >
          <Icon name="trash" />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          title="Ekspor proyek ke file"
          aria-label="Ekspor"
          onClick={() => {
            const { name: n, nodes, edges } = useEditor.getState()
            downloadProject(toProject(n, nodes, edges))
          }}
        >
          <Icon name="download" />
        </button>
        <button type="button" className="btn btn-icon" title="Impor file proyek" aria-label="Impor" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void onImport(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn btn-icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
          title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button
          type="button"
          className={`btn btn-icon ${rightOpen ? 'is-on' : ''}`}
          onClick={toggleRight}
          aria-pressed={rightOpen}
          aria-label="Panel properti"
          title={`${rightOpen ? 'Tutup' : 'Buka'} panel properti ( ] )`}
        >
          <Icon name="panelRight" />
        </button>
      </div>
    </header>
  )
}
