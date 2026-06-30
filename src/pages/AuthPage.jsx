import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function AuthPage() {
  const { user, signIn, signUp, resetPassword } = useAuth()
  const nav = useNavigate()
  const [mode, setMode]     = useState('login')   // login | register | forgot
  const [email, setEmail]   = useState('')
  const [pass, setPass]     = useState('')
  const [pass2, setPass2]   = useState('')
  const [pName, setPName]   = useState('')
  const [players, setPlayers] = useState([])
  const [err, setErr]       = useState('')
  const [msg, setMsg]       = useState('')
  const [busy, setBusy]     = useState(false)

  useEffect(() => { if (user) nav('/') }, [user])
  useEffect(() => {
    supabase.from('players').select('name').order('name').then(({ data, error }) => {
      if (error) {
        console.error('Supabase players query failed:', error)
        setErr(`Помилка завантаження гравців: ${error.message}`)
        return
      }
      setPlayers((data || []).map(p => p.name))
    })
  }, [])

  async function submit(e) {
    e.preventDefault()
    setErr(''); setMsg(''); setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, pass)
      } else if (mode === 'register') {
        if (pass !== pass2) throw new Error('Паролі не співпадають')
        if (!pName) throw new Error('Оберіть своє ім'я')
        await signUp(email, pass, pName)
        setMsg('Перевір пошту для підтвердження!')
      } else {
        await resetPassword(email)
        setMsg('Лист для скидання паролю відправлено!')
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page" style={{background:'var(--bg)'}}>
      <div>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontFamily:'Orbitron,sans-serif',fontWeight:900,fontSize:22,color:'var(--red)',letterSpacing:3}}>SET-UP FANTASY</div>
          <div style={{fontFamily:'Orbitron,sans-serif',fontSize:9,color:'var(--muted)',letterSpacing:2,marginTop:4}}>Formula Set-Up | Формула-1 українською 🇺🇦</div>
        </div>
        <div className="auth-box">
          <div className="auth-title">
            {mode === 'login' ? 'ВХІД' : mode === 'register' ? 'РЕЄСТРАЦІЯ' : 'ВІДНОВЛЕННЯ'}
          </div>
          <form onSubmit={submit}>
            <div className="field">
              <label>EMAIL</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="твій@email.com" />
            </div>
            {mode !== 'forgot' && (
              <div className="field">
                <label>ПАРОЛЬ</label>
                <input type="password" value={pass} onChange={e=>setPass(e.target.value)} required placeholder="••••••••" minLength={6} />
              </div>
            )}
            {mode === 'register' && (<>
              <div className="field">
                <label>ПІДТВЕРДИТИ ПАРОЛЬ</label>
                <input type="password" value={pass2} onChange={e=>setPass2(e.target.value)} required placeholder="••••••••" />
              </div>
              <div className="field">
                <label>ТВОЄ ІМ'Я В ГРІ</label>
                <select value={pName} onChange={e=>setPName(e.target.value)} required>
                  <option value="">— Обери своє ім'я —</option>
                  {players.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </>)}
            {err && <div className="auth-error">⚠ {err}</div>}
            {msg && <div style={{color:'var(--green)',fontSize:12,marginTop:10}}>✓ {msg}</div>}
            <button className="btn btn-red" type="submit" disabled={busy} style={{width:'100%',marginTop:16,justifyContent:'center',minHeight:44}}>
              {busy ? '...' : mode === 'login' ? 'УВІЙТИ' : mode === 'register' ? 'ЗАРЕЄСТРУВАТИСЬ' : 'НАДІСЛАТИ ЛИСТ'}
            </button>
          </form>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:14,flexWrap:'wrap',gap:8}}>
            {mode === 'login' && <>
              <button className="auth-link" onClick={()=>setMode('register')}>Немає акаунту?</button>
              <button className="auth-link" onClick={()=>setMode('forgot')}>Забув пароль?</button>
            </>}
            {mode !== 'login' && <button className="auth-link" onClick={()=>setMode('login')}>← Назад до входу</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
