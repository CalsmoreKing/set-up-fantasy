import test from 'node:test'
import assert from 'node:assert/strict'
import { buildManualReviewQueue, inputForReviewItem, scoreManualReviewItem, isManualReviewMismatch, sessionSortOrder } from './manualReview.js'

test('manual review queue follows event order and includes only committed player entries',()=>{
  const sessions=[
    {id:'race-2',stage_id:'b',type:'race',committed:true,stages:{sort_order:2}},
    {id:'missed-qual-2',stage_id:'b',type:'qual',committed:true,stages:{sort_order:2}},
    {id:'race-1',stage_id:'a',type:'race',committed:true,stages:{sort_order:1}},
    {id:'sprint-1',stage_id:'a',type:'sprint',committed:true,stages:{sort_order:1}},
    {id:'qual-1',stage_id:'a',type:'qual',committed:true,stages:{sort_order:1}},
    {id:'future',stage_id:'c',type:'race',committed:false,stages:{sort_order:3}},
  ]
  const forecasts=[{id:'f2',player_id:'p',session_id:'race-2'},{id:'f1',player_id:'p',session_id:'race-1'},{id:'fs',player_id:'p',session_id:'sprint-1'}]
  const qualifications=[{id:'q1',player_id:'p',session_id:'qual-1'}]
  const queue=buildManualReviewQueue({playerId:'p',sessions,forecasts,qualifications,eligibleBonusStageIds:['a']})
  assert.deepEqual(queue.map(item=>item.session.id),['qual-1','sprint-1','race-1','missed-qual-2','race-2'])
  assert.equal(queue.find(item=>item.session.id==='missed-qual-2').missed,true)
  assert.equal(queue.find(item=>item.session.id==='missed-qual-2').row,null)
  assert.deepEqual(sessionSortOrder(sessions[4]).slice(0,2),[1,0])
})

test('manual review input keeps five sprint positions and calculates top-five 6/3/1 scoring',()=>{
  const item={kind:'forecast',session:{id:'s',type:'sprint',results:['A','B','C','D','E'],stages:{sort_order:1}},row:{predictions:{1:'B',2:'A',3:'C',4:'D',5:'E',6:'ignored'},fl_pick:'A'}}
  const input=inputForReviewItem(item)
  assert.equal(Object.keys(input.predictions).length,5)
  assert.equal(input.fl_pick,'')
  assert.deepEqual(input.predictions,{1:'B',2:'A',3:'C',4:'D',5:'E'})
  const scored=scoreManualReviewItem(item,input)
  assert.equal(scored.score,24)
  assert.equal(isManualReviewMismatch(24,scored.score),false)
  assert.equal(isManualReviewMismatch(27,scored.score),true)
})

test('qualifying manual editor carries player picks and their submitted positions',()=>{
  const item={kind:'qual',session:{type:'qual',results:['A','B','C'],stages:{sort_order:10}},row:{pilot_1:'A',pred_pos_1:1,pilot_2:'B',pred_pos_2:2,pilot_3:'C',pred_pos_3:3}}
  const input=inputForReviewItem(item)
  assert.equal(input.pred_pos_3,3)
  assert.equal(scoreManualReviewItem(item,input).score,18)
})
