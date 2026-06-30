import { useState, useEffect } from 'react'
import { PILOTS } from '../lib/supabase'

export default function SprintResults({ session, isAdmin, onUpdate }) {
  const results = session?.results || {}
  const init = Array.from({length:7}, (_,i) => results[i+1] || '')
  const [slots, setSlots] = useState(init)

  useEffect(() => {
    setSlots(Array.from({length:7}, (_,i) => (session?.results||{})[i+1] || ''))
  }, [session])

  function change(idx, val) {
    const n = [...slots]; n[idx] = val; setSlots(n)
    const res = {}
    n.forEach((p,i) => { if(p) res[i+1] = p })
    onUpdate(res)
  }

  return (
    <>
      <div className="section-label">Результати спринту (Топ-7)</div>
      <div className="sprint-results">
        {slots.map((p, i) => (
          <div key={i} className="sprint-slot">
            <span style={{fontFamily:'Orbitron,sans-serif',fontSize:11,fontWeight:700,color:'var(--muted)',width:16,flexShrink:0}}>{i+1}</span>
            {isAdmin ? (
              <select className="base-select" style={{flex:1}} value={p} onChange={e=>change(i,e.target.value)}>
                <option value="">—</option>
                {PILOTS.map(pi=><option key={pi} value={pi}>{pi}</option>)}
              </select>
            ) : (
              <span style={{fontSize:12,color:p?'var(--text)':'var(--muted)',fontStyle:p?'normal':'italic',flex:1}}>
                {p||'—'}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="divider" />
    </>
  )
}
