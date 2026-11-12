import { createClient } from '@supabase/supabase-js'
import { PILOTS_2026_ORDER, RESERVE_PILOTS_2026 } from './roster.js'
export { USED_PILOTS, PILOTS_2026_ORDER, ACTIVE_PILOTS_2026, RESERVE_PILOTS_2026, TEAM_RESERVE_PILOTS_2026, PILOT_TEAM_ROSTER, buildStagePilotPool, qualifyingSlotsForStage, qualifyingPlanForAvailable, NEWCOMER_FIRST_STAGE_ORDER, newcomerPlayersForStage } from './roster.js'
export { calcRaceScore, calcQualScore, calcQualAssignmentScore, calcSprintScore } from './scoring.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON) {
  // Видно прямо на сторінці, не тільки в консолі
  document.body.innerHTML = `<div style="background:#0D0D0D;color:#ff6b6b;font-family:monospace;padding:40px;min-height:100vh">
    <h2>⚠ ENV ПОМИЛКА</h2>
    <p>VITE_SUPABASE_URL = ${SUPABASE_URL || 'НЕ ВСТАНОВЛЕНО'}</p>
    <p>VITE_SUPABASE_ANON_KEY = ${SUPABASE_ANON ? 'встановлено (' + SUPABASE_ANON.slice(0,20) + '...)' : 'НЕ ВСТАНОВЛЕНО'}</p>
    <p>Перевір Vercel → Settings → Environment Variables → обидва ключі мають бути увімкнені для Production.</p>
  </div>`
  throw new Error('Missing Supabase env vars')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// Roulette and race-result defaults contain starters only. Reserves are offered only in substitutions.
export const PILOTS = [...PILOTS_2026_ORDER]

export const PILOT_ABBR = {
  ANT:'Antonelli', RUS:'Russell',  HAM:'Hamilton',  PIA:'Piastri',
  NOR:'Norris',    LEC:'Leclerc',  VER:'Verstappen',HAD:'Hadjar',
  GAS:'Gasly',     LAW:'Lawson',   BEA:'Bearman',   COL:'Colapinto',
  LIN:'Lindblad',  SAI:'Sainz',    ALB:'Albon',     OCO:'Ocon',
  BOR:'Bortoleto', ALO:'Alonso',   HUL:'Hülkenberg',BOT:'Bottas',
  PER:'Pérez',     STR:'Stroll', TSU:'Tsunoda', HIR:'Hirakawa', CAM:'Câmara',
}

// Скорочення для швидкого введення в bulk
export const BULK_FL_KEYS   = ['шк','fl','швидке коло','fast lap','швидкеколо']
export const BULK_OV_KEYS   = ['прорив','ov','overtake']

// ── Подвійні кваліфікаційні етапи ───────────────────
// Подвійні кваліфікації — 3 останні етапи (математично правильно: 12×18 + 3×36 = 324≈327)
// Андрій, Кітасу, Миколапка мають 19 вільних — їм дістанеться +1 в одному з подвійних
export const DOUBLE_STAGES = new Set(['brazil','qatar','uae'])

// ── Аліаси гравців ───────────────────────────────────
// Ключ = канонічне ім'я, значення = всі варіанти написання
export const PLAYER_ALIASES = {
  'Валентин':  ['валентін','valentin','valentine'],
  'Анастасія': ['настя','nastya','anastasia'],
  'Хонда':     ['альфахонда','alfahoma','alphahonda','honda'],
  'Кітасу':    ['k1tasu','kitasu','к1тасу','кітасу'],
}

// Резолвер: будь-який варіант → канонічне ім'я
export function resolvePlayerName(raw, playerList) {
  if (!raw) return null
  const lower = raw.trim().toLowerCase()

  // Спочатку точний збіг (регістронезалежний)
  const exact = playerList.find(p => p.name.toLowerCase() === lower)
  if (exact) return exact

  // Потім аліаси
  for (const p of playerList) {
    const canonical = p.name.toLowerCase()
    if (canonical === lower) return p
    const aliases = (PLAYER_ALIASES[p.name] || []).map(a => a.toLowerCase())
    if (aliases.includes(lower)) return p
  }
  return null
}

// Резолвер пілотів: VER / verstappen / Верстаппен → 'Verstappen'
export function resolvePilot(token) {
  if (!token) return null
  const t = token.trim().toUpperCase()
  if (PILOT_ABBR[t]) return PILOT_ABBR[t]
  const full = [...PILOTS, ...RESERVE_PILOTS_2026].find(p => p.toUpperCase() === t)
  return full || null
}

// ── Команди: кольори, скорочення (емблема-замінник без ліцензованих логотипів) ──
export const TEAM_META = {
  'Макларен':             { color:'#FF8000', code:'MCL', glyph:'🟧' },
  'Мерседес':              { color:'#00D2BE', code:'MER', glyph:'⬛' },
  'Феррарі':               { color:'#E8002D', code:'FER', glyph:'🟥' },
  'Альпін':                { color:'#0090FF', code:'ALP', glyph:'🟦' },
  'Ред Булл Рейсінг':      { color:'#3671C6', code:'RBR', glyph:'🟦' },  // Нептун, Хонда
  'Ауді':                  { color:'#888888', code:'AUD', glyph:'⬜' },
  'Астон Мартін':          { color:'#358C75', code:'AMR', glyph:'🟩' },
  'Альфа Ромео':           { color:'#C92D4B', code:'ALF', glyph:'🟥' },
  'Ред Булл':              { color:'#1E3A8A', code:'RB',  glyph:'🔷' },  // Кітасу, Миколапка
  'Порше':                 { color:'#D4AF37', code:'PSC', glyph:'🟨', secondaryColor:'#B12B28' }, // Педрі, Хексі — золотий + червоний з герба Porsche
}
// ── Парсер bulk-імпорту ──────────────────────────────
export function parseBulkText(raw, playerList) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const blocks = []
  let cur = []

  for (const line of lines) {
    const maybePlayer = resolvePlayerName(line, playerList)
    if (maybePlayer && cur.length > 0) {
      blocks.push(cur.join('\n'))
      cur = [line]
    } else {
      cur.push(line)
    }
  }
  if (cur.length) blocks.push(cur.join('\n'))

  const results = []
  const warnings = []

  for (const block of blocks) {
    const blines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (!blines.length) continue

    const player = resolvePlayerName(blines[0], playerList)
    if (!player) {
      warnings.push({ type: 'unknown_player', raw: blines[0], message: `Гравець "${blines[0]}" не знайдений` })
      continue
    }

    const body = blines.slice(1).join(' ')
    const preds = Array(10).fill('')
    let fl = '', ov = ''
    let parseErrors = []

    for (let i = 1; i <= 10; i++) {
      const m = body.match(new RegExp(`\\b${i}\\s*[-–:.]+\\s*([A-Za-zéüÉÜа-яА-ЯіїєґІЇЄҐ]+)`, 'i'))
      if (m) {
        const p = resolvePilot(m[1])
        if (!p) parseErrors.push({ type: 'unknown_pilot', pos: i, raw: m[1], message: `P${i}: невідомий пілот "${m[1]}"` })
        else preds[i-1] = p
      }
    }

    const flRe = new RegExp(`(?:${BULK_FL_KEYS.join('|')})\\s*[-–:.]+\\s*([A-Za-zéü]+)`, 'i')
    const flm = body.match(flRe)
    if (flm) {
      fl = resolvePilot(flm[1])
      if (!fl) parseErrors.push({ type: 'unknown_pilot', pos: 'fl', raw: flm[1], message: `Швидке коло: невідомий пілот "${flm[1]}"` })
    }

    const ovRe = new RegExp(`(?:${BULK_OV_KEYS.join('|')})\\s*[-–:.]+\\s*([A-Za-zéü]+)`, 'i')
    const ovm = body.match(ovRe)
    if (ovm) {
      ov = resolvePilot(ovm[1])
      if (!ov) parseErrors.push({ type: 'unknown_pilot', pos: 'ov', raw: ovm[1], message: `Прорив: невідомий пілот "${ovm[1]}"` })
    }

    // Аліас-попередження
    if (player.name !== blines[0].trim()) {
      warnings.push({ type: 'alias_resolved', raw: blines[0], canonical: player.name,
        message: `"${blines[0]}" → "${player.name}" (аліас)` })
    }

    results.push({ player, preds, fl, ov, errors: parseErrors })
    if (parseErrors.length) warnings.push(...parseErrors.map(e => ({ ...e, player: player.name })))
  }

  return { results, warnings }
}
