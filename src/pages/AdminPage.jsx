import { useState, useEffect } from 'react'
import { supabase, IS_PREVIEW_DEPLOYMENT, TEAM_META, TEAM_RESERVE_PILOTS_2026, PILOT_TEAM_ROSTER, ACTIVE_PILOTS_2026, USED_PILOTS, qualifyingPlanForAvailable, calcRaceScore, calcQualAssignmentScore, calcSprintScore } from '../lib/supabase'
import { normalizeStageDriver, normalizeStageResults, newcomerPlayersForStage } from '../lib/roster'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { auditActionLabel, auditActorLabel, auditSummary } from '../lib/audit'
import { resultsList } from '../lib/scoring'
import { calculateNewcomerBonuses } from '../lib/standings'

export default function AdminPage() {
  const { isAdmin, user, player: adminPlayer } = useAuth()
  const nav = useNavigate()
  const [tab,       setTab]       = useState('stages')
  const [stages,    setStages]    = useState([])
  const [players,   setPlayers]   = useState([])
  const [sessions,  setSessions]  = useState([])
  const [logs,      setLogs]      = useState([])
  const [pilotChanges, setPilotChanges] = useState([])
  const [qualAssignments, setQualAssignments] = useState([])
  const [subStageId, setSubStageId] = useState('')
  const [subTeam, setSubTeam] = useState('')
  const [subOutgoing, setSubOutgoing] = useState('')
  const [subIncoming, setSubIncoming] = useState('')
  const [loading,   setLoading]   = useState(true)
  const [msg,       setMsg]       = useState('')
  const [recalculatingAll, setRecalculatingAll] = useState(false)

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
      supabase.from('qual_assignments').select('player_id,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3,sessions(stages(sort_order))'),
    ]).then(([s,p,se,l,sub,qa]) => {
      setStages((s.data||[]))
      setPlayers(p.data||[])
      setSessions(se.data||[])
      setLogs(l.data||[])
      setPilotChanges(sub.data || [])
      setQualAssignments(qa.data || [])
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
    await supabase.from('stages').update({ is_locked: !stage.is_locked }).eq('id', stage.id)
    await supabase.from('sessions').update({ is_locked: !stage.is_locked }).eq('stage_id', stage.id)
    setStages(prev => prev.map(s => s.id===stage.id ? {...s, is_locked:!s.is_locked} : s))
    setMsg(`${stage.name} — ${stage.is_locked ? 'розблоковано' : 'заблоковано'}`)
    await log(stage.is_locked ? 'unlock_stage' : 'lock_stage', { stage: stage.key })
  }
  // ── PLAYER EDIT ──
  async function updatePlayerField(playerId, field, value) {
    const target = players.find(p => p.id === playerId)
    const { error } = await supabase.from('players').update({ [field]: value }).eq('id', playerId)
    if (error) { setMsg(`⚠ ${error.message}`); return }
    setPlayers(prev => prev.map(p => p.id===playerId ? {...p, [field]:value} : p))
    await log('edit_player', { player_id:playerId, player_name:target?.name, field, old_value:target?.[field], value })
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
      name: newPlayerName.trim(), team: newPlayerTeam
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

  async function recalculateStage(stage) {
    const stageSessions = sessions.filter(session => session.stage_id === stage.id)
    if (!stageSessions.length) { setMsg(`${stage.name}: у базі ще немає сесій цього етапу.`); return }
    if (stageSessions.some(session => !session.committed)) { setMsg(`${stage.name}: спершу зарахуй усі сесії ГП.`); return }
    if (!stageSessions.some(session => session.type === 'race')) { setMsg(`${stage.name}: немає сесії гонки для перерахунку.`); return }
    if (!window.confirm(`Перерахувати весь ГП ${stage.name}? Збережені бали буде замінено новим підрахунком, не додано повторно. Бонус новачка буде перерахований лише за гонку.`)) return
    setMsg(`⟳ Перераховую ${stage.name}…`)
    try {
      const ids = stageSessions.map(session => session.id)
      const [forecastResult, qualResult, changesResult] = await Promise.all([
        supabase.from('forecasts').select('id,player_id,session_id,score,predictions,fl_pick,ov_pick').in('session_id', ids),
        supabase.from('qual_assignments').select('id,player_id,session_id,score,pole_pick,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id', ids),
        supabase.from('stage_pilot_substitutions').select('*').eq('stage_id', stage.id).eq('is_active', true),
      ])
      if (forecastResult.error) throw forecastResult.error
      if (qualResult.error) throw qualResult.error
      if (changesResult.error) throw changesResult.error
      const changes = changesResult.data || []
      const scoreRows = []
      const rescoredForecasts = []
      const order = Number(stage.sort_order)
      for (const session of stageSessions) {
        if (!['qual','race','sprint'].includes(session.type)) throw new Error(`Непідтримуваний тип сесії: ${session.type}`)
        const resultsObject = normalizeStageResults(session.results || {}, changes)
        const results = resultsList(resultsObject)
        const requiredResults = session.type==='qual' ? (order<7 ? 1 : 3) : session.type==='sprint' ? 5 : 10
        const positions = Object.keys(resultsObject).map(Number).sort((a,b)=>a-b)
        const contiguous = positions.length >= requiredResults && positions.slice(0,requiredResults).every((position,index)=>position===index+1)
        if (results.length < requiredResults || !contiguous) throw new Error(`${session.type.toUpperCase()}: є ${results.length} з ${requiredResults} потрібних реальних позицій; бали не змінено.`)
        const fastLap = normalizeStageDriver(session.fl_pilot || '', changes)
        const overtake = String(session.ov_pilot || '').split(/[,;|]/).map(pilot=>normalizeStageDriver(pilot.trim(),changes)).filter(Boolean).join(', ')
        if (session.type === 'qual') {
          const qualifyingScores = (qualResult.data || []).filter(row=>row.session_id===session.id).map(row=>{
            const normalized = {...row,
              pole_pick:normalizeStageDriver(row.pole_pick,changes),
              pilot_1:normalizeStageDriver(row.pilot_1,changes),
              pilot_2:normalizeStageDriver(row.pilot_2,changes),
              pilot_3:normalizeStageDriver(row.pilot_3,changes),
            }
            const {total} = calcQualAssignmentScore(normalized,results,order)
            return {id:row.id,score:total,scored_input:{pole_pick:normalized.pole_pick || '',pilot_1:normalized.pilot_1,pred_pos_1:row.pred_pos_1,pilot_2:normalized.pilot_2,pred_pos_2:row.pred_pos_2,pilot_3:normalized.pilot_3,pred_pos_3:row.pred_pos_3}}
          })
          scoreRows.push({session_id:session.id,forecast_scores:[],qual_scores:qualifyingScores})
        } else {
          const rows = (forecastResult.data || []).filter(row=>row.session_id===session.id).map(row=>{
            const slotCount = session.type==='sprint' ? 5 : 10
            const predictions = Array.from({length:slotCount},(_,index)=>normalizeStageDriver(row.predictions?.[index+1] || '',changes))
            const result = session.type==='sprint'
              ? calcSprintScore(predictions,results,order,normalizeStageDriver(row.fl_pick,changes),fastLap)
              : calcRaceScore(predictions,normalizeStageDriver(row.fl_pick,changes),normalizeStageDriver(row.ov_pick,changes),results,fastLap,overtake,order)
            const scoredInput = {predictions:Object.fromEntries(predictions.map((pilot,index)=>[index+1,pilot]).filter(([,pilot])=>pilot)),fl_pick:normalizeStageDriver(row.fl_pick,changes)}
            if (session.type==='race') scoredInput.ov_pick=normalizeStageDriver(row.ov_pick,changes)
            const forecastScore = {id:row.id,score:result.total,score_breakdown:result.breakdown,scored_input:scoredInput}
            if (session.type==='race') rescoredForecasts.push({...row,...forecastScore})
            return forecastScore
          })
          scoreRows.push({session_id:session.id,forecast_scores:rows,qual_scores:[]})
        }
      }
      const eligible = newcomerPlayersForStage(players,order).map(player=>player.id)
      const raceResult = calculateNewcomerBonuses(players,stageSessions,rescoredForecasts,[],eligible)
      if (!raceResult.ready) throw new Error('Не вдалося безпечно визначити рахунок гонки для бонусу новачка.')
      const {error} = await supabase.rpc('apply_stage_scores',{
        p_stage_id:stage.id,
        p_session_scores:scoreRows,
        p_newcomer_bonuses:raceResult.bonuses,
        p_newcomer_minimum:raceResult.minimum,
      })
      if (error) throw error
      const playerNames = Object.fromEntries(players.map(player => [player.id, player.name]))
      const sessionReport = stageSessions.map(session => ({
        type:session.type,
        scores:[...(scoreRows.find(row => row.session_id === session.id)?.forecast_scores || []).map(row => ({player:playerNames[forecastResult.data.find(f => f.id === row.id)?.player_id] || '—',points:row.score})), ...(scoreRows.find(row => row.session_id === session.id)?.qual_scores || []).map(row => ({player:playerNames[qualResult.data.find(q => q.id === row.id)?.player_id] || '—',points:row.score}))],
      }))
      await log('recalculate_stage', {stage:stage.key,stage_name:stage.name,report:sessionReport,newcomer_bonus_minimum:raceResult.minimum})
      setMsg(`✓ ${stage.name}: бали перезаписано; звіт по гравцях збережено в журналі.`)
      loadAll()
    } catch (error) {
      const message = String(error.message || error)
      const migrationHint = /apply_stage_scores|schema cache|function.*exist/i.test(message)
        ? ' Потрібні SQL-міграції після повного backup і перевіреного відновлення.'
        : ''
      setMsg(`⚠ Не вдалося перерахувати ${stage.name}: ${message}.${migrationHint}`)
    }
  }


  async function recalculateAllScores() {
    const completedStages = stages.filter(stage => {
      const rows = sessions.filter(session => session.stage_id === stage.id)
      return rows.length && rows.some(session => session.committed)
    })
    if (!canRecalculateAll(stages,sessions)) {
      setMsg('⚠ Є ГП із частково зарахованими сесіями. Спершу зарахуй усі сесії кожного розпочатого ГП.')
      return
    }
    const notCommitted = stages.filter(stage => {
      const rows = sessions.filter(session => session.stage_id === stage.id)
      return rows.length && !rows.some(session => session.committed)
    }).length
    const confirmed = window.confirm(
      `Повністю перерахувати ${completedStages.length} ГП? Усі підсумки буде замінено сумою заново розрахованих прогнозів, кваліфікацій і перевірених бонусів. ${notCommitted} ГП без зарахованих сесій буде пропущено.`
    )
    if (!confirmed) return
    setRecalculatingAll(true)
    setMsg('⟳ Перераховую всі завершені ГП атомарно…')
    try {
      const stageIds = completedStages.map(stage => stage.id)
      const eventSessions = sessions.filter(session => stageIds.includes(session.stage_id))
      const sessionIds = eventSessions.map(session => session.id)
      const [forecastResult, qualResult, changesResult] = await Promise.all([
        supabase.from('forecasts').select('id,player_id,session_id,score,predictions,fl_pick,ov_pick').in('session_id',sessionIds),
        supabase.from('qual_assignments').select('id,player_id,session_id,score,pole_pick,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id',sessionIds),
        supabase.from('stage_pilot_substitutions').select('*').in('stage_id',stageIds).eq('is_active',true),
      ])
      if (forecastResult.error) throw forecastResult.error
      if (qualResult.error) throw qualResult.error
      if (changesResult.error) throw changesResult.error
      const allForecasts = forecastResult.data || []
      const allQualifying = qualResult.data || []
      const changes = changesResult.data || []
      const payload = []
      const recalculationReports = []

      for (const stage of completedStages) {
        const stageSessions = eventSessions.filter(session => session.stage_id === stage.id)
        const stageChanges = changes.filter(change => change.stage_id === stage.id)
        const scoreRows = []
        const rescoredRaceForecasts = []
        const order = Number(stage.sort_order)
        for (const session of stageSessions) {
          if (!['qual','race','sprint'].includes(session.type)) throw new Error(`${stage.name}: непідтримуваний тип сесії ${session.type}`)
          const resultObject = normalizeStageResults(session.results || {}, stageChanges)
          const results = resultsList(resultObject)
          const requiredResults = session.type === 'qual' ? (order < 7 ? 1 : 3) : session.type === 'sprint' ? 5 : 10
          const positions = Object.keys(resultObject).map(Number).sort((a,b)=>a-b)
          if (results.length < requiredResults || !positions.slice(0,requiredResults).every((position,index)=>position === index+1)) {
            throw new Error(`${stage.name} ${session.type.toUpperCase()}: немає ${requiredResults} послідовних реальних результатів; база не змінена.`)
          }
          const fastLap = normalizeStageDriver(session.fl_pilot || '',stageChanges)
          const overtake = String(session.ov_pilot || '').split(/[,;|]/).map(pilot=>normalizeStageDriver(pilot.trim(),stageChanges)).filter(Boolean).join(', ')
          if (session.type === 'qual') {
            const rows = allQualifying.filter(row => row.session_id === session.id).map(row => {
              const normalized = {...row,
                pole_pick:normalizeStageDriver(row.pole_pick,stageChanges),
                pilot_1:normalizeStageDriver(row.pilot_1,stageChanges),
                pilot_2:normalizeStageDriver(row.pilot_2,stageChanges),
                pilot_3:normalizeStageDriver(row.pilot_3,stageChanges),
              }
              const {total} = calcQualAssignmentScore(normalized,results,order)
              return {id:row.id,score:total,scored_input:{pole_pick:normalized.pole_pick || '',pilot_1:normalized.pilot_1,pred_pos_1:row.pred_pos_1,pilot_2:normalized.pilot_2,pred_pos_2:row.pred_pos_2,pilot_3:normalized.pilot_3,pred_pos_3:row.pred_pos_3}}
            })
            scoreRows.push({session_id:session.id,forecast_scores:[],qual_scores:rows})
            continue
          }
          const rows = allForecasts.filter(row => row.session_id === session.id).map(row => {
            const slots = session.type === 'sprint' ? 5 : 10
            const predictions = Array.from({length:slots},(_,index)=>normalizeStageDriver(row.predictions?.[index+1] || '',stageChanges))
            const result = session.type === 'sprint'
              ? calcSprintScore(predictions,results,order,normalizeStageDriver(row.fl_pick,stageChanges),fastLap)
              : calcRaceScore(predictions,normalizeStageDriver(row.fl_pick,stageChanges),normalizeStageDriver(row.ov_pick,stageChanges),results,fastLap,overtake,order)
            const scored = {id:row.id,score:result.total,score_breakdown:result.breakdown}
            if (session.type === 'race') rescoredRaceForecasts.push({...row,...scored})
            return scored
          })
          scoreRows.push({session_id:session.id,forecast_scores:rows,qual_scores:[]})
        }
        const eligible = newcomerPlayersForStage(players,order).map(player=>player.id)
        const raceBonus = calculateNewcomerBonuses(players,stageSessions,rescoredRaceForecasts,[],eligible)
        if (!raceBonus.ready) throw new Error(`${stage.name}: не вдалося безпечно перерахувати бонус новачка за гонку.`)
        const playerNameById = Object.fromEntries(players.map(player => [player.id, player.name]))
        const report = stageSessions.map(session => {
          const rows = scoreRows.find(row => row.session_id === session.id)
          return {
            type:session.type,
            scores:[...(rows?.forecast_scores || []).map(row => ({player:playerNameById[allForecasts.find(forecast => forecast.id === row.id)?.player_id] || '—',points:row.score})), ...(rows?.qual_scores || []).map(row => ({player:playerNameById[allQualifying.find(assignment => assignment.id === row.id)?.player_id] || '—',points:row.score}))],
          }
        })
        recalculationReports.push({stage:stage.key,stage_name:stage.name,report,newcomer_bonus_minimum:raceBonus.minimum})
        payload.push({stage_id:stage.id,session_scores:scoreRows,newcomer_bonuses:raceBonus.bonuses,newcomer_minimum:raceBonus.minimum})
      }

      const projectedTotals = Object.fromEntries(players.map(player => [player.id,0]))
      const forecastPlayerById = Object.fromEntries(allForecasts.map(row => [row.id,row.player_id]))
      const qualPlayerById = Object.fromEntries(allQualifying.map(row => [row.id,row.player_id]))
      payload.forEach(stagePayload => {
        stagePayload.session_scores.forEach(sessionPayload => {
          sessionPayload.forecast_scores.forEach(row => {
            const playerId = forecastPlayerById[row.id]
            if (playerId) projectedTotals[playerId] = (projectedTotals[playerId]||0) + (Number(row.score)||0)
          })
          sessionPayload.qual_scores.forEach(row => {
            const playerId = qualPlayerById[row.id]
            if (playerId) projectedTotals[playerId] = (projectedTotals[playerId]||0) + (Number(row.score)||0)
          })
        })
        stagePayload.newcomer_bonuses.forEach(row => {
          projectedTotals[row.player_id] = (projectedTotals[row.player_id]||0) + (Number(row.points)||0)
        })
      })
      const previewText = players.map(player => `${player.name}: ${Number(player.base_pts)||0} → ${projectedTotals[player.id]||0} (${(projectedTotals[player.id]||0)-(Number(player.base_pts)||0)>=0?'+':''}${(projectedTotals[player.id]||0)-(Number(player.base_pts)||0)})`).join('\n')
      if (!window.confirm(`СУХИЙ ПРОГІН · ${payload.length} ГП\n\n${previewText}\n\nЦе нові підсумки, перераховані за результатами сесій. Підтвердити атомарний перезапис?`)) {
        setMsg('Сухий прогін завершено; базу не змінено.')
        return
      }

      const {data,error} = await supabase.rpc('recalculate_all_stage_scores',{p_stages:payload})
      if (error) throw error
      for (const report of recalculationReports) await log('recalculate_stage', report)
      setMsg(`✓ Перераховано ${payload.length} ГП; підсумки оновлено, звіти по гравцях збережено в журналі.`)
      loadAll()
    } catch (error) {
      setMsg(`⚠ Повний перерахунок скасовано — жодні бали не змінено: ${error.message || error}`)
    } finally {
      setRecalculatingAll(false)
    }
  }


  async function addPilotSubstitution(teamName = subTeam, outgoingDriver = subOutgoing, incomingDriver = subIncoming) {
    const teamRoster = PILOT_TEAM_ROSTER.find(row => row.team === teamName)
    const teamReserves = TEAM_RESERVE_PILOTS_2026[teamName] || []
    if (!subStageId || !teamRoster || !teamRoster.drivers.includes(outgoingDriver) || !teamReserves.includes(incomingDriver) || outgoingDriver === incomingDriver) {
      setMsg('⚠ Обери етап, команду, пілота, заміну; імена мають відрізнятися.')
      return
    }
    const sameReserve = pilotChanges.find(change => change.stage_id === subStageId && change.incoming_driver === incomingDriver && change.is_active && !(change.team_name===teamName && change.outgoing_driver===outgoingDriver))
    if (sameReserve) { setMsg('⚠ Резерв уже використовується на цьому ГП.'); return }
    const previous = pilotChanges.filter(change=>change.stage_id===subStageId && change.team_name===teamName && change.outgoing_driver===outgoingDriver && change.is_active)
    for (const change of previous) {
      const { error:deactivateError } = await supabase.from('stage_pilot_substitutions').update({is_active:false}).eq('id',change.id)
      if (deactivateError) { setMsg(`⚠ ${deactivateError.message}`); return }
    }
    const { data, error } = await supabase.from('stage_pilot_substitutions').insert({
      stage_id:subStageId, team_name:teamName, outgoing_driver:outgoingDriver,
      incoming_driver:incomingDriver, is_active:true, created_by:user?.id || null,
    }).select('*,stages(name,key,flag)').single()
    if (error) { setMsg(`⚠ Не вдалося зберегти заміну: ${error.message}. Перевір, чи застосована міграція меню замін.`); return }
    await log('pilot_substitution', { stage_name:stages.find(x=>x.id===subStageId)?.name, team:teamName, outgoing_driver:outgoingDriver, incoming_driver:incomingDriver, reason:null })
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
  const nextQualOrders = [23,24,25]
  const qualifyingPlanRows = players.map(player => {
    const used = new Set([...(USED_PILOTS[player.name] || [])].map(name => normalizeStageDriver(name)))
    qualAssignments.forEach(row => {
      if (row.player_id !== player.id || !Number.isFinite(Number(row.sessions?.stages?.sort_order)) || Number(row.sessions.stages.sort_order) >= 23) return
      for (const [pilotKey,posKey] of [['pilot_1','pred_pos_1'],['pilot_2','pred_pos_2'],['pilot_3','pred_pos_3']]) {
        if (row[pilotKey] && Number(row[posKey]) > 0) used.add(normalizeStageDriver(row[pilotKey]))
      }
    })
    const available = Math.max(0, ACTIVE_PILOTS_2026.length - used.size)
    const plan = qualifyingPlanForAvailable(available, 23)
    const planned = nextQualOrders.reduce((sum,order)=>sum+(plan[order]||0),0)
    return { player, available, plan, remaining:Math.max(0,available-planned) }
  })
  const qualifyingPlanStages = nextQualOrders.map((order,index) => ({
    order,
    label:stages.find(stage=>Number(stage.sort_order)===order)?.name || ['Лас-Вегас','Катар','ОАЕ'][index],
  }))

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:20}}>ЗАВАНТАЖЕННЯ...</div></main>

  const tabs = [
    { key:'stages',    label:'ЕТАПИ' },
    { key:'deadlines', label:'ДЕДЛАЙНИ' },
    { key:'users',     label:'ГРАВЦІ' },
    { key:'teams',     label:'КОМАНДИ' },
    { key:'substitutions', label:'ПІЛОТИ' },
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
          <div className="section-label">Етапи · повний перерахунок</div>
          <p className="team-created-note">Одна дія перераховує всі ГП із повністю зарахованими сесіями та замінює підсумки гравців сумою нарахувань із прогнозів, кваліфікацій і бонусу новачка. Архівний базовий залишок не переноситься.</p>
          <button className="btn btn-red" style={{marginBottom:14}} disabled={IS_PREVIEW_DEPLOYMENT || !canRecalculateAll(stages,sessions) || recalculatingAll} title={IS_PREVIEW_DEPLOYMENT ? 'Зміни бази заблоковано в прев’ю. Для сухої перевірки обери ГП на сторінці прогнозів.' : undefined} onClick={recalculateAllScores}>↻ ПЕРЕРАХУВАТИ ВСІ ГП ТА ЗАМІНИТИ ПІДСУМКИ</button>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {stages.map(stage => {
              const stageSessions = sessions.filter(session => session.stage_id===stage.id)
              const ready = stageSessions.length > 0 && stageSessions.some(session=>session.type==='race') && stageSessions.every(session=>session.committed)
              return <div key={stage.id} className="admin-stage-row">
                <span className="admin-stage-name">{stage.flag} {stage.name}</span>
                <span className="admin-stage-order">#{stage.sort_order}</span>
                <button className="btn btn-ghost admin-recalc-btn" disabled={IS_PREVIEW_DEPLOYMENT || !ready} title={IS_PREVIEW_DEPLOYMENT ? 'Зміни бази заблоковано в прев’ю; скористайся сухим прогоном на сторінці прогнозів' : ready ? 'Перерахувати всі сесії ГП і замінити старі бали' : 'Потрібні сесії гонки та зараховані всі сесії ГП'} onClick={()=>recalculateStage(stage)}>
                  ↻ ПЕРЕРАХУВАТИ ГП
                </button>
                <button className={`btn ${stage.is_locked ? 'btn-ghost' : 'btn-red'}`} style={{padding:'6px 12px',fontSize:9}} onClick={() => toggleStageLock(stage)}>
                  {stage.is_locked ? '🔒 РОЗБЛОКУВАТИ' : '🔓 ЗАБЛОКУВАТИ'}
                </button>
              </div>
            })}
          </div>
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

          <div className="section-label">Гравці та доступ · підсумкові бали формуються перерахунком результатів</div>
          <div style={{overflowX:'auto'}}>
          <table className="standings" style={{marginBottom:0,minWidth:750}}>
            <thead>
              <tr>
                <th>Ім'я</th>
                <th>Команда</th>
                <th>Разом</th>
                <th>Акаунт</th>
                <th>Адмін</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set(players.map(p => p.team))].sort((a,b)=>a.localeCompare(b,'uk')).flatMap(team => [
                <tr key={`team-${team}`} style={{background:'rgba(255,255,255,.045)'}}>
                  <td colSpan={6} style={{fontWeight:800,color:TEAM_META[team]?.color || 'var(--gold)',fontSize:11,letterSpacing:.6}}>{TEAM_META[team]?.code || '◆'} · {team}</td>
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
                  <td aria-label={`Підсумкові бали ${p.name}`} style={{width:78,color:'var(--gold)',fontFamily:'Orbitron,sans-serif',fontSize:11,padding:'5px 6px'}}>{Number(p.base_pts) || 0}</td>
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

      {/* INDIVIDUAL QUALIFYING PLAN + VERIFIED TEAM RESERVES */}
      {tab === 'substitutions' && (
        <>
          <section className="admin-plan-card">
            <header className="admin-plan-heading">
              <div>
                <div className="admin-plan-kicker">VEGAS · QATAR · UAE</div>
                <h2>Індивідуальний план кваліфікацій</h2>
                <p>Кількість слотів розрахована окремо для кожного гравця з невикористаних пілотів. Коли адмін розігрує кваліфікацію, саме цей план визначає скільки пілотів отримає кожен.</p>
              </div>
              <span className="admin-plan-badge">ПЛАН АКТИВНИЙ</span>
            </header>
            <div className="admin-plan-table-wrap">
              <table className="admin-plan-table">
                <thead><tr><th>Гравець</th><th>Доступно</th>{qualifyingPlanStages.map(stage=><th key={stage.order}>{stage.label}</th>)}<th>Залишиться</th></tr></thead>
                <tbody>{qualifyingPlanRows.sort((a,b)=>a.player.name.localeCompare(b.player.name,'uk')).map(({player,available,plan,remaining})=>(
                  <tr key={player.id}>
                    <td><strong>{player.name}</strong><small>{player.team}</small></td>
                    <td>{available}</td>
                    {qualifyingPlanStages.map(stage=><td key={stage.order}><b>{plan[stage.order] || 0}</b></td>)}
                    <td className={remaining ? 'plan-remaining' : 'plan-complete'}>{remaining}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="admin-plan-footnote">Пілотів призначаємо лише з офіційного списку чинних пілотів; один пілот не повторюється для гравця. Якщо після UAE лишається число більше нуля, у поточних трьох кваліфікаціях не вистачає слотів, щоб видати всіх пілотів.</p>
          </section>

          <section className="reserve-admin-section">
            <header className="reserve-admin-heading">
              <div><div className="admin-plan-kicker">F1 2026</div><h2>Резервні пілоти команд</h2></div>
              <label className="reserve-stage-select"><span>Гран-прі для заміни</span>
                <select className="reserve-select" value={subStageId} onChange={e=>setSubStageId(e.target.value)}><option value="">Оберіть етап</option>{stages.filter(st=>Number(st.sort_order)>=10).map(st=><option key={st.id} value={st.id}>{st.flag} {st.name}</option>)}</select>
              </label>
            </header>
            <p className="reserve-admin-note">Резерви внесені окремо для кожної команди й не потрапляють у звичайний пул жеребкування. Базовий список звірений з <a href="https://www.formula1.com/en/latest/article/who-are-the-reserve-drivers-for-each-f1-team-in-2026.Ce8YvwuVJGLkVNgERX21U" target="_blank" rel="noreferrer">оглядом Formula 1 від 25.02.2026</a>; Camara для Haas і Slater для Audi додані за вашим уточненням.</p>
            <div className="reserve-team-grid">{PILOT_TEAM_ROSTER.map(row => {
              const teamChanges = pilotChanges.filter(item => item.stage_id===subStageId && item.team_name===row.team && item.is_active)
              const replaced = new Set(teamChanges.map(change=>change.outgoing_driver))
              const officialReserves = TEAM_RESERVE_PILOTS_2026[row.team] || []
              const selected = subTeam === row.team
              return <article key={row.team} className="reserve-team-card">
                <div className="reserve-team-title"><strong>{row.team}</strong><span>{officialReserves.length ? `${officialReserves.length} у списку` : 'список порожній'}</span></div>
                <div className="reserve-active-list">{row.drivers.map(driver=><span key={driver} className={`reserve-driver-chip ${replaced.has(driver)?'is-replaced':''}`}>{driver}{replaced.has(driver)?' · замінений':' · стартовий'}</span>)}</div>
                {teamChanges.map(change=><div key={change.id} className="reserve-saved-change"><span>{change.outgoing_driver} <b>→</b> {change.incoming_driver || '—'}</span><button type="button" onClick={()=>deactivatePilotSubstitution(change)} aria-label={`Скасувати ${change.outgoing_driver}`}>Скасувати</button></div>)}
                {officialReserves.length > 0 ? <div className="reserve-form-row">
                  <select className="reserve-select" value={selected?subOutgoing:''} onChange={e=>{setSubTeam(row.team);setSubOutgoing(e.target.value);setSubIncoming(current=>officialReserves.includes(current)?current:'')}}>
                    <option value="">Кого замінити</option>{row.drivers.filter(driver=>!replaced.has(driver)).map(driver=><option key={driver} value={driver}>{driver}</option>)}
                  </select>
                  <select className="reserve-select" value={selected?subIncoming:''} onChange={e=>{setSubTeam(row.team);setSubIncoming(e.target.value)}}>
                    <option value="">Резервний пілот</option>{officialReserves.map(driver=><option key={driver} value={driver}>{driver}</option>)}
                  </select>
                  <button className="reserve-save-btn" disabled={!subStageId || !selected || !subOutgoing || !subIncoming} onClick={()=>addPilotSubstitution(row.team,subOutgoing,subIncoming)}>Зберегти заміну</button>
                </div> : <div className="reserve-unconfirmed">У довіднику поки немає резервного пілота для цієї команди.</div>}
              </article>
            })}</div>
          </section>
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
          <p className="team-created-note">Сортування — за сумою балів гравців. «Створено» показує дату найранішої реєстрації гравця цієї команди, оскільки окремої таблиці команд і дати створення команди в базі немає.</p>
          <table className="team-table">
            <thead><tr><th>Команда</th><th>Гравці</th><th>Сумарні бали</th><th>Створено*</th></tr></thead>
            <tbody>
              {[...new Set(players.map(p=>p.team))].map(team => {
                const teamPlayers = players.filter(p=>p.team===team)
                const total = teamPlayers.reduce((s,p)=>s+(Number(p.base_pts)||0),0)
                const firstAdded = teamPlayers.map(p=>p.created_at).filter(Boolean).sort()[0]
                const color = TEAM_META[team]?.color || '#888'
                return {team,teamPlayers,total,firstAdded,color}
              }).sort((a,b)=>b.total-a.total || a.team.localeCompare(b.team,'uk')).map(({team,teamPlayers,total,firstAdded,color}) => (
                  <tr key={team} style={{borderLeft:`3px solid ${color}`}}>
                    <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color}}>{team}</td>
                    <td style={{fontSize:11,color:'var(--muted)'}}>{teamPlayers.map(p=>p.name).join(' · ')}</td>
                    <td className="team-score">{total}</td>
                    <td style={{fontSize:11,color:'var(--muted)'}}>{firstAdded ? new Date(firstAdded).toLocaleDateString('uk-UA',{timeZone:'Europe/Warsaw'}) : '—'}</td>
                  </tr>
                ))}
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

function canRecalculateAll(stages,sessions) {
  const started = (stages || []).filter(stage => (sessions || []).some(session => session.stage_id === stage.id && session.committed))
  return started.length > 0 && started.every(stage => {
    const rows = sessions.filter(session => session.stage_id === stage.id)
    return rows.length > 0 && rows.some(session => session.type === 'race') && rows.every(session => session.committed)
  })
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
      .then(({ data }) => setAllSessions((data || [])))
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
