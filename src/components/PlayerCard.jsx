import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PILOTS, calcRaceScore, calcQualScore, calcSprintScore, USED_PILOTS, TEAM_META } from '../lib/supabase'
import { supabase } from '../lib/supabase'

const PILOT_OPTIONS = ['', ...PILOTS]

export default function PlayerCard({
  player, teamColor, sessionType, session, forecast, qualAssign,
  results, flResult, ovResult, isMe, isAdmin, isLocked, isDouble,
  stageKey, allQualAssign, onSaveForecast, onSaveQual, teamSiblingId,
  forecastHidden, liveScore, liveRank
}) {
  const teamCode = TEAM_META[player.team]?.code || player.team.slice(0,3).toUpperCase()
  const [open, setOpen]   = useState(false)
  const bodyRef           = useRef(null)
  const saveTimer         = useRef(null)

  // Local state for forecast
  const initPreds = useCallback(() => {
    const p = forecast?.predictions || {}
    return Array.from({length:10}, (_,i) => p[i+1] || '')
  }, [forecast])

  const [preds, setPreds]   = useState(initPreds)
  const [fl,    setFl]      = useState(forecast?.fl_pick || '')
  const [ov,    setOv]      = useState(forecast?.ov_pick || '')
  const [qPilots, setQPilots] = useState([qualAssign?.pilot_1||'', qualAssign?.pilot_2||''])
  const [qPos,    setQPos]    = useState([qualAssign?.pred_pos_1||'', qualAssign?.pred_pos_2||''])

  // Sync from DB
  useEffect(() => {
    setPreds(initPreds())
    setFl(forecast?.fl_pick || '')
    setOv(forecast?.ov_pick || '')
  }, [forecast])
  useEffect(() => {
    setQPilots([qualAssign?.pilot_1||'', qualAssign?.pilot_2||''])
    setQPos([qualAssign?.pred_pos_1||'', qualAssign?.pred_pos_2||''])
  }, [qualAssign])

  // Body height animation
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.style.maxHeight = open ? bodyRef.current.scrollHeight + 'px' : '0'
    }
  }, [open, preds, fl, ov, qPilots, qPos])

  // Debounced save
  function schedSave(newPreds, newFl, newOv) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSaveForecast(newPreds, newFl, newOv), 600)
  }

  // Forecast (race/sprint predictions + qual position guess) — own player or admin
  const canEdit = (isMe || isAdmin) && !isLocked
  // Qual PILOT assignment (roulette, manual set, remove) — ADMIN ONLY
  const canEditQualPilot = isAdmin && !isLocked

  function setP(i, v) {
    const n = [...preds]; n[i] = v; setPreds(n)
    schedSave(n, fl, ov)
  }

  // Scoring
  let score = 0, breakdown = []
  if (sessionType === 'race') {
    const r = calcRaceScore(preds, fl, ov, results, flResult, ovResult)
    score = r.total; breakdown = r.breakdown
  } else if (sessionType === 'qual') {
    let tot = 0, bd = []
    qPilots.forEach((pilot, i) => {
      const pos = parseInt(qPos[i]) || 0
      const r = calcQualScore(pilot, pos, results)
      tot += r.total; bd.push(...r.breakdown)
    })
    score = tot; breakdown = bd
  } else if (sessionType === 'sprint') {
    const r = calcSprintScore(preds.slice(0,5), results)
    score = r.total; breakdown = r.breakdown
  }

  // Fill count
  // Fill indicator — shows only when PREDICTION is entered, not just pilot assigned
  const fillCount = sessionType === 'qual'
    ? qPos.filter(p => p !== '' && p !== null && p !== undefined).length
    : sessionType === 'sprint'
    ? preds.slice(0,5).filter(Boolean).length
    : preds.filter(Boolean).length
  const fillTotal = sessionType === 'qual' ? (isDouble?2:1) : sessionType === 'sprint' ? 5 : 10
  const isFull = fillCount === fillTotal && fillTotal > 0

  // Qual available pilots
  function getAvailable() {
    const used = new Set(USED_PILOTS[player.name] || [])
    // Add all previously assigned in other stages
    Object.values(allQualAssign || {}).forEach(a => {
      if (a.player_id === player.id) { if (a.pilot_1) used.add(a.pilot_1); if (a.pilot_2) used.add(a.pilot_2) }
    })
    if (qPilots[0]) used.add(qPilots[0])
    if (qPilots[1]) used.add(qPilots[1])
    return PILOTS.filter(p => !used.has(p))
  }

  async function rollPilot(idx) {
    const taken = new Set(
      Object.values(allQualAssign || {})
        .filter(a => a.player_id !== player.id)
        .map(a => idx===0 ? a.pilot_1 : a.pilot_2)
        .filter(Boolean)
    )
    const available = getAvailable().filter(p => !taken.has(p))
    const pool = available.length ? available : getAvailable()
    if (!pool.length) { alert(`${player.name}: немає доступних пілотів!`); return }
    const pilot = pool[Math.floor(Math.random() * pool.length)]
    const nPilots = [...qPilots]; nPilots[idx] = pilot
    setQPilots(nPilots)
    const nPos = [...qPos]; nPos[idx] = ''
    setQPos(nPos)
    onSaveQual(nPilots[0], nPilots[1], parseInt(nPos[0])||null, parseInt(nPos[1])||null)
  }

  // Tooltip state
  const [ttPos, setTtPos] = useState({x:0,y:0})
  const [ttVis, setTtVis] = useState(false)
  const [ttType, setTtType] = useState('score') // 'score' | 'qual'

  function onNameEnter(e) {
    setTtPos({x:e.clientX, y:e.clientY})
    setTtType(sessionType === 'qual' ? 'qual' : 'score')
    setTtVis(true)
  }

  // Team-collapse: toggle opens sibling too
  function toggleOpen() {
    const next = !open
    setOpen(next)
    // Toggle sibling card
    if (teamSiblingId) {
      const el = document.getElementById(`card-body-${teamSiblingId}`)
      if (el) {
        const parent = el.closest('.player-card')
        if (parent) {
          el.style.maxHeight = next ? el.scrollHeight + 'px' : '0'
          el.classList.toggle('collapsed', !next)
          const arrow = parent.querySelector('.collapse-icon')
          if (arrow) arrow.classList.toggle('open', next)
        }
      }
    }
  }

  return (
    <div className="player-card" id={`player-card-${player.id}`}>
      <div
        className="card-header"
        style={{
          borderLeft: `4px solid ${teamColor}`,
          '--team-color': teamColor,
          '--team-glow': `${teamColor}14`,
        }}
        onClick={toggleOpen}
      >
        <div className="card-header-left">
          <span className="team-chip">{teamCode}</span>
          <span
            className="player-name-tag"
            data-player-id={player.id}
            onMouseEnter={e => onNameEnter(e)}
            onMouseLeave={() => setTtVis(false)}
            onMouseMove={e => setTtPos({x:e.clientX,y:e.clientY})}
          >
            {player.name}
            {isMe && <span style={{fontSize:9,color:'var(--muted)',marginLeft:6}}>(я)</span>}
          </span>
        </div>
        <div className="card-header-right">
          {liveRank && (
            <span style={{
              fontFamily:'Orbitron,sans-serif', fontSize:9, fontWeight:900,
              color: liveRank===1?'var(--gold)':liveRank===2?'var(--silver)':liveRank===3?'var(--bronze)':'var(--muted)',
              border:`1px solid ${liveRank===1?'var(--gold)':liveRank===2?'var(--silver)':liveRank===3?'var(--bronze)':'var(--border)'}`,
              borderRadius:2, padding:'2px 6px', letterSpacing:1,
            }}>#{liveRank}</span>
          )}
          <span className={`fill-pill${isFull?' full':''}`}>{fillCount}/{fillTotal}</span>
          <span className="live-score">{score}<small>pts</small></span>
          <span className={`collapse-icon${open?' open':''}`}>▼</span>
        </div>
      </div>

      <div
        className={`card-body${open?'':' collapsed'}`}
        id={`card-body-${player.id}`}
        ref={bodyRef}
        style={{ maxHeight: open ? undefined : 0 }}
      >
        {/* Hidden until deadline */}
        {forecastHidden ? (
          <div style={{padding:'18px 14px',textAlign:'center'}}>
            <div style={{fontFamily:'Orbitron,sans-serif',fontSize:10,color:'var(--muted)',letterSpacing:2}}>
              🔒 ПРОГНОЗ ЗАКРИТО ДО ДЕДЛАЙНУ
            </div>
          </div>
        ) : (<>
        {sessionType === 'race' && (
          <>
            <div className="forecast-inputs">
              {/* P1-5 left, P6-10 right */}
              {[0,1,2,3,4,5,6,7,8,9].map(i => (
                <div className="input-row" key={i}>
                  <span className="pos-label">{i+1}</span>
                  <select
                    className="pilot-select"
                    value={preds[i]}
                    disabled={!canEdit}
                    onChange={e => setP(i, e.target.value)}
                  >
                    {PILOT_OPTIONS.map(p => <option key={p} value={p}>{p||'—'}</option>)}
                  </select>
                  <span className="pts-badge">{getPts(i, preds[i], results, 'race')}</span>
                </div>
              ))}
            </div>
            <div className="specials-bar">
              <div className="special-group">
                <span className="spec-label">⚡FL</span>
                <select className="pilot-select" value={fl} disabled={!canEdit} onChange={e=>{setFl(e.target.value);schedSave(preds,e.target.value,ov)}}>
                  {PILOT_OPTIONS.map(p=><option key={p} value={p}>{p||'—'}</option>)}
                </select>
                <span className="pts-badge">{fl&&fl===flResult?'2':''}</span>
              </div>
              <div className="special-group">
                <span className="spec-label">🚀OV</span>
                <select className="pilot-select" value={ov} disabled={!canEdit} onChange={e=>{setOv(e.target.value);schedSave(preds,fl,e.target.value)}}>
                  {PILOT_OPTIONS.map(p=><option key={p} value={p}>{p||'—'}</option>)}
                </select>
                <span className="pts-badge">{ov&&ov===ovResult?'4':''}</span>
              </div>
            </div>
          </>
        )}

        {/* QUAL */}
        {sessionType === 'qual' && (
          <div style={{padding:'10px 12px'}}>
            {[0, ...(isDouble?[1]:[])].map(idx => (
              <div className="qual-pilot-row" key={idx}>
                {qPilots[idx] ? (
                  <>
                    <span className={`pilot-tag${isDouble?' double':''}`}>{qPilots[idx]}</span>
                    <select
                      className="pos-input"
                      value={qPos[idx]}
                      disabled={!canEdit}
                      onChange={e => {
                        const n=[...qPos]; n[idx]=e.target.value; setQPos(n)
                        onSaveQual(qPilots[0],qPilots[1],parseInt(n[0])||null,parseInt(n[1])||null)
                      }}
                    >
                      <option value="">місце?</option>
                      {Array.from({length:22},(_,k)=><option key={k+1} value={k+1}>{k+1}</option>)}
                    </select>
                    <span className="pts-badge">{getQualPts(qPilots[idx], qPos[idx], results)}</span>
                    {canEditQualPilot && (
                      <>
                        <button className="roulette-btn" style={{padding:'3px 7px',fontSize:10}} onClick={()=>rollPilot(idx)} title="Перекинути іншого пілота">🎲</button>
                        <button className="roulette-btn" style={{padding:'3px 7px',fontSize:10}} onClick={()=>{const n=[...qPilots];n[idx]='';setQPilots(n);const np=[...qPos];np[idx]='';setQPos(np);onSaveQual(n[0],n[1],parseInt(np[0])||null,parseInt(np[1])||null)}}>✕</button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {canEditQualPilot ? (
                      <>
                        <button className="roulette-btn" onClick={()=>rollPilot(idx)}>🎲 РУЛЕТКА</button>
                        <select
                          className="pos-input"
                          style={{width:110}}
                          value=""
                          onChange={e => {
                            if (!e.target.value) return
                            const n=[...qPilots]; n[idx]=e.target.value; setQPilots(n)
                            onSaveQual(n[0],n[1],parseInt(qPos[0])||null,parseInt(qPos[1])||null)
                          }}
                        >
                          <option value="">вручну...</option>
                          {PILOTS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </>
                    ) : (
                      <span style={{color:'var(--muted)',fontSize:11}}>очікується пілот від адміна</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* SPRINT */}
        {sessionType === 'sprint' && (
          <div className="forecast-inputs" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
            {[0,1,2,3,4].map(i => (
              <div className="input-row" key={i}>
                <span className="pos-label">{i+1}</span>
                <select className="pilot-select" value={preds[i]} disabled={!canEdit} onChange={e=>setP(i,e.target.value)}>
                  {PILOT_OPTIONS.map(p=><option key={p} value={p}>{p||'—'}</option>)}
                </select>
                <span className="pts-badge">{getSprintPts(i, preds[i], results)}</span>
              </div>
            ))}
          </div>
        )}
        </>)}
      </div>

      {/* Tooltip — rendered via portal to escape overflow:hidden */}
      {ttVis && createPortal(
        <QualTooltip
          visible={ttVis}
          pos={ttPos}
          player={player}
          sessionType={sessionType}
          ttType={ttType}
          breakdown={breakdown}
          score={score}
          qPilots={qPilots}
        />,
        document.body
      )}
    </div>
  )
}

function getPts(i, pilot, results, type) {
  if (!pilot || !results.length) return ''
  const actual = results.indexOf(pilot)
  if (actual === -1) return ''
  const diff = Math.abs(i - actual)
  const top5 = i < 5
  const pts = diff===0?(top5?5:6):diff===1?(top5?2:3):diff===2?(top5?1:2):diff===3?(top5?0:1):0
  return pts > 0 ? pts : ''
}
function getQualPts(pilot, predPos, results) {
  if (!pilot || !predPos || !results.length) return ''
  const actual = results.indexOf(pilot)
  if (actual === -1) return ''
  const diff = Math.abs(parseInt(predPos)-1 - actual)
  const pts = diff===0?6:diff===1?3:diff===2?1:0
  return pts > 0 ? pts : ''
}
function getSprintPts(i, pilot, results) {
  if (!pilot || !results.length) return ''
  const actual = results.indexOf(pilot)
  if (actual === -1) return ''
  const diff = Math.abs(i - actual)
  const pts = diff===0?3:diff===1?2:diff===2?1:0
  return pts > 0 ? pts : ''
}

function QualTooltip({ visible, pos, player, sessionType, ttType, breakdown, score, qPilots }) {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    if (!visible || ttType !== 'qual') return
    setHistory(null)
    supabase
      .from('qual_assignments')
      .select('pilot_1, pilot_2')
      .eq('player_id', player.id)
      .then(({ data }) => setHistory(data || []))
  }, [visible, ttType, player.id])

  if (!visible) return null

  const left = Math.min(pos.x + 14, window.innerWidth - 320)
  const top  = Math.min(pos.y + 14, window.innerHeight - 400)

  if (ttType === 'qual') {
    const usedBase = USED_PILOTS[player.name] || []
    const fromDB = (history || []).flatMap(a => [a.pilot_1, a.pilot_2].filter(Boolean))
    const allUsed = [...new Set([...usedBase, ...fromDB])]
    const available = PILOTS.filter(p => !allUsed.includes(p))
    const loading = history === null

    return (
      <div style={{
        position:'fixed', left, top, zIndex:99999,
        background:'#111', border:'1px solid rgba(225,6,0,.4)',
        borderRadius:4, padding:'12px 14px', width:290,
        boxShadow:'0 10px 40px rgba(0,0,0,.9)', pointerEvents:'none', fontSize:12,
      }}>
        <div style={{fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:900,color:'var(--red)',letterSpacing:2,marginBottom:8,paddingBottom:5,borderBottom:'1px solid #242424'}}>
          {player.name} — ПІЛОТИ
        </div>

        {/* Current stage */}
        {qPilots.some(Boolean) && (
          <div style={{marginBottom:8}}>
            <div style={{fontFamily:'Orbitron,sans-serif',fontSize:8,color:'var(--gold)',letterSpacing:2,marginBottom:4}}>ЦЕЙ ЕТАП</div>
            {qPilots.filter(Boolean).map((p,i) => (
              <span key={i} style={{display:'inline-block',fontSize:11,color:'var(--gold)',background:'rgba(255,215,0,.08)',border:'1px solid rgba(255,215,0,.25)',padding:'2px 7px',borderRadius:2,marginRight:4,marginBottom:3}}>
                ⭐ {p}
              </span>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{color:'var(--muted)',fontSize:11}}>завантаження...</div>
        ) : (
          <>
            <div style={{marginBottom:8}}>
              <div style={{fontFamily:'Orbitron,sans-serif',fontSize:8,color:'#f87171',letterSpacing:2,marginBottom:4}}>
                ВЖЕ БУЛИ ({allUsed.length}/22)
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                {allUsed.length === 0 && <span style={{color:'var(--muted)',fontSize:11}}>—</span>}
                {allUsed.map(p => (
                  <span key={p} style={{fontSize:10,color:'#f87171',background:'rgba(248,113,113,.08)',border:'1px solid rgba(248,113,113,.2)',padding:'1px 5px',borderRadius:2}}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontFamily:'Orbitron,sans-serif',fontSize:8,color:'var(--green)',letterSpacing:2,marginBottom:4}}>
                ДОСТУПНІ ({available.length})
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                {available.map(p => (
                  <span key={p} style={{fontSize:10,color:'var(--green)',background:'rgba(74,222,128,.06)',border:'1px solid rgba(74,222,128,.2)',padding:'1px 5px',borderRadius:2}}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // Score tooltip for race/sprint
  if (!breakdown.length) return null
  return (
    <div style={{
      position:'fixed', left, top, zIndex:99999,
      background:'#111', border:'1px solid rgba(225,6,0,.4)',
      borderRadius:4, padding:'12px 14px', minWidth:250, maxWidth:340,
      boxShadow:'0 10px 40px rgba(0,0,0,.9)', pointerEvents:'none', fontSize:12,
    }}>
      <div style={{fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:900,color:'var(--red)',letterSpacing:2,marginBottom:8,paddingBottom:5,borderBottom:'1px solid #242424'}}>
        {player.name} — {sessionType}
      </div>
      {breakdown.map((b,i) => (
        <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'2px 0'}}>
          <span style={{color:'var(--muted)'}}>{b.label}</span>
          <span style={{fontFamily:'Orbitron,sans-serif',fontSize:10,fontWeight:700,color:'var(--gold)'}}>+{b.pts}</span>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',marginTop:7,paddingTop:7,borderTop:'1px solid #242424',fontFamily:'Orbitron,sans-serif',fontSize:10,letterSpacing:1}}>
        <span>РАЗОМ</span>
        <span style={{fontSize:14,color:'var(--red)'}}>+{score}</span>
      </div>
    </div>
  )
}

