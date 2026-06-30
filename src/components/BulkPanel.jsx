import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseBulkText } from '../lib/supabase'

export default function BulkPanel({ open, onClose, mobile }) {
  const [text, setText]       = useState('')
  const [parsed, setParsed]   = useState(null)
  const [warnings, setWarnings] = useState([])
  const [status, setStatus]   = useState('')   // '', 'preview', 'done', 'error'
  const [busy, setBusy]       = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [sessions, setSessions]   = useState([])
  const didLoad = useRef(false)

  if (!open) return null

  async function loadSessions() {
    if (didLoad.current) return
    didLoad.current = true
    const { data } = await supabase
      .from('sessions')
      .select('id, type, stages(name, flag, sort_order)')
      .eq('is_locked', false)
      .order('sort_order', { referencedTable: 'stages' })
    setSessions(data || [])
  }
  loadSessions()

  async function parseFn() {
    setStatus(''); setParsed(null); setWarnings([])
    const { data: players } = await supabase.from('players').select('id, name')
    const { results, warnings: w } = parseBulkText(text, players)
    setParsed(results)
    setWarnings(w)
    setStatus('preview')
  }

  async function applyFn() {
    if (!sessionId) { setStatus('error'); return }
    setBusy(true)
    try {
      for (const r of parsed) {
        const preds = {}
        r.preds.forEach((p, i) => { if (p) preds[i+1] = p })
        await supabase.from('forecasts').upsert({
          session_id: sessionId,
          player_id:  r.player.id,
          predictions: preds,
          fl_pick: r.fl || '',
          ov_pick: r.ov || '',
        }, { onConflict: 'session_id,player_id' })

        // Audit log
        await supabase.from('audit_log').insert({
          action: 'bulk_import',
          actor:  'admin',
          details: { player: r.player.name, session: sessionId, preds, fl: r.fl, ov: r.ov }
        })
      }
      setStatus('done')
      setText(''); setParsed(null)
    } catch(e) {
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  const style = mobile
    ? { background:'#1c1c1c', borderTop:'2px solid var(--red)', padding:16, maxHeight:'70dvh', overflowY:'auto' }
    : { }

  return (
    <div className={`bulk-panel open`} style={style} onClick={e=>e.stopPropagation()}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <span style={{fontFamily:'Orbitron,sans-serif',fontSize:11,color:'var(--red)',letterSpacing:2}}>МАСОВИЙ ІМПОРТ</span>
        <button className="btn btn-ghost" style={{padding:'4px 10px',fontSize:9}} onClick={onClose}>✕</button>
      </div>

      <div style={{marginBottom:8}}>
        <label style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:2,display:'block',marginBottom:5}}>СЕСІЯ</label>
        <select className="stage-select" value={sessionId} onChange={e=>setSessionId(e.target.value)} style={{width:'100%',minHeight:36}}>
          <option value="">— Оберіть сесію —</option>
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.stages?.flag} {s.stages?.name} — {s.type.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <div style={{marginBottom:8}}>
        <label style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:2,display:'block',marginBottom:5}}>
          ПРОГНОЗИ (всі гравці підряд)
        </label>
        <textarea
          className="bulk-textarea"
          value={text}
          onChange={e=>{setText(e.target.value);setStatus('');setParsed(null)}}
          placeholder={"Ярослав\n1-VER 2-HAM 3-NOR 4-LEC 5-PIA 6-RUS 7-HAD 8-ANT 9-GAS 10-HUL ШК-HAM Прорив-HAD\n\nМія\n1-NOR 2-PIA ..."}
          onMouseDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
        />
      </div>

      {warnings.length > 0 && (
        <div>
          {warnings.map((w,i) => (
            <div key={i} className={w.type === 'alias_resolved' ? 'bulk-ok' : 'bulk-warn'}>
              {w.type === 'alias_resolved' ? `ℹ ${w.message}` : `⚠ ${w.message}`}
            </div>
          ))}
        </div>
      )}

      {parsed && status === 'preview' && (
        <div className="bulk-preview">
          {parsed.map(r => (
            <div key={r.player.id} style={{marginBottom:6}}>
              <span style={{color:'var(--red)',fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:700}}>▶ {r.player.name} </span>
              {r.preds.map((p,i) => p ? <span key={i} style={{marginRight:4,fontSize:11}}>P{i+1}:{p}</span> : null)}
              {r.fl && <span style={{color:'var(--gold)',marginLeft:4}}>⚡{r.fl}</span>}
              {r.ov && <span style={{color:'var(--gold)',marginLeft:4}}>🚀{r.ov}</span>}
              {r.errors?.length > 0 && r.errors.map((e,i) => <div key={i} className="bulk-err">⚠ {e.message}</div>)}
            </div>
          ))}
        </div>
      )}

      {status === 'done'  && <div className="bulk-ok">✓ Імпортовано успішно!</div>}
      {status === 'error' && <div className="bulk-err">⚠ Помилка. Обери сесію або перевір дані.</div>}

      <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
        <button className="btn btn-red" onClick={parseFn} disabled={!text.trim()}>РОЗПІЗНАТИ</button>
        {status === 'preview' && parsed?.length > 0 && (
          <button className="btn btn-gold" onClick={applyFn} disabled={busy||!sessionId}>
            {busy ? '...' : `ЗАСТОСУВАТИ (${parsed.length})`}
          </button>
        )}
        <button className="btn btn-ghost" onClick={()=>{setText('');setParsed(null);setStatus('')}}>ОЧИСТИТИ</button>
      </div>
    </div>
  )
}
