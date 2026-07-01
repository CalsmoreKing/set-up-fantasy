import { useState, useEffect } from 'react'
import { PILOTS } from '../lib/supabase'

// Універсальний drag-and-drop компонент результатів
// slotsCount: 22 (race/qual) або 7 (sprint)
// showSpecials: чи показувати ШК/Прорив (тільки race)
export default function DragResults({ session, isAdmin, onUpdate, slotsCount = 22, showSpecials = false, title }) {
  const results = session?.results || {}
  const slots = Array.from({length:slotsCount}, (_,i) => results[i+1] || '')
  const fl = session?.fl_pilot || ''
  const ov = session?.ov_pilot || ''

  const [localSlots, setLocalSlots] = useState(slots)
  const [localFl, setLocalFl]       = useState(fl)
  const [localOv, setLocalOv]       = useState(ov)
  const [dragPilot, setDragPilot]   = useState(null)
  const [dragFrom,  setDragFrom]    = useState(null)
  const [dragOver,  setDragOver]    = useState(null)

  useEffect(() => {
    setLocalSlots(Array.from({length:slotsCount}, (_,i) => (session?.results||{})[i+1] || ''))
    setLocalFl(session?.fl_pilot || '')
    setLocalOv(session?.ov_pilot || '')
  }, [session, slotsCount])

  function save(newSlots, newFl, newOv) {
    const res = {}
    newSlots.forEach((p,i) => { if (p) res[i+1] = p })
    onUpdate(res, newFl, newOv)
  }

  function onDragStartPool(pilot) { setDragPilot(pilot); setDragFrom('pool') }
  function onDragStartSlot(idx)   { setDragPilot(localSlots[idx]); setDragFrom(idx) }

  function onDropSlot(idx) {
    if (!dragPilot) return
    const n = [...localSlots]
    const prev = n[idx]
    if (typeof dragFrom === 'number') n[dragFrom] = prev
    const ei = n.indexOf(dragPilot)
    if (ei !== -1 && ei !== idx) n[ei] = prev
    n[idx] = dragPilot
    setLocalSlots(n)
    setDragPilot(null); setDragFrom(null); setDragOver(null)
    save(n, localFl, localOv)
  }
  function onDropPool() {
    if (typeof dragFrom === 'number') {
      const n = [...localSlots]; n[dragFrom] = ''
      setLocalSlots(n); save(n, localFl, localOv)
    }
    setDragPilot(null); setDragFrom(null); setDragOver(null)
  }
  function clearSlot(idx) {
    const n = [...localSlots]; n[idx] = ''
    setLocalSlots(n); save(n, localFl, localOv)
  }

  // Mobile tap-to-place fallback (no drag needed)
  const [selectedPilot, setSelectedPilot] = useState(null)
  function tapPilot(pilot) {
    if (used.has(pilot)) return
    setSelectedPilot(prev => prev === pilot ? null : pilot)
  }
  function tapSlot(idx) {
    if (!selectedPilot) return
    const n = [...localSlots]
    const prev = n[idx]
    const ei = n.indexOf(selectedPilot)
    if (ei !== -1) n[ei] = prev
    n[idx] = selectedPilot
    setLocalSlots(n)
    setSelectedPilot(null)
    save(n, localFl, localOv)
  }

  const used = new Set(localSlots.filter(Boolean))
  const half = Math.ceil(slotsCount / 2)
  const left  = localSlots.slice(0, half)
  const right = localSlots.slice(half, slotsCount)

  if (!isAdmin) {
    return (
      <>
        <div className="section-label">{title}</div>
        <div className="dnd-grid" style={{marginBottom:12}}>
          {[left, right].map((col, ci) => (
            <div className="dnd-col" key={ci}>
              {col.map((p, i) => {
                const pos = ci*half + i + 1
                if (pos > slotsCount) return null
                return (
                  <div key={pos} className={`dnd-slot${pos===1?' p1':pos===2?' p2':pos===3?' p3':''}`}>
                    <span className={`slot-num${pos===1?' g':pos===2?' s':pos===3?' b':''}`}>{pos}</span>
                    <span className={`slot-name${p?' filled':''}`}>{p || '—'}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {showSpecials && (session?.fl_pilot || session?.ov_pilot) && (
          <div className="specials-row">
            <div className="special-result"><span className="special-result-label">⚡ ШВИДКЕ КОЛО</span><span>{session.fl_pilot||'—'}</span></div>
            <div className="special-result"><span className="special-result-label">🚀 ПРОРИВ</span><span>{session.ov_pilot||'—'}</span></div>
          </div>
        )}
        <div className="divider" />
      </>
    )
  }

  return (
    <>
      <div className="section-label">{title} — перетягніть або торкніться пілота</div>
      <div
        className="pilot-pool"
        onDragOver={e=>e.preventDefault()}
        onDrop={onDropPool}
      >
        {PILOTS.map(p => (
          <div
            key={p}
            className={`pilot-chip${used.has(p)?' used':''}${selectedPilot===p?' dragging':''}`}
            style={selectedPilot===p?{outline:'2px solid var(--gold)'}:{}}
            draggable={!used.has(p)}
            onDragStart={() => onDragStartPool(p)}
            onClick={() => tapPilot(p)}
          >
            {p}
          </div>
        ))}
      </div>

      <div className="dnd-grid">
        {[left, right].map((col, ci) => (
          <div className="dnd-col" key={ci}>
            {col.map((p, i) => {
              const pos = ci*half + i + 1
              if (pos > slotsCount) return null
              return (
                <div
                  key={pos}
                  className={`dnd-slot${pos===1?' p1':pos===2?' p2':pos===3?' p3':''}${dragOver===pos?' drag-over':''}`}
                  draggable={!!p}
                  onDragStart={() => p && onDragStartSlot(pos-1)}
                  onDragOver={e => { e.preventDefault(); setDragOver(pos) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => onDropSlot(pos-1)}
                  onClick={() => tapSlot(pos-1)}
                >
                  <span className={`slot-num${pos===1?' g':pos===2?' s':pos===3?' b':''}`}>{pos}</span>
                  <span className={`slot-name${p?' filled':''}`}>{p || '—'}</span>
                  {p && <button className="slot-clear" onClick={(e)=>{e.stopPropagation();clearSlot(pos-1)}}>×</button>}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {showSpecials && (
        <div className="specials-row" style={{marginTop:8}}>
          <div className="special-result">
            <span className="special-result-label">⚡ ШВИДКЕ КОЛО</span>
            <select className="base-select" value={localFl} onChange={e=>{setLocalFl(e.target.value);save(localSlots,e.target.value,localOv)}}>
              <option value="">—</option>
              {PILOTS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="special-result">
            <span className="special-result-label">🚀 ПРОРИВ</span>
            <select className="base-select" value={localOv} onChange={e=>{setLocalOv(e.target.value);save(localSlots,localFl,e.target.value)}}>
              <option value="">—</option>
              {PILOTS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="divider" />
    </>
  )
}
