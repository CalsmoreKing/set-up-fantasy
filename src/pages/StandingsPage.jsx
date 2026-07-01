import { useState, useEffect } from 'react'
import { supabase, TEAM_META } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const TEAM_COLORS = Object.fromEntries(Object.entries(TEAM_META).map(([k,v]) => [k, v.color]))

function RankArrow({ delta }) {
  if (!delta) return <span className="rank-arrow flat">—</span>
  const up = delta > 0
  return <span className={`rank-arrow ${up?'up':'down'}`}>{up?'▲':'▼'}{Math.abs(delta)}</span>
}

export default function StandingsPage() {
  const { isAdmin } = useAuth()
  const [players,  setPlayers]  = useState([])
  const [stages,   setStages]   = useState([])
  const [stageTab, setStageTab] = useState('')
  const [stageScores, setStageScores] = useState({}) // { playerId: { qual, sprint, race, total } }
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('players').select('*').order('base_pts', {ascending:false}),
      supabase.from('stages').select('*').where ? null :
        supabase.from('stages').select('*').order('sort_order'),
    ]).then(async ([p]) => {
      const { data: stagesData } = await supabase.from('stages').select('*').order('sort_order')
      setPlayers(p.data||[])
      setStages(stagesData||[])
      // default to last committed stage
      const lastCommitted = [...(stagesData||[])].reverse().find(s => s.is_locked)
      if (lastCommitted) setStageTab(lastCommitted.key)
      setLoading(false)
    })
  }, [])

  // Load scores for selected stage
  useEffect(() => {
    if (!stageTab || !stages.length) return
    const stage = stages.find(s => s.key === stageTab)
    if (!stage) return

    supabase.from('sessions').select('id, type, committed')
      .eq('stage_id', stage.id)
      .then(async ({ data: sessList }) => {
        const scores = {}
        for (const sess of (sessList||[])) {
          if (!sess.committed) continue
          if (sess.type === 'qual') {
            const { data: qas } = await supabase.from('qual_assignments')
              .select('player_id, score').eq('session_id', sess.id)
            ;(qas||[]).forEach(qa => {
              if (!scores[qa.player_id]) scores[qa.player_id] = { qual:0, sprint:0, race:0 }
              scores[qa.player_id].qual = qa.score || 0
            })
          } else {
            const { data: fcs } = await supabase.from('forecasts')
              .select('player_id, score').eq('session_id', sess.id)
            ;(fcs||[]).forEach(fc => {
              if (!scores[fc.player_id]) scores[fc.player_id] = { qual:0, sprint:0, race:0 }
              scores[fc.player_id][sess.type] = fc.score || 0
            })
          }
        }
        // Add totals
        Object.keys(scores).forEach(pid => {
          scores[pid].total = (scores[pid].qual||0) + (scores[pid].sprint||0) + (scores[pid].race||0)
        })
        setStageScores(scores)
      })
  }, [stageTab, stages])

  const sorted = [...players].sort((a,b) => b.base_pts - a.base_pts)
  const teamTotals = {}
  players.forEach(p => {
    if (!teamTotals[p.team]) teamTotals[p.team] = { team:p.team, pts:0, color:TEAM_COLORS[p.team]||'#888', members:[] }
    teamTotals[p.team].pts += p.base_pts
    teamTotals[p.team].members.push(p.name)
  })
  const teamSorted = Object.values(teamTotals).sort((a,b)=>b.pts-a.pts)
  const selectedStage = stages.find(s => s.key === stageTab)

  // Sort state for stage scores table
  const [sortCol, setSortCol] = useState('total')
  const [sortDir, setSortDir] = useState('desc')
  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const stagePlayersSorted = [...players].sort((a,b) => {
    const sa = stageScores[a.id] || {}
    const sb = stageScores[b.id] || {}
    const va = sa[sortCol] ?? 0, vb = sb[sortCol] ?? 0
    return sortDir === 'desc' ? vb - va : va - vb
  })
  function SortHdr({ col, label }) {
    const active = sortCol === col
    return (
      <th onClick={() => toggleSort(col)} style={{cursor:'pointer',userSelect:'none'}}>
        {label}{active ? (sortDir==='desc'?' ▼':' ▲') : ' ↕'}
      </th>
    )
  }

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:20}}>ЗАВАНТАЖЕННЯ...</div></main>

  return (
    <main>
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
              const tc = TEAM_COLORS[p.team] || '#888'
              const code = TEAM_META[p.team]?.code || p.team.slice(0,3).toUpperCase()
              return (
                <tr key={p.id} className={rank<=3?`p${rank}`:''}>
                  <td><span className={`rank${rank<=3?` r${rank}`:''}`}>{rank}</span></td>
                  <td><RankArrow delta={p.last_rank_delta} /></td>
                  <td><span className="player-name-plain">{p.name}</span></td>
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
      <div className="section-label">Таблиця команд</div>
      <table className="team-table">
        <thead><tr><th>#</th><th>Команда</th><th>Гравці</th><th>Бали</th></tr></thead>
        <tbody>
          {teamSorted.map((t, idx) => (
            <tr key={t.team} style={{borderLeftColor:t.color}}>
              <td><span className={`rank${idx<3?` r${idx+1}`:''}`}>{idx+1}</span></td>
              <td><span className="team-name" style={{color:t.color}}>{TEAM_META[t.team]?.code} · {t.team}</span></td>
              <td style={{color:'var(--muted)',fontSize:12}}>{t.members.join(' · ')}</td>
              <td><span className="team-score">{t.pts}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="divider" />
      <div className="section-label">Бали по етапу</div>
      <div style={{marginBottom:14,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <select className="stage-select" value={stageTab} onChange={e=>setStageTab(e.target.value)}>
          <option value="">— Оберіть етап —</option>
          {stages.filter(s=>s.is_locked).map(s=>(
            <option key={s.key} value={s.key}>{s.flag} {s.name}</option>
          ))}
        </select>
        {selectedStage && <span style={{fontFamily:'Orbitron,sans-serif',fontSize:10,color:'var(--muted)'}}>
          {selectedStage.flag} {selectedStage.name} — натисни заголовок для сортування
        </span>}
      </div>
      {stageTab && (
        <div style={{overflowX:'auto'}}>
          <table className="standings">
            <thead>
              <tr>
                <th>Гравець</th>
                <SortHdr col="qual"   label="КВАЛІФІКАЦІЯ" />
                {selectedStage?.has_sprint && <SortHdr col="sprint" label="СПРИНТ" />}
                <SortHdr col="race"  label="ГОНКА" />
                <SortHdr col="total" label="СУМА" />
              </tr>
            </thead>
            <tbody>
              {stagePlayersSorted.map(p => {
                const sc = stageScores[p.id] || {}
                return (
                  <tr key={p.id}>
                    <td><span className="player-name-plain">{p.name}</span></td>
                    <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:sc.qual?'var(--text)':'var(--muted)'}}>{sc.qual ?? '—'}</td>
                    {selectedStage?.has_sprint && <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:sc.sprint?'var(--text)':'var(--muted)'}}>{sc.sprint ?? '—'}</td>}
                    <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:sc.race?'var(--text)':'var(--muted)'}}>{sc.race ?? '—'}</td>
                    <td><span className="score-total">{sc.total ?? '—'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
