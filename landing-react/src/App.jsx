import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './index.css'

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
  const [scrolled, setScrolled] = useState(false)
  const [activeVoice, setActiveVoice] = useState('chad')
  const isPrivacyPolicyPage = window.location.pathname === '/privacy-policy'

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
    chad: "🦍 Hyper Chad",
    briish: "☕ Degen",
    panic: "🐹 Panic Squeak"
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

  if (isPrivacyPolicyPage) {
    return <PrivacyPolicyPage />
  }

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
            </div>
            <a href="https://github.com/ValterSahakyan/pumpcast" className="btn btn-primary nav-btn">
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
              <a href="#features" className="btn btn-primary btn-lg">
                Explore Features
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
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
                      <option value="chad">🦍 Hyper Chad</option>
                      <option value="briish">☕ Degen</option>
                      <option value="panic">🐹 Panic Squeak</option>
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
                        {activeVoice === 'chad' && "JUP is sprinting away from the pack! Huge volume spike detected! Let's go!"}
                        {activeVoice === 'briish' && "I say, quite the lovely green candle we have here. Smashing."}
                        {activeVoice === 'panic' && "OH NO SELLING PRESSURE DETECTED! EVERYONE OUT!"}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

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
                <h3>3 Hilarious Voices</h3>
                <p>Choose between the booming <strong>Hyper Chad</strong>, the refined <strong>Degen</strong>, or the absolutely unhinged <strong>Panic Squeak</strong>.</p>
              </div>
              <div className="bento-bg-gradient glow-purple"></div>
            </motion.div>
            
            <motion.div variants={fadeInUp} className="bento-card col-span-3">
              <div className="bento-content text-center">
                <div className="bento-icon mx-auto">⚡</div>
                <h3>Instant Event Detection</h3>
                <p>Our backend hooks into DexScreener to instantly detect liquidity drops, buy/sell ratios, and rapid price action before the crowd notices.</p>
              </div>
              <div className="bento-bg-gradient glow-green"></div>
            </motion.div>
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
                <li><a href="https://telegram.me/yogurtsoftware" target="_blank" rel="noreferrer">Telegram</a></li>
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
