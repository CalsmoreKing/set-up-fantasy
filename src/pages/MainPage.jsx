import { useState, useEffect, useCallback } from 'react'
import { supabase, PILOTS, PILOT_ABBR, DOUBLE_STAGES, calcRaceScore, calcQualScore, calcSprintScore } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PlayerCard from '../components/PlayerCard'
import RaceResults from '../components/RaceResults'
import QualResults from '../components/QualResults'
import SprintResults from '../components/SprintResults'

const TEAM_COLORS = {
  'Макларен':'#FF8000','Мерседес':'#00D2BE','Феррарі':'#E8002D',
  'Альпін':'#0090FF','Ред Булл':'#3671C6','Ауді':'#888888',
  'Астон Мартін':'#358C75','Альфа Ромео':'#C92D4B','Ред Булл Альфа Таурі':'#5E8FAA',
}

export default function MainPage() {
  const { player: me, isAdmin } = useAuth()
  const [stages,   setStages]   = useState([])
  const [players,  setPlayers]  = useState([])
  const [sessions, setSessions] = useState({})      // { stageKey+type : session }
  const [forecasts,setForecasts]= useState({})      // { sessionId+playerId : forecast }
  const [qualAssign,setQualAssign]=useState({})     // { sessionId+playerId : assignment }
  const [stageKey, setStageKey] = useState('')
  const [sessionType, setSessionType] = useState('race')
  const [loading, setLoading]   = useState(true)

  // Load stages and players once
  useEffect(() => {
    Promise.all([
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('players').select('*').order('name'),
    ]).then(([s, p]) => {
      setStages(s.data || [])
      setPlayers(p.data || [])
      setLoading(false)
    })
  }, [])

  // Load sessions + forecasts when stage changes
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

        // Load forecasts for current session type
        const sid = map[sessionType]?.id
        if (!sid) return
        Promise.all([
          supabase.from('forecasts').select('*').eq('session_id', sid),
          supabase.from('qual_assignments').select('*').eq('session_id', sid),
        ]).then(([f, q]) => {
          const fm = {}
          ;(f.data||[]).forEach(r => { fm[r.player_id] = r })
          setForecasts(fm)
          const qm = {}
          ;(q.data||[]).forEach(r => { qm[r.player_id] = r })
          setQualAssign(qm)
        })
      })
  }, [stageKey, stages, sessionType])

  const currentStage   = stages.find(s => s.key === stageKey)
  const currentSession = sessions[sessionType]
  const isLocked       = currentSession?.is_locked || currentStage?.is_locked

  // Save forecast (debounced in PlayerCard)
  async function saveForecast(playerId, preds, fl, ov) {
    if (!currentSession) return
    const predsObj = {}
    preds.forEach((p, i) => { if (p) predsObj[i+1] = p })
    const { data, error } = await supabase.from('forecasts').upsert({
      session_id: currentSession.id,
      player_id:  playerId,
      predictions: predsObj,
      fl_pick: fl || '',
      ov_pick: ov || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,player_id' }).select().single()
    if (!error && data) {
      setForecasts(prev => ({ ...prev, [playerId]: data }))
    }
    await supabase.from('audit_log').insert({
      action: 'forecast_saved', actor: me?.name || 'player',
      details: { player_id: playerId, session_id: currentSession.id }
    })
  }

  // Save qual assignment
  async function saveQualAssign(playerId, pilot1, pilot2, pos1, pos2) {
    if (!currentSession) return
    const { data, error } = await supabase.from('qual_assignments').upsert({
      session_id: currentSession.id,
      player_id:  playerId,
      pilot_1: pilot1 || '',
      pilot_2: pilot2 || '',
      pred_pos_1: pos1 || null,
      pred_pos_2: pos2 || null,
    }, { onConflict: 'session_id,player_id' }).select().single()
    if (!error && data) {
      setQualAssign(prev => ({ ...prev, [playerId]: data }))
    }
  }

  // Get results arrays
  const resultsList = currentSession?.results
    ? Object.entries(currentSession.results).sort((a,b)=>+a[0]-+b[0]).map(([,v])=>v)
    : []

  // Group players by team for team-collapse feature
  const teamGroups = {}
  players.forEach(p => {
    if (!teamGroups[p.team]) teamGroups[p.team] = []
    teamGroups[p.team].push(p)
  })

  const isDouble = DOUBLE_STAGES.has(stageKey)

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2}}>ЗАВАНТАЖЕННЯ...</div></main>

  return (
    <main>
      {/* Stage + Session selector */}
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
          {['qual','sprint','race'].map(t => (
            <button key={t} className={`session-btn${sessionType===t?' active':''}`} onClick={()=>setSessionType(t)}>
              {t === 'qual' ? 'КВАЛІФІКАЦІЯ' : t === 'sprint' ? 'СПРИНТ' : 'ГОНКА'}
            </button>
          ))}
        </div>
        {isDouble && sessionType==='qual' && <span className="badge badge-double">×2 ПІЛОТИ</span>}
        {isLocked && <span className="badge badge-locked">🔒 ЗАБЛОКОВАНО</span>}
      </div>

      {!stageKey && (
        <div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:'20px 0',textAlign:'center'}}>
          ОБЕРІТЬ ЕТАП ТА СЕСІЮ
        </div>
      )}

      {stageKey && (
        <>
          {/* Results block */}
          {sessionType === 'race' && (
            <RaceResults
              session={currentSession}
              isAdmin={isAdmin}
              onUpdate={(results, fl, ov) => {
                if (!currentSession) return
                supabase.from('sessions').update({ results, fl_pilot: fl, ov_pilot: ov })
                  .eq('id', currentSession.id)
                  .then(() => {
                    setSessions(prev => ({
                      ...prev,
                      [sessionType]: { ...prev[sessionType], results, fl_pilot: fl, ov_pilot: ov }
                    }))
                  })
              }}
            />
          )}
          {sessionType === 'qual' && (
            <QualResults
              session={currentSession}
              isAdmin={isAdmin}
              onUpdate={(results) => {
                if (!currentSession) return
                supabase.from('sessions').update({ results })
                  .eq('id', currentSession.id)
                  .then(() => setSessions(prev => ({
                    ...prev, [sessionType]: { ...prev[sessionType], results }
                  })))
              }}
            />
          )}
          {sessionType === 'sprint' && (
            <SprintResults
              session={currentSession}
              isAdmin={isAdmin}
              onUpdate={(results) => {
                if (!currentSession) return
                supabase.from('sessions').update({ results })
                  .eq('id', currentSession.id)
                  .then(() => setSessions(prev => ({
                    ...prev, [sessionType]: { ...prev[sessionType], results }
                  })))
              }}
            />
          )}

          <div className="divider" />

          {/* Players grid — grouped by team for team-collapse */}
          <div className="toolbar">
            <div className="section-label" style={{margin:0,flex:1}}>
              {sessionType==='qual'?'ПРОГНОЗИ — КВАЛІФІКАЦІЯ':sessionType==='sprint'?'ПРОГНОЗИ — СПРИНТ':'ПРОГНОЗИ — ГОНКА'}
            </div>
            {isAdmin && sessionType==='qual' && (
              <button className="roulette-btn all" onClick={()=>rollAllQual(players, qualAssign, stageKey, currentSession?.id, setQualAssign)}>
                🎲 РАНДОМАЙЗЕР ВСІМ
              </button>
            )}
          </div>

          <div className="players-grid">
            {Object.entries(teamGroups).map(([team, teamPlayers]) => (
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
                  // Team-collapse: pass sibling player id for linked collapse
                  teamSiblingId={teamPlayers[idx===0?1:0]?.id}
                />
              ))
            ))}
          </div>
        </>
      )}
    </main>
  )
}

// Roll qual pilot for all players at once
async function rollAllQual(players, qualAssign, stageKey, sessionId, setQualAssign) {
  if (!sessionId) { alert('Спочатку оберіть сесію'); return }
  const { USED_PILOTS, PILOTS } = await import('../lib/supabase')
  const isDouble = DOUBLE_STAGES.has(stageKey)
  const count = isDouble ? 2 : 1

  // Load all existing stage assignments to know used pilots
  const { data: allAssign } = await supabase.from('qual_assignments')
    .select('player_id, pilot_1, pilot_2, sessions(stage_id)')

  const updates = []
  for (const player of players) {
    const existing = qualAssign[player.id]
    const usedBase = new Set(USED_PILOTS[player.name] || [])

    // Collect all previously assigned pilots for this player across all stages
    allAssign?.forEach(a => {
      if (a.player_id === player.id) {
        if (a.pilot_1) usedBase.add(a.pilot_1)
        if (a.pilot_2) usedBase.add(a.pilot_2)
      }
    })

    const available = PILOTS.filter(p => !usedBase.has(p))

    // Collect taken pilots THIS stage (slot 1)
    const takenSlot1 = new Set(players
      .filter(pp => pp.id !== player.id)
      .map(pp => qualAssign[pp.id]?.pilot_1)
      .filter(Boolean))
    const takenSlot2 = new Set(players
      .filter(pp => pp.id !== player.id)
      .map(pp => qualAssign[pp.id]?.pilot_2)
      .filter(Boolean))

    let p1 = existing?.pilot_1
    let p2 = existing?.pilot_2

    if (!p1) {
      const pool = available.filter(p => !takenSlot1.has(p))
      const final = pool.length ? pool : available
      if (final.length) p1 = final[Math.floor(Math.random() * final.length)]
    }
    if (count === 2 && !p2) {
      const pool = available.filter(p => p !== p1 && !takenSlot2.has(p))
      const final = pool.length ? pool : available.filter(p => p !== p1)
      if (final.length) p2 = final[Math.floor(Math.random() * final.length)]
    }

    updates.push({ session_id: sessionId, player_id: player.id, pilot_1: p1||'', pilot_2: p2||'' })
  }

  // Upsert all
  const { data } = await supabase.from('qual_assignments')
    .upsert(updates, { onConflict: 'session_id,player_id' })
    .select()
  if (data) {
    const qm = {}
    data.forEach(r => { qm[r.player_id] = r })
    setQualAssign(prev => ({ ...prev, ...qm }))
  }

  await supabase.from('audit_log').insert({
    action: 'roll_all_qual', actor: 'admin',
    details: { session_id: sessionId, stage: stageKey }
  })
}
