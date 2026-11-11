import { useState, useEffect } from 'react'
import { supabase, TEAM_META, PILOTS, RESERVE_PILOTS_2026, PILOT_TEAM_ROSTER } from '../lib/supabase'
import { normalizeStageDriver, normalizeStageResults } from '../lib/roster'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { auditActionLabel, auditActorLabel, auditSummary } from '../lib/audit'
import { archiveBaselineForPlayer } from '../lib/archive'
import { canonicalStoredScore, calcQualAssignmentScore, recalculateForecast, recalculateQualAssignment } from '../lib/scoring'
import { calculateNewcomerBonuses } from '../lib/standings'
import { newcomerPlayersForStage } from '../lib/roster'

export default function AdminPage() {
  const { isAdmin, user, player: adminPlayer } = useAuth()
  const nav = useNavigate()
  const [tab,       setTab]       = useState('stages')
  const [stages,    setStages]    = useState([])
  const [players,   setPlayers]   = useState([])
  const [sessions,  setSessions]  = useState([])
  const [logs,      setLogs]      = useState([])
  const [scoreLedger, setScoreLedger] = useState({})
  const [newcomerMinima, setNewcomerMinima] = useState({})
  const [pilotChanges, setPilotChanges] = useState([])
  const [subStageId, setSubStageId] = useState('')
  const [subTeam, setSubTeam] = useState('')
  const [subOutgoing, setSubOutgoing] = useState('')
  const [subIncoming, setSubIncoming] = useState('')
  const [loading,   setLoading]   = useState(true)
  const [msg,       setMsg]       = useState('')

  // New player / team forms
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerTeam, setNewPlayerTeam] = useState('')
  const [newTeamName,   setNewTeamName]   = useState('')
  const [newTeamColor,  setNewTeamColor]  = useState('#888888')
  const [newTeamCode,   setNewTeamCode]   = useState('')
  const [customTeams,   setCustomTeams]   = useState([])

  useEffect(() => { if (!isAdmin) nav('/') }, [isAdmin])

  function loadAll() {
    Promise.all([
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('players').select('*').order('name'),
      supabase.from('sessions').select('*, stages(name,flag,sort_order,key)').order('created_at', {ascending:false}),
      supabase.from('audit_log').select('*').order('created_at', {ascending:false}).limit(80),
      supabase.from('stage_pilot_substitutions').select('*,stages(name,key,flag)').order('created_at', {ascending:false}),
      supabase.from('stage_newcomer_bonuses').select('stage_id,source_minimum').order('updated_at',{ascending:false}),
    ]).then(([s,p,se,l,sub,b]) => {
      setStages(s.data||[])
      setPlayers(p.data||[])
      setSessions(se.data||[])
      setLogs(l.data||[])
      setPilotChanges(sub.data || [])
      setNewcomerMinima(Object.fromEntries((b.data||[]).map(row=>[row.stage_id,row.source_minimum])))
      buildPlayerScoreLedger(p.data || [], se.data || []).then(setScoreLedger)
      // collect distinct teams not in TEAM_META (custom-added)
      const teamsInDb = [...new Set((p.data||[]).map(x=>x.team))]
      setCustomTeams(teamsInDb.filter(t => !TEAM_META[t]))
      setLoading(false)
    })
  }
  useEffect(() => { loadAll() }, [])

  async function log(action, details = {}) {
    const actor = adminPlayer?.name || user?.email || 'Адміністратор'
    const enrichedDetails = { ...details, actor_name: adminPlayer?.name || null, actor_email: user?.email || null, actor_user_id: user?.id || null }
    const { error } = await supabase.from('audit_log').insert({ action, actor, details: enrichedDetails })
    if (error) console.error('Audit log insert failed:', error.message)
  }

  // ── STAGES ──
  async function toggleStageLock(stage) {
    if (Number(stage.sort_order) < 10) return
    await supabase.from('stages').update({ is_locked: !stage.is_locked }).eq('id', stage.id)
    await supabase.from('sessions').update({ is_locked: !stage.is_locked }).eq('stage_id', stage.id)
    setStages(prev => prev.map(s => s.id===stage.id ? {...s, is_locked:!s.is_locked} : s))
    setMsg(`${stage.name} — ${stage.is_locked ? 'розблоковано' : 'заблоковано'}`)
    await log(stage.is_locked ? 'unlock_stage' : 'lock_stage', { stage: stage.key })
  }
  async function toggleSessionLock(session) {
    if (Number(session.stages?.sort_order) < 10) return
    await supabase.from('sessions').update({ is_locked: !session.is_locked }).eq('id', session.id)
    setSessions(prev => prev.map(s => s.id===session.id ? {...s, is_locked:!s.is_locked} : s))
    setMsg(`Сесія ${session.type} — ${session.is_locked ? 'розблоковано' : 'заблоковано'}`)
    await log(session.is_locked ? 'unlock_session' : 'lock_session', { session_id:session.id, stage_name:session.stages?.name, type:session.type })
  }

  // ── COMMIT SCORES ──
  async function commitSession(session, recalculate = false) {
    const verb = recalculate ? 'Перерахувати' : 'Зарахувати'
    if (!window.confirm(`${verb} бали за ${session.stages?.name} — ${session.type}? Повторний перерахунок замінить старі бали, а не додасть їх повторно.`)) return

    const forecastsResult = await supabase.from('forecasts').select('*, players(id,name,base_pts)').eq('session_id', session.id)
    const qualResult = await supabase.from('qual_assignments').select('*, players(id,name,base_pts)').eq('session_id', session.id)
    if (forecastsResult.error) throw forecastsResult.error
    if (qualResult.error) throw qualResult.error
    const forecasts = forecastsResult.data
    const qualData = qualResult.data
    const substitutionsResult = await supabase.from('stage_pilot_substitutions').select('*').eq('stage_id',session.stage_id).eq('is_active',true).order('created_at')
    if (substitutionsResult.error && !String(substitutionsResult.error.message).includes('stage_pilot_substitutions')) throw substitutionsResult.error
    const pilotChanges = substitutionsResult.data || []
    const normalizedResults = normalizeStageResults(session.results || {}, pilotChanges)
    const results = Object.entries(normalizedResults).sort((a,b)=>+a[0]-+b[0]).map(([,v])=>v)
    const flResult = normalizeStageDriver(session.fl_pilot || '', pilotChanges)
    const ovResult = String(session.ov_pilot || '').split(/[,;|]/).map(p=>normalizeStageDriver(p.trim(),pilotChanges)).filter(Boolean).join(', ')
    const updates = []
    const forecastScores = []
    const qualScores = []
    const breakdown_log = []

    if (session.type === 'race') {
      const { calcRaceScore } = await import('../lib/supabase')
      for (const f of (forecasts||[])) {
        const preds = Array.from({length:10}, (_,i) => normalizeStageDriver(f.predictions?.[i+1]||'',pilotChanges))
        const { total, breakdown } = calcRaceScore(preds, normalizeStageDriver(f.fl_pick,pilotChanges), normalizeStageDriver(f.ov_pick,pilotChanges), results, flResult, ovResult, session.stages?.sort_order)
        updates.push({ id: f.players?.id, delta: total - (Number(f.score)||0) })
        forecastScores.push({ id:f.id, score:total, score_breakdown:breakdown, scored_input:{ predictions:Object.fromEntries(preds.map((pilot,index)=>[index+1,pilot]).filter(([,pilot])=>pilot)), fl_pick:normalizeStageDriver(f.fl_pick,pilotChanges), ov_pick:normalizeStageDriver(f.ov_pick,pilotChanges) } })
        breakdown_log.push({ player: f.players?.name, score: total, breakdown })
      }
    } else if (session.type === 'qual') {
      for (const qa of (qualData||[])) {
        const normalized = {
          ...qa,
          pilot_1:normalizeStageDriver(qa.pilot_1,pilotChanges),
          pilot_2:normalizeStageDriver(qa.pilot_2,pilotChanges),
          pilot_3:normalizeStageDriver(qa.pilot_3,pilotChanges),
        }
        const { total, breakdown } = calcQualAssignmentScore(normalized, results, session.stages?.sort_order)
        updates.push({ id: qa.players?.id, delta: total - (Number(qa.score)||0) })
        qualScores.push({ id:qa.id, score:total, scored_input:{ pilot_1:normalized.pilot_1, pred_pos_1:qa.pred_pos_1, pilot_2:normalized.pilot_2, pred_pos_2:qa.pred_pos_2, pilot_3:normalized.pilot_3, pred_pos_3:qa.pred_pos_3 } })
        breakdown_log.push({ player: qa.players?.name, score: total, breakdown })
      }
    } else if (session.type === 'sprint') {
      const { calcSprintScore } = await import('../lib/supabase')
      for (const f of (forecasts||[])) {
        const sprintSlots = Number(session.stages?.sort_order) < 10 ? 10 : 5
        const preds = Array.from({length:sprintSlots}, (_,i) => normalizeStageDriver(f.predictions?.[i+1]||'',pilotChanges))
        const { total, breakdown } = calcSprintScore(preds, results, session.stages?.sort_order, normalizeStageDriver(f.fl_pick,pilotChanges), flResult)
        updates.push({ id: f.players?.id, delta: total - (Number(f.score)||0) })
        forecastScores.push({ id:f.id, score:total, score_breakdown:breakdown, scored_input:{ predictions:Object.fromEntries(preds.map((pilot,index)=>[index+1,pilot]).filter(([,pilot])=>pilot)), fl_pick:normalizeStageDriver(f.fl_pick,pilotChanges), ov_pick:normalizeStageDriver(f.ov_pick,pilotChanges) } })
        breakdown_log.push({ player: f.players?.name, score: total, breakdown })
      }
    }

    // Snapshot rank before the atomic replacement-based score transaction.
    const beforeResult = await supabase.from('players').select('id,base_pts').order('base_pts',{ascending:false})
    if (beforeResult.error) throw beforeResult.error
    const beforeSnapshot = beforeResult.data
    const rankBefore = {}
    ;(beforeSnapshot||[]).forEach((p,i) => { rankBefore[p.id] = i+1 })

    const { error: applyError } = await supabase.rpc('apply_session_scores', {
      p_session_id: session.id,
      p_forecast_scores: forecastScores,
      p_qual_scores: qualScores,
      p_is_recalculation: Boolean(session.committed),
    })
    if (applyError) throw applyError

    // Snapshot rank AFTER update
    const afterResult = await supabase.from('players').select('id,base_pts').order('base_pts',{ascending:false})
    if (afterResult.error) throw afterResult.error
    const afterSnapshot = afterResult.data
    const rankAfter = {}
    ;(afterSnapshot||[]).forEach((p,i) => { rankAfter[p.id] = i+1 })

    for (const u of updates) {
      const before = rankBefore[u.id] || 0
      const after  = rankAfter[u.id] || 0
      await supabase.from('players').update({ last_rank_delta: before - after }).eq('id', u.id)
    }

    setSessions(prev => prev.map(s => s.id===session.id ? {...s, is_locked:true, committed:true} : s))
    await log(recalculate ? 'recalculate_session' : 'commit_session', { session_id: session.id, stage: session.stages?.name, type: session.type, breakdown: breakdown_log })

    loadAll()
    setMsg(recalculate ? '✓ Бали перераховано без повторного додавання.' : '✓ Бали зараховано! Сесія заблокована.')
  }

  // ── PLAYER EDIT ──
  async function updatePlayerField(playerId, field, value) {
    const target = players.find(p => p.id === playerId)
    if (field === 'base_pts') {
      const { error } = await supabase.rpc('apply_player_score_adjustment', { p_player_id:playerId, p_target_total:value, p_note:'Ручне коригування з панелі адміністратора' })
      if (error) { setMsg(`⚠ ${error.message}`); return }
    } else {
      const { error } = await supabase.from('players').update({ [field]: value }).eq('id', playerId)
      if (error) { setMsg(`⚠ ${error.message}`); return }
    }
    setPlayers(prev => prev.map(p => p.id===playerId ? {...p, [field]:value} : p))
    await log('edit_player', { player_id:playerId, player_name:target?.name, field, old_value:target?.[field], value })
    if (field === 'base_pts') loadAll()
    setMsg('✓ Збережено')
  }

  async function resetPlayerPassword(player) {
    if (!player.email_for_reset) {
      const email = window.prompt(`Email гравця ${player.name} для надсилання листа скидання паролю:`)
      if (!email) return
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) setMsg(`⚠ Помилка: ${error.message}`)
      else setMsg(`✓ Лист скидання паролю надіслано на ${email}`)
      return
    }
  }

  async function unlinkPlayerAccount(player) {
    if (!window.confirm(`Відв'язати акаунт від ${player.name}? Гравець втратить доступ і зможе зареєструватись знову.`)) return
    await supabase.from('players').update({ auth_user_id: null }).eq('id', player.id)
    setPlayers(prev => prev.map(p => p.id===player.id ? {...p, auth_user_id:null} : p))
    await log('unlink_account', { player: player.name })
    setMsg(`✓ Акаунт ${player.name} відв'язано`)
  }

  async function setAdmin(playerId, val) {
    await supabase.from('players').update({ is_admin: val }).eq('id', playerId)
    setPlayers(prev => prev.map(p => p.id===playerId ? {...p, is_admin:val} : p))
    const target = players.find(p => p.id === playerId)
    await log('edit_player', { player_id:playerId, player_name:target?.name, field:'is_admin', old_value:target?.is_admin, value:val })
  }

  async function deletePlayer(player) {
    if (!window.confirm(`Видалити гравця ${player.name} НАЗАВЖДИ? Всі його прогнози також видаляться.`)) return
    await supabase.from('players').delete().eq('id', player.id)
    setPlayers(prev => prev.filter(p => p.id !== player.id))
    await log('delete_player', { player: player.name })
    setMsg(`✓ Гравця ${player.name} видалено`)
  }

  // ── ADD PLAYER ──
  async function addPlayer() {
    if (!newPlayerName.trim() || !newPlayerTeam) { setMsg('⚠ Вкажи ім\'я та команду'); return }
    const { error } = await supabase.from('players').insert({
      name: newPlayerName.trim(), team: newPlayerTeam, base_pts: 0
    })
    if (error) { setMsg(`⚠ ${error.message}`); return }
    await log('add_player', { player_name:newPlayerName.trim(), team:newPlayerTeam })
    setNewPlayerName(''); setNewPlayerTeam('')
    loadAll()
    setMsg('✓ Гравця додано')
  }

  // ── ADD TEAM (custom, stored only via player.team string) ──
  function addCustomTeam() {
    if (!newTeamName.trim()) { setMsg('⚠ Вкажи назву команди'); return }
    setCustomTeams(prev => [...new Set([...prev, newTeamName.trim()])])
    setNewTeamName(''); setNewTeamColor('#888888'); setNewTeamCode('')
    setMsg('✓ Команда додана до списку вибору (стане активною коли матиме гравця)')
  }

  async function applyNewcomerBonus(stage) {
    const eligible = newcomerPlayersForStage(players,stage.sort_order)
    if (!eligible.length) { setMsg('Для цього ГП немає новачків із пропущеними етапами.'); return }
    if (Number(stage.sort_order) < 10) { setMsg('Для архівного ГП потрібна підтверджена мінімальна сума зі старого сайту.'); return }
    const stageSessions = sessions.filter(session => session.stage_id===stage.id)
    if (!stageSessions.length || stageSessions.some(session=>!session.committed)) { setMsg('Спочатку мають бути зараховані всі сесії ГП.'); return }
    if (!window.confirm(`Нарахувати кожному новачку мінімальну суму ГП ${stage.name}?`)) return
    try {
      const ids = stageSessions.map(session=>session.id)
      const [f,q,changesResult] = await Promise.all([
        supabase.from('forecasts').select('id,player_id,session_id,score,score_breakdown,scored_input,predictions,fl_pick,ov_pick').in('session_id',ids),
        supabase.from('qual_assignments').select('id,player_id,session_id,score,scored_input,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id',ids),
        supabase.from('stage_pilot_substitutions').select('*').eq('stage_id',stage.id).eq('is_active',true),
      ])
      if (f.error) throw f.error
      if (q.error) throw q.error
      const changes = changesResult.data || []
      const preparedForecasts = (f.data||[]).map(row=>{
        const original = stageSessions.find(session=>session.id===row.session_id)
        const session = { ...original, results:normalizeStageResults(original.results||{},changes), fl_pilot:normalizeStageDriver(original.fl_pilot||'',changes), ov_pilot:String(original.ov_pilot||'').split(/[,;|]/).map(p=>normalizeStageDriver(p.trim(),changes)).filter(Boolean).join(', ') }
        const predictions = Object.fromEntries(Object.entries(row.predictions||{}).map(([position,pilot])=>[position,normalizeStageDriver(pilot,changes)]))
        return { ...row, predictions, fl_pick:normalizeStageDriver(row.fl_pick||'',changes), ov_pick:normalizeStageDriver(row.ov_pick||'',changes), computedScore:canonicalStoredScore(row) }
      })
      const preparedQual = (q.data||[]).map(row=>{
        const original=stageSessions.find(session=>session.id===row.session_id)
        const session={...original,results:normalizeStageResults(original.results||{},changes)}
        const normalized={...row,pilot_1:normalizeStageDriver(row.pilot_1,changes),pilot_2:normalizeStageDriver(row.pilot_2,changes),pilot_3:normalizeStageDriver(row.pilot_3,changes)}
        return {...normalized,computedScore:canonicalStoredScore(row)}
      })
      const result = calculateNewcomerBonuses(players,stageSessions,
        preparedForecasts.map(row=>({...row,score:row.computedScore})),
        preparedQual.map(row=>({...row,score:row.computedScore})),eligible.map(player=>player.id))
      if (!result.ready || result.minimum == null) throw new Error('Немає повних результатів для обчислення мінімуму ГП.')
      const { error } = await supabase.rpc('apply_stage_newcomer_bonuses',{p_stage_id:stage.id,p_bonuses:result.bonuses,p_source_minimum:result.minimum})
      if (error) throw error
      await log('recalculate_session',{kind:'newcomer_bonus',stage:stage.name,minimum:result.minimum,awards:result.bonuses})
      setMsg(`${stage.name}: бонус ${result.minimum} · ${result.bonuses.length} новачків`)
      loadAll()
    } catch (error) {
      setMsg(`⚠ ${error.message}`)
    }
  }

  async function addPilotSubstitution() {
    const teamRoster = PILOT_TEAM_ROSTER.find(row => row.team === subTeam)
    if (!subStageId || Number(stages.find(stage => stage.id === subStageId)?.sort_order) < 10 || !teamRoster || !teamRoster.drivers.includes(subOutgoing) || !RESERVE_PILOTS_2026.includes(subIncoming) || subOutgoing === subIncoming) {
      setMsg('⚠ Обери етап, команду, пілота, заміну; імена мають відрізнятися.')
      return
    }
    const sameReserve = pilotChanges.find(change => change.stage_id === subStageId && change.incoming_driver === subIncoming && change.is_active && !(change.team_name===subTeam && change.outgoing_driver===subOutgoing))
    if (sameReserve) { setMsg('⚠ Резерв уже використовується на цьому ГП.'); return }
    const previous = pilotChanges.filter(change=>change.stage_id===subStageId && change.team_name===subTeam && change.outgoing_driver===subOutgoing && change.is_active)
    for (const change of previous) {
      const { error:deactivateError } = await supabase.from('stage_pilot_substitutions').update({is_active:false}).eq('id',change.id)
      if (deactivateError) { setMsg(`⚠ ${deactivateError.message}`); return }
    }
    const { data, error } = await supabase.from('stage_pilot_substitutions').insert({
      stage_id:subStageId, team_name:subTeam, outgoing_driver:subOutgoing,
      incoming_driver:subIncoming, is_active:true, created_by:user?.id || null,
    }).select('*,stages(name,key,flag)').single()
    if (error) { setMsg(`⚠ Не вдалося зберегти заміну: ${error.message}. Перевір, чи застосована міграція меню замін.`); return }
    await log('pilot_substitution', { stage_name:stages.find(x=>x.id===subStageId)?.name, team:subTeam, outgoing_driver:subOutgoing, incoming_driver:subIncoming, reason:null })
    setPilotChanges(prev => [data, ...prev.map(row=>previous.some(old=>old.id===row.id)?{...row,is_active:false}:row)])
    setSubOutgoing(''); setSubIncoming('')
    setMsg('✓ Заміна збережена для обраного ГП')
  }

  async function deactivatePilotSubstitution(change) {
    const { error } = await supabase.from('stage_pilot_substitutions').update({ is_active:false }).eq('id',change.id)
    if (error) { setMsg(`⚠ ${error.message}`); return }
    setPilotChanges(prev => prev.map(row => row.id === change.id ? { ...row, is_active:false } : row))
    await log('pilot_substitution', { stage_name:change.stages?.name, team:change.team_name, outgoing_driver:change.outgoing_driver, incoming_driver:null, reason:'Заміна деактивована' })
    setMsg('✓ Заміна вимкнена')
  }

  const allTeamOptions = [...Object.keys(TEAM_META), ...customTeams]

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:20}}>ЗАВАНТАЖЕННЯ...</div></main>

  const tabs = [
    { key:'stages',    label:'ЕТАПИ' },
    { key:'deadlines', label:'ДЕДЛАЙНИ' },
    { key:'users',     label:'ГРАВЦІ' },
    { key:'teams',     label:'КОМАНДИ' },
    { key:'substitutions', label:'ПІЛОТИ' },
    { key:'commit',    label:'БАЛИ' },
    { key:'log',       label:'ЖУРНАЛ' },
  ]

  return (
    <main>
      <div className="section-label">АДМІН ПАНЕЛЬ</div>

      <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
        {tabs.map(t => (
          <button key={t.key} className={`session-btn${tab===t.key?' active':''}`} onClick={()=>setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{background:'rgba(107,255,138,.08)',border:'1px solid var(--green)',borderRadius:4,padding:'10px 14px',marginBottom:16,color:'var(--green)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:1}}>
          {msg}
          <button style={{float:'right',background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={()=>setMsg('')}>✕</button>
        </div>
      )}

      {/* STAGES */}
      {tab === 'stages' && (
        <>
          <div className="section-label">Управління етапами</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {stages.map(s => (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,padding:'10px 14px',opacity:Number(s.sort_order)<10?.42:1,filter:Number(s.sort_order)<10?'grayscale(1)':'none'}}>
                <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,fontWeight:700,flex:1}}>{s.flag} {s.name} {Number(s.sort_order)<10 && <small style={{color:'var(--muted)',fontSize:9}}>· АРХІВ</small>}</span>
                <span style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)'}}>#{s.sort_order}</span>
                <button className={`btn ${s.is_locked ? 'btn-ghost' : 'btn-red'}`} style={{padding:'6px 14px',fontSize:9}} onClick={() => toggleStageLock(s)} disabled={Number(s.sort_order)<10}>
                  {s.is_locked ? '🔒 РОЗБЛОКУВАТИ' : '🔓 ЗАБЛОКУВАТИ'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* COMMIT */}
      {tab === 'commit' && (
        <>
          <div className="section-label">Зарахування балів</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {sessions.filter(s => !s.committed && Number(s.stages?.sort_order)>=10).map(s => (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,padding:'10px 14px',flexWrap:'wrap'}}>
                <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,flex:1}}>{s.stages?.flag} {s.stages?.name} — {s.type.toUpperCase()}</span>
                {s.is_locked && <span className="badge badge-locked">🔒</span>}
                <button className="btn btn-red" style={{fontSize:9,padding:'6px 14px'}} onClick={()=>commitSession(s).catch(e=>setMsg(`⚠ ${e.message}`))}>⚑ ЗАРАХУВАТИ</button>
                {!s.is_locked && (
                  <button className="btn btn-ghost" style={{fontSize:9,padding:'6px 14px'}} onClick={()=>toggleSessionLock(s)}>🔒 ЗАБЛОКУВАТИ</button>
                )}
              </div>
            ))}
            {sessions.filter(s=>s.committed && Number(s.stages?.sort_order)>=10).length > 0 && (
              <>
                <div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:9,letterSpacing:2,marginTop:12,marginBottom:6}}>ЗАРАХОВАНІ</div>
                {sessions.filter(s=>s.committed && Number(s.stages?.sort_order)>=10).map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,padding:'8px 14px'}}>
                    <span style={{fontFamily:'Orbitron,sans-serif',fontSize:11,flex:1}}>{s.stages?.flag} {s.stages?.name} — {s.type.toUpperCase()}</span>
                    <span className="badge badge-committed">✓ ЗАРАХОВАНО</span>
                    <button className="btn btn-ghost" style={{fontSize:9,padding:'6px 12px'}} onClick={()=>commitSession(s, true).catch(e=>setMsg(`⚠ ${e.message}`))}>↻ ПЕРЕРАХУВАТИ</button>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="section-label" style={{marginTop:24}}>Бонус новачка за ГП</div>
          <div style={{overflowX:'auto'}}><table className="standings"><thead><tr><th>ГП</th><th>Мінімум за ГП</th><th>Новачки</th><th></th></tr></thead>
            <tbody>{stages.filter(stage=>newcomerPlayersForStage(players,stage.sort_order).length>0).map(stage=>{
              const roundSessions=sessions.filter(session=>session.stage_id===stage.id)
              const ready=roundSessions.length>0&&roundSessions.every(session=>session.committed)
              return <tr key={stage.id}><td>{stage.flag} {stage.name}</td><td>{newcomerMinima[stage.id] ?? '—'}</td>
                <td>{newcomerPlayersForStage(players,stage.sort_order).map(player=>player.name).join(' · ')}</td>
                <td><button className="btn btn-ghost" disabled={!ready} onClick={()=>applyNewcomerBonus(stage)}>НАРАХУВАТИ</button></td></tr>
            })}</tbody>
          </table></div>
        </>
      )}

      {/* DEADLINES TAB */}
      {tab === 'deadlines' && (
        <DeadlinesTab sessions={sessions} setSessions={setSessions} setMsg={setMsg} />
      )}

      {/* USERS — full edit capability */}
      {tab === 'users' && (
        <>
          <div className="section-label">Додати гравця</div>
          <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
            <input className="field-input" placeholder="Ім'я гравця" value={newPlayerName} onChange={e=>setNewPlayerName(e.target.value)}
              style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px 12px',borderRadius:4,fontSize:13,minWidth:160}} />
            <select value={newPlayerTeam} onChange={e=>setNewPlayerTeam(e.target.value)}
              style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px 12px',borderRadius:4,fontSize:13}}>
              <option value="">— команда —</option>
              {allTeamOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn btn-red" onClick={addPlayer}>+ ДОДАТИ</button>
          </div>

          <div className="section-label">Гравці та доступ · розподіл загальних балів за командами</div>
          <div style={{overflowX:'auto'}}>
          <table className="standings" style={{marginBottom:0,minWidth:1050}}>
            <thead>
              <tr>
                <th>Ім'я</th>
                <th>Команда</th>
                <th>Архівні бали</th>
                <th>Активний сезон</th>
                <th>Бонус новачка</th>
                <th>Ручні коригування*</th>
                <th>Залишок / невідоме</th>
                <th>Разом</th>
                <th>Акаунт</th>
                <th>Адмін</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set(players.map(p => p.team))].sort((a,b)=>a.localeCompare(b,'uk')).flatMap(team => [
                <tr key={`team-${team}`} style={{background:'rgba(255,255,255,.045)'}}>
                  <td colSpan={11} style={{fontWeight:800,color:TEAM_META[team]?.color || 'var(--gold)',fontSize:11,letterSpacing:.6}}>{TEAM_META[team]?.code || '◆'} · {team}</td>
                </tr>,
                ...players.filter(p => p.team === team).map(p => (
                <tr key={p.id}>
                  <td>
                    <input defaultValue={p.name} style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'4px 8px',borderRadius:3,fontSize:12,width:110}}
                      onBlur={e => { if(e.target.value!==p.name) updatePlayerField(p.id,'name',e.target.value) }} />
                  </td>
                  <td>
                    <select defaultValue={p.team} style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'4px 8px',borderRadius:3,fontSize:12}}
                      onChange={e => updatePlayerField(p.id,'team',e.target.value)}>
                      {allTeamOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{fontFamily:'Orbitron,sans-serif',fontSize:11}}>{scoreLedger[p.id]?.archive ?? '—'}</td>
                  <td style={{fontFamily:'Orbitron,sans-serif',fontSize:11}}>{scoreLedger[p.id]?.season ?? '—'}</td>
                  <td style={{fontFamily:'Orbitron,sans-serif',fontSize:11}}>{scoreLedger[p.id]?.newcomer ?? '—'}</td>
                  <td style={{fontFamily:'Orbitron,sans-serif',fontSize:11}}>{scoreLedger[p.id]?.manual ?? '—'}</td>
                  <td style={{fontFamily:'Orbitron,sans-serif',fontSize:11,color:scoreLedger[p.id]?.unallocated===0?'var(--green)':'#ff8585'}}>{scoreLedger[p.id]?.unallocated ?? '—'}</td>
                  <td>
                    <input type="number" className="score-input" defaultValue={p.base_pts} min={0}
                      onBlur={e => updatePlayerField(p.id,'base_pts', parseInt(e.target.value)||0)}
                      onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}} />
                  </td>
                  <td style={{fontSize:11}}>
                    {p.auth_user_id ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{color:'var(--green)'}}>✓ підключено</span>
                        <button className="btn btn-ghost" style={{padding:'3px 8px',fontSize:9}} onClick={()=>unlinkPlayerAccount(p)}>відв'язати</button>
                      </div>
                    ) : (
                      <span style={{color:'var(--muted)'}}>— немає</span>
                    )}
                  </td>
                  <td>
                    <input type="checkbox" checked={!!p.is_admin} onChange={e=>setAdmin(p.id,e.target.checked)}
                      style={{width:16,height:16,cursor:'pointer',accentColor:'var(--red)'}} />
                  </td>
                  <td>
                    <button className="btn btn-ghost" style={{padding:'4px 9px',fontSize:9,color:'#ff6b6b',borderColor:'#552222'}} onClick={()=>deletePlayer(p)}>видалити</button>
                  </td>
                </tr>
                ))
              ])}
            </tbody>
          </table>
          </div>
        </>
      )}

      {/* EVENT-SCOPED DRIVER SUBSTITUTIONS */}
      {tab === 'substitutions' && (
        <>
          <select className="field-input" value={subStageId} onChange={e=>setSubStageId(e.target.value)} style={{maxWidth:320,marginBottom:12}}><option value="">— Гран-прі —</option>{stages.filter(st=>Number(st.sort_order)>=10).map(st=><option key={st.id} value={st.id}>{st.flag} {st.name}</option>)}</select>
          <div style={{display:'grid',gap:6}}>{PILOT_TEAM_ROSTER.map(row => {
            const changes = pilotChanges.filter(item => item.stage_id===subStageId && item.team_name===row.team && item.is_active)
            const replaced = new Set(changes.map(change=>change.outgoing_driver))
            return <div key={row.team} style={{display:'grid',gridTemplateColumns:'110px minmax(180px,1fr) minmax(150px,220px)',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:4}}>
              <strong style={{fontSize:11}}>{row.team}</strong>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{row.drivers.map(driver=><button key={driver} className="btn btn-ghost" style={{padding:'5px 8px',fontSize:9,borderColor:replaced.has(driver)?'var(--border)':'var(--gold)',opacity:replaced.has(driver)?.48:1}} onClick={()=>{setSubTeam(row.team);setSubOutgoing(driver)}}>{driver}{replaced.has(driver)?' · ЗАМІНЕНО':' · АКТИВНИЙ'}</button>)}</div>
              <div style={{display:'grid',gap:5}}>
                {changes.map(change=><div key={change.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:5,fontSize:10,color:'var(--muted)'}}><span>{change.outgoing_driver} → {change.incoming_driver || '—'}</span><button className="btn btn-ghost" aria-label="Скасувати заміну" style={{padding:'2px 6px',fontSize:9}} onClick={()=>deactivatePilotSubstitution(change)}>×</button></div>)}
                <select className="field-input" value={subTeam===row.team?subIncoming:''} onChange={e=>{setSubTeam(row.team);setSubIncoming(e.target.value);setSubOutgoing(current=>row.drivers.includes(current)?current:row.drivers.find(driver=>!replaced.has(driver))||row.drivers[0])}}><option value="">— Додати резерв —</option>{RESERVE_PILOTS_2026.map(p=><option key={p} value={p}>{p}</option>)}</select>
              </div>
            </div>
          })}</div>
          {subTeam && <div style={{display:'flex',gap:8,alignItems:'center',marginTop:12}}><span style={{fontSize:11,color:'var(--muted)'}}>{subTeam} · {subOutgoing || 'оберіть активного пілота'} → {subIncoming || 'оберіть резерв'}</span><button className="btn btn-red" onClick={addPilotSubstitution}>ЗБЕРЕГТИ ЗАМІНУ</button></div>}
        </>
      )}

      {/* TEAMS */}
      {tab === 'teams' && (
        <>
          <div className="section-label">Додати команду</div>
          <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
            <input placeholder="Назва команди" value={newTeamName} onChange={e=>setNewTeamName(e.target.value)}
              style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px 12px',borderRadius:4,fontSize:13,minWidth:160}} />
            <button className="btn btn-red" onClick={addCustomTeam}>+ ДОДАТИ КОМАНДУ</button>
          </div>
          <div className="section-label">Існуючі команди</div>
          <table className="team-table">
            <thead><tr><th>Команда</th><th>Гравці</th><th>Сумарні бали</th></tr></thead>
            <tbody>
              {[...new Set(players.map(p=>p.team))].map(team => {
                const teamPlayers = players.filter(p=>p.team===team)
                const total = teamPlayers.reduce((s,p)=>s+p.base_pts,0)
                const color = TEAM_META[team]?.color || '#888'
                return (
                  <tr key={team} style={{borderLeft:`3px solid ${color}`}}>
                    <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color}}>{team}</td>
                    <td style={{fontSize:11,color:'var(--muted)'}}>{teamPlayers.map(p=>p.name).join(' · ')}</td>
                    <td className="team-score">{total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {/* LOG */}
      {tab === 'log' && (
        <>
          <div className="section-label">Журнал змін · останні 80 подій</div>
          <div style={{display:'grid',gap:8}}>
            {logs.map(l => (
              <article key={l.id} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:5,padding:'11px 13px'}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
                  <strong style={{fontSize:12,color:'var(--text)'}}>{auditActionLabel(l.action)}</strong>
                  <time style={{fontSize:10,color:'var(--muted)'}}>{l.created_at ? new Date(l.created_at).toLocaleString('uk-UA',{timeZone:'Europe/Warsaw',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Час невідомий'}</time>
                </div>
                <div style={{display:'flex',gap:8,marginTop:7,flexWrap:'wrap',fontSize:11}}>
                  <span style={{color:'var(--gold)',fontWeight:700}}>Адмін: {auditActorLabel(l)}</span>
                  <span style={{color:'var(--muted)'}}>{auditSummary(l, Object.fromEntries(players.map(p=>[p.id,p.name])))}</span>
                </div>
                <details style={{marginTop:7,color:'var(--muted)',fontSize:10}}>
                  <summary style={{cursor:'pointer'}}>Технічні подробиці</summary>
                  <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',margin:'7px 0 0',fontSize:10}}>{JSON.stringify({action:l.action, details:l.details}, null, 2)}</pre>
                </details>
              </article>
            ))}
            {logs.length === 0 && <div style={{color:'var(--muted)',fontSize:12}}>Журнал поки порожній.</div>}
          </div>
        </>
      )}
    </main>
  )
}

async function buildPlayerScoreLedger(players, sessions) {
  const activeSessions = sessions.filter(session => session.committed && Number(session.stages?.sort_order) >= 10)
  const sessionIds = activeSessions.map(session => session.id)
  let forecasts = [], qualifying = [], bonuses = [], adjustments = []
  const adjustmentResult = await supabase.from('score_manual_adjustments').select('player_id,delta').in('player_id', players.map(p=>p.id))
  adjustments = adjustmentResult.data || []
  if (sessionIds.length) {
    const [f, q, b] = await Promise.all([
      supabase.from('forecasts').select('player_id,session_id,score,score_breakdown,scored_input,predictions,fl_pick,ov_pick').in('session_id', sessionIds),
      supabase.from('qual_assignments').select('player_id,session_id,score,scored_input,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id', sessionIds),
      supabase.from('stage_newcomer_bonuses').select('player_id,points').in('stage_id', [...new Set(activeSessions.map(s => s.stage_id))]),
    ])
    forecasts = f.data || []
    qualifying = q.data || []
    bonuses = b.data || []
  }
  const sessionsById = new Map(activeSessions.map(session => [session.id, session]))
  const season = new Map(players.map(player => [player.id, 0]))
  for (const row of forecasts) {
    const session = sessionsById.get(row.session_id)
    const score = canonicalStoredScore(row)
    season.set(row.player_id, (season.get(row.player_id) || 0) + score)
  }
  for (const row of qualifying) {
    const session = sessionsById.get(row.session_id)
    const score = canonicalStoredScore(row)
    season.set(row.player_id, (season.get(row.player_id) || 0) + score)
  }
  const newcomer = new Map(players.map(player => [player.id, 0]))
  for (const row of bonuses) newcomer.set(row.player_id, (newcomer.get(row.player_id) || 0) + (Number(row.points) || 0))
  const manual = new Map(players.map(player=>[player.id,0]))
  for (const row of adjustments) manual.set(row.player_id,(manual.get(row.player_id)||0)+(Number(row.delta)||0))
  return Object.fromEntries(players.map(player => {
    const total = Number(player.base_pts) || 0
    const archive = archiveBaselineForPlayer(player.name)
    const seasonPoints = season.get(player.id) || 0
    const newcomerPoints = newcomer.get(player.id) || 0
    const manualPoints = manual.get(player.id) || 0
    return [player.id, { archive, season:seasonPoints, newcomer:newcomerPoints, manual:manualPoints,
      unallocated:archive == null ? null : total - archive - seasonPoints - newcomerPoints - manualPoints }]
  }))
}

// ════════════════════════════════════════
//  DEADLINES TAB — окремий компонент
// ════════════════════════════════════════
import { useState as useStateD, useEffect as useEffectD } from 'react'

// Визначає чи дата підпадає під літній час в Польщі (CEST, UTC+2)
// Правило ЄС: останню неділю березня по останню неділю жовтня
function isPolandDST(year, month, day) {
  function lastSundayOfMonth(y, m) {
    const d = new Date(Date.UTC(y, m, 0)) // last day of month m (1-indexed)
    const dow = d.getUTCDay()
    return d.getUTCDate() - dow
  }
  const marchLastSunday   = lastSundayOfMonth(year, 3)
  const octoberLastSunday = lastSundayOfMonth(year, 10)
  const current = new Date(Date.UTC(year, month - 1, day))
  const dstStart = new Date(Date.UTC(year, 2, marchLastSunday))   // March, 1 AM UTC transition
  const dstEnd   = new Date(Date.UTC(year, 9, octoberLastSunday)) // October
  return current >= dstStart && current < dstEnd
}

function DeadlinesTab({ sessions, setSessions, setMsg }) {
  const [allSessions, setAllSessions] = useStateD([])
  const [saving, setSaving] = useStateD(null)

  useEffectD(() => {
    supabase.from('sessions')
      .select('id, type, is_locked, committed, deadline_utc, stages(name, flag, sort_order, key)')
      .order('sort_order', { referencedTable: 'stages' })
      .then(({ data }) => setAllSessions(data || []))
  }, [])

  async function updateDeadline(sessionId, newDeadlineLocal) {
    setSaving(sessionId)
    // newDeadlineLocal = "2026-07-04T15:00" — це час у Польщі (CEST/CET), НЕ час браузера.
    // Будуємо UTC мітку вручну з компонентів дати, щоб уникнути подвійної конвертації
    // через локальний часовий пояс браузера (звідки й був баг 15:00 → 17:00).
    const [datePart, timePart] = newDeadlineLocal.split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour, minute] = timePart.split(':').map(Number)

    // Визначаємо чи ця дата підпадає під літній час (CEST, UTC+2) чи зимовий (CET, UTC+1)
    // Європа: літній час з останньої неділі березня по останню неділю жовтня
    const isDST = isPolandDST(year, month, day)
    const polandUtcOffsetHours = isDST ? 2 : 1

    // Будуємо UTC час напряму: віднімаємо офсет Польщі від введеного польського часу
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour - polandUtcOffsetHours, minute))
    const utcStr = utcDate.toISOString()

    const { error } = await supabase.from('sessions')
      .update({ deadline_utc: utcStr })
      .eq('id', sessionId)

    if (error) {
      setMsg(`⚠ ${error.message}`)
    } else {
      setAllSessions(prev => prev.map(s => s.id === sessionId ? { ...s, deadline_utc: utcStr } : s))
      setMsg('✓ Дедлайн оновлено')
    }
    setSaving(null)
  }

  async function clearDeadline(sessionId) {
    setSaving(sessionId)
    const { error } = await supabase.from('sessions').update({ deadline_utc: null }).eq('id', sessionId)
    if (error) { setMsg(`⚠ ${error.message}`); setSaving(null); return }
    setAllSessions(prev => prev.map(s => s.id === sessionId ? { ...s, deadline_utc: null } : s))
    setMsg('✓ Дедлайн знятий')
    setSaving(null)
  }

  async function forceUnlock(sessionId) {
    setSaving(sessionId)
    const { error } = await supabase.from('sessions').update({ is_locked: false }).eq('id', sessionId)
    if (error) { setMsg(`⚠ ${error.message}`); setSaving(null); return }
    setAllSessions(prev => prev.map(s => s.id === sessionId ? { ...s, is_locked: false } : s))
    setMsg('✓ Сесію розблоковано')
    setSaving(null)
  }

  async function forceLock(sessionId) {
    setSaving(sessionId)
    const { error } = await supabase.from('sessions').update({ is_locked: true }).eq('id', sessionId)
    if (error) { setMsg(`⚠ ${error.message}`); setSaving(null); return }
    setAllSessions(prev => prev.map(s => s.id === sessionId ? { ...s, is_locked: true } : s))
    setMsg('✓ Сесію заблоковано')
    setSaving(null)
  }

  // Group by stage
  const grouped = {}
  allSessions.filter(s => Number(s.stages?.sort_order) >= 10).forEach(s => {
    const key = s.stages?.key || 'unknown'
    if (!grouped[key]) grouped[key] = { stage: s.stages, sessions: [] }
    grouped[key].sessions.push(s)
  })

  const now = new Date()

  function toLocalInput(utcStr) {
    if (!utcStr) return ''
    const d = new Date(utcStr)
    const isDST = isPolandDST(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate())
    const offsetHours = isDST ? 2 : 1
    const polandMs = d.getTime() + (offsetHours * 60 * 60000)
    const pd = new Date(polandMs)
    return pd.toISOString().slice(0, 16)
  }

  const typeLabel = { qual: 'КВА', sprint: 'СПР', race: 'ГОН' }
  const typeColor = { qual: 'var(--silver)', sprint: '#a78bfa', race: 'var(--red)' }

  return (
    <>
      <div className="section-label">Дедлайни та блокування сесій</div>

      {Object.entries(grouped).sort(([,a],[,b])=>Number(a.stage?.sort_order)-Number(b.stage?.sort_order)).map(([stageKey, { stage, sessions: stageSessions }]) => (
        <div key={stageKey} style={{marginBottom:16,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,overflow:'hidden'}}>
          <div style={{padding:'8px 14px',background:'#111',borderBottom:'1px solid var(--border)',fontFamily:'Orbitron,sans-serif',fontSize:11,fontWeight:700}}>
            {stage?.flag} {stage?.name}
          </div>
          {stageSessions.sort((a,b)=>({qual:0,sprint:1,race:2}[a.type]??9)-({qual:0,sprint:1,race:2}[b.type]??9)).map(s => {
            const dl = s.deadline_utc ? new Date(s.deadline_utc) : null
            const passed = dl ? now > dl : false
            return (
              <div key={s.id} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'8px 14px', borderBottom:'1px solid rgba(255,255,255,.04)',
                flexWrap:'wrap', opacity: s.committed ? .5 : 1
              }}>
                <span style={{
                  fontFamily:'Orbitron,sans-serif', fontSize:9, fontWeight:700,
                  color: typeColor[s.type], border:`1px solid ${typeColor[s.type]}`,
                  borderRadius:2, padding:'2px 6px', minWidth:32, textAlign:'center'
                }}>{typeLabel[s.type]}</span>

                {/* Deadline input (Polish time) */}
                <input
                  type="datetime-local"
                  defaultValue={toLocalInput(s.deadline_utc)}
                  disabled={saving === s.id || s.committed}
                  onChange={e => updateDeadline(s.id, e.target.value)}
                  style={{
                    background:'#0d0d0d', border:`1px solid ${passed?'#f87171':'var(--border)'}`,
                    color: passed ? '#f87171' : 'var(--text)',
                    fontFamily:'Orbitron,sans-serif', fontSize:10,
                    padding:'5px 8px', borderRadius:2, outline:'none'
                  }}
                />

                <button className="btn btn-ghost" style={{padding:'4px 10px',fontSize:9}}
                  onClick={() => clearDeadline(s.id)}
                  disabled={saving === s.id || s.committed}>
                  ЗНЯТИ ДЕДЛАЙН
                </button>

                {s.is_locked && !s.committed ? (
                  <button className="btn btn-red" style={{padding:'4px 10px',fontSize:9}}
                    onClick={() => forceUnlock(s.id)}
                    disabled={saving === s.id}>
                    🔓 РОЗБЛОКУВАТИ
                  </button>
                ) : !s.committed ? (
                  <button className="btn btn-ghost" style={{padding:'4px 10px',fontSize:9,borderColor:'#555'}}
                    onClick={() => forceLock(s.id)}
                    disabled={saving === s.id}>
                    🔒 ЗАБЛОКУВАТИ
                  </button>
                ) : null}

                <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
                  {s.committed && <span className="badge badge-committed">✓ ЗАРАХОВАНО</span>}
                  {s.is_locked && !s.committed && <span className="badge badge-locked">🔒</span>}
                  {passed && !s.is_locked && !s.committed && (
                    <span style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'#f87171'}}>ДЕДЛАЙН МИНУВ</span>
                  )}
                  {saving === s.id && <span style={{color:'var(--muted)',fontSize:10}}>...</span>}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
