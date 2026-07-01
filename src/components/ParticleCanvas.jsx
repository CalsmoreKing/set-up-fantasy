import { useEffect } from 'react'

export default function ParticleCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('particle-canvas')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W = canvas.width  = window.innerWidth
    let H = canvas.height = window.innerHeight
    let raf, ts0 = 0

    const onResize = () => {
      W = canvas.width  = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    // Each line spawns at a random Y, travels from left to right
    // Staggered so they're always at different phases — never all reset together
    const COUNT = 22
    const lines = Array.from({ length: COUNT }, (_, i) => ({
      // Start at a random position along the full X range so not all appear at once
      x:      (i / COUNT) * (W + 300) - 150,
      y:      Math.random() * H,
      speed:  0.35 + Math.random() * 0.9,
      len:    30 + Math.random() * 110,
      width:  0.3 + Math.random() * 0.9,
      alpha:  0.05 + Math.random() * 0.16,
    }))

    function draw(ts) {
      ctx.clearRect(0, 0, W, H)
      lines.forEach(l => {
        // Advance
        l.x += l.speed
        // Seamless wrap — as soon as tail exits right edge, respawn at left
        if (l.x - l.len > W) {
          l.x     = -l.len - 10
          l.y     = Math.random() * H
          l.speed = 0.35 + Math.random() * 0.9
          l.len   = 30 + Math.random() * 110
          l.alpha = 0.05 + Math.random() * 0.16
          l.width = 0.3 + Math.random() * 0.9
        }

        const grad = ctx.createLinearGradient(l.x - l.len, l.y, l.x, l.y)
        grad.addColorStop(0, `rgba(225,6,0,0)`)
        grad.addColorStop(0.55, `rgba(225,6,0,${l.alpha})`)
        grad.addColorStop(0.85, `rgba(255,80,60,${l.alpha * 0.75})`)
        grad.addColorStop(1, `rgba(255,200,180,${l.alpha * 0.2})`)

        ctx.beginPath()
        ctx.moveTo(l.x - l.len, l.y)
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
