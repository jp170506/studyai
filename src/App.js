import React, { useState, useRef } from 'react';
import './App.css';

const MODES = [
  { id: 'summary', icon: '📋', name: 'Quick Summary', desc: 'Key points only' },
  { id: 'deep', icon: '🔍', name: 'Deep Summary', desc: 'Full breakdown' },
  { id: 'flashcards', icon: '🃏', name: 'Flashcards Only', desc: 'Pure Q&A cards' },
  { id: 'all', icon: '✨', name: 'Everything', desc: 'Complete package' },
];

const QUICK_QUESTIONS = [
  'Explain the main concept simply',
  'What would be on an exam?',
  'Give me 3 practice questions',
  'What are the key definitions?',
];

export default function App() {
  const [tab, setTab] = useState('upload');
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('all');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [fcIndex, setFcIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mastered, setMastered] = useState(new Set());
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [pdfBase64, setPdfBase64] = useState(null);
  const fileRef = useRef();

  const toBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

  const handleFile = async (f) => {
    if (!f || f.type !== 'application/pdf') return alert('Please upload a PDF file.');
    setFile(f);
    const b64 = await toBase64(f);
    setPdfBase64(b64);
  };

  const callClaude = async (messages, systemPrompt) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REACT_APP_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.content[0].text;
  };

  const analyze = async () => {
    if (!file || !pdfBase64) return;
    setLoading(true);
    setSummary(null);
    setFlashcards([]);
    setFcIndex(0);
    setMastered(new Set());
    setMessages([]);

    try {
      const needsSummary = ['summary', 'deep', 'all'].includes(mode);
      const needsCards = ['flashcards', 'all'].includes(mode);

      const pdfContent = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
      };

      if (needsSummary) {
        const depth = mode === 'deep' ? 'detailed' : 'concise';
        const text = await callClaude(
          [{ role: 'user', content: [pdfContent, { type: 'text', text: `Give a ${depth} summary of this document. Respond ONLY with JSON (no markdown): {"topics": ["tag1","tag2","tag3"], "summary": "2-3 paragraph summary", "concepts": ["concept 1", "concept 2", "concept 3", "concept 4", "concept 5"]}` }] }],
          'You are a study assistant. Always respond with valid JSON only.'
        );
        const clean = text.replace(/```json|```/g, '').trim();
        setSummary(JSON.parse(clean));
      }

      if (needsCards) {
        const text = await callClaude(
          [{ role: 'user', content: [pdfContent, { type: 'text', text: 'Create 8 flashcards from this document. Respond ONLY with JSON (no markdown): {"cards": [{"q": "question", "a": "answer"}, ...]}' }] }],
          'You are a study assistant. Always respond with valid JSON only.'
        );
        const clean = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        setFlashcards(parsed.cards || []);
      }

      setTab(needsSummary ? 'summary' : 'flashcards');
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const sendChat = async (q) => {
    const question = q || input.trim();
    if (!question || !pdfBase64) return;
    const newMsg = { role: 'user', text: question };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setChatLoading(true);

    try {
      const pdfMsg = {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: question },
        ],
      };

      const reply = await callClaude([pdfMsg], 'You are a helpful study assistant. Answer questions about the provided document clearly and concisely.');
      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const currentCard = flashcards[fcIndex];
  const masteredCount = mastered.size;

  return (
    <div className="app">
      <div className="header">
        <h1>📚 StudyAI</h1>
        <p>Upload any PDF — get summaries, flashcards, and AI chat instantly</p>
      </div>

      <div className="tabs">
        {['upload', 'summary', 'flashcards', 'chat'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
            disabled={t !== 'upload' && !summary && flashcards.length === 0 && messages.length === 0}>
            {t === 'upload' ? '⬆️ Upload' : t === 'summary' ? '📋 Summary' : t === 'flashcards' ? '🃏 Cards' : '💬 Ask AI'}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <div className="card">
          <div className={`dropzone ${file ? 'file-selected' : ''} ${dragover ? 'dragover' : ''}`}
            onClick={() => fileRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={e => { e.preventDefault(); setDragover(false); handleFile(e.dataTransfer.files[0]); }}>
            <div className="icon">{file ? '✅' : '📄'}</div>
            <h3>{file ? file.name : 'Drop your PDF here'}</h3>
            <p>{file ? `${(file.size / 1024).toFixed(0)} KB — ready to analyze` : 'or click to browse files'}</p>
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          </div>

          <div className="mode-grid">
            {MODES.map(m => (
              <button key={m.id} className={`mode-btn ${mode === m.id ? 'selected' : ''}`} onClick={() => setMode(m.id)}>
                <span className="mode-icon">{m.icon}</span>
                <span className="mode-name">{m.name}</span>
                <span className="mode-desc">{m.desc}</span>
              </button>
            ))}
          </div>

          <button className="analyze-btn" onClick={analyze} disabled={!file || loading}>
            {loading ? 'Analyzing...' : '✨ Analyze PDF'}
          </button>

          {loading && (
            <div className="loading" style={{ marginTop: 24 }}>
              <div className="spinner" />
              <p style={{ color: 'var(--muted)' }}>Reading your document with AI...</p>
            </div>
          )}
        </div>
      )}

      {tab === 'summary' && (
        <div className="card">
          {!summary ? (
            <div className="empty-state"><div className="empty-icon">📋</div><p>No summary yet — upload a PDF first</p></div>
          ) : (
            <>
              <div className="tags">{summary.topics?.map(t => <span key={t} className="tag">{t}</span>)}</div>
              <p className="summary-text">{summary.summary}</p>
              <div className="concepts">
                <h3>Key Concepts</h3>
                <ul className="concept-list">{summary.concepts?.map(c => <li key={c}>{c}</li>)}</ul>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'flashcards' && (
        <div className="card">
          {flashcards.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🃏</div><p>No flashcards yet — upload a PDF first</p></div>
          ) : (
            <>
              <div className="fc-header">
                <span className="fc-counter">Card {fcIndex + 1} of {flashcards.length}</span>
                <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>✓ {masteredCount} mastered</span>
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${((fcIndex + 1) / flashcards.length) * 100}%` }} /></div>

              <div className="card-3d" onClick={() => setFlipped(f => !f)}>
                <div className={`card-inner ${flipped ? 'flipped' : ''}`}>
                  <div className="card-face card-front">
                    <span className="card-label">Question</span>
                    <p className="card-text">{currentCard.q}</p>
                    <span className="card-hint">Click to reveal answer</span>
                  </div>
                  <div className="card-face card-back">
                    <span className="card-label">Answer</span>
                    <p className="card-text">{currentCard.a}</p>
                  </div>
                </div>
              </div>

              <div className="fc-actions">
                <button className="fc-btn review" onClick={() => { setFlipped(false); setFcIndex(i => (i + 1) % flashcards.length); }}>🔁 Review Again</button>
                <button className="fc-btn got-it" onClick={() => { setMastered(s => new Set([...s, fcIndex])); setFlipped(false); setFcIndex(i => (i + 1) % flashcards.length); }}>✓ Got It!</button>
              </div>
              <div className="fc-stats">
                <span>📊 Progress: {Math.round((masteredCount / flashcards.length) * 100)}%</span>
                <span>🎯 Remaining: {flashcards.length - masteredCount}</span>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'chat' && (
        <div className="card">
          {!pdfBase64 ? (
            <div className="empty-state"><div className="empty-icon">💬</div><p>Upload a PDF first to start chatting</p></div>
          ) : (
            <>
              <div className="quick-btns">
                {QUICK_QUESTIONS.map(q => (
                  <button key={q} className="quick-btn" onClick={() => sendChat(q)}>{q}</button>
                ))}
              </div>
              <div className="chat-messages">
                {messages.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 80, fontSize: '0.9rem' }}>Ask anything about your document ↓</p>}
                {messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>{m.text}</div>
                ))}
                {chatLoading && <div className="msg ai loading-msg">Thinking...</div>}
              </div>
              <div className="chat-input-row">
                <input className="chat-input" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                  placeholder="Ask a question about your PDF..." />
                <button className="send-btn" onClick={() => sendChat()} disabled={!input.trim() || chatLoading}>Send</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}