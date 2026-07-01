import { useState, useEffect, useCallback } from 'react'
import { supabase, PILOTS, DOUBLE_STAGES, calcRaceScore, calcQualScore, calcSprintScore, TEAM_META } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PlayerCard from '../components/PlayerCard'
import DragResults from '../components/DragResults'

const TEAM_COLORS = Object.fromEntries(Object.entries(TEAM_META).map(([k,v]) => [k, v.color]))

export default function MainPage() {
  const { player: me, isAdmin } = useAuth()
  const [stages,    setStages]    = useState([])
  const [players,   setPlayers]   = useState([])
  const [sessions,  setSessions]  = useState({})
  const [forecasts, setForecasts] = useState({})
  const [qualAssign,setQualAssign]= useState({})
  const [stageKey,  setStageKey]  = useState('')
  const [sessionType, setSessionType] = useState('race')
  const [loading,   setLoading]   = useState(true)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing,setCommitting]= useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('players').select('*').order('name'),
    ]).then(([s, p]) => {
      const stagesData = s.data || []
      setStages(stagesData)
      setPlayers(p.data || [])
      const firstOpen = stagesData.find(st => !st.is_locked)
      if (firstOpen) {
        setStageKey(firstOpen.key)
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!stageKey || !stages.length) return
    const stage = stages.find(s => s.key === stageKey)
    if (!stage) return
    supabase.from('sessions')
      .select('*')
      .eq('stage_id', stage.id)
      .then(({ data: sess }) => {
        const map = {}
        ;(sess || []).forEach(s => { map[s.type] = s })
        setSessions(map)
        // default to race, fall back to qual if no race
        const preferred = map['race'] ? 'race' : map['qual'] ? 'qual' : 'sprint'
        setSessionType(prev => map[prev] ? prev : preferred)
      })
  }, [stageKey, stages])

  useEffect(() => {
    const session = sessions[sessionType]
    if (!session) return
    Promise.all([
      supabase.from('forecasts').select('*').eq('session_id', session.id),
      supabase.from('qual_assignments').select('*').eq('session_id', session.id),
    ]).then(([f, q]) => {
      const fm = {}; (f.data||[]).forEach(r => { fm[r.player_id] = r })
      const qm = {}; (q.data||[]).forEach(r => { qm[r.player_id] = r })
      setForecasts(fm)
      setQualAssign(qm)
    })
  }, [sessions, sessionType])

  const currentStage   = stages.find(s => s.key === stageKey)
  const currentSession = sessions[sessionType]
  const isLocked       = !!(currentSession?.is_locked || currentStage?.is_locked)
  const isDouble       = DOUBLE_STAGES.has(stageKey)

  const resultsList = currentSession?.results
    ? Object.entries(currentSession.results).sort((a,b)=>+a[0]-+b[0]).map(([,v])=>v)
    : []

  async function saveResults(results, fl, ov) {
    if (!currentSession) return
    const update = { results }
    if (fl !== undefined) update.fl_pilot = fl
    if (ov !== undefined) update.ov_pilot = ov
    const { data } = await supabase.from('sessions')
      .update(update).eq('id', currentSession.id).select().single()
    if (data) setSessions(prev => ({ ...prev, [sessionType]: data }))
  }

  async function saveForecast(playerId, preds, fl, ov) {
    if (!currentSession) return
    const predsObj = {}
    preds.forEach((p, i) => { if (p) predsObj[i+1] = p })
    const { data } = await supabase.from('forecasts').upsert({
      session_id: currentSession.id,
      player_id:  playerId,
      predictions: predsObj,
      fl_pick: fl || '',
      ov_pick: ov || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,player_id' }).select().single()
    if (data) setForecasts(prev => ({ ...prev, [playerId]: data }))
  }

  async function saveQualAssign(playerId, pilot1, pilot2, pos1, pos2) {
    if (!currentSession) return
    const { data } = await supabase.from('qual_assignments').upsert({
      session_id: currentSession.id, player_id: playerId,
      pilot_1: pilot1||'', pilot_2: pilot2||'',
      pred_pos_1: pos1||null, pred_pos_2: pos2||null,
    }, { onConflict: 'session_id,player_id' }).select().single()
    if (data) setQualAssign(prev => ({ ...prev, [playerId]: data }))
  }

  // ── COMMIT INLINE ──
  async function handleCommit() {
    if (!currentSession) return
    if (!window.confirm(`Зарахувати бали за ${currentStage?.name} — ${sessionType.toUpperCase()}?\nЦе заблокує сесію назавжди.`)) return
    setCommitting(true)
    try {
      const results   = Object.entries(currentSession.results||{}).sort((a,b)=>+a[0]-+b[0]).map(([,v])=>v)
      const flResult  = currentSession.fl_pilot || ''
      const ovResult  = currentSession.ov_pilot || ''
      const { data: forecasts_ } = await supabase.from('forecasts').select('*, players(id,name,base_pts)').eq('session_id', currentSession.id)
      const { data: qualData }   = await supabase.from('qual_assignments').select('*, players(id,name,base_pts)').eq('session_id', currentSession.id)

      const { data: beforeSnap } = await supabase.from('players').select('id,base_pts').order('base_pts',{ascending:false})
      const rankBefore = {}
      ;(beforeSnap||[]).forEach((p,i) => { rankBefore[p.id] = i+1 })

      const updates = []
      const bdLog   = []

      if (sessionType === 'race') {
        for (const f of (forecasts_||[])) {
          const preds = Array.from({length:10}, (_,i) => f.predictions?.[i+1]||'')
          const { total, breakdown } = calcRaceScore(preds, f.fl_pick, f.ov_pick, results, flResult, ovResult)
          updates.push({ id: f.players?.id, base_pts: (f.players?.base_pts||0)+total, delta: total })
          bdLog.push({ player: f.players?.name, score: total })
          await supabase.from('forecasts').update({ score: total, score_breakdown: breakdown }).eq('id', f.id)
        }
      } else if (sessionType === 'qual') {
        for (const qa of (qualData||[])) {
          let total = 0, breakdown = []
          for (const [pilot, pos] of [[qa.pilot_1, qa.pred_pos_1],[qa.pilot_2, qa.pred_pos_2]]) {
            if (!pilot || !pos) continue
            const r = calcQualScore(pilot, pos, results)
            total += r.total; breakdown.push(...r.breakdown)
          }
          updates.push({ id: qa.players?.id, base_pts: (qa.players?.base_pts||0)+total, delta: total })
          bdLog.push({ player: qa.players?.name, score: total })
          await supabase.from('qual_assignments').update({ score: total }).eq('id', qa.id)
        }
      } else if (sessionType === 'sprint') {
        for (const f of (forecasts_||[])) {
          const preds = Array.from({length:5}, (_,i) => f.predictions?.[i+1]||'')
          const { total, breakdown } = calcSprintScore(preds, results)
          updates.push({ id: f.players?.id, base_pts: (f.players?.base_pts||0)+total, delta: total })
          bdLog.push({ player: f.players?.name, score: total })
          await supabase.from('forecasts').update({ score: total, score_breakdown: breakdown }).eq('id', f.id)
        }
      }

      for (const u of updates) {
        if (u.id) await supabase.from('players').update({ base_pts: u.base_pts, last_session_delta: u.delta }).eq('id', u.id)
      }

      const { data: afterSnap } = await supabase.from('players').select('id,base_pts').order('base_pts',{ascending:false})
      const rankAfter = {}
      ;(afterSnap||[]).forEach((p,i) => { rankAfter[p.id] = i+1 })
      for (const u of updates) {
        const before = rankBefore[u.id]||0, after = rankAfter[u.id]||0
        await supabase.from('players').update({ last_rank_delta: before - after }).eq('id', u.id)
      }

      await supabase.from('sessions').update({ is_locked:true, committed:true, committed_at:new Date().toISOString() }).eq('id', currentSession.id)
      await supabase.from('audit_log').insert({ action:'commit_session', actor:'admin', details:{ stage:currentStage?.name, type:sessionType, scores:bdLog } })

      setSessions(prev => ({ ...prev, [sessionType]: { ...prev[sessionType], is_locked:true, committed:true } }))
      setCommitMsg(`✓ Зараховано! ${bdLog.map(b=>`${b.player}:+${b.score}`).join(' · ')}`)
    } catch(e) {
      setCommitMsg(`⚠ Помилка: ${e.message}`)
    } finally {
      setCommitting(false)
    }
  }

  const teamGroups = {}
  players.forEach(p => {
    if (!teamGroups[p.team]) teamGroups[p.team] = []
    teamGroups[p.team].push(p)
  })

  const availableSessions = ['qual', ...(currentStage?.has_sprint ? ['sprint'] : []), 'race']

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2}}>ЗАВАНТАЖЕННЯ...</div></main>

  return (
    <main>
      {/* Stage + Session bar */}
      <div className="stage-bar">
        <select className="stage-select" value={stageKey} onChange={e=>setStageKey(e.target.value)}>
          <option value="">— Оберіть етап —</option>
          {stages.map(s => (
            <option key={s.key} value={s.key}>
              {s.flag} {s.name} {s.is_locked ? '🔒' : ''}
            </option>
          ))}
        </select>
        <div className="session-btns">
          {availableSessions.map(t => (
            <button key={t} className={`session-btn${sessionType===t?' active':''}`} onClick={()=>setSessionType(t)}>
              {t==='qual'?'КВАЛІФІКАЦІЯ':t==='sprint'?'СПРИНТ':'ГОНКА'}
            </button>
          ))}
        </div>
        {isDouble && sessionType==='qual' && <span className="badge badge-double">×2 ПІЛОТИ</span>}
        {isLocked && <span className="badge badge-locked">🔒 ЗАБЛОКОВАНО</span>}
        {currentSession?.committed && <span className="badge badge-committed">✓ ЗАРАХОВАНО</span>}
      </div>

      {!stageKey && (
        <div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:'30px 0',textAlign:'center'}}>
          ОБЕРІТЬ ЕТАП
        </div>
      )}

      {stageKey && (
        <>
          {/* Results */}
          {sessionType === 'race' && (
            <DragResults
              session={currentSession} isAdmin={isAdmin}
              slotsCount={22} showSpecials title="Результати гонки"
              onUpdate={(results, fl, ov) => saveResults(results, fl, ov)}
            />
          )}
          {sessionType === 'qual' && (
            <DragResults
              session={currentSession} isAdmin={isAdmin}
              slotsCount={22} showSpecials={false} title="Результати кваліфікації"
              onUpdate={(results) => saveResults(results)}
            />
          )}
          {sessionType === 'sprint' && (
            <DragResults
              session={currentSession} isAdmin={isAdmin}
              slotsCount={7} showSpecials={false} title="Результати спринту (Топ-7)"
              onUpdate={(results) => saveResults(results)}
            />
          )}

          {/* Commit button — only admin, only unlocked, only not yet committed */}
          {isAdmin && !isLocked && currentSession && !currentSession.committed && (
            <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20,padding:'12px 16px',background:'rgba(225,6,0,.06)',border:'1px solid rgba(225,6,0,.2)',borderRadius:6}}>
              <button
                className="btn btn-red"
                onClick={handleCommit}
                disabled={committing}
                style={{letterSpacing:2}}
              >
                {committing ? '...' : '⚑ ЗАРАХУВАТИ БАЛИ'}
              </button>
              <span style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>
                Бали поточної сесії будуть додані до таблиці. Сесія заблокується.
              </span>
            </div>
          )}

          {commitMsg && (
            <div style={{padding:'10px 14px',marginBottom:16,background:'rgba(107,255,138,.08)',border:'1px solid var(--green)',borderRadius:4,color:'var(--green)',fontSize:11,fontFamily:'Orbitron,sans-serif'}}>
              {commitMsg}
              <button style={{float:'right',background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={()=>setCommitMsg('')}>✕</button>
            </div>
          )}

          {/* Players grid */}
          <div className="toolbar">
            <div className="section-label" style={{margin:0,flex:1}}>
              {sessionType==='qual'?'ПРОГНОЗИ — КВАЛІФІКАЦІЯ':sessionType==='sprint'?'ПРОГНОЗИ — СПРИНТ':'ПРОГНОЗИ — ГОНКА'}
            </div>
            {isAdmin && sessionType==='qual' && (
              <button className="roulette-btn all" onClick={() => rollAllQual(players, qualAssign, stageKey, currentSession?.id, setQualAssign, isDouble)}>
                🎲 РАНДОМАЙЗЕР ВСІМ
              </button>
            )}
          </div>

          <div className="players-grid">
            {Object.entries(teamGroups).flatMap(([team, teamPlayers]) =>
              teamPlayers.map((p, idx) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  teamColor={TEAM_COLORS[p.team] || '#888'}
                  sessionType={sessionType}
                  session={currentSession}
                  forecast={forecasts[p.id]}
                  qualAssign={qualAssign[p.id]}
                  results={resultsList}
                  flResult={currentSession?.fl_pilot}
                  ovResult={currentSession?.ov_pilot}
                  isMe={me?.id === p.id}
                  isAdmin={isAdmin}
                  isLocked={isLocked}
                  isDouble={isDouble}
                  stageKey={stageKey}
                  allQualAssign={qualAssign}
                  onSaveForecast={(preds, fl, ov) => saveForecast(p.id, preds, fl, ov)}
                  onSaveQual={(p1, p2, pos1, pos2) => saveQualAssign(p.id, p1, p2, pos1, pos2)}
                  teamSiblingId={teamPlayers[idx===0?1:0]?.id}
                />
              ))
            )}
          </div>
        </>
      )}
    </main>
  )
}

async function rollAllQual(players, qualAssign, stageKey, sessionId, setQualAssign, isDouble) {
  if (!sessionId) { alert('Спочатку оберіть сесію'); return }
  const { USED_PILOTS, PILOTS } = await import('../lib/supabase')
  const count = isDouble ? 2 : 1
  const { data: allAssignData } = await supabase.from('qual_assignments')
    .select('player_id, pilot_1, pilot_2, session_id')
  const updates = []

  for (const player of players) {
    const usedBase = new Set(USED_PILOTS[player.name] || [])
    allAssignData?.forEach(a => {
      if (a.player_id === player.id) {
        if (a.pilot_1) usedBase.add(a.pilot_1)
        if (a.pilot_2) usedBase.add(a.pilot_2)
      }
    })
    const available = PILOTS.filter(p => !usedBase.has(p))
    let p1 = qualAssign[player.id]?.pilot_1
    let p2 = qualAssign[player.id]?.pilot_2
    const takenSlot1 = new Set(players.filter(pp=>pp.id!==player.id).map(pp=>qualAssign[pp.id]?.pilot_1).filter(Boolean))
    const takenSlot2 = new Set(players.filter(pp=>pp.id!==player.id).map(pp=>qualAssign[pp.id]?.pilot_2).filter(Boolean))
    if (!p1) {
      const pool = available.filter(p=>!takenSlot1.has(p))
      const final = pool.length ? pool : available
      if (final.length) p1 = final[Math.floor(Math.random()*final.length)]
    }
    if (count===2 && !p2) {
      const pool = available.filter(p=>p!==p1&&!takenSlot2.has(p))
      const final = pool.length ? pool : available.filter(p=>p!==p1)
      if (final.length) p2 = final[Math.floor(Math.random()*final.length)]
    }
    updates.push({ session_id:sessionId, player_id:player.id, pilot_1:p1||'', pilot_2:count===2?(p2||''):'' })
  }

  const { data } = await supabase.from('qual_assignments')
    .upsert(updates, { onConflict:'session_id,player_id' }).select()
  if (data) {
    const qm = {}; data.forEach(r => { qm[r.player_id] = r })
    setQualAssign(prev => ({ ...prev, ...qm }))
  }
}
