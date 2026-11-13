import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseBulkText, resolvePlayerName, resolvePilot } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function BulkPanel({ open, onClose, standalone }) {
  const { user, player: actorPlayer } = useAuth()
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

  const filteredSessions = sessions.filter(s => s.type === importType && Number(s.stages?.sort_order)>=10)

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
    const selectedSession = sessions.find(session => session.id === sessionId)
    if (Number(selectedSession?.stages?.sort_order)<10) { setStatus('error'); setBusy(false); return }
    try {
      if (importType === 'qual') {
        for (const r of parsed) {
          if (!r.pos && !r.pilot) continue
          const { data: previous } = await supabase.from('qual_assignments').select('*').eq('session_id',sessionId).eq('player_id',r.player.id).maybeSingle()
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
            action:'bulk_qual_forecast', actor:actorPlayer?.name || user?.email || 'Адміністратор',
            details:{ player:r.player.name, session_id:sessionId, stage_name:selectedSession?.stages?.name, type:importType, pilot:r.pilot, pos:r.pos, previous:previous ? {pilot_1:previous.pilot_1,pred_pos_1:previous.pred_pos_1} : null, next:{pilot_1:r.pilot || previous?.pilot_1 || '',pred_pos_1:r.pos || null}, actor_name:actorPlayer?.name || null,actor_email:user?.email || null,actor_user_id:user?.id || null }
          })
        }
      } else {
        // race or sprint
        for (const r of parsed) {
          const maxPreds = importType === 'sprint' ? 5 : 10
          const preds = {}
          r.preds.slice(0, maxPreds).forEach((p, i) => { if (p) preds[i+1] = p })
          const { data: previous } = await supabase.from('forecasts').select('*').eq('session_id',sessionId).eq('player_id',r.player.id).maybeSingle()
          await supabase.from('forecasts').upsert({
            session_id: sessionId, player_id: r.player.id,
            predictions: preds,
            fl_pick: r.fl || '',
            ov_pick: r.ov || '',
          }, { onConflict: 'session_id,player_id' })
          await supabase.from('audit_log').insert({
            action:'bulk_import', actor:actorPlayer?.name || user?.email || 'Адміністратор',
            details:{ player:r.player.name, session_id:sessionId, stage_name:selectedSession?.stages?.name, type:importType, previous:previous ? {predictions:previous.predictions,fl_pick:previous.fl_pick,ov_pick:previous.ov_pick} : null, next:{predictions:preds,fl_pick:r.fl||'',ov_pick:r.ov||''}, actor_name:actorPlayer?.name || null,actor_email:user?.email || null,actor_user_id:user?.id || null }
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

      <textarea
        className="bulk-textarea"
        style={{minHeight:160}}
        value={text}
        onChange={e=>{setText(e.target.value);setStatus('');setParsed(null)}}
        placeholder=""
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
