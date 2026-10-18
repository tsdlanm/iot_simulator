import { lazy, Suspense, useEffect } from 'react'
import { getDef } from '../components/registry'
import { useLayout, type RightTab } from '../ui/layout'
import PropertiesPanel from './PropertiesPanel'
import { useEditor } from './store'

const CodePanel = lazy(() => import('./CodePanel'))

const TABS: { id: RightTab; label: string }[] = [
  { id: 'props', label: 'Properti' },
  { id: 'code', label: 'Kode' },
]

/** The right sidebar: properties of the selected component, or the code of a board. */
export default function RightPanel() {
  const tab = useLayout((s) => s.rightTab)
  const setTab = useLayout((s) => s.setRightTab)

  // Picking a component other than a board has nothing to show on the Code tab, so go to its properties.
  // Only a change of selection does this; opening the Code tab by hand with a sensor selected stays put.
  const pickedId = useEditor((s) => {
    const picked = s.nodes.filter((n) => n.selected)
    return picked.length === 1 && !getDef(picked[0]!.data.kind)?.board ? picked[0]!.id : null
  })
  useEffect(() => {
    if (pickedId) useLayout.getState().setRightTab('props')
  }, [pickedId])

  return (
    <div className="right-inner">
      <div className="tabs" role="tablist" aria-label="Panel kanan">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'props' ? (
          <PropertiesPanel />
        ) : (
          <Suspense fallback={null}>
            <CodePanel />
          </Suspense>
        )}
      </div>
    </div>
  )
}
