import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase, TEAM_META } from '../lib/supabase'
import CountryFlag from './CountryFlag'
import { isCompletedGrandPrix, rankEventPodium } from '../lib/podium'
import { canonicalStoredScore } from '../lib/scoring'
import { ARCHIVE_PREVIEW } from '../lib/archivePreview'

const PODIUM_PLACES = [1, 2, 3]

export default function PodiumCalendar({ open, onClose }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (open) load() }, [open])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [stagesResult, sessionsResult, playersResult] = await Promise.all([
        supabase.from('stages').select('id,key,name,flag,sort_order').order('sort_order'),
        supabase.from('sessions').select('id,type,committed,stage_id,results,fl_pilot,ov_pilot').in('type', ['qual', 'sprint', 'race']),
        supabase.from('players').select('id,name,team'),
      ])
      const firstError = stagesResult.error || sessionsResult.error || playersResult.error
      if (firstError) throw firstError

      const stages = (stagesResult.data || [])
      const stageByKey = new Map(stages.map(stage => [stage.key, stage]))
      const databaseSessions = sessionsResult.data || []
      const databaseStageTypes = new Set(databaseSessions.map(session => `${session.stage_id}:${session.type}`))
      const previewSessions = ARCHIVE_PREVIEW.sessions.map(session => ({
        ...session,
        stage_id:stageByKey.get(session.stage_key)?.id,
        committed:true,
        is_locked:true,
        archive_preview:true,
      })).filter(session => session.stage_id && !databaseStageTypes.has(`${session.stage_id}:${session.type}`))
      const previewSessionIds = new Set(previewSessions.map(session=>session.id))
      const sessions = [...databaseSessions, ...previewSessions]
      const committed = sessions.filter(session => session.committed)
      const scoredSessionIds = committed.map(session => session.id)
      const qualSessionIds = committed.filter(session => session.type === 'qual').map(session => session.id)
      const committedStageIds = [...new Set(committed.map(session=>session.stage_id).filter(Boolean))]
      const [forecastsResult, qualResult, newcomerResult] = await Promise.all([
        scoredSessionIds.length
          ? supabase.from('forecasts').select('player_id,session_id,score,predictions,fl_pick,ov_pick,score_breakdown').in('session_id', scoredSessionIds)
          : Promise.resolve({ data: [], error: null }),
        qualSessionIds.length
          ? supabase.from('qual_assignments').select('player_id,session_id,score,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id', qualSessionIds)
          : Promise.resolve({ data: [], error: null }),
        committedStageIds.length
          ? supabase.from('stage_newcomer_bonuses').select('stage_id,player_id,points').in('stage_id',committedStageIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (forecastsResult.error) throw forecastsResult.error
      if (qualResult.error) throw qualResult.error
      if (newcomerResult.error && newcomerResult.error.code !== 'PGRST205' && newcomerResult.error.code !== '42P01') throw newcomerResult.error

      const players = playersResult.data || []
      const stageOrderById = new Map(stages.map(stage => [stage.id, stage.sort_order]))
      const sessionById = new Map(sessions.map(session => [session.id, { ...session, stage_sort_order:stageOrderById.get(session.stage_id) }]))
      const dbForecasts = forecastsResult.data || []
      const dbQualifying = qualResult.data || []
      const dbForecastKeys = new Set(dbForecasts.map(row => `${row.session_id}:${row.player_id}`))
      const dbQualKeys = new Set(dbQualifying.map(row => `${row.session_id}:${row.player_id}`))
      const previewForecasts = ARCHIVE_PREVIEW.forecasts.filter(row => previewSessionIds.has(row.session_id) && !dbForecastKeys.has(`${row.session_id}:${row.player_id}`))
      const previewQualifying = ARCHIVE_PREVIEW.qualifying_assignments.filter(row => previewSessionIds.has(row.session_id) && !dbQualKeys.has(`${row.session_id}:${row.player_id}`))
      const currentForecasts = [...dbForecasts, ...previewForecasts].map(row => ({
        ...row,
        score: canonicalStoredScore(row),
      }))
      const currentQualifying = [...dbQualifying, ...previewQualifying].map(row => ({
        ...row,
        score: canonicalStoredScore(row),
      }))
      setData(stages.map(stage => {
        const stageSessions = sessions.filter(session => session.stage_id === stage.id)
        const completed = isCompletedGrandPrix(stageSessions)
        return {
          stage,
          localPreview:stageSessions.some(session=>session.archive_preview),
          podium: completed ? rankEventPodium(players, stageSessions, currentForecasts, currentQualifying, (newcomerResult.data||[]).filter(row=>row.stage_id===stage.id)) : null,
        }
      }))
    } catch (loadError) {
      setData([])
      setError(loadError.message || 'Не вдалося завантажити fantasy-подіуми.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null
  return createPortal(
    <div className="modal-backdrop podium-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="podium-modal" role="dialog" aria-modal="true" aria-labelledby="podium-title">
        <header className="modal-heading">
          <div>
            <div className="modal-eyebrow">SEASON RESULTS</div>
            <h2 id="podium-title" className="podium-title">🏆 Fantasy-подіуми ГП</h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕ <span>Закрити</span></button>
        </header>
        {loading && <div className="modal-status">Завантаження...</div>}
        {!loading && error && <div className="modal-error" role="alert">Не вдалося завантажити календар подіумів: {error}</div>}
        {!loading && !error && <div className="podium-grid">
          {data.map(({ stage, podium, localPreview }) => <article key={stage.id} className={`podium-card ${podium ? 'is-complete' : 'is-pending'}`}>
            <header className="podium-card-heading">
              <CountryFlag flag={stage.flag} className="podium-card-flag" />
              <div className="podium-card-title">
                <span className="podium-round">ROUND {String(stage.sort_order).padStart(2, '0')}</span>
                <h3>{stage.name}</h3>
              </div>
              <span className="podium-card-glow" aria-hidden="true" />
            </header>
            {localPreview && <div className="podium-archive-note">ЛОКАЛЬНІ ДАНІ · ОЧІКУЮТЬ ВІДНОВЛЕННЯ В БАЗІ</div>}
            {podium !== null && <div className="podium-places">
              {PODIUM_PLACES.map(place => {
                const group = podium?.find(row => row.place === place)
                return <div key={place} className={`podium-place podium-place-${place} ${group ? '' : 'is-empty'}`}>
                  <span className="podium-place-label">P{place}</span>
                  <div className="podium-place-names">
                    {group?.players.map(player => <span key={player.id} style={{ color: TEAM_META[player.team]?.color || 'var(--text)' }}>{player.name}</span>)}
                    {!group && <span className="podium-empty-label">—</span>}
                  </div>
                  <strong className="podium-place-score">{group ? group.total : '—'}</strong>
                </div>
              })}
            </div>}
          </article>)}
        </div>}
      </section>
    </div>,
    document.body,
  )
}
