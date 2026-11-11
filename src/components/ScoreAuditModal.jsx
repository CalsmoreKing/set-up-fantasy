import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { recalculateForecast, recalculateQualAssignment, resultsList } from '../lib/scoring'
import CountryFlag from './CountryFlag'

const SESSION_ORDER = { qual: 0, sprint: 1, race: 2 }
const SESSION_LABEL = { qual: 'Кваліфікація', sprint: 'Спринт', race: 'Гонка' }

export default function ScoreAuditModal({ open, onClose, players: initialPlayers = [] }) {
  const [stages, setStages] = useState([])
  const [players, setPlayers] = useState(initialPlayers)
  const [stageId, setStageId] = useState('')
  const [stageAudits, setStageAudits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) loadAuditData() }, [open])

  async function loadAuditData() {
    setLoading(true)
    setError('')
    try {
      const [stagesResult, sessionsResult, playersResult] = await Promise.all([
        supabase.from('stages').select('id,name,flag,sort_order').order('sort_order'),
        supabase.from('sessions').select('id,stage_id,type,committed,results,fl_pilot,ov_pilot').in('type', ['qual', 'sprint', 'race']),
        supabase.from('players').select('id,name,team,base_pts').order('name'),
      ])
      const firstError = stagesResult.error || sessionsResult.error || playersResult.error
      if (firstError) throw firstError
      const stagesData = stagesResult.data || []
      const activeStageIds = new Set(stagesData.map(stage => stage.id))
      const sessions = (sessionsResult.data || []).filter(session => activeStageIds.has(session.stage_id))
      const committedSessions = sessions.filter(session => session.committed)
      const committedIds = committedSessions.map(session => session.id)
      const qualIds = committedSessions.filter(session => session.type === 'qual').map(session => session.id)
      const [forecastsResult, qualifyingResult] = await Promise.all([
        committedIds.length
          ? supabase.from('forecasts').select('id,session_id,player_id,score,score_breakdown,scored_input,predictions,fl_pick,ov_pick').in('session_id', committedIds)
          : Promise.resolve({ data: [], error: null }),
        qualIds.length
          ? supabase.from('qual_assignments').select('id,session_id,player_id,score,scored_input,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id', qualIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (forecastsResult.error) throw forecastsResult.error
      if (qualifyingResult.error) throw qualifyingResult.error

      const stageOrderById = new Map(stagesData.map(stage => [stage.id, stage.sort_order]))
      const sessionById = new Map(sessions.map(session => [session.id, { ...session, stage_sort_order:stageOrderById.get(session.stage_id) }]))
      const rowsBySession = new Map()
      const addRow = (sessionId, row) => {
        const rows = rowsBySession.get(sessionId) || []
        rows.push(row)
        rowsBySession.set(sessionId, rows)
      }
      for (const row of forecastsResult.data || []) {
        const session = sessionById.get(row.session_id)
        const recalculated = recalculateForecast(session, row, session.stage_sort_order)
        addRow(row.session_id, {
          playerId: row.player_id,
          savedScore: Number(row.score) || 0,
          currentScore: recalculated.score,
          recalculated: recalculated.recalculated,
          verifiable: recalculated.verifiable,
          stale: recalculated.stale,
          ruleVersion: recalculated.ruleVersion,
          currentBreakdown: recalculated.breakdown,
          savedBreakdown: row.score_breakdown || [],
          forecast: row,
        })
      }
      for (const row of qualifyingResult.data || []) {
        const session = sessionById.get(row.session_id)
        const recalculated = recalculateQualAssignment(session, row, session.stage_sort_order)
        addRow(row.session_id, {
          playerId: row.player_id,
          savedScore: Number(row.score) || 0,
          currentScore: recalculated.score,
          recalculated: recalculated.recalculated,
          verifiable: recalculated.verifiable,
          stale: recalculated.stale,
          ruleVersion: recalculated.ruleVersion,
          currentBreakdown: recalculated.breakdown,
          savedBreakdown: [],
          qualifying: row,
        })
      }

      const audits = stagesData.map(stage => {
        const stageSessions = sessions.filter(session => session.stage_id === stage.id)
          .sort((a, b) => (SESSION_ORDER[a.type] ?? 9) - (SESSION_ORDER[b.type] ?? 9))
        const totals = new Map()
        const sessionAudits = stageSessions.map(session => {
          const rows = [...(rowsBySession.get(session.id) || [])]
            .map(row => ({ ...row, player: (playersResult.data || []).find(player => player.id === row.playerId) }))
            .filter(row => row.player)
            .sort((a, b) => b.currentScore - a.currentScore || a.player.name.localeCompare(b.player.name, 'uk'))
          for (const row of rows) {
            const total = totals.get(row.playerId) || { saved: 0, current: 0 }
            total.saved += row.savedScore
            total.current += row.currentScore
            totals.set(row.playerId, total)
          }
          return { session, rows, results: resultsList(session.results) }
        })
        const stageTotals = [...totals.entries()]
          .map(([playerId, points]) => ({ player: (playersResult.data || []).find(player => player.id === playerId), ...points }))
          .filter(row => row.player)
          .sort((a, b) => b.current - a.current || a.player.name.localeCompare(b.player.name, 'uk'))
        return { stage, sessions: sessionAudits, totals: stageTotals }
      })

      setStages(stagesData)
      setPlayers(playersResult.data || initialPlayers)
      setStageAudits(audits)
      const currentStage = audits.filter(audit => audit.sessions.some(item => item.session.committed)).at(-1)
      setStageId(current => current || currentStage?.stage.id || audits.at(-1)?.stage.id || '')
    } catch (loadError) {
      setError(loadError.message || 'Не вдалося завантажити деталізацію балів.')
    } finally {
      setLoading(false)
    }
  }

  const selectedAudit = useMemo(() => stageAudits.find(audit => audit.stage.id === stageId) || null, [stageAudits, stageId])
  const mismatchCount = selectedAudit?.sessions.reduce((count, item) => count + item.rows.filter(row => row.verifiable && row.recalculated && row.currentScore !== row.savedScore).length, 0) || 0
  const unverifiableCount = selectedAudit?.sessions.reduce((count, item) => count + item.rows.filter(row => !row.verifiable).length, 0) || 0
  const committedCount = selectedAudit?.sessions.filter(item => item.session.committed).length || 0

  if (!open) return null
  return createPortal(
    <div className="modal-backdrop stats-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="stats-modal score-audit-modal" role="dialog" aria-modal="true" aria-labelledby="score-audit-title">
        <header className="modal-heading">
          <div>
            <h2 id="score-audit-title" className="stats-title">🔎 Аудит балів</h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕ <span>Закрити</span></button>
        </header>
        <label className="player-selector audit-stage-selector">
          <span>ОБЕРІТЬ ЕТАП</span>
          <select className="stage-select" value={stageId} onChange={event => setStageId(event.target.value)}>
            {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
        </label>

        {loading && <div className="modal-status">Завантаження всіх зарахованих прогнозів...</div>}
        {!loading && error && <div className="modal-error" role="alert">{error}</div>}
        {!loading && !error && selectedAudit && <div className="audit-content">
          <div className="audit-stage-heading">
            <CountryFlag flag={selectedAudit.stage.flag} />
            <div><span>ROUND {String(selectedAudit.stage.sort_order).padStart(2, '0')}</span><h3>{selectedAudit.stage.name}</h3></div>
            <strong>{committedCount}/{selectedAudit.sessions.length} <small>сесій зараховано</small></strong>
          </div>

          {Number(selectedAudit.stage.sort_order) < 10 ? <div className="audit-alert audit-alert-warning">Архівні бали показані як збережені й не перераховуються.</div> : mismatchCount > 0 ? <div className="audit-alert audit-alert-warning">⚠ {mismatchCount} розбіжностей між збереженим нарахуванням та перерахунком зі знімка прогнозу.</div> : unverifiableCount > 0 ? <div className="audit-alert audit-alert-warning">Не вдалося перевірити {unverifiableCount} записів: бракує знімка прогнозу або фактичних результатів.</div> : committedCount > 0 ? <div className="audit-alert audit-alert-ok">Перевірені знімки прогнозів збігаються зі збереженим нарахуванням.</div> : null}

          {selectedAudit.totals.length > 0 && <section className="audit-section">
            <h3>ПІДСУМОК ЕТАПУ</h3>
            <div className="audit-table-wrap"><table className="audit-table">
              <thead><tr><th>Гравець</th><th>Збережено</th><th>Перерахунок за прогнозом при нарахуванні</th><th>Δ</th></tr></thead>
              <tbody>{selectedAudit.totals.map(row => <tr key={row.player.id}>
                <td><span style={{ color: 'var(--text)' }}>{row.player.name}</span><small>{row.player.base_pts} сезонних балів</small></td>
                <td>{row.saved}</td><td>{row.current}</td>
                <td className={row.current === row.saved ? 'audit-delta-zero' : 'audit-delta-change'}>{signed(row.current - row.saved)}</td>
              </tr>)}</tbody>
            </table></div>
          </section>}

          <section className="audit-section">
            <h3>ДЕТАЛІ ЗА СЕСІЯМИ</h3>
            {selectedAudit.sessions.length === 0 && <div className="audit-empty">Для цього ГП сесій ще немає.</div>}
            {selectedAudit.sessions.map(({ session, rows, results }) => <AuditSession key={session.id} session={session} rows={rows} results={results} players={players} />)}
          </section>
        </div>}
      </section>
    </div>,
    document.body,
  )
}

function AuditSession({ session, rows, results, players }) {
  const mismatchCount = rows.filter(row => row.verifiable && row.recalculated && row.currentScore !== row.savedScore).length
  const unverifiableCount = rows.filter(row => !row.verifiable).length
  const complete = session.committed && results.length > 0
  return <details className="audit-session" open={mismatchCount > 0}>
    <summary>
      <span className={`audit-session-dot ${complete ? (mismatchCount || unverifiableCount ? 'has-warning' : 'is-ok') : 'is-pending'}`} />
      <strong>{SESSION_LABEL[session.type] || session.type}</strong>
      {!session.committed && <span className="audit-session-state">Не зараховано</span>}
      {session.committed && !results.length && <span className="audit-session-state">Немає фактичних результатів</span>}
      <span className="audit-session-meta">{rows.length} записів{mismatchCount ? ` · ${mismatchCount} розбіжностей` : unverifiableCount ? ` · ${unverifiableCount} без знімка` : ''}</span>
    </summary>
    {session.committed && <div className="audit-session-body">
      {results.length > 0 && <details className="audit-results-details">
        <summary>Фактичні результати, які використано для перевірки ({results.length})</summary>
        <div className="audit-results-list">{results.map((pilot, index) => <span key={`${pilot}-${index}`}><b>P{index + 1}</b>{pilot}</span>)}</div>
      </details>}
      {rows.length > 0 ? <div className="audit-table-wrap"><table className="audit-table audit-session-table">
        <thead><tr><th>Гравець / прогноз</th><th>Збережено</th><th>Перерахунок</th><th>Δ</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.playerId}>
          <td><span>{row.player.name}</span><details className="audit-row-details">
            <summary>Показати прогноз і розклад</summary>
            <PredictionDetails row={row} session={session} results={results} />
          </details></td>
          <td>{row.savedScore}</td><td>{row.recalculated && row.verifiable ? row.currentScore : '—'}</td>
          <td className={row.recalculated && row.currentScore !== row.savedScore ? 'audit-delta-change' : 'audit-delta-zero'}>
            <strong>{row.recalculated && row.verifiable ? signed(row.currentScore - row.savedScore) : '—'}</strong>
            {!row.verifiable && <small style={{display:'block',maxWidth:280,marginTop:5,whiteSpace:'normal',lineHeight:1.45,color:'var(--muted)',fontWeight:400}}>{row.ruleVersion==='legacy-no-snapshot'?'Немає знімка прогнозу на момент нарахування.':row.ruleVersion==='no-results'?'Немає фактичних результатів для перерахунку.':'Запис не можна перевірити.'}</small>}
            {row.stale && <small style={{display:'block',maxWidth:280,marginTop:5,whiteSpace:'normal',lineHeight:1.45,color:'var(--muted)',fontWeight:400}}>Поточний прогноз відредаговано після нарахування. Перевірка використовує збережений знімок.</small>}

          </td>
        </tr>)}</tbody>
      </table></div> : <div className="audit-empty">Немає збережених прогнозів чи призначень.</div>}
    </div>}
  </details>
}

function PredictionDetails({ row, session, results }) {
  const predictions = row.forecast?.scored_input?.predictions || row.forecast?.predictions
  const scoredQualifying = row.qualifying?.scored_input || row.qualifying
  const pickRows = row.qualifying
    ? [[scoredQualifying.pilot_1, scoredQualifying.pred_pos_1], [scoredQualifying.pilot_2, scoredQualifying.pred_pos_2], [scoredQualifying.pilot_3, scoredQualifying.pred_pos_3]]
        .filter(([pilot]) => pilot)
        .map(([pilot, position]) => ({ slot: `P${position || '—'}`, pilot, actual: actualPosition(pilot, results) }))
    : Object.entries(predictions || {})
        .map(([position, pilot]) => ({ slot: `P${position}`, pilot, actual: actualPosition(pilot, results) }))
        .filter(item => item.pilot)
    .sort((a, b) => Number(a.slot.slice(1)) - Number(b.slot.slice(1)))
  const storedBreakdown = row.savedBreakdown || []
  return <div className="audit-prediction-details">
    {pickRows.length > 0 && <div className="audit-picks">
      {pickRows.map((pick, index) => <span key={`${pick.slot}-${pick.pilot}-${index}`}>
        <b>{pick.slot}</b>{pick.pilot}<i>{pick.actual ? `факт P${pick.actual}` : 'немає у фактах'}</i>
      </span>)}
    </div>}
    <div className="audit-breakdowns">
      <div><b>Розклад при нарахуванні</b>{storedBreakdown.length
        ? storedBreakdown.map((item, index) => <span key={`${item.label}-${index}`}>{item.label} <strong>+{item.pts}</strong></span>)
        : <span className="audit-muted">Детальний розклад не зберігався.</span>}</div>
      <div><b>Поточний розклад</b>{row.recalculated && row.currentBreakdown.length
        ? row.currentBreakdown.map((item, index) => <span key={`${item.label}-${index}`}>{item.label} <strong>+{item.pts}</strong></span>)
        : <span className="audit-muted">Немає розрахованих балів.</span>}</div>
    </div>
    {session.type === 'qual' && <small className="audit-muted">У кваліфікації показані всі заповнені слоти; актуальні бали сумуються окремо.</small>}
  </div>
}

function actualPosition(pilot, results) {
  const index = results.indexOf(pilot)
  return index < 0 ? null : index + 1
}

function signed(value) {
  return value > 0 ? `+${value}` : `${value}`
}
