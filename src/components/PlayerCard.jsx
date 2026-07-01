import { useState, useRef, useCallback, useEffect } from 'react'
import { PILOTS, calcRaceScore, calcQualScore, calcSprintScore, USED_PILOTS, TEAM_META } from '../lib/supabase'
import { supabase } from '../lib/supabase'

const PILOT_OPTIONS = ['', ...PILOTS]

export default function PlayerCard({
  player, teamColor, sessionType, session, forecast, qualAssign,
  results, flResult, ovResult, isMe, isAdmin, isLocked, isDouble,
  stageKey, allQualAssign, onSaveForecast, onSaveQual, teamSiblingId
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

  const canEdit = (isMe || isAdmin) && !isLocked

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
            onMouseEnter={e => { setTtPos({x:e.clientX,y:e.clientY}); setTtVis(true) }}
            onMouseLeave={() => setTtVis(false)}
            onMouseMove={e => setTtPos({x:e.clientX,y:e.clientY})}
          >
            {player.name}
            {isMe && <span style={{fontSize:9,color:'var(--muted)',marginLeft:6}}>(я)</span>}
          </span>
        </div>
        <div className="card-header-right">
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
        {/* RACE */}
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
                    {(isAdmin || isMe) && !isLocked && (
                      <button className="roulette-btn" style={{padding:'3px 7px',fontSize:10}} onClick={()=>{const n=[...qPilots];n[idx]='';setQPilots(n);onSaveQual(n[0],n[1],null,null)}}>✕</button>
                    )}
                  </>
                ) : (
                  <>
                    {(isAdmin || isMe) && !isLocked && (
                      <>
                        <button className="roulette-btn" onClick={()=>rollPilot(idx)}>🎲 РУЛЕТКА</button>
                        {isAdmin && (
                          <select
                            className="pos-input"
                            style={{width:100}}
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
                        )}
                      </>
                    )}
                    {!isAdmin && !isMe && <span style={{color:'var(--muted)',fontSize:11}}>пілот не призначений</span>}
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
      </div>

      {/* Tooltip */}
      {ttVis && breakdown.length > 0 && (
        <div className="tooltip visible" style={{
          left: Math.min(ttPos.x+14, window.innerWidth-380),
          top:  Math.min(ttPos.y+14, window.innerHeight-300),
          position:'fixed'
        }}>
          <div className="tt-title">{player.name} — {sessionType}</div>
          {breakdown.map((b,i)=>(
            <div className="tt-row" key={i}>
              <span className="tt-lbl">{b.label}</span>
              <span className="tt-pts">+{b.pts}</span>
            </div>
          ))}
          <div className="tt-total">
            <span>РАЗОМ</span>
            <span className="pts">+{score}</span>
          </div>
        </div>
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
  const pts = diff===0?(top5?5:6):diff===1?(top5?2:3):diff===2?(top5?1:2):(top5?0:1)
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
