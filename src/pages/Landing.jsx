import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const navigate = useNavigate()
  const mountRef = useRef(null)
  const fallbackRef = useRef(null)
  const [curtainOpen, setCurtainOpen] = useState(false)

  // Open curtains on mount
  useEffect(() => {
    const timer = setTimeout(() => setCurtainOpen(true), 350)
    return () => clearTimeout(timer)
  }, [])

  // Build EQ fallback bars
  useEffect(() => {
    if (fallbackRef.current && fallbackRef.current.children.length === 0) {
      for (let i = 0; i < 56; i++) {
        const bar = document.createElement('div')
        bar.className = 'eq-bar' + (i % 3 === 0 ? ' teal' : '')
        const h = Math.round(8 + Math.random() * 92)
        bar.style.height = h + '%'
        const dur = (0.7 + Math.random() * 0.9).toFixed(2)
        const delay = (Math.random() * 0.6).toFixed(2)
        bar.style.animationDuration = dur + 's'
        bar.style.animationDelay = '-' + delay + 's'
        fallbackRef.current.appendChild(bar)
      }
    }
  }, [])

  // 3D Waveform via Three.js CDN
  useEffect(() => {
    const mount = mountRef.current
    const fallback = fallbackRef.current
    if (!mount) return

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    script.onload = () => {
      try {
        const THREE = window.THREE
        const COLS = 84, ROWS = 46
        const SPAN_X = 30, SPAN_Z = 20
        let width = mount.clientWidth, height = mount.clientHeight

        const scene = new THREE.Scene()
        scene.fog = new THREE.FogExp2(0x0a0a0a, 0.055)

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
        camera.position.set(0, 3.6, 8.4)
        camera.lookAt(0, -0.6, 0)

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
        mount.appendChild(renderer.domElement)

        // Soft circular sprite
        const spriteCanvas = document.createElement('canvas')
        spriteCanvas.width = spriteCanvas.height = 64
        const sctx = spriteCanvas.getContext('2d')
        const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32)
        grad.addColorStop(0, 'rgba(255,255,255,1)')
        grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        sctx.fillStyle = grad
        sctx.fillRect(0, 0, 64, 64)
        const spriteTex = new THREE.CanvasTexture(spriteCanvas)

        const count = COLS * ROWS
        const positions = new Float32Array(count * 3)
        const colors = new Float32Array(count * 3)
        const grid = []

        let idx = 0
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const x = (c / (COLS - 1) - 0.5) * SPAN_X
            const z = (r / (ROWS - 1) - 0.5) * SPAN_Z
            positions[idx * 3] = x
            positions[idx * 3 + 1] = 0
            positions[idx * 3 + 2] = z
            grid.push({ x, z })
            idx++
          }
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage))

        const material = new THREE.PointsMaterial({
          size: 0.11, map: spriteTex, vertexColors: true, transparent: true,
          opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        })

        const points = new THREE.Points(geometry, material)
        scene.add(points)

        const cLow = new THREE.Color(0x2B2B2B)
        const cMid = new THREE.Color(0x8B1E2D)
        const cHigh = new THREE.Color(0xB08D57)
        const tmpColor = new THREE.Color()

        let mouseX = 0, mouseY = 0, targetMouseX = 0, targetMouseY = 0
        const onMouseMove = (e) => {
          targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2
          targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2
        }
        window.addEventListener('mousemove', onMouseMove)

        const onResize = () => {
          width = mount.clientWidth; height = mount.clientHeight
          if (width === 0 || height === 0) return
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height)
        }
        window.addEventListener('resize', onResize)

        const clock = new THREE.Clock()
        const AMP = 1.5
        let animId

        function animate() {
          animId = requestAnimationFrame(animate)
          const t = clock.getElapsedTime()
          const posAttr = geometry.attributes.position
          const colAttr = geometry.attributes.color

          for (let i = 0; i < count; i++) {
            const { x, z } = grid[i]
            const y = Math.sin(x * 0.35 + t * 0.9) * Math.cos(z * 0.28 + t * 0.6) * AMP
              + Math.sin(z * 0.5 - t * 1.2) * 0.35
              + Math.sin((x + z) * 0.18 + t * 0.5) * 0.4
            posAttr.array[i * 3 + 1] = y

            const tnorm = Math.min(1, Math.max(0, (y + AMP) / (AMP * 2)))
            if (tnorm < 0.5) tmpColor.copy(cLow).lerp(cMid, tnorm / 0.5)
            else tmpColor.copy(cMid).lerp(cHigh, (tnorm - 0.5) / 0.5)
            colAttr.array[i * 3] = tmpColor.r
            colAttr.array[i * 3 + 1] = tmpColor.g
            colAttr.array[i * 3 + 2] = tmpColor.b
          }
          posAttr.needsUpdate = true
          colAttr.needsUpdate = true

          mouseX += (targetMouseX - mouseX) * 0.04
          mouseY += (targetMouseY - mouseY) * 0.04
          camera.position.x = Math.sin(t * 0.06) * 1.4 + mouseX * 0.9
          camera.position.y = 3.6 + Math.sin(t * 0.09) * 0.35 - mouseY * 0.4
          camera.lookAt(0, -0.6, 0)

          renderer.render(scene, camera)
        }
        animate()

        // Cleanup
        mount._cleanup = () => {
          cancelAnimationFrame(animId)
          window.removeEventListener('mousemove', onMouseMove)
          window.removeEventListener('resize', onResize)
          renderer.dispose()
          if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
        }
      } catch (err) {
        if (fallback) fallback.classList.add('show')
      }
    }
    script.onerror = () => {
      if (fallback) fallback.classList.add('show')
    }
    document.head.appendChild(script)

    return () => {
      if (mount._cleanup) mount._cleanup()
    }
  }, [])

  return (
    <section id="landing" className={`screen active ${curtainOpen ? 'curtain-open' : ''}`}>
      <div className="letterbox-bar top"></div>
      <div className="letterbox-bar bottom"></div>
      <div className="grain-overlay"></div>

      <nav className="land-nav">
        <div className="wordmark"><span className="dot"></span> LIL UZI</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>Enter Studio</button>
      </nav>

      <div className="land-hero">
        <div className="webgl-mount" ref={mountRef}>
          <div className="hero-eq-fallback" ref={fallbackRef}></div>
        </div>
        <div className="hero-vignette"></div>

        <div className="hero-content">
          <div className="hero-eyebrow">Reel 01 · AI Co-Producer · Now Screening</div>
          <h1 className="hero-title" aria-label="LIL UZI">
            <span className="ig">L</span>
            <span className="ig">I</span>
            <span className="ig">L</span>
            <span className="ig">&nbsp;</span>
            <span className="ig">U</span>
            <span className="ig">Z</span>
            <span className="ig">I</span>
          </h1>
          <p className="hero-sub">
            The room where your stems, lyrics, and mix decisions live together. <b>Upload the session, and Uzi hears everything</b> — every stem, every lyric, every take.
          </p>
          <div className="hero-cta">
            <button className="btn-cinema" onClick={() => navigate('/dashboard')}>
              <span className="cinema-label">Enter Studio</span>
              <span className="cinema-sub">Press play to begin</span>
            </button>
          </div>
        </div>
      </div>

      <div className="marquee-wrap">
        <div className="marquee-track">
          <span>Stem-aware chat</span><span className="sep">—</span>
          <span>Live lyric sheet</span><span className="sep">—</span>
          <span>Real-time analyzer</span><span className="sep">—</span>
          <span>One workspace, zero tabs</span><span className="sep">—</span>
          <span>Stem-aware chat</span><span className="sep">—</span>
          <span>Live lyric sheet</span><span className="sep">—</span>
          <span>Real-time analyzer</span><span className="sep">—</span>
          <span>One workspace, zero tabs</span><span className="sep">—</span>
        </div>
      </div>
    </section>
  )
}
