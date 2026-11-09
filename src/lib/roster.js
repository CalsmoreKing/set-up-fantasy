export function applyStagePilotSubstitutions(baseDrivers, changes) {
  const drivers = [...(baseDrivers || [])]
  for (const change of [...(changes || [])].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))) {
    const index = drivers.indexOf(change.outgoing_driver)
    if (index < 0) continue
    if (change.incoming_driver && !drivers.includes(change.incoming_driver)) drivers[index] = change.incoming_driver
    else drivers.splice(index, 1)
  }
  return drivers
}

/** Past assignments count as used only when the player actually submitted a position for that pilot. */
export function priorQualAssignments(assignments, currentSessionId, currentStageOrder) {
  return (assignments || []).filter(row => {
    if (row.session_id === currentSessionId) return false
    const order = Number(row.sessions?.stages?.sort_order)
    const isPrior = !Number.isFinite(order) || !Number.isFinite(Number(currentStageOrder)) || order < Number(currentStageOrder)
    if (!isPrior) return false
    return [['pilot_1', 'pred_pos_1'], ['pilot_2', 'pred_pos_2'], ['pilot_3', 'pred_pos_3']]
      .some(([pilot, position]) => row[pilot] && Number(row[position]) > 0)
  }).map(row => ({
    ...row,
    pilot_1: Number(row.pred_pos_1) > 0 ? row.pilot_1 : '',
    pilot_2: Number(row.pred_pos_2) > 0 ? row.pilot_2 : '',
    pilot_3: Number(row.pred_pos_3) > 0 ? row.pilot_3 : '',
  }))
}
