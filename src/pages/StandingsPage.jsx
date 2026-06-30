import { useState, useEffect } from 'react'
import { supabase, calcRaceScore, calcQualScore, calcSprintScore } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const TEAM_COLORS = {
  'Макларен':'#FF8000','Мерседес':'#00D2BE','Феррарі':'#E8002D',
  'Альпін':'#0090FF','Ред Булл':'#3671C6','Ауді':'#888888',
  'Астон Мартін':'#358C75','Альфа Ромео':'#C92D4B','Ред Булл Альфа Таурі':'#5E8FAA',
}

export default function StandingsPage() {
  const { isAdmin } = useAuth()
  const [players,   setPlayers]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(null)
  const [tooltip,   setTooltip]   = useState(null) // { player, x, y }

  useEffect(() => {
    supabase.from('players').select('*').order('base_pts', {ascending:false})
      .then(({data}) => { setPlayers(data||[]); setLoading(false) })
  }, [])

  async function updateBase(playerId, val) {
    const num = parseInt(val) || 0
    setSaving(playerId)
    await supabase.from('players').update({ base_pts: num }).eq('id', playerId)
    setPlayers(prev => prev.map(p => p.id===playerId ? {...p, base_pts:num} : p))
    setSaving(null)
    await supabase.from('audit_log').insert({
      action:'manual_pts', actor:'admin',
      details:{ player_id:playerId, new_base:num }
    })
  }

  const sorted = [...players].sort((a,b) => b.base_pts - a.base_pts)

  // Team totals
  const teamTotals = {}
  players.forEach(p => {
    if (!teamTotals[p.team]) teamTotals[p.team] = { team:p.team, pts:0, color:TEAM_COLORS[p.team]||'#888', members:[] }
    teamTotals[p.team].pts += p.base_pts
    teamTotals[p.team].members.push(p.name)
  })
  const teamSorted = Object.values(teamTotals).sort((a,b)=>b.pts-a.pts)

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:20}}>ЗАВАНТАЖЕННЯ...</div></main>

  return (
    <main>
      <div className="section-label">Турнірна таблиця</div>
      <div style={{overflowX:'auto'}}>
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Гравець</th>
              <th>Команда</th>
              <th>Бали</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const rank = idx + 1
              return (
                <tr key={p.id} className={rank<=3?`p${rank}`:''}>
                  <td><span className={`rank${rank<=3?` r${rank}`:''}`}>{rank}</span></td>
                  <td>
                    <span className="name-hover" style={{fontWeight:600}}>
                      {p.name}
                    </span>
                  </td>
                  <td>
                    <span className="team-badge" style={{borderColor:TEAM_COLORS[p.team]||'#888',color:TEAM_COLORS[p.team]||'#888'}}>
                      {p.team}
                    </span>
                  </td>
                  <td>
                    {isAdmin ? (
                      <input
                        type="number"
                        className="score-input"
                        defaultValue={p.base_pts}
                        disabled={saving===p.id}
                        onBlur={e => updateBase(p.id, e.target.value)}
                        onKeyDown={e => { if(e.key==='Enter') e.target.blur() }}
                        min={0}
                      />
                    ) : (
                      <span className="score-total">{p.base_pts}</span>
                    )}
                    {saving===p.id && <span style={{color:'var(--muted)',fontSize:10,marginLeft:6}}>...</span>}
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
        <thead>
          <tr>
            <th>#</th>
            <th>Команда</th>
            <th>Гравці</th>
            <th>Бали</th>
          </tr>
        </thead>
        <tbody>
          {teamSorted.map((t, idx) => (
            <tr key={t.team}>
              <td><span className={`rank${idx<3?` r${idx+1}`:''}`}>{idx+1}</span></td>
              <td><span className="team-name" style={{color:t.color}}>{t.team}</span></td>
              <td style={{color:'var(--muted)',fontSize:12}}>{t.members.join(' · ')}</td>
              <td><span className="team-score">{t.pts}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
