import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Singleton Audio Context
const getAudioCtx = (() => {
  let ctx = null
  return () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
})()

export default function ProjectWorkspace() {
  const { id } = useParams()
  const [project, setProject] = useState({ title: 'Loading...', genre: '' })
  const [activeTab, setActiveTab] = useState('chat')
  const [isPlaying, setIsPlaying] = useState(false)
  const [stems, setStems] = useState([])
  const [masterTime, setMasterTime] = useState(0)
  
  const fileInputRef = useRef(null)
  const analyserRef = useRef(null)
  const canvasRef = useRef(null)
  const reqAnimRef = useRef(null)
  const startTimeRef = useRef(0)
  const progressIntervalRef = useRef(null)

  // Fetch project details
  useEffect(() => {
    const fetchProject = async () => {
      const { data } = await supabase.from('projects').select('*').eq('id', id).single()
      if (data) setProject(data)
    }
    fetchProject()
  }, [id])

  // Initialize analyser on mount
  useEffect(() => {
    const ctx = getAudioCtx()
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.connect(ctx.destination)
    }
  }, [])

  // Handle Play/Pause
  const togglePlay = () => {
    if (stems.length === 0) return
    const ctx = getAudioCtx()
    if (isPlaying) {
      // Stop all sources
      stems.forEach(stem => {
        if (stem.sourceNode) {
          try { stem.sourceNode.stop() } catch (e) { /* ignore */ }
        }
      })
      clearInterval(progressIntervalRef.current)
      setIsPlaying(false)
    } else {
      // Start all sources
      const now = ctx.currentTime
      startTimeRef.current = now - masterTime
      
      const newStems = stems.map(stem => {
        const source = ctx.createBufferSource()
        source.buffer = stem.buffer
        source.connect(stem.gainNode)
        stem.gainNode.connect(analyserRef.current)
        source.start(0, masterTime)
        return { ...stem, sourceNode: source }
      })
      setStems(newStems)
      setIsPlaying(true)
      
      progressIntervalRef.current = setInterval(() => {
        setMasterTime(getAudioCtx().currentTime - startTimeRef.current)
      }, 100)
    }
  }

  // Scrub Track
  const scrubTrack = (e) => {
    if (stems.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const maxDuration = Math.max(...stems.map(s => s.buffer.duration))
    const newTime = (pct / 100) * maxDuration
    
    setMasterTime(newTime)
    
    // If playing, we need to restart playback from new time
    if (isPlaying) {
      const ctx = getAudioCtx()
      
      // Stop current
      stems.forEach(stem => {
        if (stem.sourceNode) {
          try { stem.sourceNode.stop() } catch (e) {}
        }
      })
      
      // Restart
      startTimeRef.current = ctx.currentTime - newTime
      const newStems = stems.map(stem => {
        const source = ctx.createBufferSource()
        source.buffer = stem.buffer
        source.connect(stem.gainNode)
        source.start(0, newTime)
        return { ...stem, sourceNode: source }
      })
      setStems(newStems)
    }
  }

  // Handle Mute toggle
  const toggleMute = (stemId, e) => {
    e.stopPropagation()
    setStems(prev => prev.map(stem => {
      if (stem.id === stemId) {
        const newMuted = !stem.muted
        stem.gainNode.gain.value = newMuted ? 0 : 1
        return { ...stem, muted: newMuted }
      }
      return stem
    }))
  }

  // Handle File Upload
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    
    const ctx = getAudioCtx()
    const newStems = []
    
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        const gainNode = ctx.createGain()
        
        newStems.push({
          id: Date.now() + Math.random(),
          name: file.name,
          buffer: audioBuffer,
          gainNode: gainNode,
          sourceNode: null,
          muted: false
        })
      } catch (err) {
        console.error("Error decoding audio:", err)
      }
    }
    setStems(prev => [...prev, ...newStems])
  }

  // Formatting time helper
  const formatTime = (secs) => {
    if (isNaN(secs)) return '00:00'
    const mins = Math.floor(secs / 60)
    const remaining = Math.floor(secs % 60)
    return `${mins < 10 ? '0' : ''}${mins}:${remaining < 10 ? '0' : ''}${remaining}`
  }

  const maxDuration = stems.length > 0 ? Math.max(...stems.map(s => s.buffer.duration)) : 0
  const progressPct = maxDuration > 0 ? (masterTime / maxDuration) * 100 : 0

  // Eq Component for Stems
  const StemEQ = ({ playing }) => {
    const eqRef = useRef(null)
    useEffect(() => {
      if (eqRef.current && eqRef.current.children.length === 0) {
        for (let i = 0; i < 10; i++) {
          const bar = document.createElement('div')
          bar.className = 'eq-bar'
          const h = Math.round(20 + Math.random() * 80)
          bar.style.height = h + '%'
          const dur = (0.7 + Math.random() * 0.9).toFixed(2)
          const delay = (Math.random() * 0.6).toFixed(2)
          bar.style.animationDuration = dur + 's'
          bar.style.animationDelay = '-' + delay + 's'
          eqRef.current.appendChild(bar)
        }
      }
    }, [])
    
    return <div className="stem-wave eq" ref={eqRef} style={{ opacity: playing ? 1 : 0.5 }}></div>
  }

  // Draw Analyzer
  useEffect(() => {
    if (activeTab !== 'analyzer' || !canvasRef.current || !analyserRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const analyser = analyserRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    
    const draw = () => {
      reqAnimRef.current = requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)
      
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      const barWidth = (canvas.width / 48)
      let x = 0
      
      for (let i = 0; i < 48; i++) {
        // Average the data chunk
        const chunk = Math.floor(bufferLength / 48)
        let sum = 0
        for (let j = 0; j < chunk; j++) {
          sum += dataArray[(i * chunk) + j]
        }
        const avg = sum / chunk
        
        const barHeight = isPlaying ? Math.max(5, (avg / 255) * canvas.height) : (4 + Math.random() * 3)
        
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight)
        gradient.addColorStop(0, 'var(--amber)')
        gradient.addColorStop(1, 'var(--teal-dim)')
        
        ctx.fillStyle = gradient
        // border radius effect by drawing rounded rect
        ctx.beginPath()
        ctx.roundRect(x, canvas.height - barHeight, Math.max(2, barWidth - 4), barHeight, [3, 3, 0, 0])
        ctx.fill()
        
        x += barWidth
      }
    }
    draw()
    return () => cancelAnimationFrame(reqAnimRef.current)
  }, [activeTab, isPlaying])

  // Word count logic
  const [lyrics, setLyrics] = useState('[Verse 1]\nStreetlight flicker, 3 a.m. call\nMidnight blues on the studio wall')
  const wordCount = lyrics.trim().split(/\s+/).filter(Boolean).length

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stems.forEach(stem => {
        if (stem.sourceNode) {
          try { stem.sourceNode.stop() } catch (e) { /* ignore */ }
        }
      })
      clearInterval(progressIntervalRef.current)
    }
  }, [stems])

  return (
    <section id="workspace" className="screen active">
      <div className="ws-topbar">
        <div className="ws-project-id">
          <Link className="back-link" to="/dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Dashboard
          </Link>
          <div className="ws-titleblock">
            <h2 id="wsTitle">{project.title}</h2>
            <div className="sub"><span className="tag" id="wsGenre">{project.genre}</span></div>
          </div>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept="audio/*"
          multiple
          onChange={handleFileUpload}
        />
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v14M6 9l6-6 6 6M4 21h16"/></svg> 
          Upload Stem
        </button>
      </div>

      <div className="ws-body">
        {/* LEFT: AUDIO ENGINE */}
        <div className="panel-left">
          <div className="transport">
            <button className="transport-play" onClick={togglePlay} disabled={stems.length === 0}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                {isPlaying 
                  ? <><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></>
                  : <path d="M8 5v14l11-7z"/>
                }
              </svg>
            </button>
            <div className="transport-mid">
              <div className="transport-track" onClick={scrubTrack}>
                <div className="transport-fill" style={{ width: `${Math.min(progressPct, 100)}%` }}></div>
              </div>
              <div className="transport-times">
                <span>{formatTime(masterTime)}</span>
                <span>{formatTime(maxDuration)}</span>
              </div>
            </div>
            <div className="transport-bpm"><div className="val">128</div><div className="lbl">BPM</div></div>
          </div>

          <div className="stem-header">
            <h4>Stems · {stems.length} tracks</h4>
          </div>
          <div className="stem-list">
            {stems.length === 0 ? (
               <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink-faint)' }}>
                 No stems uploaded yet.
               </div>
            ) : stems.map(stem => (
              <div key={stem.id} className={`stem ${isPlaying ? 'playing' : ''}`}>
                <StemEQ playing={isPlaying} />
                <div className="stem-info">
                  <div className="stem-name">{stem.name}</div>
                  <div className="stem-dur mono">{formatTime(stem.buffer.duration)}</div>
                </div>
                <div className="stem-controls">
                  <button 
                    className={`chip ${stem.muted ? 'active-mute' : ''}`}
                    onClick={(e) => toggleMute(stem.id, e)}
                  >M</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: INTERACTIVE TOOLS */}
        <div className="panel-right">
          <div className="tabbar">
            <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Uzi Chat</button>
            <button className={`tab ${activeTab === 'lyrics' ? 'active' : ''}`} onClick={() => setActiveTab('lyrics')}>Lyrics</button>
            <button className={`tab ${activeTab === 'analyzer' ? 'active' : ''}`} onClick={() => setActiveTab('analyzer')}>Analyzer</button>
          </div>

          <div className="tab-panels">
            {/* CHAT */}
            {activeTab === 'chat' && (
              <div className="tab-panel active">
                <div className="chat-history">
                  <div className="msg ai">
                    <div className="msg-avatar">U</div>
                    <div className="msg-bubble">Loaded your session. Want me to check for frequency masking?</div>
                  </div>
                </div>
                <div className="chat-input-row">
                  <input type="text" placeholder="Talk to Uzi about this session…" />
                  <button className="chat-send" aria-label="Send">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  </button>
                </div>
              </div>
            )}

            {/* LYRICS */}
            {activeTab === 'lyrics' && (
              <div className="tab-panel active">
                <div className="lyrics-panel">
                  <textarea 
                    className="lyrics-area" 
                    placeholder="Start writing…"
                    value={lyrics}
                    onChange={e => setLyrics(e.target.value)}
                  />
                  <div className="lyrics-foot">
                    <span>AUTO-SAVED</span>
                    <span>{wordCount} words</span>
                  </div>
                </div>
              </div>
            )}

            {/* ANALYZER */}
            {activeTab === 'analyzer' && (
              <div className="tab-panel active">
                <div className="analyzer-panel">
                  <canvas ref={canvasRef} width={400} height={220} style={{ width: '100%', height: '220px' }}></canvas>
                  <div className="analyzer-caption">
                    {isPlaying ? 'Live · analyzing mix' : 'Paused · press play to analyze'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
