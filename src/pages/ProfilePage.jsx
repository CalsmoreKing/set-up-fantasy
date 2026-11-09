import { useEffect, useState } from 'react'
import { supabase, TEAM_META } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { rankPlayers } from '../lib/standings'

export default function ProfilePage() {
  const { player } = useAuth()
  const [profile, setProfile] = useState(null)
  const [posterRows, setPosterRows] = useState([])
  const [roster, setRoster] = useState([])
  const [seasonRank, setSeasonRank] = useState(null)
  const [seasonTotal, setSeasonTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (player?.id) load()
  }, [player?.id])

  async function load() {
    setLoading(true)
    const [stagesRes, sessionsRes, playersRes] = await Promise.all([
      supabase.from('stages').select('id,key,name,flag,sort_order').order('sort_order'),
      supabase.from('sessions').select('id,stage_id,type,committed').eq('type','race').eq('committed',true),
      supabase.from('players').select('id,name,team,base_pts'),
    ])
    setProfile({ player_id: player.id, banner_url: null, bio: '' })
    const sessions = sessionsRes.data || []
    const sessionIds = sessions.map(s => s.id)
    let forecasts = []
    if (sessionIds.length) {
      const result = await supabase.from('forecasts').select('player_id,session_id,score').in('session_id', sessionIds)
      forecasts = result.data || []
    }
    const stages = stagesRes.data || []
    const allPlayers = playersRes.data || []
    setRoster(allPlayers)
    const mySeasonRank = [...allPlayers].sort((a,b) => (Number(b.base_pts)||0) - (Number(a.base_pts)||0)).findIndex(p => p.id === player.id) + 1
    setSeasonRank(mySeasonRank || null)
    const rows = []
    for (const stage of stages) {
      const session = sessions.find(s => s.stage_id === stage.id)
      if (!session) continue
      const stageScores = Object.fromEntries(forecasts.filter(f => f.session_id === session.id).map(f => [f.player_id, { score: Number(f.score)||0 }]))
      const ranked = rankPlayers(allPlayers, stageScores, 'score')
      const mine = ranked.find(p => p.id === player.id)
      if (mine) rows.push({ stage, score: mine.score, place: mine.place })
    }
    setPosterRows(rows)
    setSeasonTotal(rows.reduce((sum, row) => sum + row.score, 0))
    setLoading(false)
  }

  const teammate = roster.find(candidate => candidate.team === player?.team && candidate.id !== player?.id)
  const teamColor = TEAM_META[player?.team]?.color || '#888'

  if (loading) return <main><div className="section-label">ЗАВАНТАЖЕННЯ ПРОФІЛЮ...</div></main>
  return <main>
    <style>{`@media print { @page { margin: 12mm } body * { visibility: hidden !important } #season-poster, #season-poster * { visibility: visible !important } #season-poster { position: absolute !important; inset: 0 !important; width: 100% !important; margin: 0 !important; color: #111 !important; background-color: #fff !important; border: 2px solid #222 !important; } #season-poster * { color: #111 !important; background-color: transparent !important; } }`}</style>
    <div className="section-label">ПРОФІЛЬ ГРАВЦЯ</div>
    <section style={{border:'1px solid var(--border)',borderRadius:5,overflow:'hidden',marginBottom:24,background:'var(--card)'}}>
      <div style={{height:180,background:profile?.banner_url ? `linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,.08)),url(${profile.banner_url}) center/cover` : `linear-gradient(120deg,${teamColor}44,#111 60%)`,display:'flex',alignItems:'end',padding:18}}>
        <div>
          <div style={{fontFamily:'Orbitron,sans-serif',fontSize:20,fontWeight:900}}>{player?.name}</div>
          <div style={{color:teamColor,fontSize:12,marginTop:4}}>{player?.team}</div>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',flexWrap:'wrap'}}>
        <button className="btn btn-ghost" disabled title="Буде доступно після затвердження міграції профілів" style={{cursor:'not-allowed',fontSize:10,padding:'7px 12px',opacity:.55}}>
          БАНЕРИ ПОКИ ВИМКНЕНІ
        </button>
        <span style={{fontSize:10,color:'var(--muted)'}}>Завантаження банерів буде ввімкнено після безпечного розгортання схеми профілів.</span>
      </div>
    </section>

    <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,marginBottom:12,flexWrap:'wrap'}}>
      <div><div className="section-label" style={{marginBottom:5}}>СЕЗОННИЙ ПОСТЕР</div><div style={{fontSize:11,color:'var(--muted)'}}>Очки та місця лише за гонками (без кваліфікації й спринтів).</div></div>
      <button className="btn btn-ghost" onClick={()=>window.print()} style={{fontSize:10}}>⎙ ДРУК / ЗБЕРЕГТИ PDF</button>
    </div>
    <div id="season-poster" style={{border:`1px solid ${teamColor}66`,borderTop:`4px solid ${teamColor}`,borderRadius:5,padding:18,background:profile?.banner_url ? `linear-gradient(145deg,rgba(8,8,8,.9),rgba(8,8,8,.94)),url(${profile.banner_url}) center/cover` : 'linear-gradient(145deg,var(--card),#0b0b0b)',marginBottom:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:14}}>
        <div><div style={{fontFamily:'Orbitron,sans-serif',fontSize:15,fontWeight:900}}>{player?.name}</div><div style={{fontSize:10,color:teamColor,marginTop:4}}>{TEAM_META[player?.team]?.glyph || '◆'} {TEAM_META[player?.team]?.code || player?.team} · {player?.team}{teammate ? ` · teammate: ${teammate.name}` : ''}</div></div>
        <div style={{textAlign:'right'}}><div style={{fontFamily:'Orbitron,sans-serif',fontSize:8,color:'var(--muted)',letterSpacing:1}}>СУМА ГОНКОВИХ БАЛІВ</div><strong style={{fontFamily:'Orbitron,sans-serif',fontSize:22,color:'var(--gold)'}}>{seasonTotal}</strong></div>
      </div>
      {posterRows.length ? <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(125px,1fr))',gap:7}}>{posterRows.map(({stage,score,place})=><div key={stage.id} style={{padding:'9px 10px',border:'1px solid var(--border)',borderRadius:3,background:'#111'}}><div style={{fontSize:11,fontWeight:700}}>{stage.flag} {stage.name}</div><div style={{display:'flex',justifyContent:'space-between',marginTop:10,alignItems:'end'}}><b style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:place===1?'var(--gold)':place===2?'var(--silver)':place===3?'var(--bronze)':'var(--text)'}}>P{place}</b><span style={{fontSize:10,color:'var(--muted)'}}>{score} pts</span></div></div>)}</div> : <div style={{fontSize:12,color:'var(--muted)'}}>Ще немає зарахованих гонок.</div>}
    </div>
    <div className="section-label">ОСОБИСТА СТАТИСТИКА</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginBottom:24}}>
      <ProfileMetric label="МІСЦЕ В СЕЗОНІ" value={seasonRank ? `#${seasonRank}` : '—'} />
      <ProfileMetric label="КОМАНДА / НАПАРНИК" value={`${TEAM_META[player?.team]?.code || ''} · ${teammate?.name || '—'}`} />
      <ProfileMetric label="ЗАГАЛЬНІ ОЧКИ" value={player?.base_pts ?? 0} />
      <ProfileMetric label="ГОНКОВІ ОЧКИ" value={seasonTotal} />
      <ProfileMetric label="ЕТАПІВ З РЕЗУЛЬТАТОМ" value={posterRows.length} />
    </div>
  </main>
}

function ProfileMetric({label,value}) { return <div style={{padding:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:3}}><div style={{fontFamily:'Orbitron,sans-serif',fontSize:8,color:'var(--muted)',letterSpacing:1}}>{label}</div><div style={{fontFamily:'Orbitron,sans-serif',fontSize:17,color:'var(--gold)',fontWeight:900,marginTop:6}}>{value}</div></div> }
