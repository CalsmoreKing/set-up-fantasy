import { useState, useEffect } from 'react'
import { PILOTS } from '../lib/supabase'

export default function QualResults({ session, isAdmin, onUpdate }) {
  const results = session?.results || {}
  const init = Array.from({length:22}, (_,i) => results[i+1] || '')
  const [slots, setSlots] = useState(init)

  useEffect(() => {
    setSlots(Array.from({length:22}, (_,i) => (session?.results||{})[i+1] || ''))
  }, [session])

  function change(idx, val) {
    const n = [...slots]; n[idx] = val; setSlots(n)
    const res = {}
    n.forEach((p,i) => { if(p) res[i+1] = p })
    onUpdate(res)
  }

  // Q1=1-10, Q2=11-15, Q3=16-22 (inverted: best quali = P1)
  const groups = [
    { label:'Q3 — Топ 10', cls:'q1', range:[0,9] },
    { label:'Q2 — 11–15', cls:'q2', range:[10,14] },
    { label:'Q1 — 16–22', cls:'q3', range:[15,21] },
  ]

  return (
    <>
      <div className="section-label">Результати кваліфікації</div>
      <div className="qual-results">
        {slots.map((p, i) => {
          const pos = i+1
          const cls = i<10 ? 'q1' : i<15 ? 'q2' : 'q3'
          return (
            <div key={i} className={`qual-slot ${cls}`}>
              <span className="qual-pos">{pos}</span>
              {isAdmin ? (
                <select className="base-select" value={p} onChange={e=>change(i,e.target.value)}>
                  <option value="">—</option>
                  {PILOTS.map(pi=><option key={pi} value={pi}>{pi}</option>)}
                </select>
              ) : (
                <span style={{fontSize:12,color:p?'var(--text)':'var(--muted)',fontStyle:p?'normal':'italic'}}>
                  {p||'—'}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="divider" />
    </>
  )
}
