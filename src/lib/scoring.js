export function calcRaceScore(preds, fl, ov, results, resultFl, resultOv) {
  const breakdown = []
  let total = 0

  for (let i = 0; i < 10; i++) {
    const predicted = preds[i]
    if (!predicted) continue
    const actualPos = results.indexOf(predicted)
    if (actualPos === -1) continue
    const diff = Math.abs(i - actualPos)
    const top5 = i < 5
    const points = diff === 0 ? (top5 ? 5 : 6)
      : diff === 1 ? (top5 ? 2 : 3)
        : diff === 2 ? (top5 ? 1 : 2)
          : diff === 3 ? (top5 ? 0 : 1)
            : 0
    if (points > 0) {
      total += points
      breakdown.push({ label: `P${i + 1} ${predicted} → факт P${actualPos + 1}`, pts: points })
    }
  }

  if (fl && fl === resultFl) { total += 2; breakdown.push({ label: '⚡ Швидке коло', pts: 2 }) }
  if (ov && ov === resultOv) { total += 4; breakdown.push({ label: '🚀 Прорив', pts: 4 }) }

  const predictedTop3 = preds.slice(0, 3).filter(Boolean)
  const actualTop3 = results.slice(0, 3).filter(Boolean)
  if (predictedTop3.length === 3 && actualTop3.length === 3 && predictedTop3.every(pilot => actualTop3.includes(pilot))) {
    total += 2
    breakdown.push({ label: '🏆 Склад Топ-3', pts: 2 })
  }
  const predictedTop5 = preds.slice(0, 5).filter(Boolean)
  const actualTop5 = results.slice(0, 5).filter(Boolean)
  if (predictedTop5.length === 5 && actualTop5.length === 5 && predictedTop5.every(pilot => actualTop5.includes(pilot))) {
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

export function calcSprintScore(preds, results) {
  const breakdown = []
  let total = 0
  for (let i = 0; i < 5; i++) {
    const predicted = preds[i]
    if (!predicted) continue
    const actualPos = results.indexOf(predicted)
    if (actualPos === -1) continue
    const diff = Math.abs(i - actualPos)
    const points = diff === 0 ? 3 : diff === 1 ? 2 : diff === 2 ? 1 : 0
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
  return [[assignment?.pilot_1, assignment?.pred_pos_1], [assignment?.pilot_2, assignment?.pred_pos_2], [assignment?.pilot_3, assignment?.pred_pos_3]]
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

export function recalculateForecast(session, forecast) {
  const results = resultsList(session?.results)
  if (!results.length) return { score: Number(forecast?.score) || 0, breakdown: forecast?.score_breakdown || [], recalculated: false }
  const predictions = Array.from({ length: session.type === 'sprint' ? 5 : 10 }, (_, index) => forecast?.predictions?.[index + 1] || '')
  const result = session.type === 'sprint'
    ? calcSprintScore(predictions, results)
    : calcRaceScore(predictions, forecast?.fl_pick, forecast?.ov_pick, results, session.fl_pilot || '', session.ov_pilot || '')
  return { score: result.total, breakdown: result.breakdown, recalculated: true }
}

export function recalculateQualAssignment(session, assignment) {
  const results = resultsList(session?.results)
  const savedScore = Number(assignment?.score) || 0
  if (!results.length) return { score: savedScore, breakdown: [], recalculated: false }
  const result = [[assignment.pilot_1, assignment.pred_pos_1], [assignment.pilot_2, assignment.pred_pos_2], [assignment.pilot_3, assignment.pred_pos_3]]
    .reduce((sum, [pilot, position]) => {
      const part = calcQualScore(pilot, position, results)
      return { score: sum.score + part.total, breakdown: [...sum.breakdown, ...part.breakdown] }
    }, { score: 0, breakdown: [] })
  return { ...result, recalculated: true }
}
