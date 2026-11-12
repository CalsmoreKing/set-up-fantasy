const SESSION_TYPES = ['qual', 'sprint', 'race']

/**
 * Build per-player event totals from committed session rows. Race/sprint points
 * live on forecasts; qualifying points live on qual_assignments.
 */
export function buildStageTotals(players, sessions, forecasts, qualAssignments, newcomerBonuses = []) {
  const byStage = {}
  const init = () => ({ qual: 0, sprint: 0, race: 0, total: 0, hasScore: false })

  for (const session of sessions || []) {
    if (!session.committed || !session.stage_id || !SESSION_TYPES.includes(session.type)) continue
    const target = byStage[session.stage_id] ||= {}
    if (session.type === 'qual') {
      for (const row of qualAssignments || []) {
        if (row.session_id !== session.id || row.score == null) continue
        const score = Number(row.score) || 0
        const current = target[row.player_id] ||= init()
        current.qual += score
        current.total += score
        current.hasScore = true
      }
    } else {
      for (const row of forecasts || []) {
        if (row.session_id !== session.id || row.score == null) continue
        const score = Number(row.score) || 0
        const current = target[row.player_id] ||= init()
        current[session.type] += score
        current.total += score
        current.hasScore = true
      }
    }
  }

  for (const bonus of newcomerBonuses || []) {
    if (!bonus.stage_id || bonus.points == null) continue
    const stageTotals = byStage[bonus.stage_id] ||= {}
    const current = stageTotals[bonus.player_id] ||= init()
    current.total += Number(bonus.points) || 0
    current.hasScore = true
  }

  for (const [stageId, totals] of Object.entries(byStage)) {
    for (const player of players || []) totals[player.id] ||= init()
    byStage[stageId] = totals
  }
  return byStage
}

/** Reconcile newcomer awards against only this GP's race; qualifying and sprint never affect the minimum. */
export function calculateNewcomerBonuses(players, sessions, forecasts, _qualAssignments = [], eligiblePlayerIds = []) {
  const raceSessions = (sessions || []).filter(session => session.type === 'race')
  if (raceSessions.length !== 1 || raceSessions.some(session => !session.committed)) return { ready:false, minimum:null, bonuses:[] }
  const raceSession = raceSessions[0]
  if ((forecasts || []).some(row => row.session_id === raceSession.id && row.score == null)) {
    return { ready:false, minimum:null, bonuses:[] }
  }
  const eligible = new Set(eligiblePlayerIds || [])
  const submitted = new Set()
  const scores = new Map()
  for (const row of forecasts || []) {
    if (row.session_id !== raceSession.id) continue
    scores.set(row.player_id, Number(row.score) || 0)
    if (Object.values(row.predictions || {}).some(Boolean)) submitted.add(row.player_id)
  }
  const actuals = [...submitted].map(playerId => scores.get(playerId) || 0)
  const minimum = actuals.length ? Math.min(...actuals) : null
  const bonuses = minimum == null ? [] : (players || [])
    .filter(player => eligible.has(player.id) && !submitted.has(player.id))
    .map(player => ({ player_id:player.id, points:minimum }))
  return { ready:true, minimum, bonuses }
}

/** Competition ranking: tied scores share a place and skip the following place. */
export function rankPlayers(players, totals, scoreKey = 'total') {
  const sorted = [...(players || [])].sort((a, b) => {
    const diff = (Number(totals?.[b.id]?.[scoreKey]) || 0) - (Number(totals?.[a.id]?.[scoreKey]) || 0)
    return diff || String(a.name || '').localeCompare(String(b.name || ''), 'uk')
  })
  let previous = null
  let place = 0
  return sorted.map((player, index) => {
    const score = Number(totals?.[player.id]?.[scoreKey]) || 0
    if (previous === null || score !== previous) place = index + 1
    previous = score
    return { ...player, score, place }
  })
}

export function podiumPlayers(players, totals) {
  return rankPlayers(players, totals).filter(row => row.place <= 3)
}
