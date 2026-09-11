import { useState, useEffect } from 'react'
import { PILOTS } from '../lib/supabase'

export default function DragResults({
  session, isAdmin, onUpdate,
  slotsCount = 22, showSpecials = false,
  title, podiumCount = 3, isSprint = false
}) {
  const initSlots = () => Array.from({length:slotsCount}, (_,i) => (session?.results||{})[i+1] || '')
  const [localSlots, setLocalSlots] = useState(initSlots)
  const [localFl, setLocalFl]       = useState(session?.fl_pilot || '')
  const [localOv, setLocalOv]       = useState(session?.ov_pilot || '')
  const [dragPilot, setDragPilot]   = useState(null)
  const [dragFrom,  setDragFrom]    = useState(null)
  const [dragOver,  setDragOver]    = useState(null)
  const [selPilot,  setSelPilot]    = useState(null)

  useEffect(() => {
    setLocalSlots(Array.from({length:slotsCount}, (_,i) => (session?.results||{})[i+1] || ''))
    setLocalFl(session?.fl_pilot || '')
    setLocalOv(session?.ov_pilot || '')
  }, [session, slotsCount])

  function save(newSlots, newFl, newOv) {
    const res = {}
    newSlots.forEach((p,i) => { if (p) res[i+1] = p })
    onUpdate(res, newFl ?? localFl, newOv ?? localOv)
  }

  function dropOnSlot(toIdx) {
    if (!dragPilot) return
    const n = [...localSlots]
    if (typeof dragFrom === 'number') {
      const from = dragFrom
      if (from === toIdx) { reset(); return }
      n.splice(from, 1)
      n.splice(toIdx, 0, dragPilot)
      while (n.length < slotsCount) n.push('')
      if (n.length > slotsCount) n.length = slotsCount
    } else {
      const ei = n.indexOf(dragPilot)
      if (ei !== -1) n[ei] = ''
      const lastEmpty = n.lastIndexOf('')
      const insertAt = lastEmpty === -1 ? slotsCount - 1 : lastEmpty
      for (let i = insertAt; i > toIdx; i--) n[i] = n[i-1]
      n[toIdx] = dragPilot
    }
    setLocalSlots(n); reset(); save(n)
  }
  function dropOnPool() {
    if (typeof dragFrom === 'number') {
      const n = [...localSlots]; n[dragFrom] = ''
      setLocalSlots(n); save(n)
    }
    reset()
  }
  function reset() { setDragPilot(null); setDragFrom(null); setDragOver(null) }

  function tapPilot(pilot) {
    if (used.has(pilot)) return
    setSelPilot(prev => prev === pilot ? null : pilot)
  }
  function tapSlot(idx) {
    if (!selPilot) return
    const n = [...localSlots]
    const ei = n.indexOf(selPilot)
    if (ei !== -1) {
      n.splice(ei, 1); n.splice(idx, 0, selPilot)
      while (n.length < slotsCount) n.push('')
      if (n.length > slotsCount) n.length = slotsCount
    } else {
      const lastEmpty = n.lastIndexOf('')
      const insertAt = lastEmpty === -1 ? slotsCount-1 : lastEmpty
      for (let i = insertAt; i > idx; i--) n[i] = n[i-1]
      n[idx] = selPilot
    }
    setLocalSlots(n); setSelPilot(null); save(n)
  }
  function clearSlot(idx) {
    const n = [...localSlots]; n[idx] = ''
    setLocalSlots(n); save(n)
  }

  const used = new Set(localSlots.filter(Boolean))

  // ── READ-ONLY ──────────────────────────────────
  if (!isAdmin) {
    return (
      <>
        <div className="section-label">{title}</div>
        {isSprint ? (
          <div className="sprint-center-col">
            {localSlots.map((p, i) => (
              <div key={i} className="sprint-center-slot">
                <span className="sprint-center-pos">{i+1}</span>
                <span style={{fontSize:13,fontWeight:p?600:400,color:p?'var(--text)':'var(--muted)',fontStyle:p?'normal':'italic'}}>{p||'—'}</span>
              </div>
            ))}
          </div>
        ) : slotsCount <= 10 ? (
          <div style={{maxWidth:400,margin:'0 auto 12px'}}>
            {localSlots.map((p, i) => <ReadSlot key={i} p={p} pos={i+1} />)}
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'3px 10px',marginBottom:12}}>
            {buildQualColumns(localSlots, slotsCount).map(({p,idx,pos}) =>
              <ReadQualSlot key={idx} p={p} pos={pos} />
            )}
          </div>
        )}
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

  // ── ADMIN ──────────────────────────────────
  return (
    <>
      <div className="section-label">{title} — перетягніть або торкніться</div>

      <div className="pilot-pool" onDragOver={e=>e.preventDefault()} onDrop={dropOnPool}>
        {PILOTS.map(p => (
          <div key={p}
            className={`pilot-chip${used.has(p)?' used':''}${selPilot===p?' chip-selected':''}`}
            draggable={!used.has(p)}
            onDragStart={() => { setDragPilot(p); setDragFrom('pool') }}
            onClick={() => tapPilot(p)}
          >{p}</div>
        ))}
      </div>

      {isSprint ? (
        <div className="sprint-center-col">
          {localSlots.map((p, i) => (
            <div key={i}
              className={`sprint-center-slot${dragOver===i+1?' drag-over':''}`}
              style={{cursor:'pointer'}}
              draggable={!!p}
              onDragStart={() => p && (setDragPilot(p),setDragFrom(i))}
              onDragOver={e=>{e.preventDefault();setDragOver(i+1)}}
              onDragLeave={()=>setDragOver(null)}
              onDrop={()=>dropOnSlot(i)}
              onClick={()=>tapSlot(i)}
            >
              <span className="sprint-center-pos">{i+1}</span>
              <span style={{flex:1,fontSize:13,fontWeight:p?600:400,color:p?'var(--text)':'#444',fontStyle:p?'normal':'italic'}}>{p||'—'}</span>
              {p && <button className="slot-clear" onClick={e=>{e.stopPropagation();clearSlot(i)}}>×</button>}
            </div>
          ))}
        </div>
      ) : slotsCount <= 10 ? (
        <div style={{maxWidth:400,margin:'0 auto 8px',display:'flex',flexDirection:'column',gap:3}}>
          {localSlots.map((p, i) => (
            <AdminSlot key={i} p={p} pos={i+1} dragOver={dragOver}
              onDragStart={() => p && (setDragPilot(p),setDragFrom(i))}
              onDragOver={e=>{e.preventDefault();setDragOver(i+1)}}
              onDragLeave={()=>setDragOver(null)}
              onDrop={()=>dropOnSlot(i)}
              onClick={()=>tapSlot(i)}
              onClear={e=>{e.stopPropagation();clearSlot(i)}}
            />
          ))}
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'3px 10px',marginBottom:8}}>
          {buildQualColumns(localSlots, slotsCount).map(({p,idx,pos}) => (
            <AdminSlot key={idx} p={p} pos={pos} small dragOver={dragOver}
              onDragStart={() => p && (setDragPilot(p),setDragFrom(idx))}
              onDragOver={e=>{e.preventDefault();setDragOver(pos)}}
              onDragLeave={()=>setDragOver(null)}
              onDrop={()=>dropOnSlot(idx)}
              onClick={()=>tapSlot(idx)}
              onClear={e=>{e.stopPropagation();clearSlot(idx)}}
            />
          ))}
        </div>
      )}

      {showSpecials && (
        <div className="specials-row" style={{marginTop:8}}>
          <div className="special-result">
            <span className="special-result-label">⚡ ШВИДКЕ КОЛО</span>
            <select className="base-select" value={localFl} onChange={e=>{setLocalFl(e.target.value);save(localSlots,e.target.value,localOv)}}>
              <option value="">—</option>{PILOTS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="special-result">
            <span className="special-result-label">🚀 ПРОРИВ</span>
            <select className="base-select" value={localOv} onChange={e=>{setLocalOv(e.target.value);save(localSlots,localFl,e.target.value)}}>
              <option value="">—</option>{PILOTS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="divider" />
    </>
  )
}

// Build columns for qual: LEFT col = positions 1..half (top to bottom),
// RIGHT col = positions half+1..slotsCount (top to bottom).
// Interleaved for CSS grid (2 cols) so it renders left-full-then-right-full visually.
function buildQualColumns(slots, slotsCount) {
  const half = Math.ceil(slotsCount / 2)
  const items = []
  for (let row = 0; row < half; row++) {
    items.push({ p: slots[row], idx: row, pos: row+1 })
    const rightIdx = half + row
    if (rightIdx < slotsCount) {
      items.push({ p: slots[rightIdx], idx: rightIdx, pos: rightIdx+1 })
    }
  }
  return items
}

function ReadSlot({ p, pos }) {
  const isTop3 = pos <= 3, isTop5 = pos <= 5 && pos > 3
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding: isTop3 ? '8px 14px' : '5px 12px', marginBottom:2,
      background: pos===1 ? 'linear-gradient(90deg,rgba(255,215,0,.07),rgba(255,215,0,.02))'
        : pos===2 ? 'linear-gradient(90deg,rgba(192,192,192,.05),transparent)'
        : pos===3 ? 'linear-gradient(90deg,rgba(205,127,50,.05),transparent)'
        : isTop5 ? 'rgba(255,255,255,.02)' : 'transparent',
      borderLeft:`3px solid ${pos===1?'var(--gold)':pos===2?'var(--silver)':pos===3?'var(--bronze)':isTop5?'rgba(255,255,255,.1)':'transparent'}`,
      borderRadius:2,
    }}>
      <span style={{fontFamily:'Orbitron,sans-serif',fontWeight:700,width:26,textAlign:'center',flexShrink:0,
        fontSize:isTop3?13:11,color:pos===1?'var(--gold)':pos===2?'var(--silver)':pos===3?'var(--bronze)':'var(--muted)'}}>{pos}</span>
      <span style={{fontSize:isTop3?14:12,fontWeight:isTop3?700:isTop5?600:400,color:p?'var(--text)':'var(--muted)',fontStyle:p?'normal':'italic'}}>{p||'—'}</span>
    </div>
  )
}

function ReadQualSlot({ p, pos }) {
  const isTop3 = pos <= 3
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8, padding:'5px 9px', marginBottom:2,
      background: pos===1 ? 'linear-gradient(90deg,rgba(255,215,0,.07),rgba(255,215,0,.02))'
        : pos===2 ? 'linear-gradient(90deg,rgba(192,192,192,.05),transparent)'
        : pos===3 ? 'linear-gradient(90deg,rgba(205,127,50,.05),transparent)' : 'var(--card)',
      border:'1px solid var(--border)',
      borderLeft:`3px solid ${pos===1?'var(--gold)':pos===2?'var(--silver)':pos===3?'var(--bronze)':'var(--border)'}`,
      borderRadius:2,
    }}>
      <span style={{fontFamily:'Orbitron,sans-serif',fontWeight:700,width:22,textAlign:'center',flexShrink:0,
        fontSize:isTop3?12:10,color:pos===1?'var(--gold)':pos===2?'var(--silver)':pos===3?'var(--bronze)':'var(--muted)'}}>{pos}</span>
      <span style={{fontSize:12,fontWeight:isTop3?700:400,color:p?'var(--text)':'var(--muted)',fontStyle:p?'normal':'italic'}}>{p||'—'}</span>
    </div>
  )
}

function AdminSlot({ p, pos, small, dragOver, onDragStart, onDragOver, onDragLeave, onDrop, onClick, onClear }) {
  const isTop3 = pos <= 3, isTop5 = pos <= 5 && pos > 3
  return (
    <div
      style={{
        display:'flex', alignItems:'center', gap: small?8:10, cursor:'pointer',
        padding: small ? '5px 9px' : (isTop3 ? '8px 14px' : '5px 12px'),
        background: pos===1 ? 'linear-gradient(90deg,rgba(255,215,0,.07),rgba(255,215,0,.02))'
          : pos===2 ? 'linear-gradient(90deg,rgba(192,192,192,.05),transparent)'
          : pos===3 ? 'linear-gradient(90deg,rgba(205,127,50,.05),transparent)'
          : (!small && isTop5) ? 'rgba(255,255,255,.02)' : 'var(--card)',
        border:`1px solid ${dragOver===pos?'var(--red)':'var(--border)'}`,
        borderLeft:`3px solid ${pos===1?'var(--gold)':pos===2?'var(--silver)':pos===3?'var(--bronze)':(!small&&isTop5)?'rgba(255,255,255,.1)':'var(--border)'}`,
        borderRadius:2, opacity:dragOver===pos?.7:1,
      }}
      draggable={!!p}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onClick}
    >
      <span style={{fontFamily:'Orbitron,sans-serif',fontWeight:700,width:small?22:26,textAlign:'center',flexShrink:0,
        fontSize: small ? (isTop3?12:10) : (isTop3?13:11),
        color:pos===1?'var(--gold)':pos===2?'var(--silver)':pos===3?'var(--bronze)':'var(--muted)'}}>{pos}</span>
      <span style={{flex:1,fontSize: small?12:(isTop3?14:12), fontWeight: isTop3?700:500,
        color:p?'var(--text)':'#444',fontStyle:p?'normal':'italic'}}>{p||'—'}</span>
      {p && <button className="slot-clear" onClick={onClear}>×</button>}
    </div>
  )
}
