import test from 'node:test'
import assert from 'node:assert/strict'
import { mergePreviewDraftRows } from '../src/lib/previewDrafts.js'

test('preview season dry-run overlays saved local drafts without changing unrelated forecasts', () => {
  const saved = [
    { id:'saved-1',session_id:'race-belgium',player_id:'chuck',score:6,predictions:{1:'Norris'} },
    { id:'saved-2',session_id:'race-belgium',player_id:'neptune',score:22,predictions:{1:'Antonelli'} },
  ]
  const drafts = [
    { id:'saved-1',session_id:'race-belgium',player_id:'chuck',predictions:{1:'Antonelli'},preview_draft:true },
    { id:'preview-new',session_id:'qual-belgium',player_id:'chuck',pilot_1:'Antonelli',preview_draft:true },
  ]

  assert.deepEqual(mergePreviewDraftRows(saved,drafts),[
    { id:'saved-1',session_id:'race-belgium',player_id:'chuck',score:6,predictions:{1:'Antonelli'},preview_draft:true },
    { id:'saved-2',session_id:'race-belgium',player_id:'neptune',score:22,predictions:{1:'Antonelli'} },
    { id:'preview-new',session_id:'qual-belgium',player_id:'chuck',pilot_1:'Antonelli',preview_draft:true },
  ])
})
