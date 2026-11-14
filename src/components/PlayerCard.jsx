import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PILOTS, calcRaceScore, calcQualAssignmentScore, calcSprintScore, USED_PILOTS, TEAM_META } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { normalizeStageDriver, priorQualAssignments } from '../lib/roster'
import { calcSprintPickPoints, isOvertakeWinner } from '../lib/scoring'

export default function PlayerCard({
  player, teamColor, sessionType, session, forecast, qualAssign,
  results, flResult, ovResult, isMe, isAdmin, isLocked, isDouble,
  stageKey, stageOrder = 10, allQualAssign, onSaveForecast, onSaveQual, onSavePolePick, teamSiblingId,
  forecastHidden, liveScore, liveRank, formData, driverOptions = PILOTS, pilotSubstitutions = [], qualSlotCount = 1
}) {
  const teamCode = TEAM_META[player.team]?.code || player.team.slice(0,3).toUpperCase()
  const pilotOptions = ['', ...driverOptions]
  const slotCount = Math.max(0, Math.min(3, Number(qualSlotCount) || 0))
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
  const [qPilots, setQPilots] = useState([qualAssign?.pilot_1||'', qualAssign?.pilot_2||'', qualAssign?.pilot_3||''])
  const [qPos,    setQPos]    = useState([qualAssign?.pred_pos_1||'', qualAssign?.pred_pos_2||'', qualAssign?.pred_pos_3||''])
  const [polePick, setPolePick] = useState(qualAssign?.pole_pick || '')
  const legacyPoleOnly = Number(stageOrder) < 7

  // Sync from DB
  useEffect(() => {
    setPreds(initPreds())
    setFl(forecast?.fl_pick || '')
    setOv(forecast?.ov_pick || '')
  }, [forecast])
  useEffect(() => {
    setQPilots([qualAssign?.pilot_1||'', qualAssign?.pilot_2||'', qualAssign?.pilot_3||''])
    setQPos([qualAssign?.pred_pos_1||'', qualAssign?.pred_pos_2||'', qualAssign?.pred_pos_3||''])
    setPolePick(qualAssign?.pole_pick || '')
  }, [qualAssign])

  // Body height animation
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.style.maxHeight = open ? bodyRef.current.scrollHeight + 'px' : '0'
    }
  }, [open, preds, fl, ov, qPilots, qPos, polePick])

  // Debounced save
  function schedSave(newPreds, newFl, newOv) {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSaveForecast(newPreds, newFl, newOv), 600)
  }

  // Forecast (race/sprint predictions + qual position guess) — own player or admin
  const canEdit = !session?.archive_preview && (isAdmin || (isMe && !isLocked))
  // Admins can edit committed predictions directly, but archived previews stay read-only.
  const canEditQualPilot = !session?.archive_preview && isAdmin

  function setP(i, v) {
    const n = [...preds]; n[i] = v; setPreds(n)
    schedSave(n, fl, ov)
  }

  // Scoring
  let score = 0, breakdown = []
  if (sessionType === 'race') {
    const r = calcRaceScore(
      preds.map(pilot => normalizeStageDriver(pilot, pilotSubstitutions)),
      normalizeStageDriver(fl, pilotSubstitutions), normalizeStageDriver(ov, pilotSubstitutions), results,
      normalizeStageDriver(flResult, pilotSubstitutions), String(ovResult || '').split(/[,;|]/).map(p => normalizeStageDriver(p.trim(), pilotSubstitutions)).filter(Boolean).join(', '), stageOrder
    )
    score = r.total; breakdown = r.breakdown
  } else if (sessionType === 'qual') {
    const assignment = {
      pilot_1:normalizeStageDriver(qPilots[0], pilotSubstitutions), pred_pos_1:parseInt(qPos[0]) || null,
      pilot_2:normalizeStageDriver(qPilots[1], pilotSubstitutions), pred_pos_2:parseInt(qPos[1]) || null,
      pilot_3:normalizeStageDriver(qPilots[2], pilotSubstitutions), pred_pos_3:parseInt(qPos[2]) || null,
      pole_pick:normalizeStageDriver(polePick, pilotSubstitutions),
    }
    const result = calcQualAssignmentScore(assignment, results, stageOrder)
    score = result.total; breakdown = result.breakdown
  } else if (sessionType === 'sprint') {
    const sprintSlots = 5
    const r = calcSprintScore(preds.slice(0,sprintSlots).map(pilot => normalizeStageDriver(pilot, pilotSubstitutions)), results, stageOrder, normalizeStageDriver(fl, pilotSubstitutions), normalizeStageDriver(flResult, pilotSubstitutions))
    score = r.total; breakdown = r.breakdown
  }

  // Fill count
  // Fill indicator — shows only when PREDICTION is entered, not just pilot assigned
  const sprintSlots = 5
  const fillCount = sessionType === 'qual'
    ? legacyPoleOnly ? (polePick ? 1 : 0) : qPos.filter(p => p !== '' && p !== null && p !== undefined).length
    : sessionType === 'sprint'
    ? preds.slice(0,sprintSlots).filter(Boolean).length
    : preds.filter(Boolean).length
  const fillTotal = sessionType === 'qual' ? slotCount : sessionType === 'sprint' ? sprintSlots : 10
  const isFull = fillCount === fillTotal && fillTotal > 0

  // Qual available pilots
  function getAvailable() {
    const used = new Set(USED_PILOTS[player.name] || [])
    // Add all previously assigned in other stages
    Object.values(allQualAssign || {}).forEach(a => {
      if (a.player_id === player.id) {
        if (a.pilot_1) used.add(a.pilot_1)
        if (a.pilot_2) used.add(a.pilot_2)
        if (a.pilot_3) used.add(a.pilot_3)
      }
    })
    qPilots.forEach(p => { if (p) used.add(p) })
    return driverOptions.filter(p => !used.has(p))
  }

  async function rollPilot(idx) {
    const taken = new Set(
      Object.values(allQualAssign || {})
        .filter(a => a.player_id !== player.id && a.session_id === session?.id)
        .map(a => idx===0 ? a.pilot_1 : idx===1 ? a.pilot_2 : a.pilot_3)
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
    onSaveQual(nPilots, nPos.map(v=>parseInt(v)||null))
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
          <FormIndicator playerId={player.id} allFormData={formData} />
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
                    {pilotOptions.map(p => <option key={p} value={p}>{p||'—'}</option>)}
                  </select>
                  <span className="pts-badge">{getPts(i, preds[i], results, 'race', stageOrder)}</span>
                </div>
              ))}
            </div>
            <div className="specials-bar">
              <div className="special-group">
                <span className="spec-label">⚡FL</span>
                <select className="pilot-select" value={fl} disabled={!canEdit} onChange={e=>{setFl(e.target.value);schedSave(preds,e.target.value,ov)}}>
                  {pilotOptions.map(p=><option key={p} value={p}>{p||'—'}</option>)}
                </select>
                <span className="pts-badge">{fl&&fl===flResult?'2':''}</span>
              </div>
              <div className="special-group">
                <span className="spec-label">🚀OV</span>
                <select className="pilot-select" value={ov} disabled={!canEdit} onChange={e=>{setOv(e.target.value);schedSave(preds,fl,e.target.value)}}>
                  {pilotOptions.map(p=><option key={p} value={p}>{p||'—'}</option>)}
                </select>
                <span className="pts-badge">{isOvertakeWinner(ov,ovResult)?'4':''}</span>
              </div>
            </div>
          </>
        )}

        {/* QUAL */}
        {sessionType === 'qual' && (
          <div style={{padding:'10px 12px'}}>
            {legacyPoleOnly ? (
              <div className="qual-pilot-row pole-pick-row">
                <span className="spec-label">ПОУЛ</span>
                <select
                  className="pilot-select"
                  value={polePick}
                  disabled={!canEdit}
                  onChange={event => {
                    const value = event.target.value
                    setPolePick(value)
                    onSavePolePick?.(value)
                  }}
                >
                  <option value="">Обери пілота на поул…</option>
                  {driverOptions.map(pilot => <option key={pilot} value={pilot}>{pilot}</option>)}
                </select>
                <span className="pts-badge">{polePick && polePick === results[0] ? '1' : ''}</span>
              </div>
            ) : Array.from({length: slotCount}, (_,i)=>i).map(idx => (
              <div className="qual-pilot-row" key={idx}>
                {qPilots[idx] ? (
                  <>
                    <span className={`pilot-tag${slotCount>1?' double':''}`}>{qPilots[idx]}</span>
                    <select
                      className="pos-input"
                      value={qPos[idx]}
                      disabled={!canEdit}
                      onChange={e => {
                        const n=[...qPos]; n[idx]=e.target.value; setQPos(n)
                        onSaveQual(qPilots, n.map(v=>parseInt(v)||null))
                      }}
                    >
                      <option value="">місце?</option>
                      {Array.from({length:22},(_,k)=><option key={k+1} value={k+1}>{k+1}</option>)}
                    </select>
                    <span className="pts-badge">{getQualPts(qPilots[idx], qPos[idx], results)}</span>
                    {canEditQualPilot && (
                      <>
                        <button className="roulette-btn" style={{padding:'3px 7px',fontSize:10}} onClick={()=>rollPilot(idx)} aria-label="Перекинути пілота">🎲</button>
                        <button className="roulette-btn" style={{padding:'3px 7px',fontSize:10}} onClick={()=>{const n=[...qPilots];n[idx]='';setQPilots(n);const np=[...qPos];np[idx]='';setQPos(np);onSaveQual(n, np.map(v=>parseInt(v)||null))}}>✕</button>
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
                            onSaveQual(n, qPos.map(v=>parseInt(v)||null))
                          }}
                        >
                          <option value="">вручну...</option>
                          {driverOptions.map(p => <option key={p} value={p}>{p}</option>)}
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
          <>
            <div className="forecast-inputs" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
              {Array.from({length:sprintSlots}, (_,i) => i).map(i => (
                <div className="input-row" key={i}>
                  <span className="pos-label">{i+1}</span>
                  <select className="pilot-select" value={preds[i]} disabled={!canEdit} onChange={e=>setP(i,e.target.value)}>
                    {pilotOptions.map(p=><option key={p} value={p}>{p||'—'}</option>)}
                  </select>
                  <span className="pts-badge">{getSprintPts(i, preds[i], results, stageOrder)}</span>
                </div>
              ))}
            </div>

          </>
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
          driverOptions={driverOptions}
          stageKey={stageKey}
          session={session}
        />,
        document.body
      )}
    </div>
  )
}

function getPts(i, pilot, results, type, stageOrder) {
  if (!pilot || !results.length) return ''
  const actual = results.indexOf(pilot)
  if (actual === -1) return ''
  const diff = Math.abs(i - actual)
  const pts = actual > 9 ? 0 : i < 5
    ? (diff===0?5:diff===1?2:diff===2?1:0)
    : (diff===0?6:diff===1?3:diff===2?2:diff===3?1:0)
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
  const points = calcSprintPickPoints(i,pilot,results)
  return points > 0 ? points : ''
}

function QualTooltip({ visible, pos, player, sessionType, ttType, breakdown, score, qPilots, driverOptions = PILOTS, stageKey, session }) {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    if (!visible || ttType !== 'qual') return
    setHistory(null)
    async function loadHistory() {
      const [{ data }, { data: stage }] = await Promise.all([
        supabase.from('qual_assignments').select('session_id,pilot_1,pred_pos_1,pilot_2,pred_pos_2,pilot_3,pred_pos_3,sessions(stages(sort_order))').eq('player_id', player.id),
        supabase.from('stages').select('sort_order').eq('key',stageKey).maybeSingle(),
      ])
      setHistory(priorQualAssignments(data, session?.id, stage?.sort_order))
    }
    loadHistory()
  }, [visible, ttType, player.id, stageKey, session?.id])

  if (!visible) return null

  const left = Math.min(pos.x + 14, window.innerWidth - 320)
  const top  = Math.min(pos.y + 14, window.innerHeight - 400)

  if (ttType === 'qual') {
    const usedBase = USED_PILOTS[player.name] || []
    const fromDB = (history || []).flatMap(a => [a.pilot_1, a.pilot_2, a.pilot_3].filter(Boolean))
    const allUsed = [...new Set([...usedBase, ...fromDB])]
    const available = driverOptions.filter(p => !allUsed.includes(p))
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


// ── FORM INDICATOR — colored dot showing accuracy trend ──
// Green = high % of exact predictions among all players, Red = lowest.
// Recalculates on every mount (i.e. after each score recalculation the
// underlying forecasts table changes, so a fresh load reflects it).
export function FormIndicator({ playerId, allFormData }) {
  const data = allFormData?.[playerId]
  if (!data || data.total === 0) return null

  const accuracy = data.exact / data.total // 0..1
  const { rank, count } = data

  // Color gradient: red (worst) → yellow (mid) → green (best), based on rank among peers
  const t = count > 1 ? 1 - (rank - 1) / (count - 1) : 0.5 // 1 = best, 0 = worst
  const hue = Math.round(t * 120) // 0=red, 120=green
  const color = `hsl(${hue}, 70%, 55%)`

  return (
    <span
      title={`Форма: ${Math.round(accuracy*100)}% точних прогнозів (${data.exact}/${data.total})`}
      style={{
        fontFamily: 'Orbitron,sans-serif', fontSize: 9, fontWeight: 700,
        color, border: `1px solid ${color}`, borderRadius: 2,
        padding: '2px 5px', minWidth: 28, textAlign: 'center', flexShrink: 0,
      }}
    >
      {Math.round(accuracy*100)}%
    </span>
  )
}

// Computes form data for all players: % of exact-position predictions
// across all committed race/sprint forecasts and qual assignments this season.
export async function loadFormData(players) {
  const stats = {}
  players.forEach(p => { stats[p.id] = { exact: 0, total: 0 } })

  const { data: forecasts } = await supabase
    .from('forecasts')
    .select('player_id, predictions, score_breakdown')
    .not('score_breakdown', 'is', null)

  forecasts?.forEach(f => {
    const bd = f.score_breakdown || []
    if (!stats[f.player_id]) return
    // Count positive breakdown entries; exact race and sprint picks all score at least five points.
    bd.forEach(b => {
      stats[f.player_id].total += 1
      if (b.pts >= 5) stats[f.player_id].exact += 1 // treat top-tier points as "exact"
    })
  })

  const { data: quals } = await supabase
    .from('qual_assignments')
    .select('player_id, pilot_1, pred_pos_1, pilot_2, pred_pos_2, pilot_3, pred_pos_3, score')
    .gt('score', -1)

  // Qual score of 6 per pilot = exact; approximate using average score per assigned pilot
  quals?.forEach(qa => {
    if (!stats[qa.player_id]) return
    const pilots = [qa.pilot_1, qa.pilot_2, qa.pilot_3].filter(Boolean)
    if (!pilots.length) return
    // We don't have per-pilot breakdown here, so treat qa.score/pilots.length >= 6 as exact-ish signal
    const avgPerPilot = (qa.score || 0) / pilots.length
    pilots.forEach(() => {
      stats[qa.player_id].total += 1
      if (avgPerPilot >= 6) stats[qa.player_id].exact += 1
    })
  })

  // Rank players by accuracy (only those with data)
  const withData = players
    .map(p => ({ id: p.id, acc: stats[p.id].total > 0 ? stats[p.id].exact / stats[p.id].total : null }))
    .filter(x => x.acc !== null)
    .sort((a,b) => b.acc - a.acc)

  const result = {}
  withData.forEach((x, i) => {
    result[x.id] = { ...stats[x.id], rank: i+1, count: withData.length }
  })
  return result
}
