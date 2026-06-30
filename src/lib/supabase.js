import { createClient } from '@supabase/supabase-js'

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

// ── Пілоти ──────────────────────────────────────────
export const PILOTS = [
  'Verstappen','Hamilton','Leclerc','Norris','Sainz',
  'Russell','Pérez','Alonso','Piastri','Stroll',
  'Gasly','Ocon','Bottas','Colapinto','Bearman',
  'Hülkenberg','Bortoleto','Lawson','Albon','Lindblad',
  'Antonelli','Hadjar'
]

export const PILOT_ABBR = {
  VER:'Verstappen', HAM:'Hamilton',  LEC:'Leclerc',    NOR:'Norris',
  SAI:'Sainz',      RUS:'Russell',   PER:'Pérez',       ALO:'Alonso',
  PIA:'Piastri',    STR:'Stroll',    GAS:'Gasly',       OCO:'Ocon',
  BOT:'Bottas',     COL:'Colapinto', BEA:'Bearman',     HUL:'Hülkenberg',
  BOR:'Bortoleto',  LAW:'Lawson',    ALB:'Albon',       LIN:'Lindblad',
  ANT:'Antonelli',  HAD:'Hadjar',
}

// Скорочення для швидкого введення в bulk
export const BULK_FL_KEYS   = ['шк','fl','швидке коло','fast lap','швидкеколо']
export const BULK_OV_KEYS   = ['прорив','ov','overtake']

// ── Подвійні кваліфікаційні етапи ───────────────────
export const DOUBLE_STAGES = new Set(['mexico','brazil','lasvegas','qatar','uae'])

// ── Вже використані пілоти кваліфікації ─────────────
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
  'Софія':     ['Russell','Ocon','Piastri','Norris'],
  'Стас':      ['Stroll','Alonso','Verstappen','Hülkenberg'],
  'Кітасу':    ['Leclerc','Pérez','Piastri'],
  'Миколапка': ['Bortoleto','Stroll','Sainz'],
}

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
  const full = PILOTS.find(p => p.toUpperCase() === t)
  return full || null
}

// ── Рахунок для гонки ────────────────────────────────
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
    let pts = diff === 0 ? (top5 ? 5 : 6)
            : diff === 1 ? (top5 ? 2 : 3)
            : diff === 2 ? (top5 ? 1 : 2)
            : top5 ? 0 : 1
    if (pts > 0) {
      total += pts
      breakdown.push({ label: `P${i+1} ${predicted} → факт P${actualPos+1}`, pts })
    }
  }

  if (fl && fl === resultFl) { total += 2; breakdown.push({ label: '⚡ Швидке коло', pts: 2 }) }
  if (ov && ov === resultOv) { total += 4; breakdown.push({ label: '🚀 Прорив', pts: 4 }) }

  const predTop3 = preds.slice(0,3).filter(Boolean)
  const realTop3 = results.slice(0,3).filter(Boolean)
  if (predTop3.length===3 && realTop3.length===3 && predTop3.every(p=>realTop3.includes(p))) {
    total += 2; breakdown.push({ label: '🏆 Склад Топ-3', pts: 2 })
  }
  const predTop5 = preds.slice(0,5).filter(Boolean)
  const realTop5 = results.slice(0,5).filter(Boolean)
  if (predTop5.length===5 && realTop5.length===5 && predTop5.every(p=>realTop5.includes(p))) {
    total += 2; breakdown.push({ label: '🏆 Склад Топ-5', pts: 2 })
  }

  return { total, breakdown }
}

// ── Рахунок для кваліфікації ─────────────────────────
export function calcQualScore(pilot, predPos, results) {
  if (!pilot || !predPos) return { total: 0, breakdown: [] }
  const actualPos = results.indexOf(pilot)
  if (actualPos === -1) return { total: 0, breakdown: [] }
  const diff = Math.abs(predPos - 1 - actualPos)
  const pts = diff === 0 ? 6 : diff === 1 ? 3 : diff === 2 ? 1 : 0
  return pts > 0
    ? { total: pts, breakdown: [{ label: `${pilot}: прог P${predPos} → факт P${actualPos+1}`, pts }] }
    : { total: 0, breakdown: [] }
}

// ── Рахунок для спринту ──────────────────────────────
export function calcSprintScore(preds, results) {
  const breakdown = []
  let total = 0
  for (let i = 0; i < 5; i++) {
    const predicted = preds[i]
    if (!predicted) continue
    const actualPos = results.indexOf(predicted)
    if (actualPos === -1) continue
    const diff = Math.abs(i - actualPos)
    const pts = diff === 0 ? 3 : diff === 1 ? 2 : diff === 2 ? 1 : 0
    if (pts > 0) { total += pts; breakdown.push({ label: `P${i+1} ${predicted} → факт P${actualPos+1}`, pts }) }
  }
  return { total, breakdown }
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
