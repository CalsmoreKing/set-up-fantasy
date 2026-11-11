import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStageTotals, calculateNewcomerBonuses, podiumPlayers, rankPlayers } from '../src/lib/standings.js'
import { applyStagePilotSubstitutions, priorQualAssignments } from '../src/lib/roster.js'

test('event totals include only committed sessions and sum qualifying, sprint, and race', () => {
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
  const sessions = [
    { id: 'q', stage_id: 'gp', type: 'qual', committed: true },
    { id: 's', stage_id: 'gp', type: 'sprint', committed: true },
    { id: 'r', stage_id: 'gp', type: 'race', committed: true },
    { id: 'uncommitted', stage_id: 'gp', type: 'race', committed: false },
  ]
  const forecasts = [
    { session_id: 's', player_id: 'a', score: 4 },
    { session_id: 'r', player_id: 'a', score: 11 },
    { session_id: 'r', player_id: 'b', score: 14 },
    { session_id: 'uncommitted', player_id: 'b', score: 99 },
  ]
  const quals = [
    { session_id: 'q', player_id: 'a', score: 2 },
    { session_id: 'q', player_id: 'b', score: 1 },
  ]
  const totals = buildStageTotals(players, sessions, forecasts, quals).gp
  assert.deepEqual(totals.a, { qual: 2, sprint: 4, race: 11, total: 17, hasScore: true })
  assert.deepEqual(totals.b, { qual: 1, sprint: 0, race: 14, total: 15, hasScore: true })
  const withBonus = buildStageTotals(players, sessions, forecasts, quals, [{stage_id:'gp',player_id:'b',points:7}]).gp
  assert.equal(withBonus.b.total, 22)
})

test('competition ranks share ties and skip the next place', () => {
  const players = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: `Player ${i}` }))
  const totals = { a: { total: 30 }, b: { total: 30 }, c: { total: 20 }, d: { total: 10 } }
  assert.deepEqual(rankPlayers(players, totals).map(row => [row.id, row.place]), [['a', 1], ['b', 1], ['c', 3], ['d', 4]])
  assert.deepEqual(podiumPlayers(players, totals).map(row => row.id), ['a', 'b', 'c'])
})

test('newcomer bonus uses the lowest whole-event score only for explicitly eligible newcomers after the stage is complete', () => {
  const players = [{id:'experienced'}, {id:'rookie'}, {id:'no_prediction'}]
  const sessions = [
    {id:'q',type:'qual',committed:true},
    {id:'r',type:'race',committed:true},
  ]
  const forecasts = [
    {session_id:'r',player_id:'experienced',score:5,predictions:{1:'Norris'}},
    {session_id:'r',player_id:'rookie',score:0,predictions:{}},
  ]
  const quals = [{session_id:'q',player_id:'experienced',score:2,pilot_1:'Norris',pred_pos_1:1}]
  assert.deepEqual(calculateNewcomerBonuses(players, sessions, forecasts, quals, ['rookie']), {
    ready:true, minimum:7, bonuses:[{player_id:'rookie',points:7}],
  })
  assert.equal(calculateNewcomerBonuses(players, [{...sessions[0],committed:false},sessions[1]], forecasts, quals, ['rookie']).ready, false)
  assert.equal(calculateNewcomerBonuses(players, sessions, [{...forecasts[0],score:null}], quals, ['rookie']).ready, false)
})
