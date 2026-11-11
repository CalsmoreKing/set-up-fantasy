import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase, TEAM_META } from '../lib/supabase'
import { canonicalStoredScore, hasForecastSubmission, hasQualifyingPrediction } from '../lib/scoring'
import CountryFlag from './CountryFlag'

export default function StatsModal({ open, onClose, players }) {
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const [leftStats, setLeftStats] = useState(null)
  const [rightStats, setRightStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !players.length) return
    setLeftId(current => players.some(player => player.id === current) ? current : players[0].id)
    setRightId(current => players.some(player => player.id === current) ? current : (players[1]?.id || players[0].id))
  }, [open, players])

  useEffect(() => {
    if (!open || !leftId || !rightId) return
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      loadPlayerStats(leftId, players.find(player => player.id === leftId)),
      loadPlayerStats(rightId, players.find(player => player.id === rightId)),
    ]).then(([left, right]) => {
      if (!active) return
      setLeftStats(left)
      setRightStats(right)
    }).catch(loadError => {
      if (!active) return
      setError(loadError.message || 'Не вдалося завантажити статистику гравців.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [open, leftId, rightId, players])

  const comparisonStages = useMemo(() => {
    const stages = new Map()
    for (const row of [...(leftStats?.allSessions || []), ...(rightStats?.allSessions || [])]) {
      if (row.stage?.id && !stages.has(row.stage.id)) stages.set(row.stage.id, row.stage)
    }
    return [...stages.values()]
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .slice(-8)
  }, [leftStats, rightStats])

  const allStageRows = useMemo(() => {
    const byId = new Map()
    for (const row of leftStats?.allSessions || []) byId.set(row.stage.id, { stage: row.stage, left: row.score, right: null })
    for (const row of rightStats?.allSessions || []) {
      const entry = byId.get(row.stage.id) || { stage: row.stage, left: null, right: null }
      entry.right = row.score
      byId.set(row.stage.id, entry)
    }
    return [...byId.values()].sort((a, b) => (a.stage?.sort_order || 0) - (b.stage?.sort_order || 0))
  }, [leftStats, rightStats])

  if (!open) return null
  return createPortal(
    <div className="modal-backdrop stats-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="stats-modal" role="dialog" aria-modal="true" aria-labelledby="stats-title">
        <header className="modal-heading">
          <div>
            <div className="modal-eyebrow">HEAD-TO-HEAD</div>
            <h2 id="stats-title" className="stats-title">📊 Порівняння гравців</h2>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕ <span>Закрити</span></button>
        </header>

        <div className="stats-selectors">
          <PlayerSelector label="ЛІВИЙ ГРАВЕЦЬ" value={leftId} players={players} onChange={setLeftId} />
          <PlayerSelector label="ПРАВИЙ ГРАВЕЦЬ" value={rightId} players={players} onChange={setRightId} />
        </div>
        {loading && <div className="modal-status">Завантажуємо статистику обох гравців...</div>}
        {!loading && error && <div className="modal-error" role="alert">{error}</div>}
        {!loading && !error && leftStats && rightStats && <div className="comparison-content">
          {(leftStats.staleSessions.length > 0 || rightStats.staleSessions.length > 0) && <div className="stats-recalc-note" role="status">
            ⚠ {leftStats.staleSessions.length + rightStats.staleSessions.length} розбіжностей у сесіях
          </div>}
          {comparisonStages.length > 0 && <TrendComparison
            stages={comparisonStages}
            leftStats={leftStats}
            rightStats={rightStats}
          />}

          <div className="comparison-cards">
            <PlayerStatsCard stats={leftStats} side="ЛІВИЙ" />
            <PlayerStatsCard stats={rightStats} side="ПРАВИЙ" />
          </div>

          {allStageRows.length > 0 && <details className="all-stage-details">
            <summary>Показати бали за всіма етапами <span>({allStageRows.length})</span></summary>
            <div className="all-stage-header"><span>ЕТАП</span><span>{leftStats.player.name}</span><span>{rightStats.player.name}</span></div>
            {allStageRows.map(row => <div className="all-stage-row" key={row.stage.id}>
              <span className="all-stage-name"><CountryFlag flag={row.stage.flag} />{row.stage.name}</span>
              <b>{formatScore(row.left)}</b><b>{formatScore(row.right)}</b>
            </div>)}
          </details>}
        </div>}
      </section>
    </div>,
    document.body,
  )
}

async function loadPlayerStats(playerId, player) {
  const [forecastsResult, qualsResult] = await Promise.all([
    supabase.from('forecasts')
      .select('score, score_breakdown, scored_input, fl_pick, ov_pick, predictions, session_id, sessions(type, stage_id, committed, results, fl_pilot, ov_pilot, stages(id,name,flag,sort_order))')
      .eq('player_id', playerId),
    supabase.from('qual_assignments')
      .select('score, scored_input, pilot_1, pred_pos_1, pilot_2, pred_pos_2, pilot_3, pred_pos_3, session_id, sessions(stage_id, committed, results, stages(id,name,flag,sort_order))')
      .eq('player_id', playerId)
      .gt('score', -1),
  ])
  if (forecastsResult.error) throw forecastsResult.error
  if (qualsResult.error) throw qualsResult.error

  const savedForecasts = (forecastsResult.data || []).filter(row => row.sessions?.committed && Number(row.sessions?.stages?.sort_order)>=10 && hasForecastSubmission(row))
  const savedQuals = (qualsResult.data || []).filter(row => row.sessions?.committed && Number(row.sessions?.stages?.sort_order)>=10 && hasQualifyingPrediction(row))
  const committedForecasts = savedForecasts.map(row => {
    return { ...row, score:canonicalStoredScore(row), savedScore:canonicalStoredScore(row), currentBreakdown:row.score_breakdown || [], wasRecalculated:false }
  })
  const committedQuals = savedQuals.map(row => {
    return { ...row, score:canonicalStoredScore(row), savedScore:canonicalStoredScore(row), currentBreakdown:row.score_breakdown || [], wasRecalculated:false }
  })
  const byType = { race: [], sprint: [] }
  committedForecasts.forEach(row => {
    const type = row.sessions?.type
    if (byType[type]) byType[type].push(Number(row.score) || 0)
  })

  const stageMap = new Map()
  const addStageScore = (stage, score, savedScore = score) => {
    if (!stage?.id) return
    const row = stageMap.get(stage.id) || { stage, score: 0, savedScore: 0 }
    row.score += Number(score) || 0
    row.savedScore += Number(savedScore) || 0
    stageMap.set(stage.id, row)
  }
  committedForecasts.forEach(row => addStageScore(row.sessions?.stages, row.score, row.savedScore))
  committedQuals.forEach(row => addStageScore(row.sessions?.stages, row.score, row.savedScore))
  const allSessions = [...stageMap.values()].sort((a, b) => (a.stage?.sort_order || 0) - (b.stage?.sort_order || 0))
  const staleSessions = [...committedForecasts, ...committedQuals]
    .filter(row => row.wasRecalculated && row.savedScore !== row.score)
  const best = [...allSessions].sort((a, b) => b.score - a.score)[0]
  const worst = [...allSessions].sort((a, b) => a.score - b.score)[0]

  const pilotFreq = {}
  committedForecasts.forEach(row => {
    if (row.sessions?.type !== 'race') return
    Object.values(row.predictions || {}).forEach(pilot => {
      if (pilot) pilotFreq[pilot] = (pilotFreq[pilot] || 0) + 1
    })
  })
  const favoritePilot = Object.entries(pilotFreq).sort((a, b) => b[1] - a[1])[0]

  let flHits = 0, flTotal = 0, ovHits = 0, ovTotal = 0
  committedForecasts.forEach(row => {
    const breakdown = row.currentBreakdown || []
    if (row.fl_pick) { flTotal++; if (breakdown.some(item => item.label?.includes('Швидке коло'))) flHits++ }
    if (row.ov_pick) { ovTotal++; if (breakdown.some(item => item.label?.includes('Прорив'))) ovHits++ }
  })
  const podiumHits = committedForecasts.filter(row => (row.currentBreakdown || []).some(item => item.label?.includes('Топ-3'))).length
  const top5Hits = committedForecasts.filter(row => (row.currentBreakdown || []).some(item => item.label?.includes('Топ-5'))).length
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

  return {
    player,
    allSessions,
    staleSessions,
    best,
    worst,
    favoritePilot,
    avgRace: average(byType.race),
    avgSprint: average(byType.sprint),
    avgQual: average(committedQuals.map(row => Number(row.score) || 0)),
    flHits, flTotal, ovHits, ovTotal, podiumHits, top5Hits,
    totalSessions: committedForecasts.length + committedQuals.length,
  }
}

function PlayerSelector({ label, value, players, onChange }) {
  return <label className="player-selector">
    <span>{label}</span>
    <select className="stage-select" value={value} onChange={event => onChange(event.target.value)}>
      {players.map(player => <option key={player.id} value={player.id}>{player.name} — {player.team}</option>)}
    </select>
  </label>
}

function TrendComparison({ stages, leftStats, rightStats }) {
  const leftColor = TEAM_META[leftStats.player.team]?.color || '#e10600'
  const rightColor = TEAM_META[rightStats.player.team]?.color || '#49b6ff'
  const leftScores = new Map(leftStats.allSessions.map(row => [row.stage.id, row.score]))
  const rightScores = new Map(rightStats.allSessions.map(row => [row.stage.id, row.score]))
  const maxScore = Math.max(1, ...stages.flatMap(stage => [leftScores.get(stage.id) || 0, rightScores.get(stage.id) || 0]))
  const chartMinWidth = Math.max(100, stages.length * 86)

  return <section className="trend-panel" aria-label="Порівняння очок за останні етапи">
    <div className="trend-heading">
      <div>
        <h3>Очки за останні {stages.length} ГП</h3>
      </div>
      <div className="trend-legend">
        <span><i style={{ background: leftColor }} />{leftStats.player.name}</span>
        <span><i style={{ background: rightColor }} />{rightStats.player.name}</span>
      </div>
    </div>
    <div className="trend-scroll">
      <div className="trend-grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(72px, 1fr))`, minWidth: chartMinWidth }}>
        {stages.map(stage => {
          const leftScore = leftScores.get(stage.id)
          const rightScore = rightScores.get(stage.id)
          return <div className="trend-column" key={stage.id}>
            <div className="trend-values">
              <b style={{ color: leftColor }}>{formatScore(leftScore)}</b>
              <b style={{ color: rightColor }}>{formatScore(rightScore)}</b>
            </div>
            <div className="trend-bars">
              <span className="trend-bar" style={{ height: `${barHeight(leftScore, maxScore)}%`, background: leftColor }} title={`${leftStats.player.name}: ${formatScore(leftScore)} балів`} />
              <span className="trend-bar" style={{ height: `${barHeight(rightScore, maxScore)}%`, background: rightColor }} title={`${rightStats.player.name}: ${formatScore(rightScore)} балів`} />
            </div>
            <div className="trend-stage"><CountryFlag flag={stage.flag} /><span title={stage.name}>{stage.name}</span></div>
          </div>
        })}
      </div>
    </div>
  </section>
}

function barHeight(score, maxScore) {
  return score == null ? 2 : Math.max(4, (Math.max(0, score) / maxScore) * 100)
}

function PlayerStatsCard({ stats, side }) {
  const teamColor = TEAM_META[stats.player.team]?.color || '#888'
  return <article className="player-stats-card" style={{ '--player-color': teamColor }}>
    <div className="player-card-heading">
      <div className="player-side-label">{side} ГРАВЕЦЬ</div>
      <div className="player-identity">
        <div>
          <h3>{stats.player.name}</h3>
          <span>{stats.player.team}</span>
        </div>
        <strong>{stats.player.base_pts ?? '—'} <small>pts</small></strong>
      </div>
    </div>
    <div className="average-grid">
      <StatBox label="СЕР. ГОНКА" value={stats.avgRace.toFixed(1)} />
      <StatBox label="СЕР. СПРИНТ" value={stats.avgSprint.toFixed(1)} />
      <StatBox label="СЕР. КВАЛА" value={stats.avgQual.toFixed(1)} />
    </div>
    <div className="best-worst-grid">
      <StageHighlight label="КРАЩИЙ ГП" row={stats.best} type="best" />
      <StageHighlight label="ГІРШИЙ ГП" row={stats.worst} type="worst" />
    </div>
    <div className="mini-stats-grid">
      <MiniStat icon="⚡" label="Швидке коло" value={`${stats.flHits}/${stats.flTotal}`} />
      <MiniStat icon="🚀" label="Прорив" value={`${stats.ovHits}/${stats.ovTotal}`} />
      <MiniStat icon="🏆" label="Топ-3 бонус" value={stats.podiumHits} />
      <MiniStat icon="🎯" label="Топ-5 бонус" value={stats.top5Hits} />
    </div>
    {stats.favoritePilot && <div className="favorite-pilot">
      <span>Улюблений пілот</span>
      <b>{stats.favoritePilot[0]}</b>
      <small>обраний {stats.favoritePilot[1]} разів</small>
    </div>}
    <div className="total-sessions">Зарахованих прогнозів і кваліфікацій: {stats.totalSessions}</div>
  </article>
}

function StageHighlight({ label, row, type }) {
  return <div className={`stage-highlight stage-highlight-${type}`}>
    <span>{label}</span>
    {row ? <div><CountryFlag flag={row.stage?.flag} /><b>{row.stage?.name}</b><strong>{row.score} pts</strong></div> : <em>Поки немає даних</em>}
  </div>
}

function StatBox({ label, value }) {
  return <div className="stat-box">
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
}

function MiniStat({ icon, label, value }) {
  return <div className="mini-stat">
    <span className="mini-stat-icon">{icon}</span>
    <span className="mini-stat-label">{label}</span>
    <strong>{value}</strong>
  </div>
}

function formatScore(score) {
  return score == null ? '—' : `${score}`
}
