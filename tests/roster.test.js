import test from 'node:test'
import assert from 'node:assert/strict'
import { applyStagePilotSubstitutions, buildStagePilotPool, buildQualifyingPilotAssignments, isFinalThreeQualifyingStage, normalizeStageDriver, normalizeStageResults, priorQualAssignments, teammatePilotsAssignedForSession, newcomerPlayersForStage, PILOTS_2026_ORDER, RESERVE_PILOTS_2026, TEAM_RESERVE_PILOTS_2026, USED_PILOTS, qualifyingPlanForAvailable, qualifyingSlotsForStage } from '../src/lib/roster.js'

test('legacy pilot seeds follow the current profile and deduplicate resolved qualifying corrections', () => {
  assert.deepEqual(USED_PILOTS['Даня'], ['Stroll','Sainz'])
  assert.equal(USED_PILOTS['Миколапка'], undefined)
  assert.deepEqual(USED_PILOTS['Андріі'], ['Ocon','Piastri','Norris'])
})

test('stage-scoped reserve changes replace literally without dropping a slot, or deactivate a driver', () => {
  const base = ['Driver A','Driver B','Reserve']
  const changes = [
    { outgoing_driver:'Driver A', incoming_driver:'Reserve', created_at:'2026-01-01' },
    { outgoing_driver:'Driver B', incoming_driver:null, created_at:'2026-01-02' },
  ]
  assert.deepEqual(applyStagePilotSubstitutions(base, changes), ['Reserve','Reserve'])
  assert.deepEqual(base, ['Driver A','Driver B','Reserve'])
})

test('qualifying roulette only blocks duplicate pilots already assigned to a teammate at this GP',()=>{
  const assignments={
    teammate:{player_id:'teammate',session_id:'gp',pilot_1:'Driver A',pilot_2:'Driver B',pilot_4:'Driver G',pilot_6:'Driver I'},
    otherTeam:{player_id:'other',session_id:'gp',pilot_1:'Driver C'},
    previous:{player_id:'teammate',session_id:'old-gp',pilot_1:'Driver D'},
    self:{player_id:'self',session_id:'gp',pilot_1:'Driver E'},
  }
  const taken=teammatePilotsAssignedForSession(assignments,'self','Team X',{teammate:'Team X',other:'Team Y',self:'Team X'},'gp')
  assert.deepEqual([...taken].sort(),['Driver A','Driver B','Driver G','Driver I'])
})

test('qualifying history ignores current and future allocations', () => {
  const rows = [
    {session_id:'old',pilot_1:'Driver A',pred_pos_1:1,pilot_2:'Driver B',pred_pos_2:null,pilot_4:'Driver E',pred_pos_4:4,sessions:{stages:{sort_order:2}}},
    {session_id:'unused',pilot_1:'Driver C',pred_pos_1:null,pilot_4:'Driver F',pred_pos_4:null,sessions:{stages:{sort_order:2}}},
    {session_id:'current',pilot_1:'Driver D',pred_pos_1:1,sessions:{stages:{sort_order:3}}},
    {session_id:'future',pilot_1:'Driver E',pred_pos_1:1,sessions:{stages:{sort_order:4}}},
  ]
  const history = priorQualAssignments(rows,'current',3)
  assert.deepEqual(history.map(row=>row.session_id), ['old'])
  assert.equal(history[0].pilot_1, 'Driver A')
  assert.equal(history[0].pilot_2, '')
  assert.equal(history[0].pilot_4, 'Driver E')
})


test('the final three qualifying rounds allow pilots to repeat across players but never within a player season', () => {
  assert.equal(isFinalThreeQualifyingStage(22), false)
  assert.equal(isFinalThreeQualifyingStage(23), true)
  assert.equal(isFinalThreeQualifyingStage(24), true)
  assert.equal(isFinalThreeQualifyingStage(25), true)
  assert.equal(isFinalThreeQualifyingStage(26), false)

  const players = [
    {id:'mclaren-1',team:'McLaren'},
    {id:'mclaren-2',team:'McLaren'},
    {id:'ferrari-1',team:'Ferrari'},
    {id:'red-bull-1',team:'Red Bull'},
  ]
  const usedByPlayer = Object.fromEntries(players.map(player => [player.id, new Set(PILOTS_2026_ORDER.slice(0,19))]))
  const {assigned, usedByPlayer:updated} = buildQualifyingPilotAssignments(
    players, usedByPlayer, Object.fromEntries(players.map(player => [player.id,3])), PILOTS_2026_ORDER, 23, () => 0.25,
  )
  const finalThree = PILOTS_2026_ORDER.slice(19)
  for (const player of players) {
    assert.equal(assigned[player.id].filter(Boolean).length,3)
    assert.equal(new Set(assigned[player.id]).size,3)
    assert.deepEqual(new Set(assigned[player.id]),new Set(finalThree))
    assert.equal(updated[player.id].size,22)
  }
  for (const pilot of finalThree) assert.equal(players.filter(player => assigned[player.id].includes(pilot)).length,players.length)

  const beforeWaiver = buildQualifyingPilotAssignments(
    players.slice(0,3), usedByPlayer, Object.fromEntries(players.slice(0,3).map(player => [player.id,1])), PILOTS_2026_ORDER, 22, () => 0.25,
  )
  assert.equal(new Set(players.slice(0,3).map(player => beforeWaiver.assigned[player.id][0])).size,3)
})

test('1,000 scenario-runs keep player-specific uniqueness and exhaust every feasible final-round slot plan', () => {
  const remainingCounts = [0,1,3,4,5,6,7,8,9,10,12,14,16,22]
  for (let scenario=0; scenario<1000; scenario++) {
    const players = remainingCounts.map((remaining,id) => ({id:`p${id}`,remaining}))
    const usedByPlayer = Object.fromEntries(players.map(player => [
      player.id,
      new Set(PILOTS_2026_ORDER.slice(0,22-player.remaining)),
    ]))
    const plans = Object.fromEntries(players.map(player => [player.id,qualifyingPlanForAvailable(player.remaining)]))
    let seed = 7654321 + scenario
    const random = () => { seed = seed * 48271 % 2147483647; return seed / 2147483647 }

    for (const order of [23,24,25]) {
      const counts = Object.fromEntries(players.map(player => [player.id,plans[player.id][order]]))
      const round = buildQualifyingPilotAssignments(players,usedByPlayer,counts,PILOTS_2026_ORDER,order,random)
      for (const player of players) {
        const picks = round.assigned[player.id].filter(Boolean)
        assert.equal(picks.length,counts[player.id],`scenario ${scenario}: ${player.id} stage ${order} slot count`)
        assert.equal(new Set([...usedByPlayer[player.id],...picks]).size,usedByPlayer[player.id].size+picks.length,`scenario ${scenario}: ${player.id} stage ${order} duplicates`)
        usedByPlayer[player.id]=round.usedByPlayer[player.id]
      }
    }
    for (const player of players) {
      assert.equal(usedByPlayer[player.id].size,22,`scenario ${scenario}: ${player.id} season total`)
    }
  }
})

test('roulette pool is exactly 22 starters and excludes all reserves', () => {
  assert.equal(PILOTS_2026_ORDER.length, 22)
  assert.equal(PILOTS_2026_ORDER[0], 'Antonelli')
  assert.ok(PILOTS_2026_ORDER.includes('Stroll'))
  assert.ok(PILOTS_2026_ORDER.includes('Pérez'))
  assert.deepEqual(RESERVE_PILOTS_2026, [...new Set(Object.values(TEAM_RESERVE_PILOTS_2026).flat())])
  for (const reserve of RESERVE_PILOTS_2026) assert.ok(!PILOTS_2026_ORDER.includes(reserve))
  assert.ok(TEAM_RESERVE_PILOTS_2026.Haas.includes('Hirakawa'))
  assert.ok(TEAM_RESERVE_PILOTS_2026.Haas.includes('Camara'))
  assert.deepEqual(TEAM_RESERVE_PILOTS_2026.Audi, ['Slater'])
  assert.deepEqual(TEAM_RESERVE_PILOTS_2026['Racing Bulls'], ['Tsunoda','Iwasa'])
})

test('stage pool replaces one active Haas seat with a reserve and remains exactly 22', () => {
  const pool = buildStagePilotPool([{team_name:'Haas',outgoing_driver:'Ocon',incoming_driver:'Hirakawa',is_active:true}])
  assert.equal(pool.length,22)
  assert.ok(!pool.includes('Ocon'))
  assert.ok(pool.includes('Hirakawa'))
  assert.deepEqual(buildStagePilotPool([{team_name:'Ferrari',outgoing_driver:'Leclerc',incoming_driver:'Hirakawa',is_active:true}]), PILOTS_2026_ORDER)
  assert.equal(buildStagePilotPool([]).length,22)
})

test('catch-up qualifying plans cover Vegas, Qatar, and UAE and use the full remaining pilot pool', () => {
  assert.equal(qualifyingSlotsForStage(5,23),1)
  assert.equal(qualifyingSlotsForStage(6,23),2)
  assert.equal(qualifyingSlotsForStage(7,23),2)
  assert.equal(qualifyingSlotsForStage(7,24),4)
  assert.equal(qualifyingSlotsForStage(9,23),3)
  assert.equal(qualifyingSlotsForStage(3,25),3)
  assert.deepEqual(qualifyingPlanForAvailable(5), {23:1,24:2,25:2})
  assert.deepEqual(qualifyingPlanForAvailable(6), {23:2,24:2,25:2})
  assert.deepEqual(qualifyingPlanForAvailable(7), {23:2,24:3,25:2})
  assert.deepEqual(qualifyingPlanForAvailable(12), {23:4,24:4,25:4})
  assert.deepEqual(qualifyingPlanForAvailable(14), {23:4,24:5,25:5})
  assert.deepEqual(qualifyingPlanForAvailable(16), {23:5,24:6,25:5})
  assert.deepEqual(qualifyingPlanForAvailable(22), {23:7,24:8,25:7})
  assert.deepEqual({
    Даня:qualifyingPlanForAvailable(16),
    Педрі:qualifyingPlanForAvailable(12),
    Хексі:qualifyingPlanForAvailable(14),
  }, {
    Даня:{23:5,24:6,25:5},
    Педрі:{23:4,24:4,25:4},
    Хексі:{23:4,24:5,25:5},
  })
  assert.equal(qualifyingSlotsForStage(11,24),6)
  assert.equal(qualifyingSlotsForStage(5,25),5)
  assert.deepEqual(qualifyingPlanForAvailable(0), {23:0,24:0,25:0})
})

test('newcomer bonuses cover every GP before a late entrant’s first race, but not a mid-season absence', () => {
  const players=[{id:'andriy',name:'Андрій'},{id:'danya',name:'Даня'},{id:'regular',name:'Калсмор'},{id:'future',name:'Новий гравець'}]
  const sessions=[
    {id:'aus',type:'race',committed:true,stages:{sort_order:1}},
    {id:'china',type:'race',committed:true,stages:{sort_order:2}},
    {id:'miami',type:'race',committed:true,stages:{sort_order:6}},
    {id:'monaco',type:'race',committed:true,stages:{sort_order:8}},
    {id:'later',type:'race',committed:true,stages:{sort_order:10}},
  ]
  const forecasts=[
    {player_id:'andriy',session_id:'miami',predictions:{1:'A'}},
    {player_id:'danya',session_id:'monaco',predictions:{1:'A'}},
    {player_id:'regular',session_id:'aus',predictions:{1:'A'}},
    {player_id:'future',session_id:'later',predictions:{1:'A'}},
  ]
  assert.deepEqual(newcomerPlayersForStage(players,2,sessions,forecasts).map(player=>player.id).sort(),['andriy','danya','future'])
  assert.deepEqual(newcomerPlayersForStage(players,6,sessions,forecasts).map(player=>player.id).sort(),['danya','future'])
  assert.deepEqual(newcomerPlayersForStage(players,8,sessions,forecasts).map(player=>player.id),['future'])
  assert.deepEqual(newcomerPlayersForStage(players,9,sessions,forecasts).map(player=>player.id),['future'])
})

test('event replacement normalizes saved picks and real result names only for that event', () => {
  const changes = [{ outgoing_driver:'Ocon', incoming_driver:'Hirakawa', is_active:true }]
  assert.equal(normalizeStageDriver('Ocon', changes), 'Hirakawa')
  assert.deepEqual(normalizeStageResults({1:'Norris',2:'Ocon'}, changes), {1:'Norris',2:'Hirakawa'})
})
