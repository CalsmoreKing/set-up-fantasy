import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase, TEAM_META } from '../lib/supabase'

export default function StatsModal({ open, onClose, players }) {
  const [selectedId, setSelectedId] = useState('')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (open && !selectedId && players.length) setSelectedId(players[0].id) }, [open])
  useEffect(() => { if (open && selectedId) loadStats(selectedId) }, [open, selectedId])

  async function loadStats(playerId) {
    setLoading(true)
    const player = players.find(p => p.id === playerId)

    const [{ data: forecasts }, { data: quals }] = await Promise.all([
      supabase.from('forecasts')
        .select('score, score_breakdown, fl_pick, ov_pick, predictions, session_id, sessions(type, stage_id, stages(name,flag,sort_order))')
        .eq('player_id', playerId)
        .not('score_breakdown', 'is', null),
      supabase.from('qual_assignments')
        .select('score, pilot_1, pred_pos_1, pilot_2, pred_pos_2, pilot_3, pred_pos_3, session_id, sessions(stage_id, stages(name,flag,sort_order))')
        .eq('player_id', playerId)
        .gt('score', -1),
    ])

    // Aggregate by session type
    const byType = { race: [], sprint: [] }
    ;(forecasts||[]).forEach(f => {
      const type = f.sessions?.type
      if (byType[type]) byType[type].push({ score: f.score||0, stage: f.sessions?.stages, breakdown: f.score_breakdown||[] })
    })

    // Best & worst session (by score)
    const allSessions = [
      ...byType.race.map(s => ({...s, type:'race'})),
      ...byType.sprint.map(s => ({...s, type:'sprint'})),
      ...(quals||[]).map(q => ({ score: q.score||0, stage: q.sessions?.stages, type:'qual' })),
    ].filter(s => s.stage).sort((a,b) => (a.stage?.sort_order||0) - (b.stage?.sort_order||0))

    const best = [...allSessions].sort((a,b) => b.score - a.score)[0]
    const worst = [...allSessions].sort((a,b) => a.score - b.score)[0]

    // Pilot pick frequency (from race predictions, top-10)
    const pilotFreq = {}
    ;(forecasts||[]).forEach(f => {
      if (f.sessions?.type !== 'race') return
      Object.values(f.predictions||{}).forEach(pilot => {
        if (pilot) pilotFreq[pilot] = (pilotFreq[pilot]||0) + 1
      })
    })
    const favoritePilot = Object.entries(pilotFreq).sort((a,b)=>b[1]-a[1])[0]

    // FL/OV hit rate
    let flHits = 0, flTotal = 0, ovHits = 0, ovTotal = 0
    ;(forecasts||[]).forEach(f => {
      const bd = f.score_breakdown || []
      if (f.fl_pick) { flTotal++; if (bd.some(b => b.label?.includes('Швидке коло'))) flHits++ }
      if (f.ov_pick) { ovTotal++; if (bd.some(b => b.label?.includes('Прорив'))) ovHits++ }
    })

    // Podium/Top5 bonus hits
    const podiumHits = (forecasts||[]).filter(f => (f.score_breakdown||[]).some(b => b.label?.includes('Топ-3'))).length
    const top5Hits   = (forecasts||[]).filter(f => (f.score_breakdown||[]).some(b => b.label?.includes('Топ-5'))).length

    // Average scores
    const avgRace   = byType.race.length ? (byType.race.reduce((s,x)=>s+x.score,0) / byType.race.length) : 0
    const avgSprint = byType.sprint.length ? (byType.sprint.reduce((s,x)=>s+x.score,0) / byType.sprint.length) : 0
    const avgQual   = (quals||[]).length ? ((quals||[]).reduce((s,x)=>s+(x.score||0),0) / (quals||[]).length) : 0

    // Trend: last 5 sessions score sequence for sparkline
    const trend = allSessions.slice(-8).map(s => s.score)

    setStats({
      player, allSessions, best, worst, favoritePilot,
      flHits, flTotal, ovHits, ovTotal, podiumHits, top5Hits,
      avgRace, avgSprint, avgQual, trend,
      totalSessions: allSessions.length,
    })
    setLoading(false)
  }

  if (!open) return null

  return createPortal(
    <div
      style={{position:'fixed',inset:0,zIndex:6000,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(0,0,0,.75)'}}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background:'var(--card2)', border:'1px solid rgba(225,6,0,.3)', borderRadius:6,
        padding:22, width:'min(560px,100%)', maxHeight:'85dvh', overflowY:'auto',
      }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:'var(--red)',letterSpacing:2,fontWeight:700}}>
            📊 СТАТИСТИКА ГРАВЦЯ
          </span>
          <button className="btn btn-ghost" style={{padding:'4px 10px',fontSize:11}} onClick={onClose}>✕ ЗАКРИТИ</button>
        </div>

        <select className="stage-select" style={{width:'100%',marginBottom:16,minHeight:38}}
          value={selectedId} onChange={e=>setSelectedId(e.target.value)}>
          {players.map(p => <option key={p.id} value={p.id}>{p.name} — {p.team}</option>)}
        </select>

        {loading && <div style={{color:'var(--muted)',fontSize:12,textAlign:'center',padding:20}}>Завантаження...</div>}

        {!loading && stats && (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {/* Header with team color */}
            <div style={{
              display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
              background:`linear-gradient(90deg, ${TEAM_META[stats.player.team]?.color||'#888'}18, transparent)`,
              borderLeft:`3px solid ${TEAM_META[stats.player.team]?.color||'#888'}`,borderRadius:3,
            }}>
              <span style={{fontFamily:'Orbitron,sans-serif',fontSize:14,fontWeight:900}}>{stats.player.name}</span>
              <span style={{fontSize:11,color:'var(--muted)'}}>{stats.player.team}</span>
              <span style={{marginLeft:'auto',fontFamily:'Orbitron,sans-serif',fontSize:16,fontWeight:900,color:'var(--gold)'}}>
                {stats.player.base_pts} pts
              </span>
            </div>

            {/* Average scores grid */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <StatBox label="СЕР. ГОНКА" value={stats.avgRace.toFixed(1)} />
              <StatBox label="СЕР. СПРИНТ" value={stats.avgSprint.toFixed(1)} />
              <StatBox label="СЕР. КВАЛА" value={stats.avgQual.toFixed(1)} />
            </div>

            {/* Trend sparkline */}
            {stats.trend.length > 1 && (
              <div>
                <div style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:1,marginBottom:6}}>
                  ТРЕНД (останні {stats.trend.length} сесій)
                </div>
                <Sparkline data={stats.trend} />
              </div>
            )}

            {/* Best/Worst */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {stats.best && (
                <div style={{padding:'8px 12px',background:'rgba(74,222,128,.06)',border:'1px solid rgba(74,222,128,.2)',borderRadius:3}}>
                  <div style={{fontFamily:'Orbitron,sans-serif',fontSize:8,color:'var(--green)',letterSpacing:1}}>КРАЩА СЕСІЯ</div>
                  <div style={{fontSize:12,marginTop:3}}>{stats.best.stage?.flag} {stats.best.stage?.name} — <b style={{color:'var(--green)'}}>+{stats.best.score}</b></div>
                </div>
              )}
              {stats.worst && (
                <div style={{padding:'8px 12px',background:'rgba(248,113,113,.06)',border:'1px solid rgba(248,113,113,.2)',borderRadius:3}}>
                  <div style={{fontFamily:'Orbitron,sans-serif',fontSize:8,color:'#f87171',letterSpacing:1}}>ГІРША СЕСІЯ</div>
                  <div style={{fontSize:12,marginTop:3}}>{stats.worst.stage?.flag} {stats.worst.stage?.name} — <b style={{color:'#f87171'}}>+{stats.worst.score}</b></div>
                </div>
              )}
            </div>

            {/* Special picks */}
            <div>
              <div style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:1,marginBottom:6}}>СПЕЦІАЛЬНІ ПРОГНОЗИ</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <MiniStat icon="⚡" label="Швидке коло" value={`${stats.flHits}/${stats.flTotal}`} />
                <MiniStat icon="🚀" label="Прорив" value={`${stats.ovHits}/${stats.ovTotal}`} />
                <MiniStat icon="🏆" label="Топ-3 бонус" value={stats.podiumHits} />
                <MiniStat icon="🎯" label="Топ-5 бонус" value={stats.top5Hits} />
              </div>
            </div>

            {/* Favorite pilot */}
            {stats.favoritePilot && (
              <div style={{padding:'8px 12px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:3,fontSize:12}}>
                <span style={{color:'var(--muted)'}}>Улюблений пілот: </span>
                <b style={{color:'var(--gold)'}}>{stats.favoritePilot[0]}</b>
                <span style={{color:'var(--muted)'}}> — обраний {stats.favoritePilot[1]} разів</span>
              </div>
            )}

            <div style={{fontSize:10,color:'var(--muted)',textAlign:'center'}}>
              Загалом зараховано сесій: {stats.totalSessions}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function StatBox({ label, value }) {
  return (
    <div style={{textAlign:'center',padding:'10px 6px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:3}}>
      <div style={{fontFamily:'Orbitron,sans-serif',fontSize:18,fontWeight:900,color:'var(--gold)'}}>{value}</div>
      <div style={{fontFamily:'Orbitron,sans-serif',fontSize:8,color:'var(--muted)',letterSpacing:1,marginTop:2}}>{label}</div>
    </div>
  )
}

function MiniStat({ icon, label, value }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:3}}>
      <span style={{fontSize:14}}>{icon}</span>
      <span style={{fontSize:11,color:'var(--muted)',flex:1}}>{label}</span>
      <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,fontWeight:700,color:'var(--text)'}}>{value}</span>
    </div>
  )
}

function Sparkline({ data }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{display:'flex',alignItems:'flex-end',gap:3,height:40}}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex:1, height:`${Math.max(4,(v/max)*100)}%`,
          background: v === max ? 'var(--gold)' : 'rgba(225,6,0,.5)',
          borderRadius:'2px 2px 0 0', transition:'height .3s',
        }} title={`+${v}`} />
      ))}
    </div>
  )
}
