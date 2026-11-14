// The fantasy pool is exactly the 22 race starters; reserve drivers are never roulette options.
export const PILOT_TEAM_ROSTER = [
  { team:'Mercedes', drivers:['Antonelli','Russell'] },
  { team:'Ferrari', drivers:['Hamilton','Leclerc'] },
  { team:'McLaren', drivers:['Norris','Piastri'] },
  { team:'Red Bull', drivers:['Verstappen','Hadjar'] },
  { team:'Racing Bulls', drivers:['Lawson','Lindblad'] },
  { team:'Alpine', drivers:['Gasly','Colapinto'] },
  { team:'Haas', drivers:['Bearman','Ocon'] },
  { team:'Audi', drivers:['Bortoleto','Hülkenberg'] },
  { team:'Williams', drivers:['Sainz','Albon'] },
  { team:'Aston Martin', drivers:['Alonso','Stroll'] },
  { team:'Cadillac', drivers:['Bottas','Pérez'] },
]
export const ACTIVE_PILOTS_2026 = PILOT_TEAM_ROSTER.flatMap(team => team.drivers)
// Team-by-team 2026 reserves. Use the surnames used elsewhere in the app.
// Camara and Slater were explicitly supplied by the user in the latest correction.
export const TEAM_RESERVE_PILOTS_2026 = Object.freeze({
  'McLaren':['Fornaroli',"O'Ward"],
  'Mercedes':['Vesti'],
  'Red Bull':['Tsunoda'],
  'Ferrari':['Giovinazzi'],
  'Williams':['Browning'],
  'Racing Bulls':['Tsunoda','Iwasa'],
  'Aston Martin':['Crawford','Vandoorne'],
  'Haas':['Hirakawa','Doohan','Camara'],
  'Audi':['Slater'],
  'Alpine':['Aron','Maini'],
  'Cadillac':['Zhou'],
})
export const RESERVE_PILOTS_2026 = [...new Set(Object.values(TEAM_RESERVE_PILOTS_2026).flat())]
// Backward-compatible export: consumers of the roulette pool get starters only.
export const PILOTS_2026_ORDER = ACTIVE_PILOTS_2026

export function buildStagePilotPool(changes = []) {
  const starters = [...ACTIVE_PILOTS_2026]
  const usedReserves = new Set()
  for (const change of [...changes].filter(item => item?.is_active !== false)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))) {
    const team = PILOT_TEAM_ROSTER.find(row => row.team === change.team_name)
    if (!team || !team.drivers.includes(change.outgoing_driver)) continue
    if (!(TEAM_RESERVE_PILOTS_2026[change.team_name] || []).includes(change.incoming_driver) || usedReserves.has(change.incoming_driver)) continue
    const index = starters.indexOf(change.outgoing_driver)
    if (index < 0) continue
    starters[index] = change.incoming_driver
    usedReserves.add(change.incoming_driver)
  }
  return starters
}

// Imported pilot history from the pre-database seed. Keep this aligned to canonical live player names.
export const USED_PILOTS = {
  'Ярослав':   ['Colapinto','Russell','Antonelli','Ocon'],
  'Мія':       ['Bearman','Norris','Hadjar','Stroll'],
  'Нептун':    ['Norris','Lawson','Hülkenberg','Bortoleto'],
  'Хонда':     ['Antonelli','Verstappen','Bortoleto','Bearman'],
  'Іванна':    ['Hadjar','Bortoleto','Lawson','Verstappen'],
  'Марго':     ['Bottas','Colapinto','Hamilton','Alonso'],
  'Чак':       ['Hamilton','Gasly','Sainz','Bottas'],
  'Калсмор':   ['Gasly','Leclerc','Colapinto','Hamilton'],
  'Іван':      ['Albon','Hadjar','Lindblad','Lawson'],
  'Ігор':      ['Lawson','Bearman','Norris','Antonelli'],
  'Ярік':      ['Sainz','Hülkenberg','Albon','Leclerc'],
  'Анастасія': ['Alonso','Antonelli','Ocon','Gasly'],
  'Андрій':    ['Ocon','Piastri','Russell'],
  'Валентин':  ['Lindblad','Stroll','Gasly','Albon'],
  'Андріі':    ['Ocon','Piastri','Norris'],  // Russell був дублікатом очищеного запису Австрії
  'Стас':      ['Stroll','Alonso','Verstappen','Hülkenberg'],
  'Кітасу':    ['Leclerc','Pérez','Piastri'],
  'Даня':      ['Stroll','Sainz'], // legacy seed Миколапки; Bortoleto вже врахований в Австрії
  'Педрі':     [], // новий гравець — пілоти ще не випадали
  'Хексі':     [], // новий гравець — пілоти ще не випадали
}

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


/** Resolve an outgoing 2026 driver to the event-specific replacement. */
export function normalizeStageDriver(driver, changes = []) {
  let current = driver
  const ordered = [...(changes || [])].filter(change => change?.is_active !== false)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
  for (let pass = 0; pass < ordered.length; pass++) {
    const next = ordered.find(change => change.outgoing_driver === current && change.incoming_driver)?.incoming_driver
    if (!next || next === current) break
    current = next
  }
  return current
}

export function normalizeStageResults(results, changes = []) {
  const entries = Array.isArray(results) ? results.map((pilot, index) => [String(index + 1), pilot]) : Object.entries(results || {})
  return Object.fromEntries(entries.map(([position, pilot]) => [position, normalizeStageDriver(pilot, changes)]).filter(([,pilot]) => Boolean(pilot)))
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

// The remaining 2026 qualifying rounds use the regular Vegas slot plus the two double rounds.
export const FUTURE_QUAL_SLOT_BASE = { 23:1, 24:2, 25:2 }

/** Build one per-player plan across all remaining Vegas/Qatar/UAE qualifying rounds. */
export function qualifyingPlanForAvailable(availableCount, fromStageOrder = 23, maxPerStage = 3) {
  const orders = Object.keys(FUTURE_QUAL_SLOT_BASE).map(Number).filter(order => order >= Number(fromStageOrder)).sort((a,b)=>a-b)
  const plan = Object.fromEntries(orders.map(order => [order, 0]))
  let remaining = Math.max(0, Number(availableCount) || 0)
  for (const order of orders) {
    const future = orders.filter(value => value >= order)
    const baseTotal = future.reduce((sum, value) => sum + Math.min(maxPerStage, FUTURE_QUAL_SLOT_BASE[value]), 0)
    const maxTotal = future.length * maxPerStage
    let extras = Math.max(0, Math.min(remaining, maxTotal) - baseTotal)
    const counts = future.map(value => Math.min(maxPerStage, FUTURE_QUAL_SLOT_BASE[value]))
    while (extras > 0) {
      let placed = false
      for (let index = 0; index < counts.length && extras > 0; index++) {
        if (counts[index] >= maxPerStage) continue
        counts[index]++
        extras--
        placed = true
      }
      if (!placed) break
    }
    const count = Math.min(remaining, counts[0] || 0)
    plan[order] = count
    remaining -= count
  }
  return plan
}

/** The active individual allocation for this round, with catch-up slots first. */
export function qualifyingSlotsForStage(availableCount, stageOrder, maxPerStage = 3) {
  const order = Number(stageOrder)
  if (!Number.isFinite(order)) return 1
  const plan = qualifyingPlanForAvailable(availableCount, order, maxPerStage)
  return Object.hasOwn(plan, order) ? plan[order] : 1
}

// Verified first race in which each late-joining player submitted a forecast.
// When session/forecast history is available, newcomerPlayersForStage derives this dynamically;
// this map remains a fallback for isolated stage previews without the full season history.
export const NEWCOMER_FIRST_STAGE_ORDER = Object.freeze({
  'Анастасія':3,
  'Ярік':3,
  'Андрій':6,
  'Валентин':6,
  'Стас':6,
  'Андрії':7,
  'Кітасу':8,
  'Даня':8,
  'Педрі':16,
  'Хексі':16,
})

export function newcomerFirstStageOrderByPlayer(players, sessions, forecasts) {
  const firstOrder = new Map((players || []).map(player => [player.id, Number(NEWCOMER_FIRST_STAGE_ORDER[player.name]) || Infinity]))
  if (!Array.isArray(sessions) || !Array.isArray(forecasts)) return firstOrder
  const bySession = new Map((sessions || []).map(session => [session.id, session]))
  for (const forecast of forecasts || []) {
    const session = bySession.get(forecast.session_id)
    const order = Number(session?.stages?.sort_order ?? session?.stage_sort_order)
    const submitted = Object.values(forecast.predictions || {}).some(Boolean)
    if (!session?.committed || session.type !== 'race' || !Number.isFinite(order) || !submitted) continue
    const previous = firstOrder.get(forecast.player_id) ?? Infinity
    if (order < previous) firstOrder.set(forecast.player_id, order)
  }
  return firstOrder
}

export function newcomerPlayersForStage(players, stageOrder, sessions, forecasts) {
  const order = Number(stageOrder)
  if (!Number.isFinite(order)) return []
  const firstOrders = newcomerFirstStageOrderByPlayer(players, sessions, forecasts)
  return (players || []).filter(player => (firstOrders.get(player.id) ?? Infinity) > order)
}
