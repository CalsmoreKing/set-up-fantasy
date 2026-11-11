import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase, TEAM_META } from '../lib/supabase'
import CountryFlag from './CountryFlag'
import { isCompletedGrandPrix, rankEventPodium } from '../lib/podium'
import { canonicalStoredScore } from '../lib/scoring'

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
        supabase.from('stages').select('id,name,flag,sort_order').order('sort_order'),
        supabase.from('sessions').select('id,type,committed,stage_id,results,fl_pilot,ov_pilot').in('type', ['qual', 'sprint', 'race']),
        supabase.from('players').select('id,name,team'),
      ])
      const firstError = stagesResult.error || sessionsResult.error || playersResult.error
      if (firstError) throw firstError

      const stages = stagesResult.data || []
      const activeStages = stages.filter(stage => Number(stage.sort_order) >= 10)
      const activeStageIds = new Set(activeStages.map(stage => stage.id))
      const sessions = (sessionsResult.data || []).filter(session => activeStageIds.has(session.stage_id))
      const committed = sessions.filter(session => session.committed)
      const scoredSessionIds = committed.map(session => session.id)
      const qualSessionIds = committed.filter(session => session.type === 'qual').map(session => session.id)
      const [forecastsResult, qualResult] = await Promise.all([
        scoredSessionIds.length
          ? supabase.from('forecasts').select('player_id,session_id,score,scored_input,predictions,fl_pick,ov_pick,score_breakdown').in('session_id', scoredSessionIds)
          : Promise.resolve({ data: [], error: null }),
        qualSessionIds.length
          ? supabase.from('qual_assignments').select('player_id,session_id,score,scored_input,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3').in('session_id', qualSessionIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (forecastsResult.error) throw forecastsResult.error
      if (qualResult.error) throw qualResult.error

      const players = playersResult.data || []
      const stageOrderById = new Map(stages.map(stage => [stage.id, stage.sort_order]))
      const sessionById = new Map(sessions.map(session => [session.id, { ...session, stage_sort_order:stageOrderById.get(session.stage_id) }]))
      const currentForecasts = (forecastsResult.data || []).map(row => ({
        ...row,
        score: canonicalStoredScore(row),
      }))
      const currentQualifying = (qualResult.data || []).map(row => ({
        ...row,
        score: canonicalStoredScore(row),
      }))
      setData(stages.map(stage => {
        const stageSessions = sessions.filter(session => session.stage_id === stage.id)
        const completed = isCompletedGrandPrix(stageSessions)
        return {
          stage,
          archived: Number(stage.sort_order) < 10,
          podium: Number(stage.sort_order) < 10 ? null : completed
            ? rankEventPodium(players, stageSessions, currentForecasts, currentQualifying)
            : null,
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
          {data.map(({ stage, podium, archived }) => <article key={stage.id} className={`podium-card ${archived ? 'is-archive' : podium ? 'is-complete' : 'is-pending'}`}>
            <header className="podium-card-heading">
              <CountryFlag flag={stage.flag} className="podium-card-flag" />
              <div className="podium-card-title">
                <span className="podium-round">ROUND {String(stage.sort_order).padStart(2, '0')}</span>
                <h3>{stage.name}</h3>
              </div>
              {archived && <span className="podium-lock" aria-label="Архівний етап">🔒</span>}
              <span className="podium-card-glow" aria-hidden="true" />
            </header>
            {archived ? <div className="podium-archive-note">АРХІВНИЙ ЕТАП · ПОДІУМ ЗАБЛОКОВАНО</div> : podium !== null && <div className="podium-places">
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
