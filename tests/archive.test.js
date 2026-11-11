import test from 'node:test'
import assert from 'node:assert/strict'
import { ARCHIVE_BASELINE, ARCHIVE_BASELINE_TOTAL, archiveBaselineForPlayer } from '../src/lib/archive.js'
import { newcomerPlayersForStage } from '../src/lib/roster.js'

test('screenshot archive baselines total 2035 without adding green deltas', () => {
  assert.equal(ARCHIVE_BASELINE_TOTAL, 2035)
  assert.equal(Object.keys(ARCHIVE_BASELINE).length, 18)
  assert.equal(archiveBaselineForPlayer('Андріі'), 94)
  assert.equal(archiveBaselineForPlayer('Даня'), 90)
  assert.equal(archiveBaselineForPlayer('Педрі'), 0)
  assert.equal(archiveBaselineForPlayer('Хексі'), 0)
  assert.equal(archiveBaselineForPlayer('Невідомий'), null)
})

test('Porsche profiles receive newcomer eligibility through round 15, not Madrid onward', () => {
  const players = [{id:'pedri',name:'Педрі'}, {id:'hexi',name:'Хексі'}, {id:'andrii',name:'Андріі'}]
  assert.deepEqual(newcomerPlayersForStage(players, 15).map(player=>player.id), ['pedri','hexi'])
  assert.deepEqual(newcomerPlayersForStage(players, 16), [])
})
