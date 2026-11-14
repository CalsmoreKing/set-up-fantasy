const PREVIEW_DRAFTS_KEY = 'set-up-fantasy:preview-drafts:v1'

export function readPreviewDrafts() {
  if (typeof window === 'undefined') return { forecasts: [], qual_assignments: [] }
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PREVIEW_DRAFTS_KEY) || '{}')
    return {
      forecasts: Array.isArray(parsed.forecasts) ? parsed.forecasts : [],
      qual_assignments: Array.isArray(parsed.qual_assignments) ? parsed.qual_assignments : [],
    }
  } catch {
    return { forecasts: [], qual_assignments: [] }
  }
}

export function rememberPreviewDraft(table, row) {
  if (!['forecasts', 'qual_assignments'].includes(table) || !row?.session_id || !row?.player_id) return
  if (typeof window === 'undefined') return
  try {
    const drafts = readPreviewDrafts()
    const keyedRows = new Map(drafts[table].map(item => [`${item.session_id}:${item.player_id}`, item]))
    keyedRows.set(`${row.session_id}:${row.player_id}`, { ...row, preview_draft: true })
    drafts[table] = [...keyedRows.values()]
    window.sessionStorage.setItem(PREVIEW_DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    // A browser storage restriction should not prevent local in-page preview edits.
  }
}

export function mergePreviewDraftRows(savedRows, draftRows) {
  const rows = new Map((savedRows || []).map(row => [`${row.session_id}:${row.player_id}`, row]))
  for (const draft of draftRows || []) {
    const key = `${draft.session_id}:${draft.player_id}`
    rows.set(key, { ...rows.get(key), ...draft })
  }
  return [...rows.values()]
}
