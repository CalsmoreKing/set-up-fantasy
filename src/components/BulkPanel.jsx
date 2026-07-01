import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseBulkText, resolvePlayerName, resolvePilot } from '../lib/supabase'

export default function BulkPanel({ open, onClose, standalone }) {
  const [importType, setImportType] = useState('race')
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

  const filteredSessions = sessions.filter(s => s.type === importType)

  async function parseFn() {
    setStatus(''); setParsed(null); setWarnings([])
    const { data: players } = await supabase.from('players').select('id, name')

    // ── QUAL: "Хонда ANT - 2" або "Хонда 2" або "Хонда - 2" ──
    if (importType === 'qual') {
      const lines = text.split('\n').map(l=>l.trim()).filter(Boolean)
      const results = []
      const warns = []
      for (const line of lines) {
        // Formats:
        // "Хонда ANT - 2"   → player=Хонда, pilot=ANT, pos=2
        // "Хонда 2"         → player=Хонда, no pilot, pos=2
        // "Хонда ANT"       → player=Хонда, pilot=ANT, no pos
        // "Хонда - 2"       → same as Хонда 2
        const tokens = line.split(/[\s\-–]+/).filter(Boolean)
        if (!tokens.length) continue

        let playerName = tokens[0]
        let pilotCode  = null
        let pos        = null

        for (let i = 1; i < tokens.length; i++) {
          const t = tokens[i]
          if (/^\d+$/.test(t)) { pos = parseInt(t); continue }
          if (!pilotCode) {
            const p = resolvePilot(t)
            if (p) { pilotCode = p; continue }
          }
        }

        const player = resolvePlayerName(playerName, players)
        if (!player) {
          warns.push({ message: `Гравець "${playerName}" не знайдений` }); continue
        }
        if (player.name !== playerName) warns.push({ message: `"${playerName}" → "${player.name}" (аліас)`, ok:true })

        results.push({ player, pilot: pilotCode||'', pos: pos||null })
        if (!pos) warns.push({ message: `${player.name}: не знайдено позицію прогнозу`, ok:false })
      }
      setParsed(results); setWarnings(warns); setStatus('preview')
      return
    }

    // ── SPRINT: "Гравець\n1-ANT 2-RUS 3-HAM 4-PIA 5-NOR" ──
    // ── RACE:   стандартний bulk формат ──
    const { results, warnings: w } = parseBulkText(text, players)
    setParsed(results); setWarnings(w); setStatus('preview')
  }

  async function applyFn() {
    if (!sessionId) { setStatus('error'); return }
    setBusy(true)
    try {
      if (importType === 'qual') {
        for (const r of parsed) {
          if (!r.pos && !r.pilot) continue
          // If pilot is provided — also save it as assignment
          if (r.pilot) {
            await supabase.from('qual_assignments').upsert({
              session_id: sessionId, player_id: r.player.id,
              pilot_1: r.pilot, pred_pos_1: r.pos||null,
            }, { onConflict: 'session_id,player_id' })
          } else {
            // No pilot — just update existing assignment's pred_pos
            await supabase.from('qual_assignments').upsert({
              session_id: sessionId, player_id: r.player.id,
              pred_pos_1: r.pos,
            }, { onConflict: 'session_id,player_id' })
          }
          await supabase.from('audit_log').insert({
            action:'bulk_qual_forecast', actor:'admin',
            details:{ player: r.player.name, pilot: r.pilot, pos: r.pos }
          })
        }
      } else {
        // race or sprint
        for (const r of parsed) {
          const maxPreds = importType === 'sprint' ? 5 : 10
          const preds = {}
          r.preds.slice(0, maxPreds).forEach((p, i) => { if (p) preds[i+1] = p })
          await supabase.from('forecasts').upsert({
            session_id: sessionId, player_id: r.player.id,
            predictions: preds,
            fl_pick: r.fl || '',
            ov_pick: r.ov || '',
          }, { onConflict: 'session_id,player_id' })
          await supabase.from('audit_log').insert({
            action:'bulk_import', actor:'admin',
            details:{ player: r.player.name, session: sessionId }
          })
        }
      }
      setStatus('done'); setText(''); setParsed(null)
    } catch(e) {
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  // Placeholder hints per type
  const placeholders = {
    qual: `Хонда ANT - 2\nНептун NOR - 4\nКітасу LEC - 7\nМиколапка BOR - 16\nКалсмор GAS - 11\n\nАБО якщо пілоти вже призначені:\nХонда 2\nНептун 4\nКітасу 7`,
    sprint: `Ярослав\n1-ANT 2-RUS 3-HAM 4-PIA 5-NOR\n\nМія\n1-NOR 2-ANT 3-LEC 4-RUS 5-HAM`,
    race: `Ярослав\n1-ANT 2-RUS 3-HAM 4-PIA 5-NOR 6-LEC 7-VER 8-HAD 9-GAS 10-LAW ШК-ANT Прорив-HAD\n\nМія\n1-NOR 2-PIA 3-ANT ...`
  }

  return (
    <div
      style={{
        background:'#1c1c1c', border:'1px solid var(--red)', borderRadius:8,
        padding:20, width:'min(560px, 100%)', maxHeight:'85dvh', overflowY:'auto',
        fontFamily:'Inter,sans-serif'
      }}
      onClick={e=>e.stopPropagation()}
    >
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:'var(--red)',letterSpacing:2,fontWeight:700}}>МАСОВИЙ ІМПОРТ</span>
        <button className="btn btn-ghost" style={{padding:'4px 10px',fontSize:11}} onClick={onClose}>✕ ЗАКРИТИ</button>
      </div>

      {/* Type tabs */}
      <div style={{display:'flex',gap:5,marginBottom:12}}>
        {['qual','sprint','race'].map(t => (
          <button key={t} className={`session-btn${importType===t?' active':''}`} style={{flex:1,fontSize:10}}
            onClick={()=>{setImportType(t);setText('');setParsed(null);setStatus('');setSessionId('')}}>
            {t==='qual'?'КВАЛІФІКАЦІЯ':t==='sprint'?'СПРИНТ':'ГОНКА'}
          </button>
        ))}
      </div>

      {/* Format hint */}
      <div style={{fontSize:11,color:'var(--muted)',marginBottom:10,padding:'8px 10px',background:'var(--card)',borderRadius:4,lineHeight:1.6}}>
        {importType==='qual' && <>
          <b style={{color:'var(--text)'}}>Кваліфікація:</b> кожен рядок = один гравець.<br/>
          Формат: <code style={{color:'var(--gold)'}}>Ім'я КодПілота - Позиція</code><br/>
          Якщо пілот вже призначений: <code style={{color:'var(--gold)'}}>Ім'я Позиція</code>
        </>}
        {importType==='sprint' && <>
          <b style={{color:'var(--text)'}}>Спринт:</b> рядок з іменем, потім прогноз Топ-5.<br/>
          Формат: <code style={{color:'var(--gold)'}}>1-ANT 2-RUS 3-HAM 4-PIA 5-NOR</code>
        </>}
        {importType==='race' && <>
          <b style={{color:'var(--text)'}}>Гонка:</b> рядок з іменем, потім Топ-10 + ШК + Прорив.<br/>
          Формат: <code style={{color:'var(--gold)'}}>1-ANT 2-RUS ... ШК-ANT Прорив-HAD</code>
        </>}
      </div>

      {/* Session selector */}
      <div style={{marginBottom:10}}>
        <label style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:2,display:'block',marginBottom:5}}>СЕСІЯ</label>
        <select className="stage-select" value={sessionId} onChange={e=>setSessionId(e.target.value)} style={{width:'100%',minHeight:38}}>
          <option value="">— Оберіть —</option>
          {filteredSessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.stages?.flag} {s.stages?.name} — {s.type.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Textarea */}
      <textarea
        className="bulk-textarea"
        style={{minHeight:160}}
        value={text}
        onChange={e=>{setText(e.target.value);setStatus('');setParsed(null)}}
        placeholder={placeholders[importType]}
      />

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{marginTop:8}}>
          {warnings.map((w,i) => (
            <div key={i} className={w.ok ? 'bulk-ok' : 'bulk-warn'}>
              {w.ok ? `ℹ ${w.message}` : `⚠ ${w.message}`}
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      {parsed && status==='preview' && (
        <div className="bulk-preview" style={{marginTop:8}}>
          {importType === 'qual' ? (
            parsed.map((r,i) => (
              <div key={i}>
                <span style={{color:'var(--red)',fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:700}}>▶ {r.player.name}</span>
                {r.pilot && <span style={{color:'var(--gold)',marginLeft:6}}>{r.pilot}</span>}
                {r.pos && <span style={{color:'var(--text)',marginLeft:6}}>→ P{r.pos}</span>}
              </div>
            ))
          ) : (
            parsed.map((r,i) => (
              <div key={i} style={{marginBottom:4}}>
                <span style={{color:'var(--red)',fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:700}}>▶ {r.player.name} </span>
                {r.preds.map((p,j) => p ? <span key={j} style={{fontSize:11,marginRight:3}}>P{j+1}:{p}</span> : null)}
                {r.fl && <span style={{color:'var(--gold)',marginLeft:4}}>⚡{r.fl}</span>}
                {r.ov && <span style={{color:'var(--gold)',marginLeft:4}}>🚀{r.ov}</span>}
              </div>
            ))
          )}
        </div>
      )}

      {status==='done'  && <div className="bulk-ok" style={{marginTop:8}}>✓ Імпортовано успішно!</div>}
      {status==='error' && <div className="bulk-err" style={{marginTop:8}}>⚠ Помилка — обери сесію або перевір дані.</div>}

      <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
        <button className="btn btn-red" onClick={parseFn} disabled={!text.trim()}>РОЗПІЗНАТИ</button>
        {status==='preview' && parsed?.length > 0 && (
          <button className="btn btn-gold" onClick={applyFn} disabled={busy||!sessionId}>
            {busy ? '...' : `✓ ЗАСТОСУВАТИ (${parsed.length})`}
          </button>
        )}
        <button className="btn btn-ghost" onClick={()=>{setText('');setParsed(null);setStatus('')}}>ОЧИСТИТИ</button>
      </div>
    </div>
  )
}
