import { useState, useEffect } from 'react'
import { supabase, TEAM_META } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import StatsModal from '../components/StatsModal'
import PodiumCalendar from '../components/PodiumCalendar'
import { canonicalStoredScore } from '../lib/scoring'
import { ARCHIVE_PREVIEW, archiveScoresForStage } from '../lib/archivePreview'

const TEAM_COLORS = Object.fromEntries(Object.entries(TEAM_META).map(([k,v]) => [k, v.color]))

function RankArrow({ delta }) {
  if (!delta) return <span className="rank-arrow flat">—</span>
  const up = delta > 0
  return <span className={`rank-arrow ${up?'up':'down'}`}>{up?'▲':'▼'}{Math.abs(delta)}</span>
}

export default function StandingsPage() {
  const { isAdmin } = useAuth()
  const [players,         setPlayers]         = useState([])
  const [stages,          setStages]          = useState([])
  const [stageTab,        setStageTab]        = useState('')
  const [stageScores,     setStageScores]     = useState({})
  const [stagesWithCommit,setStagesWithCommit]= useState(new Set())
  const [loading,         setLoading]         = useState(true)
  const [sortCol,         setSortCol]         = useState('total')
  const [statsOpen,       setStatsOpen]       = useState(false)
  const [podiumOpen,      setPodiumOpen]      = useState(false)
  const [sortDir,         setSortDir]         = useState('desc')

  // Load players + stages + committed sessions
  useEffect(() => {
    Promise.all([
      supabase.from('players').select('*').order('base_pts', {ascending:false}),
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('sessions').select('stage_id').eq('committed', true),
    ]).then(([p, s, cs]) => {
      const stagesData = (s.data || [])
      const committedIds = new Set((cs.data||[]).map(x => x.stage_id))
      ARCHIVE_PREVIEW.sessions.forEach(session => committedIds.add(session.stage_id))
      setPlayers(p.data||[])
      setStages(stagesData)
      setStagesWithCommit(committedIds)
      // Default to the latest live round; archives remain available in the selector.
      const withCommit = stagesData.filter(st => Number(st.sort_order) >= 10 && committedIds.has(st.id))
      if (withCommit.length) setStageTab(withCommit[withCommit.length-1].key)
      setLoading(false)
    })
  }, [])

  // Show current-rule stages from live results; preserve archived stored scores before Austria.
  useEffect(() => {
    if (!stageTab || !stages.length) return
    const stage = stages.find(s => s.key === stageTab)
    if (!stage) return

    supabase.from('sessions').select('id,type,committed,fl_pilot,ov_pilot')
      .eq('stage_id', stage.id)
      .then(async ({ data: sessList, error: sessionsError }) => {
        if (sessionsError) throw sessionsError
        if (Number(stage.sort_order) < 10 && !(sessList || []).length) {
          setStageScores(archiveScoresForStage(stage.key))
          return
        }
        const scores = {}
        let bonusRows = []
        const bonusResult = await supabase.from('stage_newcomer_bonuses').select('player_id,points').eq('stage_id',stage.id)
        if (!bonusResult.error) bonusRows = bonusResult.data || []
        else if (bonusResult.error.code !== 'PGRST205' && bonusResult.error.code !== '42P01') throw bonusResult.error
        for (const session of (sessList || [])) {
          if (!session.committed) continue
          if (session.type === 'qual') {
            const { data: assignments, error } = await supabase.from('qual_assignments')
              .select('player_id,score,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3')
              .eq('session_id', session.id)
            if (error) throw error
            ;(assignments || []).forEach(assignment => {
              if (!scores[assignment.player_id]) scores[assignment.player_id] = { qual:0, qualBonus:0, sprint:0, race:0, newcomerBonus:0 }
              scores[assignment.player_id].qual += canonicalStoredScore(assignment)
            })
          } else {
            const { data: forecasts, error } = await supabase.from('forecasts')
              .select('player_id,score,score_breakdown,predictions,fl_pick,ov_pick').eq('session_id', session.id)
            if (error) throw error
            ;(forecasts || []).forEach(forecast => {
              if (!scores[forecast.player_id]) scores[forecast.player_id] = { qual:0, qualBonus:0, sprint:0, race:0, newcomerBonus:0 }
              const score = canonicalStoredScore(forecast)
              scores[forecast.player_id][session.type] = score
            })
          }
        }
        for (const bonus of bonusRows) {
          if (!scores[bonus.player_id]) scores[bonus.player_id] = {qual:0,qualBonus:0,sprint:0,race:0,newcomerBonus:0}
          scores[bonus.player_id].newcomerBonus += Number(bonus.points)||0
        }
        Object.keys(scores).forEach(pid => {
          scores[pid].total = (scores[pid].qual||0) + (scores[pid].qualBonus||0) + (scores[pid].sprint||0) + (scores[pid].race||0) + (scores[pid].newcomerBonus||0)
        })
        setStageScores(scores)
      }).catch(error => console.error('Failed to load stage score details:', error))
  }, [stageTab, stages])

  const sorted = [...players].sort((a,b) => b.base_pts - a.base_pts)

  const teamTotals = {}
  players.forEach(p => {
    if (!teamTotals[p.team]) teamTotals[p.team] = { team:p.team, pts:0, weekendPts:0, color:TEAM_COLORS[p.team]||'#888', members:[] }
    teamTotals[p.team].pts += p.base_pts
    teamTotals[p.team].weekendPts += (p.last_session_delta || 0)
    teamTotals[p.team].members.push(p.name)
  })
  const teamSorted = Object.values(teamTotals).sort((a,b)=>b.pts-a.pts || a.team.localeCompare(b.team,'uk'))

  // Compute team rank change: current pts vs pts-before-last-weekend (pts - weekendPts)
  const teamPrevSorted = [...Object.values(teamTotals)]
    .map(t => ({ ...t, prevPts: t.pts - t.weekendPts }))
    .sort((a,b) => b.prevPts - a.prevPts)
  const prevRankByTeam = {}
  teamPrevSorted.forEach((t, i) => { prevRankByTeam[t.team] = i + 1 })
  const teamRankDelta = {}
  teamSorted.forEach((t, i) => {
    const currentRank = i + 1
    const prevRank = prevRankByTeam[t.team] || currentRank
    teamRankDelta[t.team] = prevRank - currentRank
  })

  const selectedStage = stages.find(s => s.key === stageTab)
  const selectedStageHasSprint = Boolean(selectedStage?.has_sprint || ARCHIVE_PREVIEW.sessions.some(session => session.stage_key === selectedStage?.key && session.type === 'sprint'))

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d==='desc'?'asc':'desc')
    else { setSortCol(col); setSortDir('desc') }
  }
  function SortHdr({ col, label }) {
    const active = sortCol === col
    return (
      <th onClick={()=>toggleSort(col)} style={{cursor:'pointer',userSelect:'none'}}>
        {label}{active?(sortDir==='desc'?' ▼':' ▲'):' ↕'}
      </th>
    )
  }
  const stagePlayersSorted = [...players].sort((a,b) => {
    const sa = stageScores[a.id] || {}
    const sb = stageScores[b.id] || {}
    const getVal = (s) => sortCol === 'qual' ? (s.qual||0) + (s.qualBonus||0) : (s[sortCol] ?? 0)
    const va = getVal(sa), vb = getVal(sb)
    return sortDir==='desc' ? vb-va : va-vb
  })

  if (loading) return (
    <main>
      <div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:20}}>
        ЗАВАНТАЖЕННЯ...
      </div>
    </main>
  )

  return (
    <main>
      {/* ── PLAYER STANDINGS ── */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        <button className="btn btn-gold" onClick={()=>setStatsOpen(true)}>
          📊 СТАТИСТИКА ГРАВЦЯ
        </button>
        <button className="btn btn-gold" onClick={()=>setPodiumOpen(true)}>
          🏆 КАЛЕНДАР ПОДІУМІВ
        </button>
      </div>

      <div className="section-label">Турнірна таблиця</div>
      <div style={{overflowX:'auto'}}>
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Δ</th>
              <th>Гравець</th>
              <th>Команда</th>
              <th>Бали</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const rank = idx + 1
              const tc   = TEAM_COLORS[p.team] || '#888'
              const code = TEAM_META[p.team]?.code || p.team.slice(0,3).toUpperCase()
              return (
                <tr key={p.id} className={rank<=3?`p${rank}`:''}>
                  <td><span className={`rank${rank<=3?` r${rank}`:''}`}>{rank}</span></td>
                  <td><RankArrow delta={p.last_rank_delta} /></td>
                  <td><a className="player-name-plain" href={`/profile?player=${encodeURIComponent(p.id)}`} style={{textDecoration:"none"}}>{p.name}</a></td>
                  <td><span className="team-badge" style={{borderColor:tc,color:tc}}>{code} · {p.team}</span></td>
                  <td>
                    <span className="score-total">{p.base_pts}</span>
                    {p.last_session_delta > 0 && (
                      <span style={{color:'var(--green)',fontSize:11,fontFamily:'Orbitron,sans-serif',fontWeight:700,marginLeft:6}}>
                        ▲+{p.last_session_delta}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="divider" />

      {/* ── TEAM TABLE ── */}
      <div className="section-label">Таблиця команд</div>
      <table className="team-table">
        <thead><tr><th>#</th><th>Δ</th><th>Команда</th><th>Гравці</th><th>Бали</th></tr></thead>
        <tbody>
          {teamSorted.map((t, idx) => (
            <tr key={t.team} style={{borderLeftColor:t.color}}>
              <td><span className={`rank${idx<3?` r${idx+1}`:''}`}>{idx+1}</span></td>
              <td><RankArrow delta={teamRankDelta[t.team]} /></td>
              <td><span className="team-name" style={{color:t.color}}>{TEAM_META[t.team]?.code} · {t.team}</span></td>
              <td style={{color:'var(--muted)',fontSize:12}}>{t.members.join(' · ')}</td>
              <td>
                <span className="team-score">{t.pts}</span>
                {t.weekendPts > 0 && (
                  <span style={{color:'var(--green)',fontSize:11,fontFamily:'Orbitron,sans-serif',fontWeight:700,marginLeft:6}}>
                    ▲+{t.weekendPts}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="divider" />

      {/* ── STAGE BREAKDOWN ── */}
      <div className="section-label">Бали по етапу</div>
      <div style={{marginBottom:14,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <select className="stage-select" value={stageTab} onChange={e=>setStageTab(e.target.value)}>
          <option value="">— Оберіть етап —</option>
          {stages.filter(s => stagesWithCommit.has(s.id)).map(s=>(
            <option key={s.key} value={s.key}>{s.flag} {s.name}</option>
          ))}
        </select>
        {selectedStage && (
          <span style={{fontFamily:'Orbitron,sans-serif',fontSize:10,color:'var(--muted)'}}>
            {selectedStage.flag} {selectedStage.name}
          </span>
        )}
      </div>

      {stageTab && (
        <div style={{overflowX:'auto'}}>
          <table className="standings">
            <thead>
              <tr>
                <th>Гравець</th>
                <SortHdr col="qual"   label="КВАЛІФІКАЦІЯ" />
                {selectedStageHasSprint && <SortHdr col="sprint" label="СПРИНТ" />}
                <SortHdr col="race"  label="ГОНКА" />
                <th>БОНУС НОВАЧКА</th>
                <SortHdr col="total" label="СУМА" />
              </tr>
            </thead>
            <tbody>
              {stagePlayersSorted.map(p => {
                const sc = stageScores[p.id] || {}
                return (
                  <tr key={p.id}>
                    <td><a className="player-name-plain" href={`/profile?player=${encodeURIComponent(p.id)}`} style={{textDecoration:"none"}}>{p.name}</a></td>
                    <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:sc.qual?'var(--text)':'var(--muted)'}}>
                      {sc.qual ?? '—'}
                    </td>
                    {selectedStageHasSprint && (
                      <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:sc.sprint?'var(--text)':'var(--muted)'}}>{sc.sprint ?? '—'}</td>
                    )}
                    <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:sc.race?'var(--text)':'var(--muted)'}}>{sc.race ?? '—'}</td>
                    <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:sc.newcomerBonus?'var(--gold)':'var(--muted)'}}>{sc.newcomerBonus || '—'}</td>
                    <td><span className="score-total">{sc.total ?? '—'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <StatsModal open={statsOpen} onClose={()=>setStatsOpen(false)} players={players} />
      <PodiumCalendar open={podiumOpen} onClose={()=>setPodiumOpen(false)} />
    </main>
  )
}
