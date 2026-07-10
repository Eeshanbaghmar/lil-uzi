import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Landing() {
  const eqRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Generate the animated EQ bars for the hero background
    if (eqRef.current && eqRef.current.children.length === 0) {
      for (let i = 0; i < 56; i++) {
        const bar = document.createElement('div')
        bar.className = 'eq-bar teal'
        const h = Math.round(8 + Math.random() * (100 - 8))
        bar.style.height = h + '%'
        const dur = (0.7 + Math.random() * 0.9).toFixed(2)
        const delay = (Math.random() * 0.6).toFixed(2)
        bar.style.animationDuration = dur + 's'
        bar.style.animationDelay = '-' + delay + 's'
        eqRef.current.appendChild(bar)
      }
    }
  }, [])

  return (
    <section id="landing" className="screen active">
      <nav className="land-nav">
        <div className="wordmark"><span className="dot"></span> LIL UZI</div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>Enter Studio</button>
      </nav>

      <div className="land-hero">
        <div className="hero-eq" id="heroEq" ref={eqRef}></div>
        <div className="hero-eyebrow">AI Co-Producer Studio</div>
        <h1 className="hero-title">LIL&nbsp;UZI</h1>
        <p className="hero-sub">
          The room where your stems, lyrics, and mix decisions live together. <b>Upload the session, and Uzi hears everything</b> — every stem, every lyric, every take.
        </p>
        <div className="hero-cta">
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Enter Studio →</button>
          <span className="hero-hint">no signup · loads your last session</span>
        </div>
      </div>

      <div className="land-strip">
        <span>Stem-aware chat</span>
        <span>Live lyric sheet</span>
        <span>Real-time analyzer</span>
        <span>One workspace, zero tabs</span>
      </div>
    </section>
  )
}
