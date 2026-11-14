import test from 'node:test'
import assert from 'node:assert/strict'
import { strFromU8, unzipSync } from 'fflate'
import { buildStageExportSheets, buildStageWorkbookXlsx } from './stageWorkbook.js'

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

test('xlsx is a multi-sheet workbook with requested headers and escaped cell values', () => {
  const sheets = buildStageExportSheets(stages, players, sessions, forecasts, qualifications, bonuses)
  const files = unzipSync(buildStageWorkbookXlsx(sheets))
  const workbook = strFromU8(files['xl/workbook.xml'])
  const firstSheet = strFromU8(files['xl/worksheets/sheet1.xml'])
  const secondSheet = strFromU8(files['xl/worksheets/sheet2.xml'])
  assert.match(workbook, /name="ГП &lt;Австралія&gt;"/)
  assert.match(workbook, /name="Наступний етап"/)
  assert.match(firstSheet, /Ім&apos;я/)
  assert.match(firstSheet, /Бонус новачка/)
  assert.match(firstSheet, /Марго &amp; Мія/)
  assert.match(firstSheet, /<v>40<\/v>/)
  assert.match(firstSheet, /state="frozen"/)
  assert.match(secondSheet, /<autoFilter ref="A1:F3"\/>/)
  assert.ok(files['[Content_Types].xml'])
  assert.ok(files['xl/styles.xml'])
})
