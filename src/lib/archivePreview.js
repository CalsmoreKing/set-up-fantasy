import archivePreview from '../data/archivePreview.json'

export const ARCHIVE_PREVIEW = archivePreview

const sessionsByStage = new Map()
const forecastsBySession = new Map()
const qualifyingBySession = new Map()

for (const session of archivePreview.sessions) {
  const row = { ...session, archive_preview:true, is_locked:true, committed:true }
  const list = sessionsByStage.get(row.stage_key) || []
  list.push(row)
  sessionsByStage.set(row.stage_key, list)
}
for (const row of archivePreview.forecasts) {
  const list = forecastsBySession.get(row.session_id) || []
  list.push(row)
  forecastsBySession.set(row.session_id, list)
}
for (const row of archivePreview.qualifying_assignments) {
  const list = qualifyingBySession.get(row.session_id) || []
  list.push(row)
  qualifyingBySession.set(row.session_id, list)
}

export function archiveSessionsForStage(stageKey, stageId) {
  return (sessionsByStage.get(stageKey) || []).map(session => ({ ...session, stage_id:stageId }))
}

export function archiveForecastsForSession(sessionId) {
  return forecastsBySession.get(sessionId) || []
}

export function archiveQualifyingForSession(sessionId) {
  return qualifyingBySession.get(sessionId) || []
}

export function archiveScoresForStage(stageKey) {
  const scores = new Map()
  for (const row of archivePreview.forecasts.filter(item => item.stage_key === stageKey)) {
    const value = scores.get(row.player_id) || { qual:0, sprint:0, race:0, total:0 }
    value[row.session_type] = (value[row.session_type] || 0) + (Number(row.score) || 0)
    value.total += Number(row.score) || 0
    scores.set(row.player_id, value)
  }
  for (const row of archivePreview.qualifying_assignments.filter(item => item.stage_key === stageKey)) {
    const value = scores.get(row.player_id) || { qual:0, sprint:0, race:0, total:0 }
    value.qual += Number(row.score) || 0
    value.total += Number(row.score) || 0
    scores.set(row.player_id, value)
  }
  return Object.fromEntries(scores)
}
