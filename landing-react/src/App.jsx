import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './index.css'
import Admin from './Admin'

// ─── Ad Slider ────────────────────────────────────────────────────────────────

function AdSlider() {
  const [ads, setAds]           = useState([])
  const [index, setIndex]       = useState(0)
  const [paused, setPaused]     = useState(false)
  const [animDir, setAnimDir]   = useState(1) // 1=forward, -1=back
  const timerRef                = useRef(null)

  useEffect(() => {
    fetch('/api/ads')
      .then(r => r.json())
      .then(d => { if (d.success && d.ads?.length) setAds(d.ads) })
      .catch(() => {})
  }, [])

  const goTo = useCallback((next, dir = 1) => {
    setAnimDir(dir)
    setIndex(next)
  }, [])

  const prev = useCallback(() => {
    goTo((index - 1 + ads.length) % ads.length, -1)
  }, [index, ads.length, goTo])

  const next = useCallback(() => {
    goTo((index + 1) % ads.length, 1)
  }, [index, ads.length, goTo])

  useEffect(() => {
    if (ads.length < 2 || paused) return
    timerRef.current = setInterval(() => {
      setAnimDir(1)
      setIndex(i => (i + 1) % ads.length)
    }, 4000)
    return () => clearInterval(timerRef.current)
  }, [ads.length, paused])

  if (!ads.length) return null

  const ad = ads[index]
  const accent = ad.accent || '#FF6A00'

  return (
    <section className="ad-slider-section">
      <div className="container">
        <div className="ad-slider-label">
          <span className="ad-slider-eyebrow">SPONSORS</span>
          <div className="ad-slider-line" />
          <span className="ad-slider-eyebrow">ADVERTISE WITH US</span>
        </div>

        <div
          className="ad-slider-stage"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <AnimatePresence mode="wait" custom={animDir}>
            <motion.a
              key={index}
              href={ad.link || '#'}
              target="_blank"
              rel="noreferrer"
              className="ad-slide-card"
              style={{ '--ad-accent': accent }}
              custom={animDir}
              initial={d => ({ opacity: 0, x: d * 48 })}
              animate={{ opacity: 1, x: 0 }}
              exit={d => ({ opacity: 0, x: d * -48 })}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              onClick={e => { if (!ad.link) e.preventDefault() }}
            >
              {/* glow border */}
              <div className="ad-card-glow" style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}30 0%, transparent 70%)` }} />

              <div className="ad-card-inner">
                {ad.image && (
                  <div className="ad-card-img-wrap">
                    <img src={ad.image} alt={ad.title} className="ad-card-img" />
                  </div>
                )}
                <div className="ad-card-body">
                  <span className="ad-card-badge" style={{ color: accent, background: `${accent}18`, borderColor: `${accent}40` }}>
                    {ad.badge || 'SPONSORED'}
                  </span>
                  <h3 className="ad-card-title">{ad.title}</h3>
                  <p className="ad-card-desc">{ad.desc}</p>
                </div>
                <div className="ad-card-cta" style={{ color: accent }}>
                  <span>Learn more</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </motion.a>
          </AnimatePresence>

          {/* Arrow nav */}
          {ads.length > 1 && (
            <>
              <button className="ad-arrow ad-arrow-left" onClick={prev} aria-label="Previous ad">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <button className="ad-arrow ad-arrow-right" onClick={next} aria-label="Next ad">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </>
          )}
        </div>

        {/* Dots */}
        {ads.length > 1 && (
          <div className="ad-dots">
            {ads.map((_, i) => (
              <button
                key={i}
                className={`ad-dot${i === index ? ' active' : ''}`}
                style={i === index ? { background: ads[i].accent || '#FF6A00' } : {}}
                onClick={() => goTo(i, i > index ? 1 : -1)}
                aria-label={`Go to ad ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function PrivacyPolicyPage() {
  return (
    <div className="policy-shell">
      <div className="ambient-bg policy-ambient">
        <div className="ambient-blob blob-1"></div>
        <div className="ambient-blob blob-2"></div>
        <div className="ambient-blob blob-3"></div>
      </div>

      <main className="policy-main">
        <div className="container policy-container">
          <a href="/" className="policy-back">Back to PumpCast</a>

          <div className="policy-card">
            <span className="section-eyebrow">Privacy Policy</span>
            <h1>PumpCast AI Privacy Policy</h1>
            <p className="policy-updated">Last updated: May 1, 2026</p>

            <p>
              PumpCast AI is a Chrome extension that adds a live commentary widget to
              pump.fun coin pages. This policy explains what information the extension
              accesses, how it is used, and how to contact us.
            </p>

            <h2>What We Collect</h2>
            <p>
              The extension reads limited website content from the currently open
              `pump.fun/coin/...` page, specifically the token page context needed to
              provide commentary for that token.
            </p>
            <p>We do not intentionally collect:</p>
            <ul>
              <li>Name, email address, or other direct personal identifiers</li>
              <li>Passwords, credentials, or authentication secrets</li>
              <li>Payment card data or banking information</li>
              <li>Private messages, emails, or personal communications</li>
              <li>Browsing history across websites</li>
              <li>Keystrokes, form entries, or clipboard contents</li>
            </ul>

            <h2>How We Use Information</h2>
            <p>We use the page and token context only to:</p>
            <ul>
              <li>Identify the current pump.fun token page</li>
              <li>Request AI-generated commentary for that token</li>
              <li>Display commentary and audio playback inside the extension</li>
            </ul>

            <h2>Data Sent to Our Backend</h2>
            <p>
              When commentary is requested, the extension may send the token address
              and selected commentary mode to the PumpCast backend API so the service
              can generate a response.
            </p>

            <h2>Remote Code</h2>
            <p>
              PumpCast AI does not download or execute remotely hosted JavaScript or
              WASM. All executable extension code is packaged with the extension.
              Network requests are used only to retrieve data needed for the
              extension&apos;s functionality.
            </p>

            <h2>Sharing</h2>
            <p>
              We do not sell user data. We do not use or transfer user data for
              advertising, creditworthiness, lending decisions, or purposes unrelated
              to the extension&apos;s single purpose.
            </p>

            <h2>Data Retention</h2>
            <p>
              The extension stores recent commentary locally in memory for the current
              session to show the on-page history feed. If backend logs are retained
              for operations, debugging, or abuse prevention, they should be limited
              to what is reasonably necessary.
            </p>

            <h2>Security</h2>
            <p>
              We take reasonable steps to protect service infrastructure and limit data
              use to the functionality described in this policy.
            </p>

            <h2>Changes</h2>
            <p>
              We may update this Privacy Policy from time to time. Material updates
              will be reflected by changing the date at the top of this page.
            </p>

            <h2>Contact</h2>
            <p>
              For privacy questions, contact <a href="mailto:hello@pumpcast.co">hello@pumpcast.co</a>.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function App() {
  const [scrolled, setScrolled]       = useState(false)
  const [activeVoice, setActiveVoice] = useState('godmode')
  const [tokenConfig, setTokenConfig] = useState(null)
  const isPrivacyPolicyPage = window.location.pathname === '/privacy-policy'
  const isAdminPage = window.location.pathname === '/admin'

  useEffect(() => {
    fetch('/api/token')
      .then(r => r.json())
      .then(d => { if (d.success && d.token) setTokenConfig(d.token) })
      .catch(() => {})
  }, [])

  const tokenSymbol  = tokenConfig?.symbol   || 'PCAST'
  const tokenAddress = tokenConfig?.address  || ''
  const tokenIconUrl = tokenConfig?.icon_url    || '/assets/logo-light.png'
  const tokenDesc    = tokenConfig?.description || 'Own a piece of PumpCast AI. The $PCAST token is live on pump.fun — be early, support the project, and ride the wave.'
  const pumpFunTokenUrl = tokenConfig?.pumpfun_url?.trim()
    || (tokenAddress ? `https://pump.fun/coin/${tokenAddress}` : null)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  }

  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  }

  const voices = {
    godmode: "🎙️ GODMODE",
    glitch:  "⚡ GLITCH AI",
    hypeman: "🔥 HYPEMAN",
    oracle:  "🔮 ORACLE",
    doom:    "💀 DOOM",
    sarge:   "🎯 SARGE",
  }

  const scrollToSection = (e, id) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: id === 'top' ? 0 : offsetPosition,
        behavior: 'smooth'
      });
      
      if (id === 'top') {
        window.history.pushState("", document.title, window.location.pathname);
      }
    }
  };

  if (isPrivacyPolicyPage) return <PrivacyPolicyPage />
  if (isAdminPage) return <Admin />

  return (
    <div className="app-wrapper">
      <div className="header-spacer"></div>
      <div className="ambient-bg" id="top">
        <div className="ambient-blob blob-1"></div>
        <div className="ambient-blob blob-2"></div>
        <div className="ambient-blob blob-3"></div>
      </div>

      <header className={scrolled ? 'scrolled' : ''} id="header">
        <div className="container">
          <nav>
            <a href="#" className="logo" onClick={(e) => scrollToSection(e, 'top')}>
              <img src="/assets/logo.png" alt="PumpCast Logo" />
              <span>PumpCast AI</span>
            </a>
            <div className="nav-links">
              <a href="#features" onClick={(e) => scrollToSection(e, 'features')}>Features</a>
              <a href="#how-it-works" onClick={(e) => scrollToSection(e, 'how-it-works')}>How it Works</a>
              <a href="#support" onClick={(e) => scrollToSection(e, 'support')}>Support</a>
              <a href={pumpFunTokenUrl || '#token'} target={pumpFunTokenUrl ? '_blank' : undefined} rel="noreferrer" className="nav-token-badge" onClick={(e) => !pumpFunTokenUrl && scrollToSection(e, 'token')}>
                <img src={tokenIconUrl} alt={`${tokenSymbol} Logo`} style={{ width: '28px', height: '28px', objectFit: 'contain' }} /> ${tokenSymbol}
              </a>
            </div>
            <a href="https://chromewebstore.google.com/detail/pumpcast-ai/ncafjdfigggpbgmnlejbbflmcdgmcnma?utm_source=pumpcast" target="_blank" rel="noreferrer" className="btn btn-primary nav-btn">
              Install Extension
            </a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-container">
          <motion.div 
            className="hero-content"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.h1 variants={fadeInUp}>
              Never Miss A Pump.<br/>
              <span className="text-gradient">Hear The Market.</span>
            </motion.h1>
            <motion.p variants={fadeInUp} className="hero-subtitle">
              PumpCast AI is a Chrome extension that overlays directly onto pump.fun. It uses advanced AI to instantly detect volume spikes, whale buys, and rugs, delivering <b>live audio commentary</b> right as the action happens.
            </motion.p>
            <motion.div variants={fadeInUp} className="hero-actions">
              <a href={pumpFunTokenUrl || '#token'} target={pumpFunTokenUrl ? '_blank' : undefined} rel="noreferrer" className="btn btn-primary btn-lg hero-token-btn" onClick={(e) => !pumpFunTokenUrl && scrollToSection(e, 'token')}>
                BUY ${tokenSymbol}
              </a>
              <a href="#features" className="btn hero-features-btn" onClick={(e) => scrollToSection(e, 'features')}>
                Explore Features
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </a>
            </motion.div>
          </motion.div>

          <motion.div 
            className="hero-visual"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            {/* CSS Replica of the Widget */}
            <div className="mock-widget">
              <div className="mock-widget-header">
                <div className="mock-brand">
                  <img src="/assets/logo.png" alt="Logo" />
                  <div>
                    <div className="mock-eyebrow">LIVE COMMENTARY</div>
                    <div className="mock-title">PumpCast AI</div>
                  </div>
                </div>
              </div>
              <div className="mock-widget-body">
                <div className="mock-status-row">
                  <span className="mock-token">JUP...x9zP</span>
                  <div className="mock-status">
                    <div className="mock-wave active">
                      <span></span><span></span><span></span><span></span>
                    </div>
                    <div className="mock-dot active"></div>
                    Speaking
                  </div>
                </div>

                <div className="mock-controls">
                  <div className="mock-control">
                    <label>Mode</label>
                    <select disabled><option>🏎️ Race</option></select>
                  </div>
                  <div className="mock-control">
                    <label>Voice Character</label>
                    <select value={activeVoice} onChange={(e) => setActiveVoice(e.target.value)}>
                      <option value="godmode">🎙️ GODMODE</option>
                      <option value="glitch">⚡ GLITCH AI</option>
                      <option value="hypeman">🔥 HYPEMAN</option>
                      <option value="oracle">🔮 ORACLE</option>
                      <option value="doom">💀 DOOM</option>
                      <option value="sarge">🎯 SARGE</option>
                    </select>
                  </div>
                </div>

                <div className="mock-feed">
                  <label>Live Feed</label>
                  <div className="mock-feed-box">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeVoice}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mock-feed-text"
                      >
                        {activeVoice === 'godmode' && "LADIES AND GENTLEMEN... a WHALE just entered the building. Volume. Is. EXPLODING."}
                        {activeVoice === 'glitch' && "ALERT. BUY PRESSURE DETECTED. PROBABILITY OF PUMP: 94.7%. EXECUTING ANALYSIS."}
                        {activeVoice === 'hypeman' && "OHMYGOD IT'S GOING PARABOLIC! BUY BUY BUY! THIS IS THE ONE! LFG!!!"}
                        {activeVoice === 'oracle' && "...I have seen this chart before... in the ancient scrolls... the pump... is coming."}
                        {activeVoice === 'doom' && "Another soul enters the market. The candles do not lie. Prepare... for what comes next."}
                        {activeVoice === 'sarge' && "MOVE MOVE MOVE! Volume spike, 0200 hours! Buy pressure confirmed! DO NOT HESITATE SOLDIER!"}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <AdSlider />

      <section id="features" className="features">
        <div className="container">
          <motion.div 
            className="section-header"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="section-eyebrow">FEATURES</span>
            <h2>Your AI Co-Pilot</h2>
            <p>Designed for meme traders who need eyes (and ears) everywhere.</p>
          </motion.div>
          
          <motion.div 
            className="bento-grid"
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
          >
            <motion.div variants={fadeInUp} className="bento-card col-span-2">
              <div className="bento-content">
                <div className="bento-icon">🎙️</div>
                <h3>Live Audio Commentary</h3>
                <p>Stop staring at the charts. Let the AI verbally announce volume spikes, bonding curve progress, and whale buys so you can multitask effectively.</p>
              </div>
              <div className="bento-bg-gradient glow-orange"></div>
            </motion.div>
            
            <motion.div variants={fadeInUp} className="bento-card">
              <div className="bento-content">
                <div className="bento-icon">🎭</div>
                <h3>6 Unique Voices</h3>
                <p>Choose from <strong>GODMODE</strong>, <strong>GLITCH AI</strong>, <strong>HYPEMAN</strong>, the prophetic <strong>ORACLE</strong>, the grim <strong>DOOM</strong>, or the ruthless <strong>SARGE</strong>.</p>
              </div>
              <div className="bento-bg-gradient glow-purple"></div>
            </motion.div>
            
            <motion.div variants={fadeInUp} className="bento-card col-span-3">
              <div className="bento-content">
                <div className="bento-icon">⚡</div>
                <h3>Instant Event Detection</h3>
                <p>Our backend hooks into DexScreener to instantly detect liquidity drops, buy/sell ratios, and rapid price action before the crowd notices.</p>
              </div>
              <div className="bento-bg-gradient glow-green"></div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Token Section */}
      <section id="token" className="token-section">
        <div className="container">
          <motion.div
            className="token-card"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="token-card-glow" />
            <div className="token-card-inner">
              <div className="token-card-left">
                <span className="section-eyebrow" style={{ color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <img src={tokenIconUrl} alt={`${tokenSymbol} Logo`} style={{ width: '34px', height: '34px', objectFit: 'contain' }} /> ${tokenSymbol} TOKEN
                </span>
                <h2 className="token-heading">${tokenSymbol} is <span className="token-heading-live">LIVE</span></h2>
                <p className="token-desc">{tokenDesc}</p>
                <div className="token-actions">
                  <a href={pumpFunTokenUrl || 'https://pump.fun'} target="_blank" rel="noreferrer" className="btn token-buy-btn">
                    Buy ${tokenSymbol} on pump.fun
                  </a>
                  {tokenAddress && (
                    <div
                      className="token-address-pill"
                      onClick={() => {
                        navigator.clipboard.writeText(tokenAddress);
                        const el = document.getElementById('token-section-toast');
                        if (el) {
                          el.classList.add('show');
                          setTimeout(() => el.classList.remove('show'), 2000);
                        }
                      }}
                      title="Click to copy token address"
                    >
                      <span>{tokenAddress.slice(0, 8)}...{tokenAddress.slice(-6)}</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      <div id="token-section-toast" className="copy-feedback">Copied!</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="token-card-right">
                <div className="token-coin-visual">
                  <div className="token-coin-ring token-ring-1" />
                  <div className="token-coin-ring token-ring-2" />
                  <div className="token-coin-ring token-ring-3" />
                  <div className="token-coin-emoji">
                    <img src={tokenIconUrl} alt={`${tokenSymbol} Logo`} style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                  </div>
                  <div className="token-coin-label">${tokenSymbol}</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <motion.div 
            className="section-header"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="section-eyebrow">QUICK START</span>
            <h2>How It Works</h2>
            <p>Get set up and trading in under 60 seconds.</p>
          </motion.div>
          
          <motion.div 
            className="steps-container"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <div className="steps-line"></div>
            <motion.div variants={fadeInUp} className="step-card">
              <div className="step-number">01</div>
              <div className="step-content">
                <h3>Install Extension</h3>
                <p>Download and install the PumpCast AI extension directly into your Chrome browser.</p>
              </div>
            </motion.div>
            
            <motion.div variants={fadeInUp} className="step-card">
              <div className="step-number">02</div>
              <div className="step-content">
                <h3>Open pump.fun</h3>
                <p>Navigate to any token page on pump.fun. The widget will inject itself seamlessly over the chart.</p>
              </div>
            </motion.div>
            
            <motion.div variants={fadeInUp} className="step-card">
              <div className="step-number">03</div>
              <div className="step-content">
                <h3>Start Cast</h3>
                <p>Click 'Start Cast', select your Voice Character, and let the AI do the heavy lifting!</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <footer id="support">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <a href="#" className="logo" onClick={(e) => { e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}); }}>
                <img src="/assets/logo.png" alt="PumpCast Logo" />
                <span>PumpCast AI</span>
              </a>
              <p>Empowering Solana traders with real-time AI intelligence and entertainment directly on pump.fun.</p>
            </div>
            <div className="footer-links">
              <h4>Connect</h4>
              <ul>
                <li><a href="https://x.com/pump_cast_ai" target="_blank" rel="noreferrer">X (Twitter)</a></li>
                <li><a href="https://t.me/pumpcastco" target="_blank" rel="noreferrer">Telegram</a></li>
                <li><a href="mailto:hello@pumpcast.co">hello@pumpcast.co</a></li>
                <li><a href="/privacy-policy">Privacy Policy</a></li>
              </ul>
            </div>
            <div className="footer-links">
              <h4>Support Dev</h4>
              <ul style={{ color: 'var(--text-dim)', fontSize: '14px' }}>
                <li style={{ marginBottom: '8px' }}>SOL Address:</li>
                <li>
                  <div 
                    className="address-copy-box" 
                    onClick={() => {
                      navigator.clipboard.writeText("FAomiJibEwiNy7teURECEzyrUaJpVGxkBqZUEAH4ViGt");
                      const toast = document.getElementById('footer-copy-toast');
                      if (toast) {
                        toast.classList.add('show');
                        setTimeout(() => toast.classList.remove('show'), 2000);
                      }
                    }}
                    title="Click to copy SOL address"
                  >
                    <span className="address-text">FAomiJibEwi...H4ViGt</span>
                    <svg className="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                    <div id="footer-copy-toast" className="copy-feedback">Copied!</div>
                  </div>
                </li>
              </ul>
            </div>

          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 PumpCast.co - Built for the community.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
