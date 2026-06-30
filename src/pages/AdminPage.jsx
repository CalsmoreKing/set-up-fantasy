import { useState, useEffect } from 'react'
import { supabase, TEAM_META } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function AdminPage() {
  const { isAdmin } = useAuth()
  const nav = useNavigate()
  const [tab,       setTab]       = useState('stages')
  const [stages,    setStages]    = useState([])
  const [players,   setPlayers]   = useState([])
  const [sessions,  setSessions]  = useState([])
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [msg,       setMsg]       = useState('')

  // New player / team forms
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerTeam, setNewPlayerTeam] = useState('')
  const [newTeamName,   setNewTeamName]   = useState('')
  const [newTeamColor,  setNewTeamColor]  = useState('#888888')
  const [newTeamCode,   setNewTeamCode]   = useState('')
  const [customTeams,   setCustomTeams]   = useState([])

  useEffect(() => { if (!isAdmin) nav('/') }, [isAdmin])

  function loadAll() {
    Promise.all([
      supabase.from('stages').select('*').order('sort_order'),
      supabase.from('players').select('*').order('name'),
      supabase.from('sessions').select('*, stages(name,flag)').order('created_at', {ascending:false}),
      supabase.from('audit_log').select('*').order('created_at', {ascending:false}).limit(80),
    ]).then(([s,p,se,l]) => {
      setStages(s.data||[])
      setPlayers(p.data||[])
      setSessions(se.data||[])
      setLogs(l.data||[])
      // collect distinct teams not in TEAM_META (custom-added)
      const teamsInDb = [...new Set((p.data||[]).map(x=>x.team))]
      setCustomTeams(teamsInDb.filter(t => !TEAM_META[t]))
      setLoading(false)
    })
  }
  useEffect(() => { loadAll() }, [])

  async function log(action, details) {
    await supabase.from('audit_log').insert({ action, actor:'admin', details })
  }

  // ── STAGES ──
  async function toggleStageLock(stage) {
    await supabase.from('stages').update({ is_locked: !stage.is_locked }).eq('id', stage.id)
    await supabase.from('sessions').update({ is_locked: !stage.is_locked }).eq('stage_id', stage.id)
    setStages(prev => prev.map(s => s.id===stage.id ? {...s, is_locked:!s.is_locked} : s))
    setMsg(`${stage.name} — ${stage.is_locked ? 'розблоковано' : 'заблоковано'}`)
    await log(stage.is_locked ? 'unlock_stage' : 'lock_stage', { stage: stage.key })
  }
  async function toggleSessionLock(session) {
    await supabase.from('sessions').update({ is_locked: !session.is_locked }).eq('id', session.id)
    setSessions(prev => prev.map(s => s.id===session.id ? {...s, is_locked:!s.is_locked} : s))
    setMsg(`Сесія ${session.type} — ${session.is_locked ? 'розблоковано' : 'заблоковано'}`)
  }

  // ── COMMIT SCORES ──
  async function commitSession(session) {
    if (!window.confirm(`Зарахувати бали за ${session.stages?.name} — ${session.type}?`)) return

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
        updates.push({ id: f.players?.id, base_pts: (f.players?.base_pts||0) + total, delta: total })
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
        updates.push({ id: qa.players?.id, base_pts: (qa.players?.base_pts||0) + total, delta: total })
        breakdown_log.push({ player: qa.players?.name, score: total, breakdown })
        await supabase.from('qual_assignments').update({ score: total }).eq('id', qa.id)
      }
    } else if (session.type === 'sprint') {
      const { calcSprintScore } = await import('../lib/supabase')
      for (const f of (forecasts||[])) {
        const preds = Array.from({length:5}, (_,i) => f.predictions?.[i+1]||'')
        const { total, breakdown } = calcSprintScore(preds, results)
        updates.push({ id: f.players?.id, base_pts: (f.players?.base_pts||0) + total, delta: total })
        breakdown_log.push({ player: f.players?.name, score: total, breakdown })
        await supabase.from('forecasts').update({ score: total, score_breakdown: breakdown }).eq('id', f.id)
      }
    }

    // Snapshot rank BEFORE update for delta calculation later
    const { data: beforeSnapshot } = await supabase.from('players').select('id,base_pts').order('base_pts',{ascending:false})
    const rankBefore = {}
    ;(beforeSnapshot||[]).forEach((p,i) => { rankBefore[p.id] = i+1 })

    for (const u of updates) {
      if (u.id) await supabase.from('players').update({
        base_pts: u.base_pts,
        last_session_delta: u.delta,
      }).eq('id', u.id)
    }

    // Snapshot rank AFTER update
    const { data: afterSnapshot } = await supabase.from('players').select('id,base_pts').order('base_pts',{ascending:false})
    const rankAfter = {}
    ;(afterSnapshot||[]).forEach((p,i) => { rankAfter[p.id] = i+1 })

    for (const u of updates) {
      const before = rankBefore[u.id] || 0
      const after  = rankAfter[u.id] || 0
      await supabase.from('players').update({ last_rank_delta: before - after }).eq('id', u.id)
    }

    await supabase.from('sessions').update({ is_locked: true, committed: true, committed_at: new Date().toISOString() }).eq('id', session.id)
    setSessions(prev => prev.map(s => s.id===session.id ? {...s, is_locked:true, committed:true} : s))
    await log('commit_session', { session_id: session.id, stage: session.stages?.name, type: session.type, breakdown: breakdown_log })

    loadAll()
    setMsg(`✓ Бали зараховано! Сесія заблокована.`)
  }

  // ── PLAYER EDIT ──
  async function updatePlayerField(playerId, field, value) {
    await supabase.from('players').update({ [field]: value }).eq('id', playerId)
    setPlayers(prev => prev.map(p => p.id===playerId ? {...p, [field]:value} : p))
    await log('edit_player', { player_id:playerId, field, value })
    setMsg('✓ Збережено')
  }

  async function resetPlayerPassword(player) {
    if (!player.email_for_reset) {
      const email = window.prompt(`Email гравця ${player.name} для надсилання листа скидання паролю:`)
      if (!email) return
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (error) setMsg(`⚠ Помилка: ${error.message}`)
      else setMsg(`✓ Лист скидання паролю надіслано на ${email}`)
      return
    }
  }

  async function unlinkPlayerAccount(player) {
    if (!window.confirm(`Відв'язати акаунт від ${player.name}? Гравець втратить доступ і зможе зареєструватись знову.`)) return
    await supabase.from('players').update({ auth_user_id: null }).eq('id', player.id)
    setPlayers(prev => prev.map(p => p.id===player.id ? {...p, auth_user_id:null} : p))
    await log('unlink_account', { player: player.name })
    setMsg(`✓ Акаунт ${player.name} відв'язано`)
  }

  async function setAdmin(playerId, val) {
    await supabase.from('players').update({ is_admin: val }).eq('id', playerId)
    setPlayers(prev => prev.map(p => p.id===playerId ? {...p, is_admin:val} : p))
  }

  async function deletePlayer(player) {
    if (!window.confirm(`Видалити гравця ${player.name} НАЗАВЖДИ? Всі його прогнози також видаляться.`)) return
    await supabase.from('players').delete().eq('id', player.id)
    setPlayers(prev => prev.filter(p => p.id !== player.id))
    await log('delete_player', { player: player.name })
    setMsg(`✓ Гравця ${player.name} видалено`)
  }

  // ── ADD PLAYER ──
  async function addPlayer() {
    if (!newPlayerName.trim() || !newPlayerTeam) { setMsg('⚠ Вкажи ім\'я та команду'); return }
    const { error } = await supabase.from('players').insert({
      name: newPlayerName.trim(), team: newPlayerTeam, base_pts: 0
    })
    if (error) { setMsg(`⚠ ${error.message}`); return }
    setNewPlayerName(''); setNewPlayerTeam('')
    loadAll()
    setMsg('✓ Гравця додано')
  }

  // ── ADD TEAM (custom, stored only via player.team string) ──
  function addCustomTeam() {
    if (!newTeamName.trim()) { setMsg('⚠ Вкажи назву команди'); return }
    setCustomTeams(prev => [...new Set([...prev, newTeamName.trim()])])
    setNewTeamName(''); setNewTeamColor('#888888'); setNewTeamCode('')
    setMsg('✓ Команда додана до списку вибору (стане активною коли матиме гравця)')
  }

  const allTeamOptions = [...Object.keys(TEAM_META), ...customTeams]

  if (loading) return <main><div style={{color:'var(--muted)',fontFamily:'Orbitron,sans-serif',fontSize:11,letterSpacing:2,padding:20}}>ЗАВАНТАЖЕННЯ...</div></main>

  const tabs = [
    { key:'stages', label:'ЕТАПИ' },
    { key:'commit', label:'ЗАРАХУВАННЯ' },
    { key:'users',  label:'ГРАВЦІ' },
    { key:'teams',  label:'КОМАНДИ' },
    { key:'log',    label:'ЛОГ' },
  ]

  return (
    <main>
      <div className="section-label">АДМІН ПАНЕЛЬ</div>

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

      {/* STAGES */}
      {tab === 'stages' && (
        <>
          <div className="section-label">Управління етапами</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {stages.map(s => (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,padding:'10px 14px'}}>
                <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,fontWeight:700,flex:1}}>{s.flag} {s.name}</span>
                <span style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)'}}>#{s.sort_order}</span>
                <button className={`btn ${s.is_locked ? 'btn-ghost' : 'btn-red'}`} style={{padding:'6px 14px',fontSize:9}} onClick={() => toggleStageLock(s)}>
                  {s.is_locked ? '🔒 РОЗБЛОКУВАТИ' : '🔓 ЗАБЛОКУВАТИ'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* COMMIT */}
      {tab === 'commit' && (
        <>
          <div className="section-label">Зарахування балів</div>
          <p style={{color:'var(--muted)',fontSize:12,marginBottom:16,lineHeight:1.6}}>
            Натисни «ЗАРАХУВАТИ» після завершення сесії. Бали додаються до базових і сесія блокується.
          </p>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {sessions.filter(s => !s.committed).map(s => (
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,background:'var(--card)',border:'1px solid var(--border)',borderRadius:4,padding:'10px 14px',flexWrap:'wrap'}}>
                <span style={{fontFamily:'Orbitron,sans-serif',fontSize:12,flex:1}}>{s.stages?.flag} {s.stages?.name} — {s.type.toUpperCase()}</span>
                {s.is_locked && <span className="badge badge-locked">🔒</span>}
                <button className="btn btn-red" style={{fontSize:9,padding:'6px 14px'}} onClick={()=>commitSession(s)}>⚑ ЗАРАХУВАТИ</button>
                {!s.is_locked && (
                  <button className="btn btn-ghost" style={{fontSize:9,padding:'6px 14px'}} onClick={()=>toggleSessionLock(s)}>🔒 ЗАБЛОКУВАТИ</button>
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

      {/* USERS — full edit capability */}
      {tab === 'users' && (
        <>
          <div className="section-label">Додати гравця</div>
          <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
            <input className="field-input" placeholder="Ім'я гравця" value={newPlayerName} onChange={e=>setNewPlayerName(e.target.value)}
              style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px 12px',borderRadius:4,fontSize:13,minWidth:160}} />
            <select value={newPlayerTeam} onChange={e=>setNewPlayerTeam(e.target.value)}
              style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px 12px',borderRadius:4,fontSize:13}}>
              <option value="">— команда —</option>
              {allTeamOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn btn-red" onClick={addPlayer}>+ ДОДАТИ</button>
          </div>

          <div className="section-label">Гравці та доступ</div>
          <div style={{overflowX:'auto'}}>
          <table className="standings" style={{marginBottom:0,minWidth:760}}>
            <thead>
              <tr>
                <th>Ім'я</th>
                <th>Команда</th>
                <th>Бали</th>
                <th>Акаунт</th>
                <th>Адмін</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id}>
                  <td>
                    <input defaultValue={p.name} style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'4px 8px',borderRadius:3,fontSize:12,width:110}}
                      onBlur={e => { if(e.target.value!==p.name) updatePlayerField(p.id,'name',e.target.value) }} />
                  </td>
                  <td>
                    <select defaultValue={p.team} style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'4px 8px',borderRadius:3,fontSize:12}}
                      onChange={e => updatePlayerField(p.id,'team',e.target.value)}>
                      {allTeamOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td>
                    <input type="number" className="score-input" defaultValue={p.base_pts} min={0}
                      onBlur={e => updatePlayerField(p.id,'base_pts', parseInt(e.target.value)||0)}
                      onKeyDown={e=>{if(e.key==='Enter')e.target.blur()}} />
                  </td>
                  <td style={{fontSize:11}}>
                    {p.auth_user_id ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{color:'var(--green)'}}>✓ підключено</span>
                        <button className="btn btn-ghost" style={{padding:'3px 8px',fontSize:9}} onClick={()=>unlinkPlayerAccount(p)}>відв'язати</button>
                      </div>
                    ) : (
                      <span style={{color:'var(--muted)'}}>— немає</span>
                    )}
                  </td>
                  <td>
                    <input type="checkbox" checked={!!p.is_admin} onChange={e=>setAdmin(p.id,e.target.checked)}
                      style={{width:16,height:16,cursor:'pointer',accentColor:'var(--red)'}} />
                  </td>
                  <td>
                    <button className="btn btn-ghost" style={{padding:'4px 9px',fontSize:9,color:'#ff6b6b',borderColor:'#552222'}} onClick={()=>deletePlayer(p)}>видалити</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p style={{color:'var(--muted)',fontSize:11,marginTop:10,lineHeight:1.6}}>
            «Відв'язати» прибирає зв'язок акаунт↔гравець — людина зможе зареєструватись наново під цим ім'ям.
            Скинути пароль гравець може сам через «Забув пароль?» на сторінці входу.
          </p>
        </>
      )}

      {/* TEAMS */}
      {tab === 'teams' && (
        <>
          <div className="section-label">Додати команду</div>
          <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
            <input placeholder="Назва команди" value={newTeamName} onChange={e=>setNewTeamName(e.target.value)}
              style={{background:'var(--card)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px 12px',borderRadius:4,fontSize:13,minWidth:160}} />
            <button className="btn btn-red" onClick={addCustomTeam}>+ ДОДАТИ КОМАНДУ</button>
          </div>
          <p style={{color:'var(--muted)',fontSize:11,marginBottom:16,lineHeight:1.6}}>
            Нова команда з'явиться у виборі команди для гравця. Базові 9 команд (з фіксованими кольорами) редагуються в коді проєкту.
          </p>
          <div className="section-label">Існуючі команди</div>
          <table className="team-table">
            <thead><tr><th>Команда</th><th>Гравці</th><th>Сумарні бали</th></tr></thead>
            <tbody>
              {[...new Set(players.map(p=>p.team))].map(team => {
                const teamPlayers = players.filter(p=>p.team===team)
                const total = teamPlayers.reduce((s,p)=>s+p.base_pts,0)
                const color = TEAM_META[team]?.color || '#888'
                return (
                  <tr key={team} style={{borderLeft:`3px solid ${color}`}}>
                    <td style={{fontFamily:'Orbitron,sans-serif',fontSize:12,color}}>{team}</td>
                    <td style={{fontSize:11,color:'var(--muted)'}}>{teamPlayers.map(p=>p.name).join(' · ')}</td>
                    <td className="team-score">{total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {/* LOG */}
      {tab === 'log' && (
        <>
          <div className="section-label">Лог подій (останні 80)</div>
          <div>
            {logs.map(l => (
              <div key={l.id} className="log-row">
                <span className="log-time">{new Date(l.created_at).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                <span className="log-actor">{l.actor}</span>
                <span style={{flex:1,fontSize:11}}>
                  <span style={{color:'var(--text)',fontWeight:600}}>{l.action}</span>{' '}
                  <span style={{color:'var(--muted)'}}>{JSON.stringify(l.details).slice(0,100)}</span>
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
