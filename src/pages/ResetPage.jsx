import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPage() {
  const nav = useNavigate()
  const [pass, setPass]   = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr]     = useState('')
  const [msg, setMsg]     = useState('')
  const [busy, setBusy]   = useState(false)

  useEffect(() => {
    // Supabase redirects here with access_token in hash
    supabase.auth.getSession()
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (pass !== pass2) { setErr('Паролі не співпадають'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(false)
    if (error) setErr(error.message)
    else { setMsg('Пароль змінено!'); setTimeout(() => nav('/'), 1500) }
  }

  return (
    <div className="auth-page" style={{background:'var(--bg)'}}>
      <div className="auth-box">
        <div className="auth-title">НОВИЙ ПАРОЛЬ</div>
        <form onSubmit={submit}>
          <div className="field"><label>ПАРОЛЬ</label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} required minLength={6} placeholder="••••••••" /></div>
          <div className="field"><label>ПІДТВЕРДИТИ</label><input type="password" value={pass2} onChange={e=>setPass2(e.target.value)} required placeholder="••••••••" /></div>
          {err && <div className="auth-error">⚠ {err}</div>}
          {msg && <div style={{color:'var(--green)',fontSize:12,marginTop:10}}>✓ {msg}</div>}
          <button className="btn btn-red" type="submit" disabled={busy} style={{width:'100%',marginTop:16,justifyContent:'center'}}>
            {busy ? '...' : 'ЗБЕРЕГТИ'}
          </button>
        </form>
      </div>
    </div>
  )
}
