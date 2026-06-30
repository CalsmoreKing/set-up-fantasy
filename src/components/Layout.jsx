import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useRef, useEffect } from 'react'
import BulkPanel from './BulkPanel'

export default function Layout() {
  const { player, signOut, isAdmin } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [bulkOpen, setBulkOpen] = useState(false)
  const bulkWrapRef = useRef(null)

  const isMain     = loc.pathname === '/'
  const isTable    = loc.pathname === '/table'
  const isAdminP   = loc.pathname === '/admin'

  // Close bulk on outside click
  useEffect(() => {
    function handler(e) {
      if (bulkWrapRef.current && !bulkWrapRef.current.contains(e.target)) {
        setBulkOpen(false)
      }
    }
    if (bulkOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [bulkOpen])

  return (
    <>
      <div className="f1-stripe" />
      <header className="site-header">
        <div style={{flexShrink:0}}>
          <div className="header-logo">SET-UP FANTASY</div>
          <div className="header-sub">Formula Set-Up | Формула-1 українською 🇺🇦</div>
        </div>
        <div className="header-sep" />
        <div style={{display:'flex',flexDirection:'column',gap:3,flexShrink:0}}>
          <span style={{fontFamily:'Orbitron,sans-serif',fontSize:11,fontWeight:700,letterSpacing:1}}>
            {player?.name || '—'}
          </span>
          {isAdmin && <span className="badge badge-admin" style={{fontSize:8}}>ADMIN</span>}
        </div>

        {/* Desktop nav */}
        <nav className="header-nav">
          <button className={`nav-btn${isMain?' active':''}`}   onClick={()=>nav('/')}>ПРОГНОЗИ</button>
          <button className={`nav-btn${isTable?' active':''}`}  onClick={()=>nav('/table')}>ТАБЛИЦЯ</button>
          {isAdmin && <button className={`nav-btn${isAdminP?' active':''}`} onClick={()=>nav('/admin')}>АДМІН</button>}
          {isAdmin && (
            <div className="bulk-wrap" ref={bulkWrapRef} style={{position:'relative'}}>
              <button className={`nav-btn${bulkOpen?' active':''}`} onClick={()=>setBulkOpen(v=>!v)}>
                ІМПОРТ {bulkOpen?'▲':'▼'}
              </button>
              <BulkPanel open={bulkOpen} onClose={()=>setBulkOpen(false)} />
            </div>
          )}
          <button className="nav-btn" onClick={signOut}>ВИЙТИ</button>
        </nav>
      </header>

      <Outlet />

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        <button className={`bottom-nav-btn${isMain?' active':''}`} onClick={()=>nav('/')}>
          <span className="icon">🏁</span>ПРОГНОЗИ
        </button>
        <button className={`bottom-nav-btn${isTable?' active':''}`} onClick={()=>nav('/table')}>
          <span className="icon">🏆</span>ТАБЛИЦЯ
        </button>
        {isAdmin && (
          <button className="bottom-nav-btn" onClick={()=>setBulkOpen(v=>!v)}>
            <span className="icon">📋</span>ІМПОРТ
          </button>
        )}
        {isAdmin && (
          <button className={`bottom-nav-btn${isAdminP?' active':''}`} onClick={()=>nav('/admin')}>
            <span className="icon">⚙️</span>АДМІН
          </button>
        )}
        <button className="bottom-nav-btn" onClick={signOut}>
          <span className="icon">🚪</span>ВИЙТИ
        </button>
      </nav>

      {/* Mobile bulk panel overlay */}
      {isAdmin && bulkOpen && (
        <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
          <div style={{background:'rgba(0,0,0,.6)',flex:1}} onClick={()=>setBulkOpen(false)} />
          <div style={{background:'#1c1c1c',borderTop:'2px solid var(--red)',padding:'0 0 calc(70px + env(safe-area-inset-bottom))',maxHeight:'85dvh',overflowY:'auto'}}>
            <BulkPanel open={true} mobile onClose={()=>setBulkOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
