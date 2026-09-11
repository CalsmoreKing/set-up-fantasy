import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import AuthPage      from './pages/AuthPage'
import ResetPage     from './pages/ResetPage'
import MainPage      from './pages/MainPage'
import StandingsPage from './pages/StandingsPage'
import AdminPage     from './pages/AdminPage'
import RulesPage     from './pages/RulesPage'
import Layout        from './components/Layout'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',
      minHeight:'100dvh',fontFamily:'Orbitron,sans-serif',color:'#E10600',
      fontSize:12,letterSpacing:3,background:'#0A0A0A'}}>
      SET-UP FANTASY
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login"          element={<AuthPage />} />
      <Route path="/reset-password" element={<ResetPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index          element={<MainPage />} />
        <Route path="table"   element={<StandingsPage />} />
        <Route path="rules"   element={<RulesPage />} />
        <Route path="admin"   element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
