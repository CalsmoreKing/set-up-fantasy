import test from 'node:test'
import assert from 'node:assert/strict'
import { hasForecastSubmission, hasQualifyingPrediction, recalculateForecast, recalculateQualAssignment } from '../src/lib/scoring.js'

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
}

test('audit recalculates the saved race forecast against the latest penalty-adjusted results without writing it', () => {
  const recalculated = recalculateForecast(brazilRace, margoForecast)
  assert.equal(recalculated.recalculated, true)
  assert.equal(recalculated.score, 44)
  assert.equal(margoForecast.score, 50)
  const qualifying = recalculateQualAssignment(
    { results: { 1:'Norris', 2:'Russell', 3:'Antonelli', 4:'Leclerc', 5:'Lawson', 6:'Hülkenberg', 7:'Hadjar', 8:'Bearman' } },
    { score:3, pilot_1:'Hadjar', pred_pos_1:8, pilot_2:'Stroll', pred_pos_2:22 },
  )
  assert.equal(recalculated.score + qualifying.score, 47)
  assert.equal(margoForecast.score + qualifying.score, 53)
  assert.ok(recalculated.breakdown.some(item => item.label.includes('Leclerc → факт P8')))
})

test('qualifying coverage ignores assignments with no submitted prediction', () => {
  assert.equal(hasForecastSubmission({predictions:{1:'Norris'}}), true)
  assert.equal(hasForecastSubmission({predictions:{1:''},fl_pick:'',ov_pick:''}), false)
  assert.equal(hasQualifyingPrediction({pilot_1:'Leclerc',pred_pos_1:null}), false)
  assert.equal(hasQualifyingPrediction({pilot_1:'Leclerc',pred_pos_1:7}), true)
})

test('audit recalculates qualifying slots from the current official order', () => {
  const assignment = {
    score: 3,
    pilot_1: 'Hadjar', pred_pos_1: 8,
    pilot_2: 'Stroll', pred_pos_2: 22,
    pilot_3: '', pred_pos_3: null,
  }
  const result = recalculateQualAssignment({ results: { 1:'Norris', 2:'Russell', 3:'Antonelli', 4:'Leclerc', 5:'Lawson', 6:'Hülkenberg', 7:'Hadjar', 8:'Bearman' } }, assignment)
  assert.equal(result.score, 3)
  assert.equal(result.recalculated, true)
  assert.ok(result.breakdown[0].label.includes('факт P7'))
})

test('without official results the audit reports the persisted score without claiming a recalculation', () => {
  const result = recalculateForecast({ type:'race', results:{} }, margoForecast)
  assert.equal(result.score, 50)
  assert.equal(result.recalculated, false)
})
