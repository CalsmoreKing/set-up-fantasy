import test from 'node:test'
import assert from 'node:assert/strict'
import { isCompletedGrandPrix, rankEventPodium } from '../src/lib/podium.js'

const players = [
  {id:'a',name:'Anna',team:'A'},
  {id:'b',name:'Bohdan',team:'B'},
  {id:'c',name:'Kateryna',team:'C'},
  {id:'d',name:'Danylo',team:'D'},
]
const sessions = [
  {id:'q',type:'qual',committed:true},
  {id:'s',type:'sprint',committed:true},
  {id:'r',type:'race',committed:true},
]

test('podium sums qualifying, sprint and race points; tied players share one place and score', () => {
  const forecastRows = [
    {session_id:'s',player_id:'a',score:4}, {session_id:'r',player_id:'a',score:12},
    {session_id:'r',player_id:'b',score:17}, {session_id:'r',player_id:'c',score:15},
  ]
  const qualifyingRows = [
    {session_id:'q',player_id:'a',score:2},
    {session_id:'q',player_id:'b',score:1},
    {session_id:'q',player_id:'c',score:1},
  ]
  const podium = rankEventPodium(players, sessions, forecastRows, qualifyingRows)
  assert.deepEqual(podium.map(({place,total,players:group}) => [place,total,group.map(player => player.id)]), [
    [1,18,['a','b']], [2,16,['c']],
  ])
})

test('podium always contains fixed P1, P2 and P3 rows when three score tiers exist', () => {
  const scores = [
    {session_id:'r',player_id:'a',score:30},
    {session_id:'r',player_id:'b',score:20},
    {session_id:'r',player_id:'c',score:10},
    {session_id:'r',player_id:'d',score:10},
  ]
  const podium = rankEventPodium(players, [{id:'r',type:'race',committed:true}], scores, [])
  assert.deepEqual(podium.map(({place,total,players:group}) => [place,total,group.map(player => player.id)]), [
    [1,30,['a']], [2,20,['b']], [3,10,['d','c']],
  ])
})

test('podium totals include newcomer race bonuses without changing the underlying session scores', () => {
  const podium = rankEventPodium(players,[{id:'r',stage_id:'gp',type:'race',committed:true}],[{session_id:'r',player_id:'a',score:8}],[],[{stage_id:'gp',player_id:'b',points:9}])
  assert.equal(podium[0].total,9)
  assert.deepEqual(podium[0].players.map(player=>player.id),['b'])
  assert.equal(podium[1].total,8)
})

test('a GP podium is not final until the race and every scheduled session are committed', () => {
  assert.equal(isCompletedGrandPrix(sessions), true)
  assert.equal(isCompletedGrandPrix([{id:'q',type:'qual',committed:true},{id:'r',type:'race',committed:false}]), false)
  assert.equal(isCompletedGrandPrix([{id:'q',type:'qual',committed:true}]), false)
})
