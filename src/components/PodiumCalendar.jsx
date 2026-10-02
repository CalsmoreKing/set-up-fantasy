import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase, TEAM_META } from '../lib/supabase'

export default function PodiumCalendar({ open, onClose }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (open) load() }, [open])

  async function load() {
    setLoading(true)
    const { data: stages } = await supabase.from('stages').select('*').order('sort_order')
    const { data: sessions } = await supabase.from('sessions')
      .select('id, type, results, committed, stage_id')
      .eq('type', 'race')

    const { data: forecasts } = await supabase.from('forecasts')
      .select('player_id, session_id, predictions, players(name, team)')

    const rows = (stages||[]).map(stage => {
      const sess = (sessions||[]).find(s => s.stage_id === stage.id)
      if (!sess || !sess.committed || !sess.results) return { stage, podium: null }

      const resultsList = Object.entries(sess.results).sort((a,b)=>+a[0]-+b[0]).map(([,v])=>v)
      const top3Pilots = resultsList.slice(0,3)

      // Find which of OUR players "called" (correctly predicted exact position) each podium spot
      const podium = top3Pilots.map((actualPilot, posIdx) => {
        if (!actualPilot) return null
        const matches = (forecasts||[]).filter(f => {
          if (f.session_id !== sess.id) return false
          const predicted = f.predictions?.[posIdx+1]
          return predicted === actualPilot
        })
        return {
          pos: posIdx+1,
          pilot: actualPilot,
          players: matches.map(m => m.players).filter(Boolean),
        }
      })

      return { stage, podium }
    })

    setData(rows)
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
        padding:22, width:'min(720px,100%)', maxHeight:'85dvh', overflowY:'auto',
      }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color:'var(--red)',letterSpacing:2,fontWeight:700}}>
            🏆 КАЛЕНДАР ПОДІУМІВ
          </span>
          <button className="btn btn-ghost" style={{padding:'4px 10px',fontSize:11}} onClick={onClose}>✕ ЗАКРИТИ</button>
        </div>
        <p style={{fontSize:11,color:'var(--muted)',marginBottom:14,lineHeight:1.5}}>
          Хто з гравців вгадав точну позицію подіуму на кожному етапі.
        </p>

        {loading && <div style={{color:'var(--muted)',fontSize:12,textAlign:'center',padding:20}}>Завантаження...</div>}

        {!loading && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
            {data.map(({ stage, podium }) => (
              <div key={stage.id} style={{
                border:'1px solid var(--border)', borderRadius:3, overflow:'hidden',
                opacity: podium ? 1 : .35,
              }}>
                <div style={{
                  padding:'6px 10px', background:'var(--card)',
                  fontFamily:'Orbitron,sans-serif', fontSize:10, fontWeight:700,
                  borderBottom:'1px solid var(--border)',
                }}>
                  {stage.flag} {stage.name}
                </div>
                <div style={{padding:'6px 8px',display:'flex',flexDirection:'column',gap:3}}>
                  {podium ? podium.map((p, i) => p && (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                      <span style={{
                        fontFamily:'Orbitron,sans-serif',fontWeight:900,width:14,
                        color: p.pos===1?'var(--gold)':p.pos===2?'var(--silver)':'var(--bronze)',
                      }}>{p.pos}</span>
                      {p.players.length > 0 ? (
                        <span style={{display:'flex',flexWrap:'wrap',gap:3}}>
                          {p.players.map((pl,j) => (
                            <span key={j} style={{
                              color: TEAM_META[pl.team]?.color || 'var(--text)',
                              fontWeight:600, fontSize:10.5,
                            }}>{pl.name}</span>
                          ))}
                        </span>
                      ) : (
                        <span style={{color:'#444',fontSize:10,fontStyle:'italic'}}>ніхто</span>
                      )}
                    </div>
                  )) : (
                    <div style={{color:'var(--muted)',fontSize:10,fontStyle:'italic',padding:'4px 0'}}>— ще не пройшов —</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
