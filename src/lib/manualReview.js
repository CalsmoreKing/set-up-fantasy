import { calcRaceScore, calcQualAssignmentScore, calcSprintScore, resultsList, hasForecastSubmission, hasQualifyingPrediction } from './scoring.js'
import { normalizeStageDriver, normalizeStageResults } from './roster.js'

export const REVIEW_STORAGE_KEY = 'set-up-fantasy:manual-score-review:v1'

export function loadManualReviewState(storage = globalThis.sessionStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(REVIEW_STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveManualReviewState(state, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(REVIEW_STORAGE_KEY,JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function manualReviewStepKey(playerId,sessionId) {
  return `${playerId}:${sessionId}`
}

/** Sum only steps explicitly advanced in the client-side audit; this never writes scoring data. */
export function summarizeManualReview(queue,playerId,steps,officialTotal=0) {
  let manualTotal=0
  let checkedCount=0
  for (const item of queue || []) {
    const step=steps?.[manualReviewStepKey(playerId,item.session.id)]
    if (!step?.checked) continue
    checkedCount++
    manualTotal+=(Number(step.score)||0)+(Number(step.bonusPoints)||0)
  }
  const totalSteps=(queue || []).length
  return {
    manualTotal,
    officialTotal:Number(officialTotal)||0,
    difference:manualTotal-(Number(officialTotal)||0),
    checkedCount,
    totalSteps,
    complete:totalSteps>0&&checkedCount===totalSteps,
    matches:totalSteps>0&&checkedCount===totalSteps&&manualTotal===(Number(officialTotal)||0),
  }
}

export function sessionSortOrder(session) {
  const typeOrder = {qual:0,sprint:1,race:2}
  return [Number(session?.stages?.sort_order ?? session?.stage_sort_order ?? 0),typeOrder[session?.type] ?? 9,String(session?.committed_at || '')]
}

export function buildManualReviewQueue({playerId,sessions,forecasts,qualifications}) {
  const forecastBySession = new Map((forecasts || []).filter(row=>row.player_id===playerId).map(row=>[row.session_id,row]))
  const qualBySession = new Map((qualifications || []).filter(row=>row.player_id===playerId).map(row=>[row.session_id,row]))
  return (sessions || [])
    .filter(session=>session.committed && ['qual','sprint','race'].includes(session.type))
    .sort((a,b)=>{
      const x=sessionSortOrder(a),y=sessionSortOrder(b)
      return x[0]-y[0] || x[1]-y[1] || x[2].localeCompare(y[2])
    })
    .map(session=>{
      const candidate=session.type==='qual'?qualBySession.get(session.id):forecastBySession.get(session.id)
      const submitted=session.type==='qual'?hasQualifyingPrediction(candidate):session.type==='sprint'
        ? Object.values(candidate?.predictions || {}).some(Boolean)
        : hasForecastSubmission(candidate)
      const row=submitted?candidate:null
      return {
        session,
        row,
        kind:session.type==='qual'?'qual':'forecast',
        missed:!submitted,
      }
    })
}

export function inputForReviewItem(item, substitutions = []) {
  const {session,row}=item
  if (item.kind==='qual') return {
    pole_pick:normalizeStageDriver(row?.pole_pick || '',substitutions),
    pilot_1:normalizeStageDriver(row?.pilot_1 || '',substitutions),
    pred_pos_1:row?.pred_pos_1 || null,
    pilot_2:normalizeStageDriver(row?.pilot_2 || '',substitutions),
    pred_pos_2:row?.pred_pos_2 || null,
    pilot_3:normalizeStageDriver(row?.pilot_3 || '',substitutions),
    pred_pos_3:row?.pred_pos_3 || null,
  }
  const slots=session.type==='sprint'?5:10
  const predictions=Object.fromEntries(Array.from({length:slots},(_,index)=>[
    index+1,normalizeStageDriver(row?.predictions?.[index+1] || row?.predictions?.[String(index+1)] || '',substitutions),
  ]))
  return {
    predictions,
    fl_pick:session.type==='race'?normalizeStageDriver(row?.fl_pick || '',substitutions):'',
    ov_pick:session.type==='race'?normalizeStageDriver(row?.ov_pick || '',substitutions):'',
  }
}

export function scoreManualReviewItem(item,input,substitutions = []) {
  const {session}=item
  const stageOrder=Number(session?.stages?.sort_order ?? session?.stage_sort_order ?? 0)
  const results=resultsList(normalizeStageResults(session?.results || {},substitutions))
  if (!item.row) return {score:0,breakdown:[],scoredInput:input}
  if (item.kind==='qual') {
    const result=calcQualAssignmentScore(input,results,stageOrder)
    return {score:result.total,breakdown:result.breakdown,scoredInput:input}
  }
  const predictions=Array.from({length:session.type==='sprint'?5:10},(_,index)=>input.predictions?.[index+1] || '')
  const fastLap=normalizeStageDriver(session?.fl_pilot || '',substitutions)
  const overtake=String(session?.ov_pilot || '').split(/[,;|]/).map(value=>normalizeStageDriver(value.trim(),substitutions)).filter(Boolean).join(', ')
  const result=session.type==='sprint'
    ? calcSprintScore(predictions,results)
    : calcRaceScore(predictions,input.fl_pick,input.ov_pick,results,fastLap,overtake,stageOrder)
  return {score:result.total,breakdown:result.breakdown,scoredInput:input}
}

export function isManualReviewMismatch(approved,automatic) {
  return Number(approved || 0)!==Number(automatic || 0)
}
