import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, type CSSProperties } from 'react'
import { startAutosave } from '../editor/autosave'
import Canvas from '../editor/Canvas'
import Palette from '../editor/Palette'
import RightPanel from '../editor/RightPanel'
import { useEditor } from '../editor/store'
import Toolbar from '../editor/Toolbar'
import { useLayout } from '../ui/layout'
import { startTheme } from '../ui/theme'
import Resizer from '../ui/Resizer'
import Toasts from '../ui/Toasts'

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
}

export default function EditorPage() {
  const leftOpen = useLayout((s) => s.leftOpen)
  const rightOpen = useLayout((s) => s.rightOpen)
  const leftWidth = useLayout((s) => s.leftWidth)
  const rightWidth = useLayout((s) => s.rightWidth)

  useEffect(() => startAutosave(), [])
  useEffect(() => startTheme(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const key = e.key.toLowerCase()
      const layout = useLayout.getState()
      const editor = useEditor.getState()

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) editor.undo()
        else if ((key === 'z' && e.shiftKey) || key === 'y') editor.redo()
        else if (key === 'a') editor.selectAll()
        else if (key === 'd') editor.duplicateSelected()
        else return
        e.preventDefault()
        return
      }
      if (e.altKey) return
      if (key === 'v') layout.setTool('select')
      else if (key === 'h') layout.setTool('pan')
      else if (key === '[') layout.toggleLeft()
      else if (key === ']') layout.toggleRight()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --left/--right are the column widths (0 when closed); --*-w keep the inner width so content does not reflow while sliding.
  const columns = {
    '--left': `${leftOpen ? leftWidth : 0}px`,
    '--right': `${rightOpen ? rightWidth : 0}px`,
    '--left-w': `${leftWidth}px`,
    '--right-w': `${rightWidth}px`,
  } as CSSProperties

  return (
    <ReactFlowProvider>
      <div className="app" style={columns}>
        <Toolbar />
        <aside className="side side-left" aria-label="Daftar komponen" inert={!leftOpen}>
          <Palette />
          <Resizer side="left" />
        </aside>
        <Canvas />
        <aside className="side side-right" aria-label="Properti" inert={!rightOpen}>
          <Resizer side="right" />
          <RightPanel />
        </aside>
        <Toasts />
      </div>
    </ReactFlowProvider>
  )
}
