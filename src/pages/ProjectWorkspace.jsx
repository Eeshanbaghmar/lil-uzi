import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { saveStemToDB, getProjectStems } from '../lib/idb.js'

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
  const defaultTasks = { production: false, writing: false, recording: false, arrangement: false, mixing: false, mastering: false }
  const [tasks, setTasks] = useState(defaultTasks)
  const [activeTab, setActiveTab] = useState('progress')
  const [isPlaying, setIsPlaying] = useState(false)
  const [stems, setStems] = useState([])
  const [masterTime, setMasterTime] = useState(0)
  
  // NEW: State for Analysis and Chat
  const [analysisData, setAnalysisData] = useState(() => {
    const saved = localStorage.getItem(`analysis_${id}`)
    return saved ? JSON.parse(saved) : {}
  })
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: 'Loaded your session. Want me to check for frequency masking?' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isAiThinking, setIsAiThinking] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  const fileInputRef = useRef(null)
  const analyserRef = useRef(null)
  const canvasRef = useRef(null)
  const reqAnimRef = useRef(null)
  const startTimeRef = useRef(0)
  const progressIntervalRef = useRef(null)
  const chatEndRef = useRef(null)

  // Fetch project details and saved stems
  useEffect(() => {
    const fetchProject = async () => {
      const { data } = await supabase.from('projects').select('*').eq('id', id).single()
      if (data) {
        setProject(data)
        setTasks(data.tasks || defaultTasks)
      }
    }
    
    const loadSavedStems = async () => {
      try {
        const saved = await getProjectStems(id)
        if (saved && saved.length > 0) {
          const ctx = getAudioCtx()
          const loadedStems = []
          for (const item of saved) {
            const bufferCopy = item.buffer.slice(0)
            const audioBuffer = await ctx.decodeAudioData(bufferCopy)
            const gainNode = ctx.createGain()
            loadedStems.push({
              id: item.stemId,
              name: item.name,
              buffer: audioBuffer,
              gainNode: gainNode,
              sourceNode: null,
              muted: false
            })
          }
          setStems(prev => {
            // Prevent duplicates in React StrictMode
            const existingIds = new Set(prev.map(s => s.id))
            const uniqueNewStems = loadedStems.filter(s => !existingIds.has(s.id))
            return [...prev, ...uniqueNewStems]
          })
        }
      } catch (e) {
        console.error("Error loading saved stems:", e)
      }
    }
    
    fetchProject()
    loadSavedStems()
  }, [id])

  // Toggle checklist task
  const toggleTask = async (taskKey) => {
    const newTasks = { ...tasks, [taskKey]: !tasks[taskKey] }
    setTasks(newTasks)
    await supabase.from('projects').update({ tasks: newTasks }).eq('id', id)
  }

  const completedTasks = Object.values(tasks).filter(Boolean).length
  const totalTasks = Object.keys(tasks).length
  const taskPct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  // Initialize analyser on mount
  useEffect(() => {
    const ctx = getAudioCtx()
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.connect(ctx.destination)
    }
  }, [])

  const togglePlay = async () => {
    if (stems.length === 0) return
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    
    if (isPlaying) {
      stems.forEach(stem => {
        if (stem.sourceNode) {
          try { stem.sourceNode.stop() } catch (e) { /* ignore */ }
        }
      })
      clearInterval(progressIntervalRef.current)
      setIsPlaying(false)
    } else {
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

  const scrubTrack = async (e) => {
    if (stems.length === 0) return
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const maxDuration = Math.max(...stems.map(s => s.buffer.duration))
    const newTime = (pct / 100) * maxDuration
    
    setMasterTime(newTime)
    
    if (isPlaying) {
      stems.forEach(stem => {
        if (stem.sourceNode) {
          try { stem.sourceNode.stop() } catch (e) {}
        }
      })
      
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

  // Handle File Upload & Backend DSP Analysis
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    
    setIsUploading(true)
    setUploadStatus('Decoding audio...')
    const ctx = getAudioCtx()
    const newStems = []
    
    for (const file of files) {
      setUploadStatus(`Decoding ${file.name}...`)
      // 1. Local Web Audio Decoding (for playback) — this is fast
      try {
        const arrayBuffer = await file.arrayBuffer()
        const bufferCopy = arrayBuffer.slice(0)
        
        // Save to IndexedDB for persistence
        const stemId = Date.now() + Math.random()
        await saveStemToDB(id, stemId, file.name, arrayBuffer)
        
        const audioBuffer = await ctx.decodeAudioData(bufferCopy)
        const gainNode = ctx.createGain()
        
        newStems.push({
          id: stemId,
          name: file.name,
          buffer: audioBuffer,
          gainNode: gainNode,
          sourceNode: null,
          muted: false
        })
      } catch (err) {
        console.error("Error decoding audio:", err)
        alert(`Could not decode "${file.name}". Make sure it is a valid audio file (WAV, MP3, OGG, FLAC).`)
      }
    }

    // 2. Show stems IMMEDIATELY — don't wait for backend
    if (newStems.length > 0) {
      setStems(prev => [...prev, ...newStems])
    }
    setIsUploading(false)
    setUploadStatus('')
    e.target.value = ''

    // 3. Fire backend DSP analysis in the BACKGROUND (non-blocking)
    setIsAnalyzing(true)
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
      fetch(`${backendUrl}/analyze`, { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            setAnalysisData(prev => {
              const newData = { ...prev, [file.name]: data }
              localStorage.setItem(`analysis_${id}`, JSON.stringify(newData))
              return newData
            })
          }
        })
        .catch(err => console.error("Analysis failed:", err))
        .finally(() => setIsAnalyzing(false))
    }
  }

  // Handle Sending Chat to Ollama
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return
    
    const msgText = chatInput
    setChatInput('')
    setChatHistory(prev => [...prev, { role: 'user', text: msgText }])
    setIsAiThinking(true)

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout for cold start
      
      const response = await fetch(`${backendUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          projectContext: { title: project.title, genre: project.genre },
          analysisData: analysisData
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      const data = await response.json()
      setIsAiThinking(false)
      
      if (data.error) {
        setChatHistory(prev => [...prev, { role: 'ai', text: `⚠️ Error: ${data.error}` }])
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: data.reply }])
      }
    } catch (err) {
      setIsAiThinking(false)
      if (err.name === 'AbortError') {
        setChatHistory(prev => [...prev, { role: 'ai', text: "⚠️ The backend took too long to respond. It might be waking up (can take 50s on the free tier). Try again in a moment." }])
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: "⚠️ Could not connect to Python backend. Is it running on port 8000?" }])
      }
    }
  }

  const formatTime = (secs) => {
    if (isNaN(secs)) return '00:00'
    const mins = Math.floor(secs / 60)
    const remaining = Math.floor(secs % 60)
    return `${mins < 10 ? '0' : ''}${mins}:${remaining < 10 ? '0' : ''}${remaining}`
  }

  const maxDuration = stems.length > 0 ? Math.max(...stems.map(s => s.buffer.duration)) : 0
  const progressPct = maxDuration > 0 ? (masterTime / maxDuration) * 100 : 0

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
        const chunk = Math.floor(bufferLength / 48)
        let sum = 0
        for (let j = 0; j < chunk; j++) { sum += dataArray[(i * chunk) + j] }
        const avg = sum / chunk
        const barHeight = isPlaying ? Math.max(5, (avg / 255) * canvas.height) : (4 + Math.random() * 3)
        
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight)
        gradient.addColorStop(0, '#E8A33D') // amber
        gradient.addColorStop(1, '#2E5C56') // teal-dim
        
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, canvas.height - barHeight, Math.max(2, barWidth - 4), barHeight, [3, 3, 0, 0])
        ctx.fill()
        x += barWidth
      }
    }
    draw()
    return () => cancelAnimationFrame(reqAnimRef.current)
  }, [activeTab, isPlaying])

  const [lyrics, setLyrics] = useState('[Verse 1]\nStreetlight flicker, 3 a.m. call\nMidnight blues on the studio wall')
  const wordCount = lyrics.trim().split(/\s+/).filter(Boolean).length

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
      {isUploading && (
        <div className="upload-overlay">
          <div className="upload-spinner"></div>
          <div className="upload-text">{uploadStatus || 'Processing...'}</div>
          <div className="upload-subtext">Your stems will appear in a moment</div>
        </div>
      )}
      <div className="ws-topbar">
        <div className="ws-project-id">
          <Link className="back-link" to="/dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Dashboard
          </Link>
          <div className="ws-titleblock">
            <h2 id="wsTitle">{project.title}</h2>
            <div className="sub">
              <span className="tag" id="wsGenre">{project.genre}</span>
              {isAnalyzing && (
                <span className="tag" style={{ color: '#D4AF37', borderColor: '#D4AF37', animation: 'pulse 2s infinite' }}>
                  AI ANALYZING AUDIO...
                </span>
              )}
              <div className="global-progress" style={{ width: '120px', marginLeft: '12px', marginTop: 0 }}>
                <div className="prog-track">
                  <div className="prog-fill" style={{ width: `${taskPct}%` }}></div>
                </div>
              </div>
            </div>
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
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
          {isUploading ? (
            <>⏳ Processing...</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v14M6 9l6-6 6 6M4 21h16"/></svg> 
            Upload Stem</>
          )}
        </button>
      </div>

      <div className="ws-body">
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
            <div className="transport-bpm">
               <div className="val">{Object.keys(analysisData).length > 0 ? Object.values(analysisData)[0].bpm : '--'}</div>
               <div className="lbl">BPM</div>
            </div>
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

        <div className="panel-right">
          <div className="tabbar">
            <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Uzi Chat</button>
            <button className={`tab ${activeTab === 'lyrics' ? 'active' : ''}`} onClick={() => setActiveTab('lyrics')}>Lyrics</button>
            <button className={`tab ${activeTab === 'analyzer' ? 'active' : ''}`} onClick={() => setActiveTab('analyzer')}>Analyzer</button>
            <button className={`tab ${activeTab === 'progress' ? 'active' : ''}`} onClick={() => setActiveTab('progress')}>Progress</button>
          </div>

          <div className="tab-panels">
            {activeTab === 'progress' && (
              <div className="tab-panel active" style={{ display: 'flex' }}>
                <div className="progress-tab">
                  <div className="progress-header">
                    <h3>Project Progress</h3>
                    <p>Track your milestones to release.</p>
                  </div>
                  <div className="global-progress" style={{ maxWidth: '100%', margin: '0 0 10px 0' }}>
                    <div className="prog-label">
                      <span>Completion</span>
                      <span>{taskPct}%</span>
                    </div>
                    <div className="prog-track" style={{ height: '8px' }}>
                      <div className="prog-fill" style={{ width: `${taskPct}%` }}></div>
                    </div>
                  </div>
                  <div className="checklist">
                    {[
                      { key: 'production', title: 'Beat & Production', desc: 'Instrumental selected and arranged.' },
                      { key: 'writing', title: 'Lyrics & Writing', desc: 'Verses and chorus written.' },
                      { key: 'recording', title: 'Vocal Recording', desc: 'All main vocals and ad-libs tracked.' },
                      { key: 'arrangement', title: 'Arrangement', desc: 'Vocals and beat structured correctly.' },
                      { key: 'mixing', title: 'Mixing', desc: 'EQ, compression, and levels balanced.' },
                      { key: 'mastering', title: 'Mastering', desc: 'Loudness targeted, ready for release.' }
                    ].map(item => (
                      <div key={item.key} className={`check-item ${tasks[item.key] ? 'checked' : ''}`} onClick={() => toggleTask(item.key)}>
                        <div className="check-box">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div className="check-content">
                          <div className="check-title">{item.title}</div>
                          <div className="check-desc">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'chat' && (
              <div className="tab-panel active">
                <div className="chat-history">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`msg ${msg.role === 'user' ? 'user' : 'ai'}`}>
                      <div className="msg-avatar">{msg.role === 'user' ? 'Me' : 'U'}</div>
                      <div className="msg-bubble" style={{whiteSpace: 'pre-wrap'}}>{msg.text}</div>
                    </div>
                  ))}
                  {isAiThinking && (
                    <div className="msg ai">
                      <div className="msg-avatar">U</div>
                      <div className="msg-bubble" style={{ opacity: 0.7 }}>Analyzing...</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="chat-input-row">
                  <input 
                    type="text" 
                    placeholder="Talk to Uzi about this session…" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                    disabled={isAiThinking}
                  />
                  <button className="chat-send" onClick={sendChatMessage} disabled={isAiThinking}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  </button>
                </div>
              </div>
            )}

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

            {activeTab === 'analyzer' && (
              <div className="tab-panel active">
                <div className="analyzer-panel">
                  <canvas ref={canvasRef} width={400} height={220} style={{ width: '100%', height: '220px' }}></canvas>
                  <div className="analyzer-caption">
                    {isPlaying ? 'Live · analyzing mix' : 'Paused · press play to analyze'}
                  </div>
                  
                  {/* Show DSP Data */}
                  {Object.keys(analysisData).length > 0 && (
                    <div style={{ width: '100%', marginTop: '20px', padding: '16px', background: 'var(--surface)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--ink)' }}>
                      <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--amber)' }}>DSP Report from Backend</div>
                      {Object.values(analysisData).map((data, i) => (
                        <div key={i} style={{ marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                          <div>File: {data.filename}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px', marginTop: '4px' }}>
                            <div>BPM: {data.bpm}</div>
                            <div style={{ marginTop: '8px', fontWeight: 600, color: 'var(--ink)' }}>Timeline Analysis (15s chunks):</div>
                            <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'var(--surface-sunken)', padding: '8px', borderRadius: '4px' }}>
                              {data.segments && data.segments.map((seg, idx) => (
                                <div key={idx} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ color: 'var(--teal)' }}>{seg.time}</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                    <div>RMS: {seg.rms_db} dB</div>
                                    <div>Peak: {seg.peak_db} dB</div>
                                    <div style={{ gridColumn: 'span 2' }}>Timbre: {seg.spectral_centroid} Hz</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
