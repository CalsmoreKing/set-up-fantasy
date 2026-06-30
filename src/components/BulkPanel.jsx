import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseBulkText, resolvePlayerName, resolvePilot } from '../lib/supabase'

export default function BulkPanel({ open, onClose, mobile }) {
  const [importType, setImportType] = useState('forecast')  // 'forecast' | 'quali'
  const [text, setText]       = useState('')
  const [parsed, setParsed]   = useState(null)
  const [warnings, setWarnings] = useState([])
  const [status, setStatus]   = useState('')
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
      .order('sort_order', { referencedTable: 'stages' })
    setSessions(data || [])
  }
  loadSessions()

  const filteredSessions = sessions.filter(s =>
    importType === 'quali' ? s.type === 'qual' : true
  )

  async function parseFn() {
    setStatus(''); setParsed(null); setWarnings([])
    const { data: players } = await supabase.from('players').select('id, name')

    if (importType === 'quali') {
      const lines = text.split('\n').map(l=>l.trim()).filter(Boolean)
      const results = []
      const warns = []
      for (const line of lines) {
        const m = line.match(/^(.+?)\s*[—\-:]\s*([A-Za-zÀ-ÿ]+)$/)
        if (!m) { warns.push({ message: `Не розпізнано: "${line}"` }); continue }
        const player = resolvePlayerName(m[1], players)
        if (!player) { warns.push({ message: `Гравець "${m[1]}" не знайдений` }); continue }
        const pilot = resolvePilot(m[2])
        if (!pilot) { warns.push({ message: `${player.name}: невідомий пілот "${m[2]}"` }); continue }
        if (player.name !== m[1].trim()) warns.push({ message: `"${m[1]}" → "${player.name}" (аліас)`, ok:true })
        results.push({ player, pilot })
      }
      setParsed(results)
      setWarnings(warns)
      setStatus('preview')
      return
    }

    const { results, warnings: w } = parseBulkText(text, players)
    setParsed(results)
    setWarnings(w)
    setStatus('preview')
  }

  async function applyFn() {
    if (!sessionId) { setStatus('error'); return }
    setBusy(true)
    try {
      if (importType === 'quali') {
        for (const r of parsed) {
          await supabase.from('qual_assignments').upsert({
            session_id: sessionId,
            player_id:  r.player.id,
            pilot_1:    r.pilot,
          }, { onConflict: 'session_id,player_id' })
          await supabase.from('audit_log').insert({
            action: 'bulk_quali_assign', actor: 'admin',
            details: { player: r.player.name, pilot: r.pilot, session: sessionId }
          })
        }
      } else {
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
          await supabase.from('audit_log').insert({
            action: 'bulk_import', actor: 'admin',
            details: { player: r.player.name, session: sessionId, preds, fl: r.fl, ov: r.ov }
          })
        }
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

      <div style={{display:'flex',gap:6,marginBottom:10}}>
        <button className={`session-btn${importType==='forecast'?' active':''}`} style={{flex:1}}
          onClick={()=>{setImportType('forecast');setText('');setParsed(null);setStatus('')}}>ПРОГНОЗИ</button>
        <button className={`session-btn${importType==='quali'?' active':''}`} style={{flex:1}}
          onClick={()=>{setImportType('quali');setText('');setParsed(null);setStatus('')}}>ПІЛОТИ КВАЛІФІКАЦІЇ</button>
      </div>

      <div style={{marginBottom:8}}>
        <label style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:2,display:'block',marginBottom:5}}>СЕСІЯ</label>
        <select className="stage-select" value={sessionId} onChange={e=>setSessionId(e.target.value)} style={{width:'100%',minHeight:36}}>
          <option value="">— Оберіть сесію —</option>
          {filteredSessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.stages?.flag} {s.stages?.name} — {s.type.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <div style={{marginBottom:8}}>
        <label style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:2,display:'block',marginBottom:5}}>
          {importType === 'quali' ? 'ПІЛОТИ (Гравець — КОД)' : 'ПРОГНОЗИ (всі гравці підряд)'}
        </label>
        <textarea
          className="bulk-textarea"
          value={text}
          onChange={e=>{setText(e.target.value);setStatus('');setParsed(null)}}
          placeholder={importType === 'quali'
            ? "Ярослав — COL\nМія — BEA\nНептун — NOR\nХонда — ANT\n..."
            : "Ярослав\n1-VER 2-RUS 3-LEC 4-NOR 5-HAM 6-ANT 7-PIA 8-LAW 9-GAS 10-LIN ШК-VER Прорив-HAD\n\nМія\n1-NOR 2-PIA ..."}
          onMouseDown={e=>e.stopPropagation()}
          onTouchStart={e=>e.stopPropagation()}
        />
      </div>

      {warnings.length > 0 && (
        <div>
          {warnings.map((w,i) => (
            <div key={i} className={w.ok ? 'bulk-ok' : 'bulk-warn'}>
              {w.ok ? `ℹ ${w.message}` : `⚠ ${w.message}`}
            </div>
          ))}
        </div>
      )}

      {parsed && status === 'preview' && (
        <div className="bulk-preview">
          {importType === 'quali' ? (
            parsed.map(r => (
              <div key={r.player.id}>
                <span style={{color:'var(--red)',fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:700}}>▶ {r.player.name}</span>
                {' '}<span style={{color:'var(--gold)'}}>{r.pilot}</span>
              </div>
            ))
          ) : (
            parsed.map(r => (
              <div key={r.player.id} style={{marginBottom:6}}>
                <span style={{color:'var(--red)',fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:700}}>▶ {r.player.name} </span>
                {r.preds.map((p,i) => p ? <span key={i} style={{marginRight:4,fontSize:11}}>P{i+1}:{p}</span> : null)}
                {r.fl && <span style={{color:'var(--gold)',marginLeft:4}}>⚡{r.fl}</span>}
                {r.ov && <span style={{color:'var(--gold)',marginLeft:4}}>🚀{r.ov}</span>}
                {r.errors?.length > 0 && r.errors.map((e,i) => <div key={i} className="bulk-err">⚠ {e.message}</div>)}
              </div>
            ))
          )}
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
