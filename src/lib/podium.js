const SCORE_TYPES = new Set(['qual', 'sprint', 'race'])

/** Sum persisted fantasy points across all scored sessions belonging to one GP. */
export function buildEventScores(sessions, forecasts, qualifyingAssignments) {
  const sessionById = new Map((sessions || []).filter(s => s.committed && SCORE_TYPES.has(s.type)).map(s => [s.id, s]))
  const totals = new Map()
  const add = (sessionId, playerId, rawScore) => {
    const session = sessionById.get(sessionId)
    if (!session || rawScore == null || !playerId) return
    const entry = totals.get(playerId) || { qual: 0, sprint: 0, race: 0, total: 0 }
    const score = Number(rawScore) || 0
    entry[session.type] += score
    entry.total += score
    totals.set(playerId, entry)
  }

  for (const forecast of forecasts || []) add(forecast.session_id, forecast.player_id, forecast.score)
  for (const assignment of qualifyingAssignments || []) add(assignment.session_id, assignment.player_id, assignment.score)
  return totals
}

/** Keep tied players together; each distinct score fills the next fixed podium place. */
export function rankEventPodium(players, sessions, forecasts, qualifyingAssignments) {
  const totals = buildEventScores(sessions, forecasts, qualifyingAssignments)
  const ranked = (players || [])
    .filter(player => totals.has(player.id))
    .map(player => ({ ...player, ...(totals.get(player.id)) }))
    .sort((a, b) => b.total - a.total || String(a.name || '').localeCompare(String(b.name || ''), 'uk'))

  const groups = []
  for (const player of ranked) {
    let group = groups.at(-1)
    if (!group || group.total !== player.total) {
      if (groups.length === 3) break
      group = { place: groups.length + 1, total: player.total, players: [] }
      groups.push(group)
    }
    group.players.push(player)
  }
  return groups
}

/** A GP podium is final only after its race and every configured session are committed. */
export function isCompletedGrandPrix(sessions) {
  const list = sessions || []
  return list.length > 0 && list.some(session => session.type === 'race' && session.committed)
    && list.every(session => session.committed)
}
