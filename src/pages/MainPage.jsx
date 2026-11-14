import { useState, useEffect, useCallback } from 'react'
import { supabase, IS_PREVIEW_DEPLOYMENT, PILOTS, DOUBLE_STAGES, calcRaceScore, calcQualAssignmentScore, calcSprintScore, TEAM_META, USED_PILOTS, qualifyingSlotsForStage } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PlayerCard, { FormIndicator, loadFormData } from '../components/PlayerCard'
import DragResults from '../components/DragResults'
import { buildStagePilotPool, normalizeStageDriver, normalizeStageResults, priorQualAssignments, newcomerPlayersForStage } from '../lib/roster'
import { calculateNewcomerBonuses } from '../lib/standings'
import { resultsList } from '../lib/scoring'
import { rememberPreviewDraft } from '../lib/previewDrafts'
import { archiveSessionsForStage, archiveForecastsForSession, archiveQualifyingForSession, ARCHIVE_PREVIEW } from '../lib/archivePreview'

const TEAM_COLORS = Object.fromEntries(Object.entries(TEAM_META).map(([k,v]) => [k, v.color]))

export default function MainPage() {
  const { player: me, isAdmin, user } = useAuth()
  const [stages,    setStages]    = useState([])
  const [players,   setPlayers]   = useState([])
  const [formData,  setFormData]  = useState({})
  const [sessions,  setSessions]  = useState({})
  const [forecasts, setForecasts] = useState({})
  const [qualAssign,setQualAssign]= useState({})
  const [qualHistory, setQualHistory] = useState([])
  const [stagePilotChanges, setStagePilotChanges] = useState([])
  const stagePilotOptions = buildStagePilotPool(stagePilotChanges)
  const [stageKey,  setStageKey]  = useState('')
  const [sessionType, setSessionType] = useState('race')
  const [loading,   setLoading]   = useState(true)
  const [commitMsg, setCommitMsg] = useState('')
  const [committing,setCommitting]= useState(false)
  const [recalculatingStage,setRecalculatingStage] = useState(false)
  const [stageRecalcReport,setStageRecalcReport] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('players').select('*').order('name'),
    ]).then(([s, p]) => {
      const stagesData = (s.data || [])
      const playersData = p.data || []
      setStages(stagesData)
      setPlayers(playersData)
      const active = stagesData.filter(st => Number(st.sort_order) >= 10 && !st.is_archived)
      const firstOpen = active.find(st => !st.is_locked) || active[0]
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
    if (Number(stage.sort_order) < 10) {
      setStagePilotChanges([])
      supabase.from('sessions').select('*').eq('stage_id',stage.id).then(({data,error})=>{
        if (error) { setCommitMsg(`Не вдалося завантажити сесії ${stage.name}: ${error.message}`); return }
        if (data?.length) {
          const map = Object.fromEntries(data.map(session=>[session.type,session]))
          setSessions(map)
          setSessionType(['race','sprint','qual'].find(type=>map[type]&&!map[type].committed)||'race')
        } else {
          const archiveMap = Object.fromEntries(archiveSessionsForStage(stage.key,stage.id).map(session=>[session.type,session]))
          setSessions(archiveMap)
          setSessionType(['race','sprint','qual'].find(type=>archiveMap[type])||'race')
        }
      })
      return
    }
    supabase.from('stage_pilot_substitutions').select('*').eq('stage_id', stage.id).eq('is_active', true)
      .order('created_at').then(({ data, error }) => {
        if (error) { setStagePilotChanges([]); return }
        setStagePilotChanges(data || [])
      })
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
    if (session.archive_preview) {
      setForecasts(Object.fromEntries(archiveForecastsForSession(session.id).map(row => [row.player_id, row])))
      setQualAssign(Object.fromEntries(archiveQualifyingForSession(session.id).map(row => [row.player_id, row])))
      return
    }
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

  useEffect(() => {
    const session = sessions[sessionType]
    if (!session) return
    if (session.archive_preview) { setQualHistory([]); return }
    const stageOrder = stages.find(stage => stage.key === stageKey)?.sort_order
    supabase.from('qual_assignments').select('id,session_id,player_id,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3,sessions(stages(sort_order))')
      .then(({data}) => setQualHistory(priorQualAssignments(data, session.id, stageOrder)))
  }, [sessions, sessionType, stages, stageKey])

  const allQualAssignments = Object.fromEntries([
    ...qualHistory.map((row,index) => [`history_${index}`, row]),
    ...Object.entries(qualAssign),
  ])
  const allQualPlayerTeams=Object.fromEntries(players.map(player=>[player.id,player.team]))
  const qualSlotsByPlayer = Object.fromEntries(players.map(player => {
    const used = new Set(USED_PILOTS[player.name] || [])
    qualHistory.filter(row => row.player_id === player.id).forEach(row => {
      for (const pilot of [row.pilot_1,row.pilot_2,row.pilot_3]) if (pilot) used.add(pilot)
    })
    const available = stagePilotOptions.filter(pilot => !used.has(pilot)).length
    return [player.id, qualifyingSlotsForStage(available, stages.find(stage => stage.key === stageKey)?.sort_order)]
  }))

  const navigationStages = stages.filter(stage => Number(stage.sort_order) < 10 || !stage.is_archived)
  const currentStage   = stages.find(s => s.key === stageKey)
  const currentSession = sessions[sessionType]
  const currentStageIndex = navigationStages.findIndex(stage => stage.key === stageKey)
  function moveStage(step) {
    const nextStage = navigationStages[currentStageIndex + step]
    if (nextStage) {
      setStageRecalcReport(null)
      setStageKey(nextStage.key)
    }
  }

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

  const normalizedResults = normalizeStageResults(currentSession?.results || {}, stagePilotChanges)
  const currentResultsList = Object.entries(normalizedResults).sort(([a],[b]) => Number(a)-Number(b)).map(([,pilot]) => pilot)
  const normalizedFlResult = normalizeStageDriver(currentSession?.fl_pilot || '', stagePilotChanges)
  const normalizedOvResult = String(currentSession?.ov_pilot || '').split(/[,;|]/).map(p=>normalizeStageDriver(p.trim(), stagePilotChanges)).filter(Boolean).join(', ')
  const effectiveSession = currentSession ? { ...currentSession, results:normalizedResults, fl_pilot:normalizedFlResult, ov_pilot:normalizedOvResult } : currentSession

  async function saveResults(results, fl, ov) {
    if (!currentSession || currentSession.archive_preview) { setCommitMsg('Це локальна копія без запису в базу. Спершу відновіть архівні сесії в Supabase.'); return }
    const update = { results }
    if (fl !== undefined) update.fl_pilot = fl
    if (ov !== undefined) update.ov_pilot = ov
    const { data, error } = await supabase.from('sessions')
      .update(update).eq('id', currentSession.id).select().single()
    if (error) { setCommitMsg(`⚠ Не вдалося зберегти результати: ${error.message}`); return }
    if (data) {
      setSessions(prev => ({ ...prev, [sessionType]: data }))
      await supabase.from('audit_log').insert({ action:'save_results', actor:me?.name || user?.email || 'Адміністратор', details:{ stage:stageKey, stage_name:currentStage?.name, type:sessionType, session_id:currentSession.id, previous:{results:currentSession.results,fl_pilot:currentSession.fl_pilot,ov_pilot:currentSession.ov_pilot}, next:{results,fl_pilot:fl,ov_pilot:ov}, actor_name:me?.name || null, actor_email:user?.email || null, actor_user_id:user?.id || null } })
      if (ov !== undefined) setCommitMsg('✓ Прорив збережено')
    }
  }

  async function saveForecast(playerId, preds, fl, ov) {
    if (!currentSession || currentSession.archive_preview) { setCommitMsg('Архівний preview доступний лише для читання, доки його не відновлено в Supabase.'); return }
    const predsObj = {}
    preds.forEach((p, i) => { if (p) predsObj[i+1] = p })
    if (IS_PREVIEW_DEPLOYMENT) {
      const draft = { ...(forecasts[playerId] || {}), id:forecasts[playerId]?.id || `preview-${currentSession.id}-${playerId}`, session_id:currentSession.id, player_id:playerId, predictions:predsObj, fl_pick:fl || '', ov_pick:ov || '', preview_draft:true }
      setForecasts(prev => ({...prev,[playerId]:draft}))
      rememberPreviewDraft('forecasts',draft)
      setCommitMsg('🧪 Прогноз змінено лише в цьому прев’ю; сухий прогін сезону врахує цю чернетку, робоча база не змінюється.')
      return
    }
    const { data, error } = await supabase.from('forecasts').upsert({
      session_id: currentSession.id,
      player_id:  playerId,
      predictions: predsObj,
      fl_pick: fl || '',
      ov_pick: ov || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id,player_id' }).select().single()
    if (error) { setCommitMsg(`⚠ Не вдалося зберегти прогноз: ${error.message}`); return }
    if (data) setForecasts(prev => ({ ...prev, [playerId]: data }))
  }

  async function savePolePick(playerId, pilot) {
    if (!currentSession || currentSession.archive_preview) { setCommitMsg('Архівний preview доступний лише для читання, доки його не відновлено в Supabase.'); return }
    if (IS_PREVIEW_DEPLOYMENT) {
      const draft = {...(qualAssign[playerId]||{}),id:qualAssign[playerId]?.id || `preview-${currentSession.id}-${playerId}`,session_id:currentSession.id,player_id:playerId,pole_pick:pilot || '',preview_draft:true}
      setQualAssign(prev => ({...prev,[playerId]:draft}))
      rememberPreviewDraft('qual_assignments',draft)
      setCommitMsg('🧪 Прогноз змінено лише в цьому прев’ю; сухий прогін сезону врахує цю чернетку, робоча база не змінюється.')
      return
    }
    const { data, error } = await supabase.from('qual_assignments').upsert({
      session_id: currentSession.id,
      player_id: playerId,
      pole_pick: pilot || null,
    }, { onConflict: 'session_id,player_id' }).select().single()
    if (error) { setCommitMsg(`Не вдалося зберегти прогноз на поул: ${error.message}`); return }
    setQualAssign(prev => ({ ...prev, [playerId]: data }))
  }

  async function saveQualAssign(playerId, pilots, positions) {
    if (!currentSession || currentSession.archive_preview) { setCommitMsg('Архівний preview доступний лише для читання, доки його не відновлено в Supabase.'); return }
    if (IS_PREVIEW_DEPLOYMENT) {
      const draft = {...(qualAssign[playerId]||{}),id:qualAssign[playerId]?.id || `preview-${currentSession.id}-${playerId}`,session_id:currentSession.id,player_id:playerId,pilot_1:pilots[0]||'',pilot_2:pilots[1]||'',pilot_3:pilots[2]||'',pred_pos_1:positions[0]||null,pred_pos_2:positions[1]||null,pred_pos_3:positions[2]||null,preview_draft:true}
      setQualAssign(prev => ({...prev,[playerId]:draft}))
      rememberPreviewDraft('qual_assignments',draft)
      setCommitMsg('🧪 Прогноз змінено лише в цьому прев’ю; сухий прогін сезону врахує цю чернетку, робоча база не змінюється.')
      return
    }
    const { data, error } = await supabase.from('qual_assignments').upsert({
      session_id: currentSession.id, player_id: playerId,
      pilot_1: pilots[0]||'', pilot_2: pilots[1]||'', pilot_3: pilots[2]||'',
      pred_pos_1: positions[0]||null, pred_pos_2: positions[1]||null, pred_pos_3: positions[2]||null,
    }, { onConflict: 'session_id,player_id' }).select().single()
    if (error) { setCommitMsg(`⚠ Не вдалося зберегти пілота кваліфікації: ${error.message}`); return }
    if (data) setQualAssign(prev => ({ ...prev, [playerId]: data }))
  }

  // ── COMMIT INLINE ──
  async function handleCommit() {
    if (!currentSession || currentSession.archive_preview) return
    if (!window.confirm(`Зарахувати бали за ${currentStage?.name} — ${sessionType.toUpperCase()}?\nЦе заблокує сесію назавжди.`)) return
    setCommitting(true)
    try {
      const normalized = normalizeStageResults(currentSession.results || {}, stagePilotChanges)
      const results   = Object.entries(normalized).sort((a,b)=>+a[0]-+b[0]).map(([,v])=>v)
      const flResult  = normalizeStageDriver(currentSession.fl_pilot || '', stagePilotChanges)
      const ovResult  = String(currentSession.ov_pilot || '').split(/[,;|]/).map(p=>normalizeStageDriver(p.trim(), stagePilotChanges)).filter(Boolean).join(', ')
      const forecastsResult = await supabase.from('forecasts').select('*, players(id,name,base_pts)').eq('session_id', currentSession.id)
      const qualResult = await supabase.from('qual_assignments').select('*, players(id,name,base_pts)').eq('session_id', currentSession.id)
      if (forecastsResult.error) throw forecastsResult.error
      if (qualResult.error) throw qualResult.error
      const forecasts_ = forecastsResult.data
      const qualData = qualResult.data

      const beforeResult = await supabase.from('players').select('id,base_pts').order('base_pts',{ascending:false})
      if (beforeResult.error) throw beforeResult.error
      const beforeSnap = beforeResult.data
      const rankBefore = {}
      ;(beforeSnap||[]).forEach((p,i) => { rankBefore[p.id] = i+1 })

      const updates = []
      const forecastScores = []
      const qualScores = []
      const bdLog   = []

      if (sessionType === 'race') {
        for (const f of (forecasts_||[])) {
          const preds = Array.from({length:10}, (_,i) => normalizeStageDriver(f.predictions?.[i+1]||'', stagePilotChanges))
          const { total, breakdown } = calcRaceScore(preds, normalizeStageDriver(f.fl_pick, stagePilotChanges), normalizeStageDriver(f.ov_pick, stagePilotChanges), results, flResult, ovResult, currentStage?.sort_order)
          updates.push({ id: f.players?.id, delta: total-(Number(f.score)||0) })
          forecastScores.push({ id:f.id, score:total, score_breakdown:breakdown })
          bdLog.push({ player: f.players?.name, score: total })
        }
      } else if (sessionType === 'qual') {
        for (const qa of (qualData||[])) {
          const normalized = {
            ...qa,
            pole_pick:normalizeStageDriver(qa.pole_pick,stagePilotChanges),
            pilot_1:normalizeStageDriver(qa.pilot_1,stagePilotChanges),
            pilot_2:normalizeStageDriver(qa.pilot_2,stagePilotChanges),
            pilot_3:normalizeStageDriver(qa.pilot_3,stagePilotChanges),
          }
          const { total, breakdown } = calcQualAssignmentScore(normalized, results, currentStage?.sort_order, currentStage?.key)
          updates.push({ id: qa.players?.id, delta: total-(Number(qa.score)||0) })
          qualScores.push({ id:qa.id, score:total })
          bdLog.push({ player: qa.players?.name, score: total, breakdown })
        }
      } else if (sessionType === 'sprint') {
        for (const f of (forecasts_||[])) {
          const sprintSlots = 5
          const preds = Array.from({length:sprintSlots}, (_,i) => normalizeStageDriver(f.predictions?.[i+1]||'', stagePilotChanges))
          const { total, breakdown } = calcSprintScore(preds, results, currentStage?.sort_order, normalizeStageDriver(f.fl_pick,stagePilotChanges), normalizedFlResult)
          updates.push({ id: f.players?.id, delta: total-(Number(f.score)||0) })
          forecastScores.push({ id:f.id, score:total, score_breakdown:breakdown })
          bdLog.push({ player: f.players?.name, score: total })
        }
      }

      // One database transaction replaces scored rows, updates score deltas, and locks the session.
      const { error: applyError } = await supabase.rpc('apply_session_scores', {
        p_session_id: currentSession.id,
        p_forecast_scores: forecastScores,
        p_qual_scores: qualScores,
        p_is_recalculation: Boolean(currentSession.committed),
      })
      if (applyError) throw applyError

      const afterResult = await supabase.from('players').select('id,base_pts').order('base_pts',{ascending:false})
      if (afterResult.error) throw afterResult.error
      const afterSnap = afterResult.data
      const rankAfter = {}
      ;(afterSnap||[]).forEach((p,i) => { rankAfter[p.id] = i+1 })
      for (const u of updates) {
        const before = rankBefore[u.id]||0, after = rankAfter[u.id]||0
        await supabase.from('players').update({ last_rank_delta: before - after }).eq('id', u.id)
      }

      const { error: lockError } = await supabase.from('sessions').update({ is_locked:true, committed:true, committed_at:new Date().toISOString() }).eq('id',currentSession.id)
      if (lockError) throw lockError
      await supabase.from('audit_log').insert({ action:'commit_session', actor:me?.name || user?.email || 'Адміністратор', details:{ stage:currentStage?.name, type:sessionType, scores:bdLog, actor_name:me?.name || null, actor_email:user?.email || null, actor_user_id:user?.id || null } })

      setSessions(prev => ({ ...prev, [sessionType]: { ...prev[sessionType], is_locked:true, committed:true } }))
      setCommitMsg(`✓ Зараховано! ${bdLog.map(b=>`${b.player}:+${b.score}`).join(' · ')}`)
      loadFormData(players).then(setFormData)
    } catch(e) {
      setCommitMsg(`⚠ Помилка: ${e.message}`)
    } finally {
      setCommitting(false)
    }
  }

  async function recalculateCurrentStage() {
    if (!isAdmin || !currentStage || currentSession?.archive_preview) return
    const { data:stageSessions, error:sessionError } = await supabase.from('sessions').select('*').eq('stage_id',currentStage.id)
    if (sessionError) { setCommitMsg(`⚠ ${sessionError.message}`); return }
    if (!stageSessions?.length || stageSessions.some(session=>!session.committed) || !stageSessions.some(session=>session.type==='race')) {
      setCommitMsg('⚠ Для перерахунку потрібні збережені сесії ГП, і всі вони мають бути зараховані.')
      return
    }
    const actionMessage = IS_PREVIEW_DEPLOYMENT
      ? `Виконати сухий прогін ${currentStage.name}? Перерахую бали локально для перевірки; робочу базу та прогнози не змінюватиму.`
      : `Перерахувати ${currentStage.name}? Збережені бали буде замінено; це не змінить прогнози.`
    if (!window.confirm(actionMessage)) return
    setStageRecalcReport(null)
    setRecalculatingStage(true)
    let recalcPhase = 'завантаження прогнозів і реальних результатів'
    try {
      const ids = stageSessions.map(session=>session.id)
      const [forecastResult,qualResult,changesResult] = await Promise.all([
        supabase.from('forecasts').select('id,player_id,session_id,score,predictions,fl_pick,ov_pick').in('session_id',ids),
        supabase.from('qual_assignments').select('id,player_id,session_id,score,pole_pick,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id',ids),
        supabase.from('stage_pilot_substitutions').select('*').eq('stage_id',currentStage.id).eq('is_active',true),
      ])
      if (forecastResult.error) throw forecastResult.error
      if (qualResult.error) throw qualResult.error
      if (changesResult.error) throw changesResult.error
      const historySessionsResult=await supabase.from('sessions').select('id,stage_id,type,committed,stages(sort_order)').eq('type','race').eq('committed',true)
      if(historySessionsResult.error) throw historySessionsResult.error
      const historySessionIds=(historySessionsResult.data||[]).map(session=>session.id)
      const historyForecastResult=historySessionIds.length
        ? await supabase.from('forecasts').select('id,player_id,session_id,predictions,fl_pick,ov_pick').in('session_id',historySessionIds)
        : {data:[],error:null}
      if(historyForecastResult.error) throw historyForecastResult.error
      const changes=changesResult.data||[]
      const mergePreviewRows=(saved,drafts)=>{
        const rows=new Map((saved||[]).map(row=>[`${row.session_id}:${row.player_id}`,row]))
        if(IS_PREVIEW_DEPLOYMENT) Object.values(drafts||{}).filter(row=>ids.includes(row.session_id)).forEach(row=>rows.set(`${row.session_id}:${row.player_id}`,{...rows.get(`${row.session_id}:${row.player_id}`),...row}))
        return [...rows.values()]
      }
      const forecasts_=mergePreviewRows(forecastResult.data,forecasts), assignments=mergePreviewRows(qualResult.data,qualAssign)
      const scoreRows=[], raceRows=[]
      const report=stageSessions.map(session=>{
        recalcPhase = `${session.type.toUpperCase()}: нормалізація результатів`
        const resultObject=normalizeStageResults(session.results||{},changes),results=resultsList(resultObject)
        const required=session.type==='qual'?(Number(currentStage.sort_order)<7?1:3):session.type==='sprint'?5:10
        const positions=Object.keys(resultObject).map(Number).sort((a,b)=>a-b)
        if (results.length<required||!positions.slice(0,required).every((position,index)=>position===index+1)) throw new Error(`${session.type.toUpperCase()}: немає ${required} послідовних результатів.`)
        const fastLap=normalizeStageDriver(session.fl_pilot||'',changes)
        const overtake=String(session.ov_pilot||'').split(/[,;|]/).map(p=>normalizeStageDriver(p.trim(),changes)).filter(Boolean).join(', ')
        if(session.type==='qual'){
          recalcPhase = 'КВАЛІФІКАЦІЯ: читання прогнозів'
          const rows=assignments.filter(row=>row.session_id===session.id).map(row=>{
            const playerName = players.find(player=>player.id===row.player_id)?.name || row.player_id
            recalcPhase = `КВАЛІФІКАЦІЯ: розрахунок прогнозу ${playerName}`
            const normalized={...row,pole_pick:normalizeStageDriver(row.pole_pick,changes),pilot_1:normalizeStageDriver(row.pilot_1,changes),pilot_2:normalizeStageDriver(row.pilot_2,changes),pilot_3:normalizeStageDriver(row.pilot_3,changes)}
            const {total}=calcQualAssignmentScore(normalized,results,currentStage.sort_order,currentStage.key)
            return {id:row.id,player_id:row.player_id,score:total,scored_input:{pole_pick:normalized.pole_pick || '',pilot_1:normalized.pilot_1,pred_pos_1:row.pred_pos_1,pilot_2:normalized.pilot_2,pred_pos_2:row.pred_pos_2,pilot_3:normalized.pilot_3,pred_pos_3:row.pred_pos_3}}
          })
          scoreRows.push({session_id:session.id,forecast_scores:[],qual_scores:rows.map(({player_id,...row})=>row)})
          return {type:session.type,scores:rows.map(row=>({player:players.find(p=>p.id===row.player_id)?.name||'—',points:row.score}))}
        }
        recalcPhase = `${session.type.toUpperCase()}: читання прогнозів`
        const rows=forecasts_.filter(row=>row.session_id===session.id).map(row=>{
          const playerName = players.find(player=>player.id===row.player_id)?.name || row.player_id
          recalcPhase = `${session.type.toUpperCase()}: розрахунок прогнозу ${playerName}`
          const size=session.type==='sprint'?5:10,predictions=Array.from({length:size},(_,i)=>normalizeStageDriver(row.predictions?.[i+1]||'',changes))
          const calculated=session.type==='sprint'?calcSprintScore(predictions,results):calcRaceScore(predictions,normalizeStageDriver(row.fl_pick,changes),normalizeStageDriver(row.ov_pick,changes),results,fastLap,overtake,currentStage.sort_order)
          const scoredInput={predictions:Object.fromEntries(predictions.map((pilot,index)=>[index+1,pilot]).filter(([,pilot])=>pilot)),fl_pick:normalizeStageDriver(row.fl_pick,changes)}
          if(session.type==='race') scoredInput.ov_pick=normalizeStageDriver(row.ov_pick,changes)
          const scored={id:row.id,score:calculated.total,score_breakdown:calculated.breakdown,scored_input:scoredInput}
          if(session.type==='race')raceRows.push({...row,...scored})
          return {...scored,player_id:row.player_id}
        })
        scoreRows.push({session_id:session.id,forecast_scores:rows.map(({player_id,...row})=>row),qual_scores:[]})
        return {type:session.type,scores:rows.map(row=>({player:players.find(p=>p.id===row.player_id)?.name||'—',points:row.score}))}
      })
      recalcPhase = 'БОНУС НОВАЧКА: перевірка мінімуму за гонку'
      const historyForecasts=[...(historyForecastResult.data||[]).filter(row=>!raceRows.some(current=>current.id===row.id)),...raceRows]
      const eligible=newcomerPlayersForStage(players,Number(currentStage.sort_order),historySessionsResult.data||[],historyForecasts).map(player=>player.id)
      const bonus=calculateNewcomerBonuses(players,stageSessions,raceRows,[],eligible)
      if(!bonus.ready) throw new Error('Не вдалося визначити бонус новачка за гонку.')
      if (IS_PREVIEW_DEPLOYMENT) {
        setStageRecalcReport({stageName:currentStage.name,report,newcomerBonusMinimum:bonus.minimum,dryRun:true})
        setCommitMsg(`🧪 Сухий прогін ${currentStage.name} завершено. Бали розраховано для перевірки, але в базу не записано.`)
        return
      }
      recalcPhase = 'атомарне збереження балів цього ГП'
      const {error}=await supabase.rpc('apply_stage_scores',{p_stage_id:currentStage.id,p_session_scores:scoreRows,p_newcomer_bonuses:bonus.bonuses,p_newcomer_minimum:bonus.minimum})
      if(error) throw error
      recalcPhase = 'запис журналу й підсумкового звіту'
      const {error:auditError}=await supabase.from('audit_log').insert({action:'recalculate_stage',actor:me?.name||user?.email||'Адміністратор',details:{stage:currentStage.key,stage_name:currentStage.name,report,newcomer_bonus_minimum:bonus.minimum,actor_name:me?.name||null,actor_email:user?.email||null,actor_user_id:user?.id||null}})
      if(auditError) console.error('Не вдалося записати звіт перерахунку в журнал:',auditError)
      setStageRecalcReport({stageName:currentStage.name,report,newcomerBonusMinimum:bonus.minimum})
      setCommitMsg(`✓ ${currentStage.name}: перераховано; нижче доступний звіт по кожній сесії та гравцю.`)
      loadFormData(players).then(setFormData)
    } catch(error) {
      console.error(`Перерахунок ${currentStage.name}: помилка на етапі «${recalcPhase}»`,error)
      setCommitMsg(`⚠ Перерахунок ${currentStage.name} скасовано на етапі «${recalcPhase}»: ${error.message||error}`)
    }
    finally { setRecalculatingStage(false) }
  }

  const teamGroups = {}
  players.forEach(p => {
    if (!teamGroups[p.team]) teamGroups[p.team] = []
    teamGroups[p.team].push(p)
  })

  const availableSessions = ['sprint','qual','race'].filter(type => Boolean(sessions[type]) || (type === 'sprint' && currentStage?.has_sprint))

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2}}>ЗАВАНТАЖЕННЯ...</div></main>

  return (
    <main>
      {/* Stage + Session bar */}
      <div className="stage-bar">
        <div className="stage-stepper" aria-label="Перемикання етапів">
          <button type="button" aria-label="Попередній етап" disabled={currentStageIndex <= 0} onClick={() => moveStage(-1)}>▲</button>
          <button type="button" aria-label="Наступний етап" disabled={currentStageIndex < 0 || currentStageIndex >= navigationStages.length - 1} onClick={() => moveStage(1)}>▼</button>
        </div>
        <select className="stage-select" value={stageKey} onChange={e=>{setStageRecalcReport(null);setStageKey(e.target.value)}}>
          <option value="">— Оберіть етап —</option>
          {navigationStages.map(s => (
            <option key={s.key} value={s.key}>
              {s.flag} {s.name}
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
        {isAdmin && currentStage && <button type="button" className="btn btn-ghost stage-recalc-btn" onClick={recalculateCurrentStage} disabled={recalculatingStage || !currentSession || Boolean(currentSession.archive_preview)} title={IS_PREVIEW_DEPLOYMENT ? `Сухий прогін зарахованих сесій етапу ${currentStage.name}; без запису в базу` : `Перерахувати всі зараховані сесії етапу ${currentStage.name}`} aria-label={`${IS_PREVIEW_DEPLOYMENT?'Перевірити':'Перерахувати'} ГП ${currentStage.name}`} style={{fontSize:9,padding:'7px 9px',whiteSpace:'nowrap'}}>{recalculatingStage ? 'Перераховую…' : IS_PREVIEW_DEPLOYMENT ? '🧪 ПЕРЕВІРИТИ ЦЕЙ ГП' : '↻ ПЕРЕРАХУВАТИ ЦЕЙ ГП'}</button>}
      </div>

      {stageRecalcReport && (
        <section className="stage-recalc-report" aria-label={`Звіт перерахунку ${stageRecalcReport.stageName}`}>
          <header>
            <h3>ЗВІТ ПЕРЕРАХУНКУ · {stageRecalcReport.stageName}</h3>
            <button type="button" className="btn btn-ghost" onClick={() => setStageRecalcReport(null)}>Закрити</button>
          </header>
          <p>{stageRecalcReport.dryRun ? 'Це сухий прогін у прев’ю: бали обчислено для звірки, робочу базу не змінено.' : 'Звір бали по кожній сесії з прогнозами й фактичними результатами. Повторний перерахунок цього ГП замінює попередні бали, не додає їх удруге.'}</p>
          {stageRecalcReport.report.map((sessionReport,index) => (
            <details className="stage-recalc-session" key={`${sessionReport.type}-${index}`} open>
              <summary>{sessionReport.type==='qual'?'Кваліфікація':sessionReport.type==='sprint'?'Спринт':'Гонка'} · {sessionReport.scores.reduce((sum,row)=>sum+(Number(row.points)||0),0)} балів</summary>
              <div className="stage-recalc-score-list">
                {sessionReport.scores.map((row,rowIndex)=><div key={`${row.player}-${rowIndex}`}><span>{row.player}</span><strong>{row.points}</strong></div>)}
              </div>
            </details>
          ))}
          <div className="stage-recalc-bonus">Бонус новачка: мінімум за гонку — {stageRecalcReport.newcomerBonusMinimum ?? '—'} балів.</div>
        </section>
      )}

      {currentSession?.archive_preview && (
        <div className="archive-preview-banner" role="status">
          <strong>ДАНІ ЩЕ НЕ ВІДНОВЛЕНО · {currentStage?.name}</strong>
          <span>Це лише локальна копія прогнозів і результатів. Сесії ще не завантажені в Supabase, тому збереження та зарахування вимкнені до відновлення.</span>
          {ARCHIVE_PREVIEW.results_need_final_review && <span className="archive-preview-warning">Результати ще потребують фінальної звірки перед імпортом.</span>}
        </div>
      )}

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
              session={effectiveSession} isAdmin={isAdmin}
              slotsCount={10} showSpecials podiumCount={5} title="Результати гонки (Топ-10)" driverOptions={stagePilotOptions}
              onUpdate={(results, fl, ov) => saveResults(results, fl, ov)}
            />
          )}
          {sessionType === 'qual' && (
            <DragResults
              session={effectiveSession} isAdmin={isAdmin}
              slotsCount={22} showSpecials={false} podiumCount={3} title="Результати кваліфікації" driverOptions={stagePilotOptions}
              onUpdate={(results) => saveResults(results)}
            />
          )}
          {sessionType === 'sprint' && (
            <DragResults
              session={effectiveSession} isAdmin={isAdmin}
              slotsCount={5} showSpecials={false} podiumCount={3} isSprint title="Результати спринту (Топ-5)" driverOptions={stagePilotOptions}
              onUpdate={(results) => saveResults(results)}
            />
          )}

          {/* Commit button — only admin, only unlocked, only not yet committed */}
          {isAdmin && !currentSession?.archive_preview && !isLocked && currentSession && !currentSession.committed && (
            <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20,padding:'12px 16px',background:'rgba(225,6,0,.06)',border:'1px solid rgba(225,6,0,.2)',borderRadius:6}}>
              <button
                className="btn btn-red"
                onClick={handleCommit}
                disabled={committing}
                style={{letterSpacing:2}}
              >
                {committing ? '...' : '⚑ ЗАРАХУВАТИ БАЛИ'}
              </button>
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
              {sessionType==='qual'
                ? Number(currentStage?.sort_order)<7 ? 'ПРОГНОЗ НА ПОУЛ' : 'ПРОГНОЗИ — КВАЛІФІКАЦІЯ'
                : sessionType==='sprint' ? 'ПРОГНОЗИ — СПРИНТ' : 'ПРОГНОЗИ — ГОНКА'}
            </div>
            {isAdmin && sessionType==='qual' && Number(currentStage?.sort_order)>=7 && (
              <button className="roulette-btn all" onClick={() => rollAllQual(players, qualAssign, stageKey, currentSession?.id, setQualAssign, stagePilotOptions, currentStage?.sort_order, qualSlotsByPlayer)}>
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
                const preds = Array.from({length:10}, (_,i) => normalizeStageDriver(fc.predictions?.[i+1]||'', stagePilotChanges))
                const { total } = calcRaceScore(preds, normalizeStageDriver(fc.fl_pick, stagePilotChanges), normalizeStageDriver(fc.ov_pick, stagePilotChanges), currentResultsList,
                  normalizedFlResult, normalizedOvResult, currentStage?.sort_order)
                liveScores[p.id] = total
              } else if (sessionType === 'qual' && qa) {
                const normalizedAssignment = {
                  ...qa,
                  pole_pick:normalizeStageDriver(qa.pole_pick,stagePilotChanges),
                  pilot_1:normalizeStageDriver(qa.pilot_1,stagePilotChanges),
                  pilot_2:normalizeStageDriver(qa.pilot_2,stagePilotChanges),
                  pilot_3:normalizeStageDriver(qa.pilot_3,stagePilotChanges),
                }
                liveScores[p.id] = calcQualAssignmentScore(normalizedAssignment, currentResultsList, currentStage?.sort_order, currentStage?.key).total
              } else if (sessionType === 'sprint' && fc) {
                const sprintSlots = 5
                const preds = Array.from({length:sprintSlots}, (_,i) => fc.predictions?.[i+1]||'')
                const { total } = calcSprintScore(preds, currentResultsList, currentStage?.sort_order, normalizeStageDriver(fc.fl_pick,stagePilotChanges), normalizedFlResult)
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
                        results={currentResultsList}
                        flResult={normalizedFlResult}
                        ovResult={normalizedOvResult}
                        isMe={me?.id === p.id}
                        isAdmin={isAdmin}
                        isLocked={isLocked}
                        isDouble={isDouble}
                        qualSlotCount={qualSlotsByPlayer[p.id] ?? (isDouble ? 2 : 1)}
                        stageKey={stageKey}
                        stageOrder={currentStage?.sort_order}
                        allQualAssign={allQualAssignments}
                        allQualPlayerTeams={allQualPlayerTeams}
                        driverOptions={stagePilotOptions}
                        pilotSubstitutions={stagePilotChanges}
                        forecastHidden={!canSeeForecast}
                        onSaveForecast={(preds, fl, ov) => saveForecast(p.id, preds, fl, ov)}
                        onSaveQual={(pilots, positions) => saveQualAssign(p.id, pilots, positions)}
                        onSavePolePick={pilot => savePolePick(p.id, pilot)}
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

async function rollAllQual(players, qualAssign, stageKey, sessionId, setQualAssign, pilotPool = PILOTS, stageOrder, slotCounts = {}) {
  if (Number(stageOrder) < 7) { alert('До Канади кваліфікаційний прогноз — лише вибір поула; рулетка починається з Канади.'); return }
  if (!sessionId) { alert('Спочатку оберіть сесію'); return }
  const { USED_PILOTS } = await import('../lib/supabase')
  const { data: allAssignData } = await supabase
    .from('qual_assignments')
    .select('session_id, player_id, pilot_1, pred_pos_1, pilot_2, pred_pos_2, pilot_3, pred_pos_3, sessions(stages(sort_order))')
  const priorAssignments = priorQualAssignments(allAssignData, sessionId, stageOrder)
  const usedByPlayer = Object.fromEntries(players.map(player => [player.id, new Set(USED_PILOTS[player.name] || [])]))
  priorAssignments.forEach(row => {
    const used = usedByPlayer[row.player_id]
    if (used) for (const pilot of [row.pilot_1,row.pilot_2,row.pilot_3]) if (pilot) used.add(pilot)
  })
  const assigned = Object.fromEntries(players.map(player => [player.id, []]))
  const maxSlots = Math.min(3, Math.max(0, ...players.map(player => Number(slotCounts[player.id]) || 0)))
  for (let slotIndex=0; slotIndex<maxSlots; slotIndex++) {
    const candidates = [...players].filter(player => (Number(slotCounts[player.id]) || 0) > slotIndex)
      .sort(() => Math.random() - .5)
    const usedThisSlot = new Set()
    for (const player of candidates) {
      const already = usedByPlayer[player.id]
      const available = pilotPool.filter(pilot => !already.has(pilot) && !usedThisSlot.has(pilot))
      const fallback = pilotPool.filter(pilot => !already.has(pilot))
      const pool = available.length ? available : fallback
      const pilot = pool.length ? pool[Math.floor(Math.random()*pool.length)] : ''
      assigned[player.id][slotIndex] = pilot
      if (pilot) { already.add(pilot); usedThisSlot.add(pilot) }
    }
  }
  const updates = players.map(player => {
    const pilots = assigned[player.id] || []
    const planned = Math.max(0,Math.min(3,Number(slotCounts[player.id])||0))
    const merged = [0,1,2].map(index=>index<planned?(pilots[index]||''):'')
    return {
      session_id:sessionId, player_id:player.id,
      pilot_1:merged[0], pilot_2:merged[1], pilot_3:merged[2],
      pred_pos_1:null, pred_pos_2:null, pred_pos_3:null,
    }
  })
  const { data, error } = await supabase.from('qual_assignments').upsert(updates,{onConflict:'session_id,player_id'}).select()
  if (error) { alert(error.message); return }
  if (data) setQualAssign(Object.fromEntries(data.map(row=>[row.player_id,row])))
  await supabase.from('audit_log').insert({ action:'bulk_qual_forecast', details:{ stage:stageKey, session_id:sessionId, players:players.length } })
}
