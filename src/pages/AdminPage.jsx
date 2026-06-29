import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function AdminPage() {
  const { isAdmin } = useAuth()
  const nav = useNavigate()
  const [tab,       setTab]       = useState('stages')   // stages | users | commit | log
  const [stages,    setStages]    = useState([])
  const [players,   setPlayers]   = useState([])
  const [sessions,  setSessions]  = useState([])
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [msg,       setMsg]       = useState('')

  useEffect(() => { if (!isAdmin) nav('/') }, [isAdmin])

  useEffect(() => {
    Promise.all([
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('players').select('*').order('name'),
      supabase.from('sessions').select('*, stages(name,flag)').order('created_at', {ascending:false}),
      supabase.from('audit_log').select('*').order('created_at', {ascending:false}).limit(50),
    ]).then(([s,p,se,l]) => {
      setStages(s.data||[])
      setPlayers(p.data||[])
      setSessions(se.data||[])
      setLogs(l.data||[])
      setLoading(false)
    })
  }, [])

  async function toggleStageLock(stage) {
    await supabase.from('stages').update({ is_locked: !stage.is_locked }).eq('id', stage.id)
    await supabase.from('sessions').update({ is_locked: !stage.is_locked }).eq('stage_id', stage.id)
    setStages(prev => prev.map(s => s.id===stage.id ? {...s, is_locked:!s.is_locked} : s))
    setMsg(`${stage.name} — ${stage.is_locked ? 'розблоковано' : 'заблоковано'}`)
    await supabase.from('audit_log').insert({
      action: stage.is_locked ? 'unlock_stage' : 'lock_stage',
      actor: 'admin', details: { stage: stage.key }
    })
  }

  async function toggleSessionLock(session) {
    await supabase.from('sessions').update({ is_locked: !session.is_locked }).eq('id', session.id)
    setSessions(prev => prev.map(s => s.id===session.id ? {...s, is_locked:!s.is_locked} : s))
    setMsg(`Сесія ${session.type} — ${session.is_locked ? 'розблоковано' : 'заблоковано'}`)
  }

  async function commitSession(session) {
    if (!window.confirm(`Зарахувати бали за ${session.stages?.name} — ${session.type}? Це додасть бали до base_pts всіх гравців.`)) return

    // Load forecasts for this session
    const { data: forecasts } = await supabase.from('forecasts').select('*, players(id,name,base_pts)').eq('session_id', session.id)
    const { data: qualData }  = await supabase.from('qual_assignments').select('*, players(id,name,base_pts)').eq('session_id', session.id)

    const results   = Object.entries(session.results||{}).sort((a,b)=>+a[0]-+b[0]).map(([,v])=>v)
    const flResult  = session.fl_pilot || ''
    const ovResult  = session.ov_pilot || ''

    const updates = []
    const breakdown_log = []

    if (session.type === 'race') {
      const { calcRaceScore } = await import('../lib/supabase')
      for (const f of (forecasts||[])) {
        const preds = Array.from({length:10}, (_,i) => f.predictions?.[i+1]||'')
        const { total, breakdown } = calcRaceScore(preds, f.fl_pick, f.ov_pick, results, flResult, ovResult)
        const newBase = (f.players?.base_pts||0) + total
        updates.push({ id: f.players?.id, base_pts: newBase })
        breakdown_log.push({ player: f.players?.name, score: total, breakdown })
        await supabase.from('forecasts').update({ score: total, score_breakdown: breakdown }).eq('id', f.id)
      }
    } else if (session.type === 'qual') {
      const { calcQualScore } = await import('../lib/supabase')
      for (const qa of (qualData||[])) {
        let total = 0, breakdown = []
        for (const [pilot, pos] of [[qa.pilot_1, qa.pred_pos_1],[qa.pilot_2, qa.pred_pos_2]]) {
          if (!pilot || !pos) continue
          const r = calcQualScore(pilot, pos, results)
          total += r.total; breakdown.push(...r.breakdown)
        }
        const newBase = (qa.players?.base_pts||0) + total
        updates.push({ id: qa.players?.id, base_pts: newBase })
        breakdown_log.push({ player: qa.players?.name, score: total, breakdown })
        await supabase.from('qual_assignments').update({ score: total }).eq('id', qa.id)
      }
    } else if (session.type === 'sprint') {
      const { calcSprintScore } = await import('../lib/supabase')
      for (const f of (forecasts||[])) {
        const preds = Array.from({length:5}, (_,i) => f.predictions?.[i+1]||'')
        const { total, breakdown } = calcSprintScore(preds, results)
        const newBase = (f.players?.base_pts||0) + total
        updates.push({ id: f.players?.id, base_pts: newBase })
        breakdown_log.push({ player: f.players?.name, score: total, breakdown })
        await supabase.from('forecasts').update({ score: total, score_breakdown: breakdown }).eq('id', f.id)
      }
    }

    // Apply base_pts updates
    for (const u of updates) {
      if (u.id) await supabase.from('players').update({ base_pts: u.base_pts }).eq('id', u.id)
    }

    // Lock session + mark committed
    await supabase.from('sessions').update({ is_locked: true, committed: true, committed_at: new Date().toISOString() }).eq('id', session.id)
    setSessions(prev => prev.map(s => s.id===session.id ? {...s, is_locked:true, committed:true} : s))

    // Audit log
    await supabase.from('audit_log').insert({
      action: 'commit_session', actor: 'admin',
      details: { session_id: session.id, stage: session.stages?.name, type: session.type, breakdown: breakdown_log }
    })

    // Refresh players
    const { data: newPlayers } = await supabase.from('players').select('*').order('name')
    setPlayers(newPlayers||[])

    setMsg(`✓ Бали зараховано! Сесія заблокована.`)
  }

  async function setAdmin(playerId, val) {
    await supabase.from('players').update({ is_admin: val }).eq('id', playerId)
    setPlayers(prev => prev.map(p => p.id===playerId ? {...p, is_admin:val} : p))
  }

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:20}}>ЗАВАНТАЖЕННЯ...</div></main>

  const tabs = [
    { key:'stages', label:'ЕТАПИ' },
    { key:'commit', label:'ЗАРАХУВАННЯ' },
    { key:'users',  label:'ГРАВЦІ' },
    { key:'log',    label:'ЛОГ' },
  ]

  return (
    <main>
      <div className="section-label">АДМІН ПАНЕЛЬ</div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
        {tabs.map(t => (
          <button key={t.key} className={`session-btn${tab===t.key?' active':''}`} onClick={()=>setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{background:'rgba(107,255,138,.08)',border:'1px solid var(--green)',borderRadius:4,padding:'10px 14px',marginBottom:16,color:'var(--green)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:1}}>
          {msg}
          <button style={{float:'right',background:'none',border:'none',color:'var(--muted)',cursor:'pointer'}} onClick={()=>setMsg('')}>✕</button>
        </div>
      )}

      {/* STAGES TAB */}
      {tab === 'stages' && (
        <>
          <div className="section-label">Управління етапами</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {stages.map(s => (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,padding:'10px 14px'}}>
                <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,fontWeight:700,flex:1}}>
                  {s.flag} {s.name}
                </span>
                <span style={{fontSize:11,color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:9}}>#{s.sort_order}</span>
                <button
                  className={`btn ${s.is_locked ? 'btn-ghost' : 'btn-red'}`}
                  style={{padding:'6px 14px',fontSize:9}}
                  onClick={() => toggleStageLock(s)}
                >
                  {s.is_locked ? '🔒 РОЗБЛОКУВАТИ' : '🔓 ЗАБЛОКУВАТИ'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* COMMIT TAB */}
      {tab === 'commit' && (
        <>
          <div className="section-label">Зарахування балів</div>
          <p style={{color:'var(--muted)',fontSize:12,marginBottom:16,lineHeight:1.6}}>
            Натисни «ЗАРАХУВАТИ» після завершення сесії. Бали додаються до базових і сесія блокується.
            Прогнози залишаються у базі для перегляду.
          </p>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {sessions.filter(s => !s.committed).map(s => (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,padding:'10px 14px',flexWrap:'wrap'}}>
                <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,flex:1}}>
                  {s.stages?.flag} {s.stages?.name} — {s.type.toUpperCase()}
                </span>
                {s.is_locked && <span className="badge badge-locked">🔒</span>}
                {s.committed && <span className="badge badge-committed">✓ ЗАРАХОВАНО</span>}
                {!s.committed && (
                  <button className="btn btn-red" style={{fontSize:9,padding:'6px 14px'}} onClick={()=>commitSession(s)}>
                    ⚑ ЗАРАХУВАТИ
                  </button>
                )}
                {!s.is_locked && !s.committed && (
                  <button className="btn btn-ghost" style={{fontSize:9,padding:'6px 14px'}} onClick={()=>toggleSessionLock(s)}>
                    🔒 ЗАБЛОКУВАТИ
                  </button>
                )}
              </div>
            ))}
            {sessions.filter(s=>s.committed).length > 0 && (
              <>
                <div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:9,letterSpacing:2,marginTop:12,marginBottom:6}}>ЗАРАХОВАНІ</div>
                {sessions.filter(s=>s.committed).map(s=>(
                  <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,padding:'8px 14px',opacity:.6}}>
                    <span style={{fontFamily:'Orbitron,sans-serif',fontSize:11,flex:1}}>{s.stages?.flag} {s.stages?.name} — {s.type.toUpperCase()}</span>
                    <span className="badge badge-committed">✓ ЗАРАХОВАНО</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* USERS TAB */}
      {tab === 'users' && (
        <>
          <div className="section-label">Гравці та доступ</div>
          <table className="standings" style={{marginBottom:0}}>
            <thead>
              <tr>
                <th>Гравець</th>
                <th>Команда</th>
                <th>Бали</th>
                <th>Email</th>
                <th>Адмін</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id}>
                  <td style={{fontWeight:600}}>{p.name}</td>
                  <td style={{fontSize:11,color:'var(--muted)'}}>{p.team}</td>
                  <td>
                    <input
                      type="number" className="score-input"
                      defaultValue={p.base_pts} min={0}
                      onBlur={async e => {
                        const n = parseInt(e.target.value)||0
                        await supabase.from('players').update({base_pts:n}).eq('id',p.id)
                        setPlayers(prev=>prev.map(pl=>pl.id===p.id?{...pl,base_pts:n}:pl))
                        setMsg(`${p.name}: бали оновлено → ${n}`)
                        await supabase.from('audit_log').insert({action:'edit_pts',actor:'admin',details:{player:p.name,pts:n}})
                      }}
                      onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}}
                    />
                  </td>
                  <td style={{fontSize:11,color:'var(--muted)'}}>{p.auth_user_id ? '✓ підключено' : '— немає'}</td>
                  <td>
                    <input type="checkbox" checked={!!p.is_admin} onChange={e=>setAdmin(p.id,e.target.checked)}
                      style={{width:16,height:16,cursor:'pointer',accentColor:'var(--red)'}} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* LOG TAB */}
      {tab === 'log' && (
        <>
          <div className="section-label">Лог подій (останні 50)</div>
          <div>
            {logs.map(l => (
              <div key={l.id} className="log-row">
                <span className="log-time">{new Date(l.created_at).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                <span className="log-actor">{l.actor}</span>
                <span style={{flex:1,fontSize:11}}>
                  <span style={{color:'var(--text)',fontWeight:600}}>{l.action}</span>
                  {' '}
                  <span style={{color:'var(--muted)'}}>{JSON.stringify(l.details).slice(0,80)}</span>
                </span>
              </div>
            ))}
            {logs.length === 0 && <div style={{color:'var(--muted)',fontSize:12}}>Лог порожній</div>}
          </div>
        </>
      )}
    </main>
  )
}
