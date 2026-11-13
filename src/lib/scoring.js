export function parseOvertakeWinners(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,;|]/)
  return [...new Set(values.map(pilot => String(pilot || '').trim()).filter(Boolean))]
}

export function isOvertakeWinner(pick, result) {
  return Boolean(pick) && parseOvertakeWinners(result).includes(pick)
}

export function calcRaceScore(preds, fl, ov, results, resultFl, resultOv, stageOrder = 10) {
  const raceResults = results.slice(0, 10)
  const breakdown = []
  let total = 0

  for (let i = 0; i < 10; i++) {
    const predicted = preds[i]
    if (!predicted) continue
    const actualPos = raceResults.indexOf(predicted)
    if (actualPos === -1) continue
    const diff = Math.abs(i - actualPos)
    const points = diff === 0 ? (i < 5 ? 5 : 6)
      : diff === 1 ? (i < 5 ? 2 : 3)
        : diff === 2 ? (i < 5 ? 1 : 2)
          : diff === 3 && i >= 5 ? 1 : 0
    if (points > 0) {
      total += points
      breakdown.push({ label: `P${i + 1} ${predicted} → факт P${actualPos + 1}`, pts: points })
    }
  }

  if (fl && fl === resultFl) { total += 2; breakdown.push({ label: '⚡ Швидке коло', pts: 2 }) }
  if (isOvertakeWinner(ov, resultOv)) { total += 4; breakdown.push({ label: '🚀 Прорив', pts: 4 }) }

  const predictedTop3 = preds.slice(0, 3).filter(Boolean)
  const actualTop3 = raceResults.slice(0, 3).filter(Boolean)
  const top3Matches = predictedTop3.length === 3 && new Set(predictedTop3).size === 3
    && actualTop3.length === 3 && new Set(actualTop3).size === 3
    && predictedTop3.every(pilot => actualTop3.includes(pilot))
  if (top3Matches) {
    total += 2
    breakdown.push({ label: '🏆 Склад Топ-3', pts: 2 })
  }

  const predictedTop5 = preds.slice(0, 5).filter(Boolean)
  const actualTop5 = raceResults.slice(0, 5).filter(Boolean)
  const top5Matches = predictedTop5.length === 5 && new Set(predictedTop5).size === 5
    && actualTop5.length === 5 && new Set(actualTop5).size === 5
    && predictedTop5.every(pilot => actualTop5.includes(pilot))
  if (top5Matches) {
    total += 2
    breakdown.push({ label: '🏆 Склад Топ-5', pts: 2 })
  }

  return { total, breakdown }
}

export function calcQualScore(pilot, predPos, results) {
  if (!pilot || !predPos) return { total: 0, breakdown: [] }
  const actualPos = results.indexOf(pilot)
  if (actualPos === -1) return { total: 0, breakdown: [] }
  const diff = Math.abs(predPos - 1 - actualPos)
  const points = diff === 0 ? 6 : diff === 1 ? 3 : diff === 2 ? 1 : 0
  return points > 0
    ? { total: points, breakdown: [{ label: `${pilot}: прог P${predPos} → факт P${actualPos + 1}`, pts: points }] }
    : { total: 0, breakdown: [] }
}

export function calcPolePickScore(pilot, results, submitted = false) {
  if (!submitted || !pilot || !results.length || pilot !== results[0]) return { total: 0, breakdown: [] }
  return { total: 1, breakdown: [{ label: `Поул: ${pilot}`, pts: 1 }] }
}

export function calcQualAssignmentScore(assignment, results, stageOrder = 10) {
  if (Number(stageOrder) < QUAL_ROULETTE_START_SORT_ORDER) {
    return calcPolePickScore(assignment?.pole_pick, results, Boolean(assignment?.pole_pick))
  }
  return [[assignment?.pilot_1, assignment?.pred_pos_1], [assignment?.pilot_2, assignment?.pred_pos_2], [assignment?.pilot_3, assignment?.pred_pos_3]]
    .reduce((sum, [pilot, position]) => {
      const part = calcQualScore(pilot, position, results)
      return { total: sum.total + part.total, breakdown: [...sum.breakdown, ...part.breakdown] }
    }, { total: 0, breakdown: [] })
}

export function calcSprintScore(preds, results) {
  // Sprint uses the same positional scale as the first five race slots,
  // limited to the actual sprint top five and with no sprint-specific bonuses.
  const sprintResults = results.slice(0, 5)
  const breakdown = []
  let total = 0
  for (let i = 0; i < 5; i++) {
    const predicted = preds[i]
    if (!predicted) continue
    const actualPos = sprintResults.indexOf(predicted)
    if (actualPos === -1) continue
    const diff = Math.abs(i - actualPos)
    const points = diff === 0 ? 5 : diff === 1 ? 2 : diff === 2 ? 1 : 0
    if (points > 0) {
      total += points
      breakdown.push({ label: `P${i + 1} ${predicted} → факт P${actualPos + 1}`, pts: points })
    }
  }
  return { total, breakdown }
}

export function hasForecastSubmission(forecast) {
  return Object.values(forecast?.predictions || {}).some(Boolean) || Boolean(forecast?.fl_pick) || Boolean(forecast?.ov_pick)
}

export function hasQualifyingPrediction(assignment) {
  return Boolean(assignment?.pole_pick)
    || [[assignment?.pilot_1, assignment?.pred_pos_1], [assignment?.pilot_2, assignment?.pred_pos_2], [assignment?.pilot_3, assignment?.pred_pos_3]]
      .some(([pilot, position]) => Boolean(pilot) && Number(position) > 0)
}

export function resultsList(results) {
  if (Array.isArray(results)) return results.filter(Boolean)
  if (!results || typeof results !== 'object') return []
  return Object.entries(results)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, pilot]) => pilot)
    .filter(Boolean)
}

export const NEW_RULES_START_SORT_ORDER = 10 // Deprecated stage cutoff; race and sprint scoring now use one season-wide ruleset.
export const QUAL_ROULETTE_START_SORT_ORDER = 7 // Roulette qualifying begins at Canada.

function stageOrderOf(session, stageOrder) {
  return Number(stageOrder ?? session?.stage_sort_order ?? session?.stages?.sort_order)
}

function archivedRuleVersion(session, stageOrder) {
  const order = stageOrderOf(session, stageOrder)
  if (session?.type === 'sprint') return 'top-five-sprint'
  if (session?.type === 'qual' && Number.isFinite(order) && order < QUAL_ROULETTE_START_SORT_ORDER) return 'legacy-pole-only'
  return 'current'
}

export function hasSavedForecastPickMismatch(forecast) {
  const predictions = forecast?.predictions || {}
  return (Array.isArray(forecast?.score_breakdown) ? forecast.score_breakdown : []).some(item => {
    const match = String(item?.label || '').match(/^P(\d+)\s+(.+?)\s+→\s+факт P\d+$/)
    return Boolean(match && predictions[match[1]] && predictions[match[1]] !== match[2])
  })
}

export function explainForecastScoreDifference(forecast, savedScore, savedBreakdown, currentScore, results) {
  const saved = Array.isArray(savedBreakdown) ? savedBreakdown : []
  const savedBreakdownTotal = saved.reduce((sum, item) => sum + (Number(item?.pts) || 0), 0)
  const currentPredictions = forecast?.predictions || {}
  const scoredPick = saved
    .map(item => {
      const match = String(item?.label || '').match(/^P(\d+)\s+(.+?)\s+→\s+факт P(\d+)$/)
      return match ? { position:Number(match[1]), pilot:match[2], savedActualPosition:Number(match[3]) } : null
    })
    .find(item => item && currentPredictions[item.position] && currentPredictions[item.position] !== item.pilot)

  if (scoredPick) {
    return `У збереженій розбивці для P${scoredPick.position} стоїть ${scoredPick.pilot}, а поточний запис містить ${currentPredictions[scoredPick.position]}. Оригінальний повний прогноз не збережений; тому для історичного заліку залишено збережені ${Number(savedScore) || 0} балів без перерахунку.`
  }

  const resultChanged = saved
    .map(item => {
      const match = String(item?.label || '').match(/^P(\d+)\s+(.+?)\s+→\s+факт P(\d+)$/)
      if (!match) return null
      const actualIndex = results.indexOf(match[2])
      return actualIndex >= 0 && actualIndex + 1 !== Number(match[3])
        ? { position:Number(match[1]), pilot:match[2], savedActualPosition:Number(match[3]), currentActualPosition:actualIndex + 1 }
        : null
    })
    .find(Boolean)
  if (resultChanged) {
    return `Для ${resultChanged.pilot} у збереженому розкладі був факт P${resultChanged.savedActualPosition}, а в нинішньому результаті — P${resultChanged.currentActualPosition}. Перерахунок: ${Number(savedScore) || 0} → ${Number(currentScore) || 0}.`
  }
  if (saved.length && savedBreakdownTotal !== (Number(savedScore) || 0)) {
    return `Збережений підсумок ${Number(savedScore) || 0} не дорівнює сумі збереженого розкладу ${savedBreakdownTotal}; причина різниці в даних не записана.`
  }
  if (!saved.length) return `У базі немає збереженого розкладу для пояснення. Поточний прогноз дає ${Number(currentScore) || 0} замість збережених ${Number(savedScore) || 0}.`
  return `Поточні результати й прогноз дають ${Number(currentScore) || 0} замість збережених ${Number(savedScore) || 0}; збережений розклад не показує окремої причини.`
}

export function explainQualifyingScoreDifference(savedScore, currentScore) {
  return `Для кваліфікації збережено лише загальну суму (${Number(savedScore) || 0}), без розкладу очок за слотами та попередніх результатів. Поточний перерахунок дає ${Number(currentScore) || 0}; точну історичну причину різниці відновити з цих записів неможливо.`
}

// Canonical score shown throughout the product: the score committed to the ledger.
// Audits may calculate a separate comparison against immutable scored_input.
export function canonicalStoredScore(row) {
  return Number(row?.score) || 0
}

export function forecastScoringInput(forecast) {
  const saved = forecast?.scored_input
  if (saved && typeof saved === 'object') return saved
  return null
}

export function currentForecastInput(forecast) {
  return {
    predictions: forecast?.predictions || {},
    fl_pick: forecast?.fl_pick || '',
    ov_pick: forecast?.ov_pick || '',
  }
}

export function scoringInputChanged(forecast) {
  const scored = forecastScoringInput(forecast)
  if (!scored) return false
  const current = currentForecastInput(forecast)
  return JSON.stringify(current) !== JSON.stringify({
    predictions: scored.predictions || {}, fl_pick: scored.fl_pick || '', ov_pick: scored.ov_pick || '',
  })
}

export function qualifyingScoringInput(assignment) {
  return assignment?.scored_input && typeof assignment.scored_input === 'object' ? assignment.scored_input : null
}

function calculateForecast(session, forecast, stageOrder, input) {
  const results = resultsList(session?.results)
  if (!results.length) return { score: Number(forecast?.score) || 0, breakdown: forecast?.score_breakdown || [], recalculated: false }
  const resolvedStageOrder = stageOrderOf(session, stageOrder)
  const predictions = Array.from({ length: session.type === 'sprint' ? 5 : 10 }, (_, index) => input?.predictions?.[index + 1] || '')
  const result = session.type === 'sprint'
    ? calcSprintScore(predictions, results, resolvedStageOrder, input?.fl_pick || '', session.fl_pilot || '')
    : calcRaceScore(predictions, input?.fl_pick, input?.ov_pick, results, session.fl_pilot || '', session.ov_pilot || '', resolvedStageOrder)
  return { score: result.total, breakdown: result.breakdown, recalculated: true }
}

/** Recalculate against the immutable input recorded when points were awarded. */
export function recalculateForecast(session, forecast, stageOrder, options = {}) {
  const saved = { score: Number(forecast?.score) || 0, breakdown: forecast?.score_breakdown || [], recalculated: false }
  const scoredInput = forecastScoringInput(forecast)
  if (!scoredInput) return { ...saved, ruleVersion: 'legacy-no-snapshot', verifiable: false }
  const input = options.useCurrentInput ? currentForecastInput(forecast) : scoredInput
  const result = calculateForecast(session, forecast, stageOrder, input)
  return {
    ...result,
    verifiable: result.recalculated,
    stale: !options.useCurrentInput && scoringInputChanged(forecast),
    ruleVersion: result.recalculated ? archivedRuleVersion(session, stageOrder) : 'no-results',
  }
}

export function recalculateQualAssignment(session, assignment, stageOrder, options = {}) {
  const savedScore = Number(assignment?.score) || 0
  const input = options.useCurrentInput ? assignment : qualifyingScoringInput(assignment)
  if (!input) return { score: savedScore, breakdown: [], recalculated: false, ruleVersion: 'legacy-no-snapshot', verifiable: false }
  const results = resultsList(session?.results)
  if (!results.length) return { score: savedScore, breakdown: [], recalculated: false, verifiable: false, ruleVersion:'no-results' }
  const result = calcQualAssignmentScore(input, results, stageOrderOf(session, stageOrder))
  const currentInput = {
    pilot_1:assignment.pilot_1, pred_pos_1:assignment.pred_pos_1,
    pilot_2:assignment.pilot_2, pred_pos_2:assignment.pred_pos_2,
    pilot_3:assignment.pilot_3, pred_pos_3:assignment.pred_pos_3,
    pole_pick:assignment.pole_pick || '',
  }
  return {
    score:result.total,
    breakdown:result.breakdown,
    recalculated:true,
    verifiable:true,
    stale:!options.useCurrentInput && JSON.stringify(input) !== JSON.stringify(currentInput),
    ruleVersion:archivedRuleVersion(session, stageOrder),
  }
}
