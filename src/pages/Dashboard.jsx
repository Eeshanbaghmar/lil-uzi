import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Mini component for the pulsing EQ bars
function CardEQ({ status }) {
  const eqRef = useRef(null)
  useEffect(() => {
    if (eqRef.current && eqRef.current.children.length === 0) {
      const isDone = status === 'done'
      const isMixing = status === 'mixing'
      for (let i = 0; i < 24; i++) {
        const bar = document.createElement('div')
        bar.className = 'eq-bar' + (isMixing && i % 3 === 0 ? ' teal' : '')
        const h = Math.round(isDone ? 45 + Math.random() * 10 : 15 + Math.random() * 85)
        bar.style.height = h + '%'
        if (!isDone) {
          const dur = (0.7 + Math.random() * 0.9).toFixed(2)
          const delay = (Math.random() * 0.6).toFixed(2)
          bar.style.animationDuration = dur + 's'
          bar.style.animationDelay = '-' + delay + 's'
        } else {
          bar.style.animation = 'none'
          bar.style.transform = `scaleY(${(0.4 + Math.random() * 0.6).toFixed(2)})`
        }
        eqRef.current.appendChild(bar)
      }
    }
  }, [status])
  
  return <div className="card-eq eq" ref={eqRef}></div>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newGenre, setNewGenre] = useState('Trap')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      
    if (error) {
      console.error("Error fetching projects. Have you created the table in Supabase?", error)
      // Fallback to empty array if table doesn't exist yet
      setProjects([])
    } else {
      setProjects(data || [])
    }
    setLoading(false)
  }

  const createProject = async () => {
    const title = newTitle.trim() || 'Untitled Session'
    
    // Insert into Supabase
    const { data, error } = await supabase
      .from('projects')
      .insert([
        { title: title, genre: newGenre, status: 'writing' }
      ])
      .select()

    if (error) {
      console.error("Error creating project:", error)
      alert("Error: Make sure the 'projects' table exists in Supabase.")
      return
    }

    // Refresh and close
    setProjects([data[0], ...projects])
    setIsModalOpen(false)
    setNewTitle('')
  }

  const timeAgo = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000) // seconds
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff/60)} mins ago`
    if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`
    return `${Math.floor(diff/86400)} days ago`
  }

  const statusLabel = { writing: 'Writing', mixing: 'Mixing', done: 'Done' }

  return (
    <section id="dashboard" className="screen active">
      <nav className="dash-nav">
        <div className="wordmark"><span className="dot"></span> LIL UZI</div>
        <button className="btn-icon" title="Account" aria-label="Account">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/></svg>
        </button>
      </nav>

      <header className="dash-header">
        <div>
          <h1>Your Projects</h1>
          <p>Every session you've opened with Uzi, kept warm and ready to resume.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>+ Start New Project</button>
      </header>

      <div className="dash-grid">
        {loading ? (
          <div style={{color: 'var(--ink-dim)'}}>Loading your sessions...</div>
        ) : (
          projects.map(p => (
            <div key={p.id} className="card" onClick={() => navigate(`/project/${p.id}`)}>
              <div className="card-top">
                <div className="card-title">{p.title}</div>
                <span className="tag">{p.genre}</span>
              </div>
              <div className="card-meta">
                <div className="status"><span className={`status-dot ${p.status}`}></span>{statusLabel[p.status] || 'Active'}</div>
                <div className="card-time mono">{timeAgo(p.created_at)}</div>
              </div>
              
              {(() => {
                const tasksObj = p.tasks || {}
                const completed = Object.values(tasksObj).filter(Boolean).length
                const total = 6 // There are 6 main milestones
                const pct = Math.round((completed / total) * 100)
                return (
                  <div className="card-prog global-progress">
                    <div className="prog-label">
                      <span>Progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="prog-track">
                      <div className="prog-fill" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                )
              })()}
              
              <CardEQ status={p.status} />
            </div>
          ))
        )}
        
        {!loading && (
          <div className="new-card" onClick={() => setIsModalOpen(true)}>
            <div className="plus">+</div>
            <div>New session</div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-back show" onClick={(e) => { if(e.target.className.includes('modal-back')) setIsModalOpen(false) }}>
          <div className="modal">
            <h3>New session</h3>
            <p className="hint">Give it a name — you can change everything later.</p>
            <div className="field">
              <label htmlFor="npTitle">Title</label>
              <input 
                id="npTitle" 
                type="text" 
                placeholder="e.g. 3AM Freestyle" 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="npGenre">Genre</label>
              <select id="npGenre" value={newGenre} onChange={e => setNewGenre(e.target.value)}>
                <option>Trap</option>
                <option>R&B</option>
                <option>Hip-Hop</option>
                <option>Pop</option>
                <option>Drill</option>
                <option>Afrobeats</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={createProject}>Create session</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
