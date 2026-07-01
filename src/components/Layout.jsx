import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState } from 'react'
import BulkPanel from './BulkPanel'

export default function Layout() {
  const { player, signOut, isAdmin } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [bulkOpen, setBulkOpen] = useState(false)

  const isMain   = loc.pathname === '/'
  const isTable  = loc.pathname === '/table'
  const isRules  = loc.pathname === '/rules'
  const isAdminP = loc.pathname === '/admin'

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

        <nav className="header-nav">
          <button className={`nav-btn${isMain?' active':''}`}  onClick={()=>nav('/')}>ПРОГНОЗИ</button>
          <button className={`nav-btn${isTable?' active':''}`} onClick={()=>nav('/table')}>ТАБЛИЦЯ</button>
          <button className={`nav-btn${isRules?' active':''}`} onClick={()=>nav('/rules')}>ПРАВИЛА</button>
          {isAdmin && <button className={`nav-btn${isAdminP?' active':''}`} onClick={()=>nav('/admin')}>АДМІН</button>}
          {isAdmin && (
            <button className={`nav-btn${bulkOpen?' active':''}`} onClick={()=>setBulkOpen(true)}>
              ІМПОРТ ▼
            </button>
          )}
          <button className="nav-btn" onClick={signOut}>ВИЙТИ</button>
        </nav>
      </header>

      <Outlet />

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        <button className={`bottom-nav-btn${isMain?' active':''}`}  onClick={()=>nav('/')}>
          <span className="icon">🏁</span>ПРОГНОЗИ
        </button>
        <button className={`bottom-nav-btn${isTable?' active':''}`} onClick={()=>nav('/table')}>
          <span className="icon">🏆</span>ТАБЛИЦЯ
        </button>
        <button className={`bottom-nav-btn${isRules?' active':''}`} onClick={()=>nav('/rules')}>
          <span className="icon">📖</span>ПРАВИЛА
        </button>
        {isAdmin && (
          <button className="bottom-nav-btn" onClick={()=>setBulkOpen(true)}>
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

      {/* Bulk import modal */}
      {isAdmin && bulkOpen && (
        <div
          style={{position:'fixed',inset:0,zIndex:5000,display:'flex',alignItems:'flex-start',
            justifyContent:'center',padding:'70px 16px 16px',background:'rgba(0,0,0,.75)'}}
          onClick={e => { if (e.target === e.currentTarget) setBulkOpen(false) }}
        >
          <BulkPanel open={true} onClose={()=>setBulkOpen(false)} standalone />
        </div>
      )}
    </>
  )
}
