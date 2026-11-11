import test from 'node:test'
import assert from 'node:assert/strict'
import { calcRaceScore, calcSprintScore, explainForecastScoreDifference, explainQualifyingScoreDifference, hasForecastSubmission, hasQualifyingPrediction, hasSavedForecastPickMismatch, isOvertakeWinner, parseOvertakeWinners, recalculateForecast, recalculateQualAssignment } from '../src/lib/scoring.js'

const brazilRace = {
  type: 'race',
  results: {
    1:'Norris', 2:'Verstappen', 3:'Hadjar', 4:'Russell', 5:'Antonelli',
    6:'Piastri', 7:'Lawson', 8:'Leclerc', 9:'Hamilton', 10:'Hülkenberg',
  },
  fl_pilot: 'Antonelli',
  ov_pilot: 'Verstappen',
}

const margoForecast = {
  score: 50,
  predictions: {
    1:'Antonelli', 2:'Norris', 3:'Hadjar', 4:'Russell', 5:'Verstappen',
    6:'Piastri', 7:'Leclerc', 8:'Lawson', 9:'Hamilton', 10:'Hülkenberg',
  },
  fl_pick: 'Antonelli',
  ov_pick: 'Verstappen',
  scored_input:{ predictions:{1:'Antonelli',2:'Norris',3:'Hadjar',4:'Russell',5:'Verstappen',6:'Piastri',7:'Leclerc',8:'Lawson',9:'Hamilton',10:'Hülkenberg'}, fl_pick:'Antonelli', ov_pick:'Verstappen' },
}

test('race scoring strictly ignores actual results outside the top ten', () => {
  const topTen = ['Norris','Verstappen','Hadjar','Russell','Antonelli','Piastri','Lawson','Leclerc','Hamilton','Hülkenberg']
  const withLowerPlaces = [...topTen, 'Alonso','Ocon','Bortoleto']
  const predictions = Array.from({ length:10 }, (_, index) => topTen[index])
  const topTenScore = calcRaceScore(predictions, '', '', topTen, '', '')
  const fullOrderScore = calcRaceScore(predictions, '', '', withLowerPlaces, '', '')
  assert.deepEqual(fullOrderScore, topTenScore)
  assert.equal(calcRaceScore(['Alonso', ...Array(9).fill('')], '', '', withLowerPlaces, '', '').total, 0)
})

test('sprint scores the top-five picks as 3 exact, 2 one place off, 1 two places off, and otherwise 0', () => {
  const results = ['A','B','C','D','E','F','G']
  const predictions = ['A','C','E','G','B']
  const scored = calcSprintScore(predictions, results)
  assert.equal(scored.total, 3 + 2 + 1 + 0 + 0)
  assert.deepEqual(scored.breakdown.map(item => item.pts), [3,2,1])
})

test('all tied maximum breakthrough drivers qualify for the bonus', () => {
  const winners = 'Verstappen, Piastri, Alonso'
  assert.deepEqual(parseOvertakeWinners(winners), ['Verstappen','Piastri','Alonso'])
  assert.equal(isOvertakeWinner('Verstappen', winners), true)
  assert.equal(isOvertakeWinner('Piastri', winners), true)
  assert.equal(isOvertakeWinner('Alonso', winners), true)
  assert.equal(isOvertakeWinner('Norris', winners), false)
  assert.equal(calcRaceScore(Array(10).fill(''), '', 'Piastri', [], '', winners).total, 4)
})

test('Australia–Barcelona race scoring gives exact rank points, one point for one-place errors, and the stated bonuses', () => {
  const results = ['A','B','C','D','E','F','G','H','I','J']
  const exact = calcRaceScore(results, 'F', '', results, 'F', '', 9)
  assert.equal(exact.total, 55 + 1 + 1 + 4) // 10..1, winner, fastest lap, exact top-three set.
  assert.deepEqual(exact.breakdown.map(item => item.pts), [10,9,8,7,6,5,4,3,2,1,1,1,4])

  const oneOff = ['B','A','C','D','E','F','G','H','I','J']
  assert.equal(calcRaceScore(oneOff, '', '', results, '', '', 9).total, 42)
  const twoOff = ['C','B','A', ...results.slice(3)]
  assert.equal(calcRaceScore(twoOff, '', '', results, '', '', 9).total, 41) // the exact P2 pick and remaining exact ranks score; top-three set bonus remains.
  const duplicatePrediction = ['A','A','C', ...Array(7).fill('')]
  assert.equal(calcRaceScore(duplicatePrediction, '', '', results, '', '', 9).breakdown.some(item => item.label === '🏆 Склад Топ-3'), false)
  assert.equal(calcRaceScore(results, '', 'A', results, '', 'A', 9).total, 60) // no unlisted overtake bonus.
})

test('Australia–Barcelona sprint uses the same ten-place scoring table', () => {
  const results = ['A','B','C','D','E','F','G','H','I','J']
  assert.equal(calcSprintScore(results, results, 9).total, 60)
  assert.equal(calcSprintScore(['B','A','C','D','E','F','G','H','I','J'], results, 9).total, 42)
  assert.equal(calcSprintScore(['C','B','A', ...results.slice(3)], results, 9).total, 41)
  assert.equal(calcSprintScore(results, results, 9, 'F', 'F').total, 61)
})

test('current race rules award two points for top-three and top-five sets in any order', () => {
  const predictions = ['Verstappen','Norris','Hadjar','Piastri','Leclerc', ...Array(5).fill('')]
  const results = ['Norris','Verstappen','Hadjar','Leclerc','Piastri']
  const scored = calcRaceScore(predictions, '', '', results, '', '', 10)
  assert.equal(scored.breakdown.find(item => item.label === '🏆 Склад Топ-3')?.pts, 2)
  assert.equal(scored.breakdown.find(item => item.label === '🏆 Склад Топ-5')?.pts, 2)
})

test('audit recalculates the immutable scored forecast against current results and preserves edited drafts', () => {
  const edited = { ...margoForecast, predictions:{...margoForecast.predictions,1:'Norris'} }
  const recalculated = recalculateForecast(brazilRace, edited)
  assert.equal(recalculated.recalculated, true)
  assert.equal(recalculated.verifiable, true)
  assert.equal(recalculated.stale, true)
  assert.equal(recalculated.score, 44)
  const currentDraft = recalculateForecast(brazilRace, edited, undefined, {useCurrentInput:true})
  assert.notEqual(currentDraft.score, recalculated.score)
  assert.equal(margoForecast.score, 50)
})

test('historical race audits recalculate with Australia–Barcelona bonuses', () => {
  const session = { type:'race', stage_sort_order:9, results:{1:'A',2:'B',3:'C',4:'D',5:'E'} }
  const forecast = {
    score:0,
    predictions:{1:'C',2:'A',3:'B'},
    scored_input:{predictions:{1:'C',2:'A',3:'B'},fl_pick:'',ov_pick:''},
  }
  const result = recalculateForecast(session, forecast, 9)
  assert.equal(result.recalculated, true)
  assert.equal(result.verifiable, true)
  assert.equal(result.ruleVersion, 'legacy-australia-barcelona')
  assert.equal(result.score, 6) // two one-place hits plus 4 for the correctly guessed top-three set.
  assert.equal(result.breakdown.some(item => item.label === '🏆 Склад Топ-5'), false)
})

test('legacy rows without scored snapshots retain stored scores and are marked unverifiable', () => {
  const legacy = {score:50,predictions:{1:'Norris'}}
  const result = recalculateForecast({...brazilRace,stage_sort_order:10},legacy,10)
  assert.equal(result.score,50)
  assert.equal(result.recalculated,false)
  assert.equal(result.verifiable,false)
  assert.equal(result.ruleVersion,'legacy-no-snapshot')
})

test('Belgium saved forecasts score under the current bonus rules while preserving the legacy bonus by stage', () => {
  const belgiumTopTen = ['Antonelli','Leclerc','Verstappen','Hamilton','Piastri','Hadjar','Norris','Bortoleto','Lindblad','Colapinto']
  const chak = ['Antonelli','Verstappen','Hamilton','Leclerc','Russell','Norris','Piastri','Lindblad','Bortoleto','Gasly']
  const kal = ['Antonelli','Verstappen','Leclerc','Hamilton','Russell','Norris','Piastri','Lindblad','Bortoleto','Lawson']
  assert.equal(calcRaceScore(chak, 'Hamilton', 'Hadjar', belgiumTopTen, 'Norris', 'Hadjar', 10).total, 25)
  assert.equal(calcRaceScore(kal, 'Hamilton', 'Norris', belgiumTopTen, 'Norris', 'Hadjar', 10).total, 27)
  const legacy = calcRaceScore(kal, 'Hamilton', 'Norris', belgiumTopTen, 'Norris', 'Hadjar', 9)
  assert.equal(legacy.breakdown.some(item => item.label === '🏆 Склад Топ-5'), false)
  assert.equal(legacy.breakdown.some(item => item.label === '🚀 Прорив'), false)
})

test('saved breakdown conflicts preserve historical score instead of recalculating from a changed forecast', () => {
  const changedForecast = {
    score: 25,
    predictions:{1:'Norris',2:'Piastri'},
    score_breakdown:[
      { label:'P1 Antonelli → факт P1', pts:5 },
      { label:'P2 Verstappen → факт P3', pts:2 },
    ],
  }
  assert.equal(hasSavedForecastPickMismatch(changedForecast), true)
  const result = recalculateForecast({ ...brazilRace, stage_sort_order:10 }, changedForecast, 10)
  assert.equal(result.score, 25)
  assert.equal(result.recalculated, false)
  assert.equal(result.ruleVersion, 'legacy-no-snapshot')
  assert.equal(result.verifiable, false)
  const explanation = explainForecastScoreDifference(
    changedForecast, 25, changedForecast.score_breakdown, result.score, ['Antonelli','Leclerc','Verstappen'],
  )
  assert.match(explanation, /P1 стоїть Antonelli/)
  assert.match(explanation, /поточний запис містить Norris/)
  assert.match(explanation, /залишено збережені 25 балів без перерахунку/)
  assert.equal(hasSavedForecastPickMismatch({predictions:{1:'Norris'},score_breakdown:[]}), false)
  assert.match(explainQualifyingScoreDifference(7, 3), /збережено лише загальну суму/)
})

test('qualifying coverage ignores assignments with no submitted prediction', () => {
  assert.equal(hasForecastSubmission({predictions:{1:'Norris'}}), true)
  assert.equal(hasForecastSubmission({predictions:{1:''},fl_pick:'',ov_pick:''}), false)
  assert.equal(hasQualifyingPrediction({pilot_1:'Leclerc',pred_pos_1:null}), false)
  assert.equal(hasQualifyingPrediction({pilot_1:'Leclerc',pred_pos_1:7}), true)
})

test('qualifying audits use the stored scored assignment, not a later edited draft', () => {
  const assignment = {
    score: 3,
    pilot_1: 'Stroll', pred_pos_1: 8,
    pilot_2: 'Stroll', pred_pos_2: 22,
    pilot_3: '', pred_pos_3: null,
    scored_input:{pilot_1:'Hadjar',pred_pos_1:8,pilot_2:'Stroll',pred_pos_2:22,pilot_3:'',pred_pos_3:null},
  }
  const result = recalculateQualAssignment({ type:'qual', stage_sort_order:10, results: { 1:'Norris', 2:'Russell', 3:'Antonelli', 4:'Leclerc', 5:'Lawson', 6:'Hülkenberg', 7:'Hadjar', 8:'Bearman' } }, assignment)
  assert.equal(result.score, 3)
  assert.equal(result.recalculated, true)
  assert.equal(result.stale,true)
  assert.ok(result.breakdown[0].label.includes('факт P7'))
})

test('qualifying uses roulette from Canada and one point for a correct pole pick before Canada', () => {
  const assignment = {
    score: 0,
    pilot_1:'Norris', pred_pos_1:null,
    pilot_2:'Russell', pred_pos_2:null,
    pilot_3:'', pred_pos_3:null,
    scored_input:{pilot_1:'Norris',pred_pos_1:null,pilot_2:'Russell',pred_pos_2:null,pilot_3:'',pred_pos_3:null},
  }
  const session = { type:'qual', stage_sort_order:7, results:{1:'Russell',2:'Norris',3:'Antonelli'} }
  const roulette = recalculateQualAssignment(session, { ...assignment, pred_pos_1:1, pred_pos_2:2, scored_input:{...assignment.scored_input,pred_pos_1:1,pred_pos_2:2} }, 7)
  assert.equal(roulette.recalculated, true)
  assert.equal(roulette.score, 6)

  const poleOnly = recalculateQualAssignment({ ...session, stage_sort_order:6 }, assignment, 6)
  assert.equal(poleOnly.recalculated, true)
  assert.equal(poleOnly.score, 0)
  assert.equal(poleOnly.ruleVersion, 'legacy-pole-only')

  const correctPole = recalculateQualAssignment({ ...session, stage_sort_order:6, results:{1:'Norris',2:'Russell'} }, assignment, 6)
  assert.equal(correctPole.score, 1)
  assert.equal(correctPole.breakdown[0].pts, 1)
})

test('without official results the audit reports the persisted score without claiming a recalculation', () => {
  const result = recalculateForecast({ type:'race', results:{} }, margoForecast)
  assert.equal(result.score, 50)
  assert.equal(result.recalculated, false)
})
