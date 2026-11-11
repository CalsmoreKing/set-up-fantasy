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
export const RESERVE_PILOTS_2026 = ['Tsunoda','Hirakawa','Câmara']
// Backward-compatible export: consumers of the roulette pool get starters only.
export const PILOTS_2026_ORDER = ACTIVE_PILOTS_2026

export function buildStagePilotPool(changes = []) {
  const starters = [...ACTIVE_PILOTS_2026]
  const usedReserves = new Set()
  for (const change of [...changes].filter(item => item?.is_active !== false)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))) {
    const team = PILOT_TEAM_ROSTER.find(row => row.team === change.team_name)
    if (!team || !team.drivers.includes(change.outgoing_driver)) continue
    if (!RESERVE_PILOTS_2026.includes(change.incoming_driver) || usedReserves.has(change.incoming_driver)) continue
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

/** Allocate the outstanding unique-driver slots to this round, putting catch-up slots first. */
export function qualifyingSlotsForStage(availableCount, stageOrder, maxPerStage = 3) {
  const order = Number(stageOrder)
  const futureOrders = Object.keys(FUTURE_QUAL_SLOT_BASE).map(Number).filter(value => value >= order).sort((a,b)=>a-b)
  if (!futureOrders.length || !Number.isFinite(order)) return 1
  const base = futureOrders.map(value => FUTURE_QUAL_SLOT_BASE[value])
  let extras = Math.max(0, Math.min(Number(availableCount) || 0, futureOrders.length * maxPerStage) - base.reduce((a,b)=>a+b,0))
  const counts = base.map(value => Math.min(maxPerStage, value))
  while (extras > 0) {
    let placed = false
    for (let i=0; i<counts.length && extras>0; i++) {
      if (counts[i] >= maxPerStage) continue
      counts[i]++
      extras--
      placed = true
    }
    if (!placed) break
  }
  const index = futureOrders.indexOf(order)
  if (index >= 0) return Math.min(Number(availableCount) || 0, counts[index])
  return 1
}

// These two profiles first entered the game before Madrid (order 16); earlier GPs qualify for newcomer awards.
export const NEWCOMER_FIRST_STAGE_ORDER = Object.freeze({ 'Педрі':16, 'Хексі':16 })

export function newcomerPlayersForStage(players, stageOrder) {
  const order = Number(stageOrder)
  if (!Number.isFinite(order)) return []
  return (players || []).filter(player => Number(NEWCOMER_FIRST_STAGE_ORDER[player.name]) > order)
}
