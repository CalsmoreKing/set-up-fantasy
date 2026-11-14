import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStageExportSheets, buildStageWorkbookXml } from './stageWorkbook.js'

const stages = [
  { id: 's1', key: 'race-1', name: 'ГП <Австралія>', sort_order: 1 },
  { id: 's2', key: 'race-2', name: 'Наступний етап', sort_order: 2 },
]
const players = [
  { id: 'p1', name: 'Марго & Мія' },
  { id: 'p2', name: 'Андрій' },
]
const sessions = [
  { id: 'sprint', stage_id: 's1', type: 'sprint', committed: true },
  { id: 'qual', stage_id: 's1', type: 'qual', committed: true },
  { id: 'race', stage_id: 's1', type: 'race', committed: true },
  { id: 'next-race', stage_id: 's2', type: 'race', committed: false },
]
const forecasts = [
  { player_id: 'p1', session_id: 'sprint', score: 11 },
  { player_id: 'p2', session_id: 'sprint', score: 1 },
  { player_id: 'p1', session_id: 'race', score: 20 },
  { player_id: 'p2', session_id: 'race', score: 13 },
]
const qualifications = [
  { player_id: 'p1', session_id: 'qual', score: 4 },
  { player_id: 'p2', session_id: 'qual', score: 0 },
]
const bonuses = [{ player_id: 'p1', stage_id: 's1', points: 5 }]

test('stage report rows contain all requested per-session columns and totals', () => {
  const sheets = buildStageExportSheets(stages, players, sessions, forecasts, qualifications, bonuses)
  assert.equal(sheets.length, 2)
  assert.equal(sheets[0].rows[0].name, 'Марго & Мія')
  assert.deepEqual(sheets[0].rows[0], {
    name: 'Марго & Мія', sprint: 11, qual: 4, race: 20, newcomerBonus: 5, total: 40,
  })
  assert.deepEqual(sheets[0].rows[1], {
    name: 'Андрій', sprint: 1, qual: 0, race: 13, newcomerBonus: 0, total: 14,
  })
  assert.deepEqual(sheets[1].rows[0], {
    name: 'Андрій', sprint: '—', qual: '—', race: null, newcomerBonus: null, total: 0,
  })
})

test('workbook XML has one worksheet per stage, the requested headers, and escaped text', () => {
  const sheets = buildStageExportSheets(stages, players, sessions, forecasts, qualifications, bonuses)
  const xml = buildStageWorkbookXml(sheets)
  assert.equal((xml.match(/<Worksheet ss:Name=/g) || []).length, 2)
  assert.match(xml, /Ім&apos;я/)
  assert.match(xml, /Бонус новачка/)
  assert.match(xml, /Марго &amp; Мія/)
  assert.match(xml, /ss:Name="ГП &lt;Австралія&gt;"/)
  assert.match(xml, /SplitHorizontal>1<\/SplitHorizontal/)
})
