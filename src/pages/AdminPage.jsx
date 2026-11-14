import { useState, useEffect, useRef } from 'react'
import { supabase, IS_PREVIEW_DEPLOYMENT, TEAM_META, TEAM_RESERVE_PILOTS_2026, PILOT_TEAM_ROSTER, ACTIVE_PILOTS_2026, USED_PILOTS, qualifyingPlanForAvailable, qualifyingSlotsForStage, calcRaceScore, calcQualAssignmentScore, calcSprintScore } from '../lib/supabase'
import PlayerCard from '../components/PlayerCard'
import { buildStagePilotPool, normalizeStageDriver, normalizeStageResults, newcomerPlayersForStage, priorQualAssignments } from '../lib/roster'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { auditActionLabel, auditActorLabel, auditSummary } from '../lib/audit'
import { resultsList } from '../lib/scoring'
import { mergePreviewDraftRows, readPreviewDrafts } from '../lib/previewDrafts'
import { calculateNewcomerBonuses } from '../lib/standings'
import { buildStageExportSheets, downloadStageWorkbook } from '../lib/stageWorkbook'
import { buildManualReviewQueue, inputForReviewItem, scoreManualReviewItem, loadManualReviewState, saveManualReviewState, manualReviewStepKey, summarizeManualReview } from '../lib/manualReview'

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
  const [forecasts, setForecasts] = useState([])
  const [newcomerBonuses, setNewcomerBonuses] = useState([])
  const [manualReviewState, setManualReviewState] = useState(()=>loadManualReviewState())
  const [manualAudit, setManualAudit] = useState({})
  const [reviewDrafts, setReviewDrafts] = useState({})
  const [reviewPlayerId, setReviewPlayerId] = useState('')
  const [reviewIndex, setReviewIndex] = useState(0)
  const [reviewInput, setReviewInput] = useState(null)
  const reviewInputRef = useRef(null)
  const [subStageId, setSubStageId] = useState('')
  const [subTeam, setSubTeam] = useState('')
  const [subOutgoing, setSubOutgoing] = useState('')
  const [subIncoming, setSubIncoming] = useState('')
  const [loading,   setLoading]   = useState(true)
  const [msg,       setMsg]       = useState('')
  const [recalculatingAll, setRecalculatingAll] = useState(false)
  const [previewRecalculationReports, setPreviewRecalculationReports] = useState(null)

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
      supabase.from('sessions').select('*, stages(name,flag,sort_order,key)').order('committed_at', {ascending:false}),
      supabase.from('audit_log').select('*').order('created_at', {ascending:false}).limit(80),
      supabase.from('stage_pilot_substitutions').select('*,stages(name,key,flag)').order('created_at', {ascending:false}),
      supabase.from('qual_assignments').select('*,sessions(*,stages(name,flag,sort_order,key))'),
      supabase.from('forecasts').select('*,sessions(*,stages(name,flag,sort_order,key))'),
      supabase.from('stage_newcomer_bonuses').select('*'),
    ]).then(([s,p,se,l,sub,qa,fc,nb]) => {
      const loadErrors = [
        s.error && `етапи: ${s.error.message}`,
        p.error && `гравці: ${p.error.message}`,
        se.error && `сесії: ${se.error.message}`,
        l.error && `журнал: ${l.error.message}`,
        sub.error && `заміни пілотів: ${sub.error.message}`,
        qa.error && `кваліфікації: ${qa.error.message}`,
        fc.error && `прогнози: ${fc.error.message}`,
        nb.error && `бонуси новачків: ${nb.error.message}`,
      ].filter(Boolean)
      if (loadErrors.length) setMsg(`⚠ Не вдалося завантажити частину даних адмінки — ${loadErrors.join('; ')}`)
      const savedReview=IS_PREVIEW_DEPLOYMENT?loadManualReviewState():{}
      const localRows=savedReview.rows || {}
      setStages((s.data||[]))
      setPlayers((p.data||[]).map(player=>({...player,...(savedReview.totals?.[player.id]!=null?{base_pts:savedReview.totals[player.id]}:{})})))
      setSessions(se.data||[])
      setLogs(l.data||[])
      setPilotChanges(sub.data || [])
      setQualAssignments((qa.data || []).map(row=>({...row,...(localRows[`qual:${row.id}`]||{})})))
      setForecasts((fc.data || []).map(row=>({...row,...(localRows[`forecast:${row.id}`]||{})})))
      const localBonuses=savedReview.bonuses || {}
      setNewcomerBonuses([...((nb.data||[]).filter(row=>!Object.hasOwn(localBonuses,row.stage_id))),...Object.entries(localBonuses).flatMap(([stageId,value])=>(value.bonuses||[]).map(bonus=>({...bonus,stage_id:stageId,source_minimum:value.minimum})) )])
      setManualReviewState(savedReview)
      // collect distinct teams not in TEAM_META (custom-added)
      const teamsInDb = [...new Set((p.data||[]).map(x=>x.team))]
      setCustomTeams(teamsInDb.filter(t => !TEAM_META[t]))
      setLoading(false)
    })
  }
  useEffect(() => { loadAll() }, [])

  function persistManualReviewState(nextState) {
    setManualReviewState(nextState)
    if(IS_PREVIEW_DEPLOYMENT) saveManualReviewState(nextState)
  }

  function reviewQueueFor(playerId) {
    return buildManualReviewQueue({playerId,sessions,forecasts,qualifications:qualAssignments})
  }

  function setReviewDraft(input) {
    reviewInputRef.current=input
    setReviewInput(input)
  }

  function reviewStepKey(item,playerId=reviewPlayerId) {
    return manualReviewStepKey(playerId,item.session.id)
  }

  function setReviewItemInput(item,input) {
    const key=reviewStepKey(item)
    reviewInputRef.current=input
    setReviewInput(input)
    setReviewDrafts(previous=>({...previous,[key]:input}))
    setManualAudit(previous=>({...previous,[key]:{...previous[key],checked:false,input}}))
  }

  function persistReviewedForecast(item,predictions,flPick,ovPick) {
    const slots=item.session.type==='sprint'?5:10
    const input={
      predictions:Object.fromEntries(Array.from({length:slots},(_,index)=>[index+1,predictions[index]||''])),
      fl_pick:flPick||'',
      ov_pick:ovPick||'',
    }
    setReviewItemInput(item,input)
  }

  function persistReviewedQual(item,pilots,positions) {
    setReviewItemInput(item,{
      ...reviewInputRef.current,
      pilot_1:pilots[0]||'',pred_pos_1:positions[0]||null,
      pilot_2:pilots[1]||'',pred_pos_2:positions[1]||null,
      pilot_3:pilots[2]||'',pred_pos_3:positions[2]||null,
    })
  }

  function persistReviewedPole(item,pilot) {
    setReviewItemInput(item,{...reviewInputRef.current,pole_pick:pilot||''})
  }

  function reviewAutoResult(item,input) {
    const changes=pilotChanges.filter(change=>change.stage_id===item.session.stage_id && change.is_active)
    return scoreManualReviewItem(item,input,changes)
  }

  function isReviewItemApproved(item,playerId=reviewPlayerId) {
    return Boolean(manualAudit[reviewStepKey(item,playerId)]?.checked)
  }

  function manualReviewMismatch(item,playerId) {
    const checked=manualAudit[reviewStepKey(item,playerId)]
    if(!checked?.checked) return false
    const official=Number(item.row?.score)||0
    if(Number(checked.score)!==official) return true
    if(item.missed&&item.session.type==='race') {
      const bonus=newcomerBonusPreview(item.session,playerId)
      return Number(checked.bonusPoints||0)!==Number(bonus.recorded||0)
    }
    return false
  }

  function newcomerBonusPreview(session,playerId=reviewPlayerId) {
    const stageSessions=sessions.filter(row=>row.stage_id===session.stage_id)
    const race=stageSessions.find(row=>row.type==='race')
    if(!race || stageSessions.some(row=>!row.committed)) return {ready:false,minimum:null,points:null,recorded:null,eligible:false}
    const raceRows=forecasts.filter(row=>row.session_id===race.id)
    const order=Number(race.stages?.sort_order || session.stages?.sort_order)
    const eligible=newcomerPlayersForStage(players,order,sessions,forecasts).some(player=>player.id===playerId)
    const result=calculateNewcomerBonuses(players,stageSessions,raceRows,[],newcomerPlayersForStage(players,order,sessions,forecasts).map(player=>player.id))
    const recorded=newcomerBonuses.find(row=>row.stage_id===race.stage_id&&row.player_id===playerId)?.points ?? null
    return {ready:result.ready,minimum:result.minimum,points:result.bonuses.find(row=>row.player_id===playerId)?.points ?? null,recorded,eligible}
  }

  function reviewRunTotal(queue,playerId=reviewPlayerId) {
    const official=players.find(player=>player.id===playerId)?.base_pts
    return summarizeManualReview(queue,playerId,manualAudit,official).manualTotal
  }

  function openPlayerReview(playerId, preferredSessionId=null) {
    const queue=reviewQueueFor(playerId)
    const mismatchIndex=queue.findIndex(item=>item.session.id===preferredSessionId)
    const firstUnreviewed=queue.findIndex(item=>!isReviewItemApproved(item,playerId))
    const initialIndex=mismatchIndex>=0?mismatchIndex:firstUnreviewed>=0?firstUnreviewed:queue.length
    setReviewPlayerId(playerId)
    setReviewIndex(initialIndex)
    if(initialIndex<queue.length) {
      const item=queue[initialIndex]
      const input=reviewDrafts[reviewStepKey(item,playerId)] || manualAudit[reviewStepKey(item,playerId)]?.input || inputForReviewItem(item,pilotChanges.filter(change=>change.stage_id===item.session.stage_id&&change.is_active))
      setReviewDraft(input)
    } else setReviewDraft(null)
  }

  function confirmReviewAbsence(item) {
    const key=reviewStepKey(item)
    setManualAudit(previous=>({...previous,[key]:{...previous[key],absenceConfirmed:!previous[key]?.absenceConfirmed,checked:false}}))
  }

  function toggleReviewBonus(item) {
    const key=reviewStepKey(item)
    setManualAudit(previous=>({...previous,[key]:{...previous[key],bonusIncluded:!previous[key]?.bonusIncluded,checked:false}}))
  }

  function moveReviewBack() {
    if(reviewIndex<=0) return
    const nextIndex=reviewIndex-1
    const item=activeReviewQueue[nextIndex]
    setReviewIndex(nextIndex)
    setReviewDraft(reviewDrafts[reviewStepKey(item)] || manualAudit[reviewStepKey(item)]?.input || inputForReviewItem(item,pilotChanges.filter(change=>change.stage_id===item.session.stage_id&&change.is_active)))
  }

  function approveReviewStep() {
    const queue=reviewQueueFor(reviewPlayerId)
    const item=queue[reviewIndex]
    const currentInput=reviewInputRef.current || reviewInput
    if(!item || (!item.missed&&!currentInput)) return
    const key=reviewStepKey(item)
    const stepState=manualAudit[key]||{}
    if(item.missed&&!stepState.absenceConfirmed) { setMsg('Підтверди відсутність, щоб зарахувати цей крок як 0 балів.');return }
    const scored=item.missed?{score:0,breakdown:[]} : reviewAutoResult(item,currentInput)
    const bonus= item.missed&&item.session.type==='race' ? newcomerBonusPreview(item.session,reviewPlayerId) : null
    const bonusPoints=bonus&&stepState.bonusIncluded?Number(bonus.points??bonus.recorded)||0:0
    setManualAudit(previous=>({...previous,[key]:{
      ...previous[key],checked:true,score:scored.score,breakdown:scored.breakdown,input:currentInput,
      bonusPoints,bonusIncluded:Boolean(stepState.bonusIncluded),missed:item.missed,
    }}))
    setMsg(`${item.session.stages?.name||''}: ${scored.score} балів у калькуляторі${bonusPoints?` + бонус новачка ${bonusPoints}`:''}. База не змінювалась.`)
    const nextIndex=reviewIndex+1
    setReviewIndex(nextIndex)
    if(nextIndex<queue.length) {
      const nextItem=queue[nextIndex]
      setReviewDraft(reviewDrafts[reviewStepKey(nextItem)] || manualAudit[reviewStepKey(nextItem)]?.input || inputForReviewItem(nextItem,pilotChanges.filter(change=>change.stage_id===nextItem.session.stage_id&&change.is_active)))
    } else setReviewDraft(null)
  }

  async function log(action, details = {}) {
    const actor = adminPlayer?.name || user?.email || 'Адміністратор'
    const enrichedDetails = { ...details, actor_name: adminPlayer?.name || null, actor_email: user?.email || null, actor_user_id: user?.id || null }
    const { error } = await supabase.from('audit_log').insert({ action, actor, details: enrichedDetails })
    if (error) console.error('Audit log insert failed:', error.message)
    return error
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
      const eligible = newcomerPlayersForStage(players,order,sessions,forecasts).map(player=>player.id)
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
    const confirmed = window.confirm(IS_PREVIEW_DEPLOYMENT
      ? `Виконати сухий прогін ${completedStages.length} ГП? Перерахую кожну сесію для перевірки й покажу нові підсумки. Робочу базу не зміню.`
      : `Повністю перерахувати ${completedStages.length} ГП? Усі підсумки буде замінено сумою заново розрахованих прогнозів, кваліфікацій і перевірених бонусів. ${notCommitted} ГП без зарахованих сесій буде пропущено.`
    )
    if (!confirmed) return
    setRecalculatingAll(true)
    setPreviewRecalculationReports(null)
    setMsg(IS_PREVIEW_DEPLOYMENT ? '🧪 Рахую сухий прогін усіх доступних ГП…' : '⟳ Перераховую всі завершені ГП атомарно…')
    try {
      const stageIds = completedStages.map(stage => stage.id)
      const eventSessions = sessions.filter(session => stageIds.includes(session.stage_id))
      const sessionIds = eventSessions.map(session => session.id)
      const [forecastResult, qualResult, changesResult] = await Promise.all([
        supabase.from('forecasts').select('id,player_id,session_id,score,score_breakdown,scored_input,predictions,fl_pick,ov_pick').in('session_id',sessionIds),
        supabase.from('qual_assignments').select('id,player_id,session_id,score,scored_input,pole_pick,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id',sessionIds),
        supabase.from('stage_pilot_substitutions').select('*').in('stage_id',stageIds).eq('is_active',true),
      ])
      if (forecastResult.error) throw forecastResult.error
      if (qualResult.error) throw qualResult.error
      if (changesResult.error) throw changesResult.error
      const previewDrafts = IS_PREVIEW_DEPLOYMENT ? readPreviewDrafts() : null
      const allForecasts = IS_PREVIEW_DEPLOYMENT
        ? mergePreviewDraftRows(forecastResult.data,previewDrafts.forecasts)
        : forecastResult.data || []
      const allQualifying = IS_PREVIEW_DEPLOYMENT
        ? mergePreviewDraftRows(qualResult.data,previewDrafts.qual_assignments)
        : qualResult.data || []
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
              return {id:row.id,player_id:row.player_id,previous_score:Number(row.score)||0,has_saved_input:Boolean(row.scored_input),score:total,scored_input:{pole_pick:normalized.pole_pick || '',pilot_1:normalized.pilot_1,pred_pos_1:row.pred_pos_1,pilot_2:normalized.pilot_2,pred_pos_2:row.pred_pos_2,pilot_3:normalized.pilot_3,pred_pos_3:row.pred_pos_3}}
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
            const scoredInput = {predictions:Object.fromEntries(predictions.map((pilot,index)=>[index+1,pilot]).filter(([,pilot])=>pilot)),fl_pick:normalizeStageDriver(row.fl_pick,stageChanges)}
            if (session.type === 'race') scoredInput.ov_pick=normalizeStageDriver(row.ov_pick,stageChanges)
            const scored = {id:row.id,player_id:row.player_id,previous_score:Number(row.score)||0,has_saved_input:Boolean(row.scored_input),score:result.total,score_breakdown:result.breakdown,scored_input:scoredInput}
            if (session.type === 'race') rescoredRaceForecasts.push({...row,...scored})
            return scored
          })
          scoreRows.push({session_id:session.id,forecast_scores:rows,qual_scores:[]})
        }
        const eligible = newcomerPlayersForStage(players,order,sessions,forecasts).map(player=>player.id)
        const raceBonus = calculateNewcomerBonuses(players,stageSessions,rescoredRaceForecasts,[],eligible)
        if (!raceBonus.ready) throw new Error(`${stage.name}: не вдалося безпечно перерахувати бонус новачка за гонку.`)
        const playerNameById = Object.fromEntries(players.map(player => [player.id, player.name]))
        const report = stageSessions.map(session => {
          const rows = scoreRows.find(row => row.session_id === session.id)
          return {
            type:session.type,
            scores:[...(rows?.forecast_scores || []).map(row => ({player:playerNameById[row.player_id] || '—',previous:row.previous_score,points:row.score,hasSavedInput:row.has_saved_input,previewDraft:Boolean(allForecasts.find(item=>item.id===row.id)?.preview_draft)})), ...(rows?.qual_scores || []).map(row => ({player:playerNameById[row.player_id] || '—',previous:row.previous_score,points:row.score,hasSavedInput:row.has_saved_input,previewDraft:Boolean(allQualifying.find(item=>item.id===row.id)?.preview_draft)}))],
          }
        })
        const sessionsWithoutSnapshots = report.reduce((count,sessionReport)=>count + sessionReport.scores.filter(score=>!score.hasSavedInput).length,0)
        recalculationReports.push({stage:stage.key,stage_name:stage.name,report,newcomer_bonus_minimum:raceBonus.minimum,sessionsWithoutSnapshots})
        payload.push({
          stage_id:stage.id,
          session_scores:scoreRows.map(sessionRow=>({
            session_id:sessionRow.session_id,
            forecast_scores:sessionRow.forecast_scores.map(({id,score,score_breakdown,scored_input})=>({id,score,score_breakdown,scored_input})),
            qual_scores:sessionRow.qual_scores.map(({id,score,scored_input})=>({id,score,scored_input})),
          })),
          newcomer_bonuses:raceBonus.bonuses,
          newcomer_minimum:raceBonus.minimum,
        })
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
      const missingScoredInputs = recalculationReports.reduce((count,stage)=>count+stage.sessionsWithoutSnapshots,0)
      const mismatchedTotals = players.filter(player => (projectedTotals[player.id]||0)!==(Number(player.base_pts)||0))
      if (!IS_PREVIEW_DEPLOYMENT && (missingScoredInputs || mismatchedTotals.length)) {
        const mismatchNames = mismatchedTotals.map(player=>player.name).join(', ')
        throw new Error(`Офіційний перерахунок заблоковано: ${missingScoredInputs} прогнозів не мають історичного знімка; підсумки не збігаються для ${mismatchNames || '—'}. Спершу звірте сухий прогін і вихідні дані.`)
      }
      const confirmationText = IS_PREVIEW_DEPLOYMENT
        ? `СУХИЙ ПРОГІН · ${payload.length} ГП\n\n${previewText}\n\nБали за всіма сесіями буде лише пораховано й показано для звірки. Запис у робочу базу заблокований.`
        : `СУХИЙ ПРОГІН · ${payload.length} ГП\n\n${previewText}\n\nЦе нові підсумки, перераховані за результатами сесій. Підтвердити атомарний перезапис?`
      if (!window.confirm(confirmationText)) {
        setMsg('Сухий прогін завершено; базу не змінено.')
        return
      }
      if (IS_PREVIEW_DEPLOYMENT) {
        setPreviewRecalculationReports({
          stages:recalculationReports,
          totals:players.map(player => ({name:player.name,base:Number(player.base_pts)||0,projected:projectedTotals[player.id]||0})).sort((a,b)=>b.projected-a.projected),
        })
        setMsg(`🧪 Сухий прогін завершено: перевірено ${payload.length} ГП. Підсумки й бали по кожній сесії показані нижче; база не змінена.`)
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
    setMsg(`✓ ${outgoingDriver} замінений на ${incomingDriver} для обраного ГП`)
  }

  async function deactivatePilotSubstitution(change) {
    const { error } = await supabase.from('stage_pilot_substitutions').update({ is_active:false }).eq('id',change.id)
    if (error) { setMsg(`⚠ ${error.message}`); return }
    setPilotChanges(prev => prev.map(row => row.id === change.id ? { ...row, is_active:false } : row))
    if(subTeam===change.team_name) setSubOutgoing('')
    await log('pilot_substitution', { stage_name:change.stages?.name, team:change.team_name, outgoing_driver:change.outgoing_driver, incoming_driver:null, reason:'Заміна деактивована' })
    setMsg('✓ Резерв вимкнено; стартовий пілот повернувся')
  }

  async function toggleReserveDriver(teamRow,driver,teamChanges) {
    if(!subStageId) { setMsg('Спершу обери ГП.');return }
    if(teamChanges.length>1) { setMsg(`У ${teamRow.team} є кілька активних замін на це ГП. Спершу усунь дубль у журналі.`);return }
    const current=teamChanges[0]
    if(current) {
      if(driver===current.incoming_driver || driver===current.outgoing_driver) {
        await deactivatePilotSubstitution(current)
        return
      }
      if(teamRow.drivers.includes(driver)) {
        setMsg(`У ${teamRow.team} вже активний резерв ${current.incoming_driver}. Вимкни його перед іншою заміною.`)
        return
      }
    }
    if(teamRow.drivers.includes(driver)) {
      const cancel=subTeam===teamRow.team&&subOutgoing===driver
      setSubTeam(teamRow.team)
      setSubOutgoing(cancel?'':driver)
      setMsg(cancel?'Вибір заміни скасовано.':`Обрано ${driver}. Натисни ім’я резервіста в цьому рядку.`)
      return
    }
    if(!(TEAM_RESERVE_PILOTS_2026[teamRow.team]||[]).includes(driver)) return
    if(subTeam!==teamRow.team||!subOutgoing) {
      setMsg(`Спершу натисни стартового пілота ${teamRow.team}, якого потрібно замінити.`)
      return
    }
    const alreadyUsed=pilotChanges.find(change=>change.stage_id===subStageId&&change.is_active&&change.incoming_driver===driver)
    if(alreadyUsed) { setMsg(`${driver} вже активний резерв на цьому ГП.`);return }
    await addPilotSubstitution(teamRow.team,subOutgoing,driver)
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

  const activeReviewQueue=reviewPlayerId?reviewQueueFor(reviewPlayerId):[]
  const activeReviewItem=activeReviewQueue[reviewIndex] || null
  const activeReviewPlayer=players.find(player=>player.id===reviewPlayerId)
  const activeReviewScore=activeReviewItem&&reviewInput?reviewAutoResult(activeReviewItem,reviewInput):activeReviewItem?.missed?{score:0,breakdown:[]}:null
  const activeReviewBonus=activeReviewItem?.session.type==='race'?newcomerBonusPreview(activeReviewItem.session,reviewPlayerId):null
  const activeReviewKey=activeReviewItem?reviewStepKey(activeReviewItem):''
  const activeReviewState=activeReviewKey?manualAudit[activeReviewKey]||{}:{}
  const activeReviewSummary=summarizeManualReview(activeReviewQueue,reviewPlayerId,manualAudit,activeReviewPlayer?.base_pts)
  const activeReviewRunTotal=activeReviewSummary.manualTotal
  const activeReviewComplete=activeReviewSummary.complete
  const activeReviewChanges=activeReviewItem?pilotChanges.filter(change=>change.stage_id===activeReviewItem.session.stage_id&&change.is_active):[]
  const activeReviewStageOrder=Number(activeReviewItem?.session.stages?.sort_order)
  const activeReviewPilots=[...new Set([...buildStagePilotPool(activeReviewChanges),...resultsList(normalizeStageResults(activeReviewItem?.session.results||{},activeReviewChanges)),...activeReviewChanges.map(change=>change.incoming_driver),...Object.values(reviewInput?.predictions||{}),reviewInput?.fl_pick,reviewInput?.ov_pick].filter(Boolean))]
  const activeReviewQualHistory=activeReviewItem?priorQualAssignments(qualAssignments,activeReviewItem.session.id,activeReviewStageOrder):[]
  const activeReviewQualPlayerTeams=Object.fromEntries(players.map(player=>[player.id,player.team]))
  const activeReviewAllQualAssignments=Object.fromEntries([...activeReviewQualHistory.map((row,index)=>[`history_${index}`,row]),...qualAssignments.filter(row=>row.session_id===activeReviewItem?.session.id).map(row=>[row.id,row])])
  const activeReviewQualUsed=new Set(USED_PILOTS[activeReviewPlayer?.name]||[])
  activeReviewQualHistory.filter(row=>row.player_id===activeReviewPlayer?.id).forEach(row=>[row.pilot_1,row.pilot_2,row.pilot_3].filter(Boolean).forEach(pilot=>activeReviewQualUsed.add(pilot)))
  const activeReviewQualSlots=activeReviewItem&&activeReviewPlayer?qualifyingSlotsForStage(activeReviewPilots.filter(pilot=>!activeReviewQualUsed.has(pilot)).length,activeReviewStageOrder):1

  const tabs = [
    { key:'stages',    label:'ЕТАПИ' },
    { key:'deadlines', label:'ДЕДЛАЙНИ' },
    { key:'users',     label:'ГРАВЦІ' },
    { key:'review',    label:'ПЕРЕВІРКА ПРОГНОЗІВ' },
    { key:'teams',     label:'КОМАНДИ' },
    { key:'qualifying', label:'КВАЛІФІКАЦІЇ' },
    { key:'reserves', label:'РЕЗЕРВІСТИ' },
    { key:'export', label:'ЕКСПОРТ ТАБЛИЦЬ' },
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
          <div className="section-label">Перерахунок етапів</div>
          <p className="team-created-note">{IS_PREVIEW_DEPLOYMENT ? 'Preview показує сухий прогін; production-база не змінюється.' : 'Перерахунок замінює підсумки балами за повністю зараховані сесії.'}</p>
          <button className="btn btn-red" style={{marginBottom:14}} disabled={!canRecalculateAll(stages,sessions) || recalculatingAll} title={IS_PREVIEW_DEPLOYMENT ? 'Сухий прогін доступних зарахованих ГП сезону без запису в робочу базу' : 'Перерахувати всі доступні завершені ГП і замінити підсумки'} onClick={recalculateAllScores}>{IS_PREVIEW_DEPLOYMENT ? '🧪 СУХИЙ ПРОГІН ПЕРЕРАХУНКУ СЕЗОНУ' : '↻ ПЕРЕРАХУВАТИ ВСІ ГП ТА ЗАМІНИТИ ПІДСУМКИ'}</button>
          {IS_PREVIEW_DEPLOYMENT && previewRecalculationReports?.totals && (
            <div style={{margin:'8px 0 20px',padding:14,border:'1px solid var(--green)',borderRadius:6,background:'rgba(107,255,138,.04)'}}>
              <div className="section-label">🧪 Результат сухого прогону · база не змінена</div>
              <p className="team-created-note">У звіті для кожного прогнозу показані збережені бали та новий розрахунок. «Немає знімка» означає, що система не має незмінної копії прогнозу, за яким раніше нарахували бали; такі історичні різниці не можна вважати поясненими лише сухим прогоном. Чернетки з поточного preview позначено окремо.</p>
              <div style={{overflowX:'auto',marginBottom:18}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead><tr><th style={{textAlign:'left',padding:7}}>Гравець</th><th style={{textAlign:'right',padding:7}}>Було</th><th style={{textAlign:'right',padding:7}}>За прогнозами</th><th style={{textAlign:'right',padding:7}}>Різниця</th></tr></thead>
                  <tbody>{previewRecalculationReports.totals.map(row => <tr key={row.name}>
                    <td style={{padding:7,borderTop:'1px solid var(--border)'}}>{row.name}</td>
                    <td style={{padding:7,borderTop:'1px solid var(--border)',textAlign:'right'}}>{row.base}</td>
                    <td style={{padding:7,borderTop:'1px solid var(--border)',textAlign:'right'}}>{row.projected}</td>
                    <td style={{padding:7,borderTop:'1px solid var(--border)',textAlign:'right',color:row.projected-row.base<0?'var(--red)':'var(--green)'}}>{row.projected-row.base>0?'+':''}{row.projected-row.base}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              {previewRecalculationReports.stages.map(stage => <details key={stage.stage} style={{marginTop:8}}>
                <summary style={{cursor:'pointer',fontFamily:'Orbitron,sans-serif',fontSize:11}}>{stage.stage_name} · бонус новачка: {stage.newcomer_bonus_minimum} очок · без знімка: {stage.sessionsWithoutSnapshots} прогнозів</summary>
                {stage.report.map((session,index) => <div key={`${session.type}-${index}`} style={{margin:'10px 0 14px',fontSize:12}}>
                  <strong>{session.type.toUpperCase()}</strong>
                  {session.scores.length ? <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'4px 12px',marginTop:6}}>{session.scores.map((score,i) => <span key={`${score.player}-${i}`}>{score.player}: {score.previous} → <b>{score.points}</b> ({score.points-score.previous>0?'+':''}{score.points-score.previous}) · {score.hasSavedInput?'є знімок':'немає знімка'}{score.previewDraft?' · preview-чернетка':''}</span>)}</div> : <div style={{color:'var(--muted)',marginTop:5}}>Немає прогнозів для підрахунку.</div>}
                </div>)}
              </details>)}
            </div>
          )}
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

      {tab === 'export' && (
        <section>
          <div className="section-label">Вивантаження таблиць етапів</div>
          <p className="team-created-note">Завантажить один Excel-сумісний файл із окремим аркушем на кожен етап. У таблицях: ім’я, спринт, кваліфікація, гонка, бонус новачка та сума. Незараховані сесії залишаться порожніми; етапи без спринту матимуть прочерк у цьому стовпці.</p>
          <button
            type="button"
            className="btn btn-red"
            disabled={!stages.length || !players.length}
            onClick={() => {
              try {
                const sheets = buildStageExportSheets(stages, players, sessions, forecasts, qualAssignments, newcomerBonuses)
                const date = new Date().toISOString().slice(0, 10)
                downloadStageWorkbook(sheets, `fantasy-etapy-2026-${date}.xlsx`)
                setMsg(`✓ Файл із ${sheets.length} аркушами етапів завантажено.`)
              } catch (error) {
                setMsg(`⚠ Не вдалося створити файл: ${error.message || error}`)
              }
            }}
          >
            ⬇ ЗАВАНТАЖИТИ ВСІ ЕТАПИ В ОДНОМУ ФАЙЛІ
          </button>
        </section>
      )}

      {/* DEADLINES TAB */}
      {tab === 'deadlines' && (
        <DeadlinesTab sessions={sessions} setSessions={setSessions} setMsg={setMsg} />
      )}

      {tab === 'review' && (
        <section>
          <div className="section-label">Ручна звірка · гравці за командами</div>
          <p className="team-created-note">Перевір сесії по порядку. Калькулятор не записує зміни в базу.</p>
          <div style={{display:'grid',gap:18}}>
            {[...new Set(players.map(player=>player.team || 'Без команди'))].sort((a,b)=>a.localeCompare(b)).map(team=> (
              <div key={team}>
                <div className="section-label" style={{marginBottom:6}}>{team}</div>
                <div className="admin-review-grid">
                  {players.filter(player=>(player.team || 'Без команди')===team).map(player=>{
                    const queue=reviewQueueFor(player.id)
                    const mismatches=queue.filter(item=>manualReviewMismatch(item,player.id))
                    const complete=queue.length>0 && queue.every(item=>isReviewItemApproved(item,player.id))
                    const mismatch=mismatches[0]
                    const state=mismatch?'РОЗБІЖНІСТЬ':complete?'ЗВІРЕНО':`ПЕРЕВІРЕНО ${queue.filter(item=>isReviewItemApproved(item,player.id)).length}/${queue.length}`
                    const color=mismatch?'#f4c542':complete?'var(--green)':'var(--muted)'
                    const teamColor=TEAM_META[player.team]?.color || '#888'
                    const credited=Number(player.base_pts)||0
                    return <button key={player.id} className="admin-review-player-card" style={{'--team-color':teamColor}} onClick={()=>openPlayerReview(player.id,mismatch?.session.id || null)}>
                      <span className="admin-review-card-header"><span className="player-name-tag">{player.name}</span><span className="team-chip">{player.team}</span></span>
                      <span className="admin-review-card-state" style={{color}}><i style={{background:color}}/>{state}{mismatch?` · ${mismatch.session.stages?.name || ''} / ${mismatch.session.type.toUpperCase()}`:''}</span>
                      <span className="admin-review-card-points">{credited}<small> балів</small></span>
                    </button>
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
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

          <div className="section-label">Гравці</div>
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
      {tab === 'qualifying' && (
        <section className="admin-plan-card">
          <header className="admin-plan-heading">
            <div><div className="admin-plan-kicker">КВАЛІФІКАЦІЙНІ СЛОТИ</div><h2>План на етап</h2></div>
          </header>
          <div className="admin-plan-table-wrap">
            <table className="admin-plan-table">
              <thead><tr><th>Гравець</th><th>Вільні пілоти</th>{qualifyingPlanStages.map(stage=><th key={stage.order}>{stage.label}</th>)}<th>Не використано</th></tr></thead>
              <tbody>{qualifyingPlanRows.sort((a,b)=>a.player.name.localeCompare(b.player.name,'uk')).map(({player,available,plan,remaining})=>(
                <tr key={player.id}><td><strong>{player.name}</strong></td><td>{available}</td>{qualifyingPlanStages.map(stage=><td key={stage.order}><b>{plan[stage.order]||0}</b></td>)}<td className={remaining?'plan-remaining':'plan-complete'}>{remaining}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'reserves' && (
        <section className="reserve-admin-section">
          <header className="reserve-admin-heading">
            <div><div className="admin-plan-kicker">ЗАМІНИ НА ОКРЕМИЙ ГП</div><h2>Резервісти</h2></div>
            <label className="reserve-stage-select"><span>Етап</span>
              <select className="reserve-select" value={subStageId} onChange={event=>{setSubStageId(event.target.value);setSubTeam('');setSubOutgoing('')}}><option value="">Оберіть ГП</option>{stages.filter(stage=>Number(stage.sort_order)>=10).map(stage=><option key={stage.id} value={stage.id}>{stage.flag} {stage.name}</option>)}</select>
            </label>
          </header>
          {subOutgoing&&<div className="reserve-pending-note">Обрано заміну: <b>{subOutgoing}</b> · натисни резервіста в тому самому рядку.</div>}
          <div className="reserve-table-wrap">
            <table className="reserve-table">
              <thead><tr><th>Команда</th><th>Пілот</th><th>Пілот</th><th>Резервіст</th></tr></thead>
              <tbody>{PILOT_TEAM_ROSTER.map(row=>{
                const displayDrivers=row.team==='Mercedes'?[...row.drivers].reverse():row.drivers
                const teamChanges=pilotChanges.filter(change=>change.stage_id===subStageId&&change.team_name===row.team&&change.is_active)
                const current=teamChanges[0]
                const replaced=new Set(teamChanges.map(change=>change.outgoing_driver))
                const activeReserveNames=new Set(pilotChanges.filter(change=>change.stage_id===subStageId&&change.is_active).map(change=>change.incoming_driver))
                return <tr key={row.team}>
                  <th scope="row" className="reserve-team-name">{row.team}</th>
                  {displayDrivers.map(driver=>{
                    const active=!replaced.has(driver)
                    const pending=subTeam===row.team&&subOutgoing===driver
                    return <td key={driver}><button type="button" className={`reserve-driver-button ${active?'is-active':'is-inactive'}${pending?' is-pending':''}`} onClick={()=>toggleReserveDriver(row,driver,teamChanges)} disabled={!subStageId} aria-pressed={active}>
                      <span>{driver}</span><small>{pending?'ОБРАНО НА ЗАМІНУ':active?'АКТИВНИЙ':'ЗАМІНЕНИЙ'}</small>
                    </button></td>
                  })}
                  <td><div className="reserve-pilot-options">{(TEAM_RESERVE_PILOTS_2026[row.team]||[]).map(driver=>{
                    const active=current?.incoming_driver===driver
                    const unavailable=activeReserveNames.has(driver)&&!active
                    return <button type="button" key={driver} className={`reserve-driver-button reserve-option ${active?'is-active':'is-inactive'}`} onClick={()=>active?toggleReserveDriver(row,driver,teamChanges):toggleReserveDriver(row,driver,teamChanges)} disabled={!subStageId||unavailable} aria-pressed={active}>
                      <span>{driver}</span><small>{active?'АКТИВНИЙ':unavailable?'ЗАЙНЯТИЙ':'РЕЗЕРВ'}</small>
                    </button>
                  })}</div></td>
                </tr>
              })}</tbody>
            </table>
          </div>
          <div className="reserve-legend"><span><i className="is-active"/>Активний склад</span><span><i className="is-inactive"/>Неактивний</span><span>Натисни стартового пілота, потім резервіста.</span></div>
        </section>
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

      {reviewPlayerId && (
        <div role="dialog" aria-modal="true" aria-label={`Калькулятор перевірки ${activeReviewPlayer?.name || ''}`} className="manual-review-backdrop">
          <div className="manual-review-modal">
            <div className="manual-review-heading">
              <div><div className="section-label">КАЛЬКУЛЯТОР ПЕРЕВІРКИ</div><h2>{activeReviewPlayer?.name}</h2></div>
              <button aria-label="Закрити" className="btn btn-ghost" onClick={()=>{setReviewPlayerId('');setReviewDraft(null)}}>✕</button>
            </div>
            <div className="manual-review-layout">
              <aside className="manual-review-totals">
                <span className="manual-review-caption">РУЧНИЙ ПІДСУМОК</span>
                <strong>{activeReviewRunTotal}</strong><small>балів перевірено</small>
                <div className="manual-review-divider" />
                <span className="manual-review-caption">ФІНАЛЬНИЙ У БАЗІ</span>
                <b>{Number(activeReviewPlayer?.base_pts)||0}</b><small>балів</small>
                <div className={`manual-review-delta ${activeReviewRunTotal===(Number(activeReviewPlayer?.base_pts)||0)?'is-match':'is-different'}`}>
                  {activeReviewComplete
                    ? activeReviewRunTotal===(Number(activeReviewPlayer?.base_pts)||0)?'ЗБІГАЄТЬСЯ':`РІЗНИЦЯ ${activeReviewRunTotal-(Number(activeReviewPlayer?.base_pts)||0)>0?'+':''}${activeReviewRunTotal-(Number(activeReviewPlayer?.base_pts)||0)}`
                    : `ПЕРЕВІРЕНО ${activeReviewQueue.filter(item=>isReviewItemApproved(item,reviewPlayerId)).length}/${activeReviewQueue.length}`}
                </div>
              </aside>
              <div className="manual-review-work">
                {activeReviewItem&&reviewInput ? <>
                  <div className="manual-review-stage">
                    <b>{activeReviewItem.session.stages?.flag} {activeReviewItem.session.stages?.name}</b>
                    <span>{String(activeReviewItem.session.type).toUpperCase()} · {reviewIndex+1}/{activeReviewQueue.length}</span>
                    <small>Факт: {resultsList(normalizeStageResults(activeReviewItem.session.results||{},activeReviewChanges)).join(' · ')||'результат не внесено'}</small>
                  </div>
                  {activeReviewItem.missed ? <div className="manual-review-missed">Прогнозу немає · у ручній звірці це 0 балів.</div> : <PlayerCard
                    key={`${activeReviewItem.session.id}:${reviewPlayerId}`}
                    player={activeReviewPlayer}
                    teamColor={TEAM_META[activeReviewPlayer?.team]?.color||'#888'}
                    sessionType={activeReviewItem.session.type}
                    session={activeReviewItem.session}
                    forecast={activeReviewItem.kind==='forecast'?activeReviewItem.row:null}
                    qualAssign={activeReviewItem.kind==='qual'?activeReviewItem.row:null}
                    results={resultsList(normalizeStageResults(activeReviewItem.session.results||{},activeReviewChanges))}
                    flResult={normalizeStageDriver(activeReviewItem.session.fl_pilot||'',activeReviewChanges)}
                    ovResult={String(activeReviewItem.session.ov_pilot||'').split(/[,;|]/).map(value=>normalizeStageDriver(value.trim(),activeReviewChanges)).filter(Boolean).join(', ')}
                    isAdmin isLocked={false} stageKey={activeReviewItem.session.stages?.key} stageOrder={activeReviewStageOrder}
                    allQualAssign={activeReviewAllQualAssignments} allQualPlayerTeams={activeReviewQualPlayerTeams} driverOptions={activeReviewPilots} pilotSubstitutions={activeReviewChanges}
                    forecastHidden={false} qualSlotCount={activeReviewQualSlots} editorOnly saveDelay={0}
                    onSaveForecast={(predictions,fl,ov)=>persistReviewedForecast(activeReviewItem,predictions,fl,ov)}
                    onSaveQual={(pilots,positions)=>persistReviewedQual(activeReviewItem,pilots,positions)}
                    onSavePolePick={pilot=>persistReviewedPole(activeReviewItem,pilot)}
                  />}
                  {activeReviewItem.session.type==='race'&&activeReviewItem.missed&&<div className="manual-review-bonus-note"><b>Бонус новачка</b> · {activeReviewBonus?.eligible?`мінімум за гонку ${activeReviewBonus.minimum??'—'} балів${activeReviewBonus.recorded!=null?` · уже записано +${activeReviewBonus.recorded}`:''}`:'за пропуск після першого прогнозу не дається.'}</div>}
                  <div className="manual-review-score">За цей крок: <b>{activeReviewScore?.score??0}</b> балів{activeReviewState.bonusIncluded&&activeReviewBonus?.points!=null?` · бонус у звірці +${activeReviewBonus.points}`:''}</div>
                  <div className="manual-review-navigation">
                    <button className="btn btn-ghost" disabled={reviewIndex===0} onClick={moveReviewBack}>← НАЗАД</button>
                    <div className="manual-review-center-controls">
                      {activeReviewItem.missed&&<button type="button" className={`btn ${activeReviewState.absenceConfirmed?'btn-red':'btn-ghost'}`} onClick={()=>confirmReviewAbsence(activeReviewItem)}>{activeReviewState.absenceConfirmed?'ВІДСУТНІСТЬ ✓':'ПІДТВЕРДИТИ ВІДСУТНІСТЬ'}</button>}
                      {activeReviewItem.session.type==='race'&&activeReviewItem.missed&&<button type="button" className={`btn ${activeReviewState.bonusIncluded?'btn-red':'btn-ghost'}`} disabled={!activeReviewBonus?.ready||!activeReviewBonus?.eligible||activeReviewBonus.points==null} onClick={()=>toggleReviewBonus(activeReviewItem)}>{activeReviewState.bonusIncluded?'БОНУС ✓':`БОНУС НОВАЧКА +${activeReviewBonus?.points??'—'}`}</button>}
                    </div>
                    <button className="btn btn-red" disabled={activeReviewItem.missed&&!activeReviewState.absenceConfirmed} onClick={approveReviewStep}>ДАЛІ →</button>
                  </div>
                </> : activeReviewComplete ? <div className="manual-review-finish">
                  <h3>Звірку завершено</h3>
                  <p>Ручний підсумок: <b>{activeReviewRunTotal}</b> · у базі: <b>{Number(activeReviewPlayer?.base_pts)||0}</b></p>
                  <strong className={activeReviewRunTotal===(Number(activeReviewPlayer?.base_pts)||0)?'is-match':'is-different'}>
                    {activeReviewRunTotal===(Number(activeReviewPlayer?.base_pts)||0)?'БАЛИ ЗБІГАЮТЬСЯ':`РІЗНИЦЯ ${activeReviewRunTotal-(Number(activeReviewPlayer?.base_pts)||0)>0?'+':''}${activeReviewRunTotal-(Number(activeReviewPlayer?.base_pts)||0)}`}
                  </strong>
                  <small>Калькулятор не змінює прогнози, бонуси чи підсумкові бали в базі.</small>
                  <div className="manual-review-finish-actions"><button className="btn btn-ghost" onClick={moveReviewBack}>← ДО ОСТАННЬОЇ СЕСІЇ</button><button className="btn btn-ghost" onClick={()=>{setReviewPlayerId('');setReviewDraft(null)}}>ЗАКРИТИ</button></div>
                </div> : <div className="manual-review-finish"><p>Для цього гравця немає зарахованих сесій.</p><button className="btn btn-ghost" onClick={()=>setReviewPlayerId('')}>ЗАКРИТИ</button></div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const reviewInputStyle={display:'block',width:'100%',boxSizing:'border-box',marginTop:4,padding:'8px 9px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:4,color:'var(--text)',fontSize:12}

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
