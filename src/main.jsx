import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

function ParticleCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('particle-canvas')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = canvas.width  = window.innerWidth
    let H = canvas.height = window.innerHeight
    let raf

    const onResize = () => {
      W = canvas.width  = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    // Racing line particles — thin horizontal streaks
    const lines = Array.from({ length: 18 }, (_, i) => ({
      x: Math.random() * W * 1.5 - W * 0.5,
      y: Math.random() * H,
      speed: 0.4 + Math.random() * 1.2,
      length: 40 + Math.random() * 120,
      width: 0.4 + Math.random() * 0.8,
      alpha: 0.06 + Math.random() * 0.18,
      delay: Math.random() * 8000,
      born: performance.now(),
    }))

    function draw(ts) {
      ctx.clearRect(0, 0, W, H)
      lines.forEach(l => {
        const age = ts - l.born - l.delay
        if (age < 0) return
        if (l.x > W + l.length) {
          l.x = -l.length - 20
          l.y = Math.random() * H
          l.speed = 0.4 + Math.random() * 1.2
          l.length = 40 + Math.random() * 120
          l.alpha = 0.06 + Math.random() * 0.18
          l.born = ts; l.delay = 0
          return
        }
        l.x += l.speed

        const grad = ctx.createLinearGradient(l.x - l.length, l.y, l.x, l.y)
        grad.addColorStop(0, `rgba(225,6,0,0)`)
        grad.addColorStop(0.6, `rgba(225,6,0,${l.alpha})`)
        grad.addColorStop(1, `rgba(255,100,80,${l.alpha * 0.6})`)

        ctx.beginPath()
        ctx.moveTo(l.x - l.length, l.y)
        ctx.lineTo(l.x, l.y)
        ctx.strokeStyle = grad
        ctx.lineWidth = l.width
        ctx.stroke()
      })
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return <canvas id="particle-canvas" />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ParticleCanvas />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
