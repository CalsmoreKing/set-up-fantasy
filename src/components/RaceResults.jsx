import { useState, useRef, useEffect } from 'react'
import { PILOTS } from '../lib/supabase'

export default function RaceResults({ session, isAdmin, onUpdate }) {
  const results = session?.results || {}
  const slots = Array.from({length:22}, (_,i) => results[i+1] || '')
  const fl = session?.fl_pilot || ''
  const ov = session?.ov_pilot || ''

  const [localSlots, setLocalSlots] = useState(slots)
  const [localFl, setLocalFl]       = useState(fl)
  const [localOv, setLocalOv]       = useState(ov)
  const [dragPilot, setDragPilot]   = useState(null)
  const [dragFrom,  setDragFrom]    = useState(null) // 'pool' | slotIndex
  const [dragOver,  setDragOver]    = useState(null)

  useEffect(() => {
    setLocalSlots(Array.from({length:22}, (_,i) => results[i+1] || ''))
    setLocalFl(session?.fl_pilot || '')
    setLocalOv(session?.ov_pilot || '')
  }, [session])

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
    // remove pilot from wherever it was
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

  const used = new Set(localSlots.filter(Boolean))
  const left  = localSlots.slice(0, 11)
  const right = localSlots.slice(11, 22)

  if (!isAdmin) {
    // Read-only view
    return (
      <>
        <div className="section-label">Результати гонки</div>
        <div className="dnd-grid" style={{marginBottom:12}}>
          {[left, right].map((col, ci) => (
            <div className="dnd-col" key={ci}>
              {col.map((p, i) => {
                const pos = ci*11 + i + 1
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
        {(session?.fl_pilot || session?.ov_pilot) && (
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
      <div className="section-label">Результати гонки — перетягніть пілотів</div>
      {/* Pool */}
      <div
        className="pilot-pool"
        onDragOver={e=>e.preventDefault()}
        onDrop={onDropPool}
      >
        {PILOTS.map(p => (
          <div
            key={p}
            className={`pilot-chip${used.has(p)?' used':''}`}
            draggable={!used.has(p)}
            onDragStart={() => onDragStartPool(p)}
          >
            {p}
          </div>
        ))}
      </div>

      <div className="dnd-grid">
        {[left, right].map((col, ci) => (
          <div className="dnd-col" key={ci}>
            {col.map((p, i) => {
              const pos = ci*11 + i + 1
              return (
                <div
                  key={pos}
                  className={`dnd-slot${pos===1?' p1':pos===2?' p2':pos===3?' p3':''}${dragOver===pos?' drag-over':''}`}
                  draggable={!!p}
                  onDragStart={() => p && onDragStartSlot(pos-1)}
                  onDragOver={e => { e.preventDefault(); setDragOver(pos) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => onDropSlot(pos-1)}
                >
                  <span className={`slot-num${pos===1?' g':pos===2?' s':pos===3?' b':''}`}>{pos}</span>
                  <span className={`slot-name${p?' filled':''}`}>{p || '—'}</span>
                  {p && <button className="slot-clear" onClick={()=>clearSlot(pos-1)}>×</button>}
                </div>
              )
            })}
          </div>
        ))}
      </div>

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
      <div className="divider" />
    </>
  )
}
