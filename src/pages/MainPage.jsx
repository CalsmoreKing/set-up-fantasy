import { useState, useEffect, useCallback } from 'react'
import { supabase, PILOTS, DOUBLE_STAGES, calcRaceScore, calcQualScore, calcSprintScore, TEAM_META } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PlayerCard, { FormIndicator, loadFormData } from '../components/PlayerCard'
import DragResults from '../components/DragResults'

const TEAM_COLORS = Object.fromEntries(Object.entries(TEAM_META).map(([k,v]) => [k, v.color]))

export default function MainPage() {
  const { player: me, isAdmin } = useAuth()
  const [stages,    setStages]    = useState([])
  const [players,   setPlayers]   = useState([])
  const [formData,  setFormData]  = useState({})
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
      const playersData = p.data || []
      setStages(stagesData)
      setPlayers(playersData)
      const firstOpen = stagesData.find(st => !st.is_locked)
      if (firstOpen) {
        setStageKey(firstOpen.key)
      }
      setLoading(false)
      loadFormData(playersData).then(setFormData)
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
        // Always pick session with closest upcoming deadline first
        const now = new Date()
        const withDeadline = Object.entries(map)
          .filter(([, s]) => s?.deadline_utc && new Date(s.deadline_utc) > now && !s.committed)
          .sort(([, a], [, b]) => new Date(a.deadline_utc) - new Date(b.deadline_utc))
        // Fallback order: sprint → qual → race
        const fallback = ['sprint','qual','race'].find(t => map[t] && !map[t].committed) || 'race'
        const preferred = withDeadline.length > 0 ? withDeadline[0][0] : fallback
        setSessionType(preferred)
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

  // Deadline logic — session locks automatically when deadline_utc passes
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000) // update every 10s
    return () => clearInterval(t)
  }, [])

  const deadlineDate = currentSession?.deadline_utc ? new Date(currentSession.deadline_utc) : null
  const pastDeadline = deadlineDate ? now >= deadlineDate : false
  // Admin is NEVER locked by deadline — only regular players are
  const isLocked = isAdmin
    ? !!(currentSession?.is_locked || currentStage?.is_locked)
    : !!(currentSession?.is_locked || currentStage?.is_locked || pastDeadline)

  // Auto-lock in DB when deadline passes (only once, only if not already locked)
  useEffect(() => {
    if (!isAdmin && pastDeadline && currentSession && !currentSession.is_locked && !currentSession.committed) {
      supabase.from('sessions')
        .update({ is_locked: true })
        .eq('id', currentSession.id)
        .then(() => {
          setSessions(prev => ({
            ...prev,
            [sessionType]: { ...prev[sessionType], is_locked: true }
          }))
        })
    }
  }, [pastDeadline, currentSession?.id, isAdmin])

  // Countdown string
  function getCountdown() {
    if (!deadlineDate || pastDeadline) return null
    const diff = deadlineDate - now
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    if (h > 48) return null // don't show if far away
    if (h > 0) return `${h}год ${m}хв до закриття`
    if (m > 0) return `${m}хв до закриття`
    return 'менше хвилини!'
  }
  const countdown = getCountdown()
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

  async function saveQualAssign(playerId, pilots, positions) {
    if (!currentSession) return
    const { data } = await supabase.from('qual_assignments').upsert({
      session_id: currentSession.id, player_id: playerId,
      pilot_1: pilots[0]||'', pilot_2: pilots[1]||'', pilot_3: pilots[2]||'',
      pred_pos_1: positions[0]||null, pred_pos_2: positions[1]||null, pred_pos_3: positions[2]||null,
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
          for (const [pilot, pos] of [[qa.pilot_1, qa.pred_pos_1],[qa.pilot_2, qa.pred_pos_2],[qa.pilot_3, qa.pred_pos_3]]) {
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

      // Reset previous weekend deltas for everyone first, so stale values from
      // a prior session don't linger on players who didn't forecast this time
      await supabase.from('players').update({ last_session_delta: 0 }).neq('id', '00000000-0000-0000-0000-000000000000')

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
      loadFormData(players).then(setFormData)
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

  const availableSessions = [...(currentStage?.has_sprint ? ['sprint'] : []), 'qual', 'race']

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
        {isLocked && !currentSession?.committed && <span className="badge badge-locked">🔒 ЗАБЛОКОВАНО</span>}
        {currentSession?.committed && <span className="badge badge-committed">✓ ЗАРАХОВАНО</span>}
        {countdown && (
          <span style={{
            fontFamily:'Orbitron,sans-serif', fontSize:9, letterSpacing:1,
            color: countdown.includes('хв') && !countdown.includes('год') ? '#fbbf24' : 'var(--muted)',
            border: `1px solid ${countdown.includes('хв') && !countdown.includes('год') ? '#fbbf24' : 'var(--border)'}`,
            borderRadius:2, padding:'2px 8px',
          }}>
            ⏱ {countdown}
          </span>
        )}
        {deadlineDate && !countdown && !pastDeadline && (
          <span style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:1}}>
            закр. {deadlineDate.toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
          </span>
        )}
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
              slotsCount={10} showSpecials podiumCount={5} title="Результати гонки (Топ-10)"
              onUpdate={(results, fl, ov) => saveResults(results, fl, ov)}
            />
          )}
          {sessionType === 'qual' && (
            <DragResults
              session={currentSession} isAdmin={isAdmin}
              slotsCount={22} showSpecials={false} podiumCount={3} title="Результати кваліфікації"
              onUpdate={(results) => saveResults(results)}
            />
          )}
          {sessionType === 'sprint' && (
            <DragResults
              session={currentSession} isAdmin={isAdmin}
              slotsCount={5} showSpecials={false} podiumCount={3} isSprint title="Результати спринту (Топ-5)"
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

          {/* Live-mode scoring helper */}
          {(() => {
            // Live mode = session locked (deadline passed or admin locked) but not yet committed
            const isLiveMode = (pastDeadline || currentSession?.is_locked) && !currentSession?.committed
            const allPlayers = Object.values(teamGroups).flat()

            // Compute live score per player
            const liveScores = {}
            allPlayers.forEach(p => {
              const fc = forecasts[p.id]
              const qa = qualAssign[p.id]
              if (sessionType === 'race' && fc) {
                const preds = Array.from({length:10}, (_,i) => fc.predictions?.[i+1]||'')
                const { total } = calcRaceScore(preds, fc.fl_pick, fc.ov_pick, resultsList,
                  currentSession?.fl_pilot, currentSession?.ov_pilot)
                liveScores[p.id] = total
              } else if (sessionType === 'qual' && qa) {
                let tot = 0
                for (const [pilot, pos] of [[qa.pilot_1,qa.pred_pos_1],[qa.pilot_2,qa.pred_pos_2],[qa.pilot_3,qa.pred_pos_3]]) {
                  if (pilot && pos) { const r = calcQualScore(pilot, pos, resultsList); tot += r.total }
                }
                liveScores[p.id] = tot
              } else if (sessionType === 'sprint' && fc) {
                const preds = Array.from({length:5}, (_,i) => fc.predictions?.[i+1]||'')
                const { total } = calcSprintScore(preds, resultsList)
                liveScores[p.id] = total
              } else {
                liveScores[p.id] = 0
              }
            })

            // Sort by live score desc when live mode, else keep team order
            const sortedPlayers = isLiveMode
              ? [...allPlayers].sort((a,b) => (liveScores[b.id]||0) - (liveScores[a.id]||0))
              : allPlayers

            const gridClass = isLiveMode ? 'players-grid-live' : 'players-grid'

            return (
              <div className={gridClass} style={isLiveMode ? {} : {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))'}}>
                {sortedPlayers.map((p, idx) => {
                  const teamPlayers = teamGroups[p.team] || []
                  const teamIdx = teamPlayers.findIndex(tp => tp.id === p.id)
                  const siblingId = teamPlayers[teamIdx===0?1:0]?.id
                  // Is current player's teammate viewing this card? (bidirectional)
                  const myTeamPlayers = teamGroups[me?.team] || []
                  const isMyTeammate = me && myTeamPlayers.some(tp => tp.id === p.id) && me.id !== p.id
                  const canSeeForecast = isAdmin || me?.id === p.id || isMyTeammate || pastDeadline || currentSession?.committed
                  return (
                    <div
                      key={p.id}
                      className="player-card-live-wrap"
                      style={isLiveMode ? {
                        order: idx,
                        transition: 'transform .5s cubic-bezier(.4,0,.2,1)',
                      } : {}}
                    >
                      <PlayerCard
                        player={p}
                        teamColor={TEAM_COLORS[p.team] || '#888'}
                        sessionType={sessionType}
                        session={currentSession}
                        forecast={canSeeForecast ? forecasts[p.id] : null}
                        qualAssign={canSeeForecast ? qualAssign[p.id] : null}
                        results={resultsList}
                        flResult={currentSession?.fl_pilot}
                        ovResult={currentSession?.ov_pilot}
                        isMe={me?.id === p.id}
                        isAdmin={isAdmin}
                        isLocked={isLocked}
                        isDouble={isDouble}
                        stageKey={stageKey}
                        allQualAssign={qualAssign}
                        forecastHidden={!canSeeForecast}
                        onSaveForecast={(preds, fl, ov) => saveForecast(p.id, preds, fl, ov)}
                        onSaveQual={(pilots, positions) => saveQualAssign(p.id, pilots, positions)}
                        teamSiblingId={siblingId}
                        formData={formData}
                        liveScore={isLiveMode ? liveScores[p.id] : undefined}
                        liveRank={isLiveMode ? idx+1 : undefined}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </>
      )}
    </main>
  )
}

async function rollAllQual(players, qualAssign, stageKey, sessionId, setQualAssign, isDouble) {
  if (!sessionId) { alert('Спочатку оберіть сесію'); return }
  const { USED_PILOTS, PILOTS, getStandardSlotCount, hasBonusSlot } = await import('../lib/supabase')

  const standardCount = getStandardSlotCount(isDouble) // 1 or 2, same for everyone

  // Load ALL qual assignments across ALL stages to know full pilot history
  const { data: allAssignData } = await supabase
    .from('qual_assignments')
    .select('player_id, pilot_1, pilot_2, pilot_3')

  const playerUsed = {}
  players.forEach(p => {
    playerUsed[p.id] = new Set(USED_PILOTS[p.name] || [])
  })
  allAssignData?.forEach(a => {
    if (a.pilot_1 && playerUsed[a.player_id]) playerUsed[a.player_id].add(a.pilot_1)
    if (a.pilot_2 && playerUsed[a.player_id]) playerUsed[a.player_id].add(a.pilot_2)
    if (a.pilot_3 && playerUsed[a.player_id]) playerUsed[a.player_id].add(a.pilot_3)
  })

  const teammateOf = {}
  players.forEach(p => {
    const sibling = players.find(pp => pp.team === p.team && pp.id !== p.id)
    if (sibling) teammateOf[p.id] = sibling.id
  })

  // ── STANDARD POOL: shared across everyone, team-protected ──
  function assignStandardSlot() {
    const available = {}
    players.forEach(p => {
      available[p.id] = PILOTS.filter(pilot => !playerUsed[p.id].has(pilot))
    })
    const assignment = {}
    const usedThisSlot = new Set()
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5)

    for (const player of shuffledPlayers) {
      if (assignment[player.id] !== undefined) continue
      const teammateId = teammateOf[player.id]
      const teammate = teammateId ? players.find(pp => pp.id === teammateId) : null

      const pool1 = available[player.id].filter(p => !usedThisSlot.has(p))
      const finalPool1 = pool1.length > 0 ? pool1 : available[player.id]
      const pilot1 = finalPool1.length ? finalPool1[Math.floor(Math.random()*finalPool1.length)] : ''
      if (pilot1) { assignment[player.id] = pilot1; usedThisSlot.add(pilot1); playerUsed[player.id].add(pilot1) }
      else assignment[player.id] = ''

      if (teammate && assignment[teammate.id] === undefined) {
        const pool2 = available[teammate.id].filter(p => !usedThisSlot.has(p) && p !== pilot1)
        const fallback2 = available[teammate.id].filter(p => p !== pilot1)
        const finalPool2 = pool2.length > 0 ? pool2 : (fallback2.length > 0 ? fallback2 : available[teammate.id].filter(p=>p!==pilot1))
        const pilot2 = finalPool2.length ? finalPool2[Math.floor(Math.random()*finalPool2.length)] : ''
        if (pilot2) { assignment[teammate.id] = pilot2; usedThisSlot.add(pilot2); playerUsed[teammate.id].add(pilot2) }
        else assignment[teammate.id] = ''
      }
    }
    return assignment
  }

  const standardSlots = []
  for (let i = 0; i < standardCount; i++) standardSlots.push(assignStandardSlot())

  // ── BONUS POOL: fully independent — its own copy of playerUsed history,
  // never touches or is touched by the standard pool assignments above.
  // Only guarantees: unique within player's own history, and never same
  // pilot as own teammate's bonus pilot this round. ──
  const bonusPlayers = players.filter(p => hasBonusSlot(p.name, stageKey))
  const bonusAssignment = {}
  if (bonusPlayers.length) {
    const bonusUsed = {}
    bonusPlayers.forEach(p => { bonusUsed[p.id] = new Set(USED_PILOTS[p.name] || []) })
    allAssignData?.forEach(a => {
      if (bonusUsed[a.player_id]) {
        if (a.pilot_1) bonusUsed[a.player_id].add(a.pilot_1)
        if (a.pilot_2) bonusUsed[a.player_id].add(a.pilot_2)
        if (a.pilot_3) bonusUsed[a.player_id].add(a.pilot_3)
      }
    })
    // Also exclude what was just assigned in the standard pool this round
    standardSlots.forEach(slot => {
      bonusPlayers.forEach(p => { if (slot[p.id] && bonusUsed[p.id]) bonusUsed[p.id].add(slot[p.id]) })
    })

    const usedThisBonusRound = new Set()
    const shuffledBonus = [...bonusPlayers].sort(() => Math.random() - 0.5)
    for (const player of shuffledBonus) {
      if (bonusAssignment[player.id] !== undefined) continue
      const teammateId = teammateOf[player.id]
      const teammate = teammateId ? bonusPlayers.find(pp => pp.id === teammateId) : null

      const pool1 = PILOTS.filter(p => !bonusUsed[player.id].has(p) && !usedThisBonusRound.has(p))
      const fallback1 = PILOTS.filter(p => !bonusUsed[player.id].has(p))
      const finalPool1 = pool1.length > 0 ? pool1 : (fallback1.length > 0 ? fallback1 : PILOTS)
      const pilot1 = finalPool1.length ? finalPool1[Math.floor(Math.random()*finalPool1.length)] : ''
      if (pilot1) { bonusAssignment[player.id] = pilot1; usedThisBonusRound.add(pilot1); bonusUsed[player.id].add(pilot1) }
      else bonusAssignment[player.id] = ''

      if (teammate && bonusAssignment[teammate.id] === undefined) {
        const pool2 = PILOTS.filter(p => !bonusUsed[teammate.id].has(p) && !usedThisBonusRound.has(p) && p !== pilot1)
        const fallback2 = PILOTS.filter(p => !bonusUsed[teammate.id].has(p) && p !== pilot1)
        const finalPool2 = pool2.length > 0 ? pool2 : (fallback2.length > 0 ? fallback2 : PILOTS.filter(p=>p!==pilot1))
        const pilot2 = finalPool2.length ? finalPool2[Math.floor(Math.random()*finalPool2.length)] : ''
        if (pilot2) { bonusAssignment[teammate.id] = pilot2; usedThisBonusRound.add(pilot2); bonusUsed[teammate.id].add(pilot2) }
        else bonusAssignment[teammate.id] = ''
      }
    }
  }

  // ── Combine: standard slots fill pilot_1/pilot_2, bonus fills the next free slot ──
  const updates = players.map(p => {
    const myBonus = bonusAssignment[p.id] || ''
    const pilots = []
    for (let i = 0; i < standardCount; i++) pilots.push(standardSlots[i]?.[p.id] || '')
    if (myBonus) pilots.push(myBonus)
    return {
      session_id: sessionId,
      player_id: p.id,
      pilot_1: pilots[0] || '',
      pilot_2: pilots[1] || '',
      pilot_3: pilots[2] || '',
      pred_pos_1: null, pred_pos_2: null, pred_pos_3: null,
    }
  })

  const { data } = await supabase
    .from('qual_assignments')
    .upsert(updates, { onConflict: 'session_id,player_id' })
    .select()

  if (data) {
    const qm = {}
    data.forEach(r => { qm[r.player_id] = r })
    setQualAssign(qm)
  }

  await supabase.from('audit_log').insert({
    action: 'roll_all_qual', actor: 'admin',
    details: { session_id: sessionId, stage: stageKey }
  })
}
