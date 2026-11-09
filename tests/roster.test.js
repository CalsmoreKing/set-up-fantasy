import test from 'node:test'
import assert from 'node:assert/strict'
import { applyStagePilotSubstitutions, priorQualAssignments } from '../src/lib/roster.js'

test('stage-scoped reserve changes replace or deactivate a driver without mutating the base roster', () => {
  const base = ['Driver A','Driver B','Reserve']
  const changes = [
    { outgoing_driver:'Driver A', incoming_driver:'Reserve', created_at:'2026-01-01' },
    { outgoing_driver:'Driver B', incoming_driver:null, created_at:'2026-01-02' },
  ]
  assert.deepEqual(applyStagePilotSubstitutions(base, changes), ['Reserve'])
  assert.deepEqual(base, ['Driver A','Driver B','Reserve'])
})

test('qualifying history ignores current and future allocations', () => {
  const rows = [
    {session_id:'old',pilot_1:'Driver A',pred_pos_1:1,pilot_2:'Driver B',pred_pos_2:null,sessions:{stages:{sort_order:2}}},
    {session_id:'unused',pilot_1:'Driver C',pred_pos_1:null,sessions:{stages:{sort_order:2}}},
    {session_id:'current',pilot_1:'Driver D',pred_pos_1:1,sessions:{stages:{sort_order:3}}},
    {session_id:'future',pilot_1:'Driver E',pred_pos_1:1,sessions:{stages:{sort_order:4}}},
  ]
  const history = priorQualAssignments(rows,'current',3)
  assert.deepEqual(history.map(row=>row.session_id), ['old'])
  assert.equal(history[0].pilot_1, 'Driver A')
  assert.equal(history[0].pilot_2, '')
})
