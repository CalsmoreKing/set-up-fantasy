import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ARCHIVE_PREVIEW = JSON.parse(readFileSync(new URL('../src/data/archivePreview.json', import.meta.url), 'utf8'))

test('archive preview stays local, read-only, and keeps real session/result records', () => {
  assert.equal(ARCHIVE_PREVIEW.read_only_preview, true)
  assert.equal(ARCHIVE_PREVIEW.production_written, false)
  assert.equal(ARCHIVE_PREVIEW.sessions.length, 15)
  assert.equal(ARCHIVE_PREVIEW.forecasts.length, 114)
  assert.equal(ARCHIVE_PREVIEW.qualifying_assignments.length, 42)
  assert.ok(ARCHIVE_PREVIEW.sessions.every(session => session.results && session.stage_key && session.type))
  assert.ok(ARCHIVE_PREVIEW.forecasts.every(row => row.player_name && row.predictions && row.session_id))
})

test('Shanghai archive totals include its available race, sprint, and qualifying predictions', () => {
  const stageKey = 'china'
  const totals = new Map()
  for (const row of ARCHIVE_PREVIEW.forecasts.filter(item => item.stage_key === stageKey)) {
    const score = totals.get(row.player_id) || { qual:0, sprint:0, race:0, total:0 }
    score[row.session_type] += Number(row.score) || 0
    score.total += Number(row.score) || 0
    totals.set(row.player_id, score)
  }
  for (const row of ARCHIVE_PREVIEW.qualifying_assignments.filter(item => item.stage_key === stageKey)) {
    const score = totals.get(row.player_id) || { qual:0, sprint:0, race:0, total:0 }
    score.qual += Number(row.score) || 0
    score.total += Number(row.score) || 0
    totals.set(row.player_id, score)
  }
  assert.ok(totals.size > 0)
  assert.ok([...totals.values()].some(row => row.race > 0))
  assert.ok([...totals.values()].some(row => row.sprint > 0))
  assert.ok(ARCHIVE_PREVIEW.qualifying_assignments.some(row => row.stage_key === stageKey))
  assert.ok(ARCHIVE_PREVIEW.qualifying_assignments.some(row => row.stage_key === 'australia' && row.score > 0))
})
