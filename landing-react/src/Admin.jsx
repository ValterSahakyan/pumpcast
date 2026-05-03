import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider } from 'ethers';

const ADMIN_WALLET = '0xd21760A4ad624d15ee37570B3C09Fd3Bff489309'.toLowerCase();
const STORAGE_KEY = 'pumpcast_admin_wallet';

function getSavedWallet() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === ADMIN_WALLET ? saved : '';
  } catch {
    return '';
  }
}

function saveWallet(wallet) {
  try { localStorage.setItem(STORAGE_KEY, wallet); } catch {}
}

function clearWallet() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ─── API layer ────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const api = {
  getAds: (wallet) =>
    apiFetch('/api/admin/ads', { headers: { Authorization: wallet } }),

  saveAds: (wallet, ads) =>
    apiFetch('/api/admin/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: wallet },
      body: JSON.stringify({ ads }),
    }),

  getToken: () =>
    apiFetch('/api/token'),

  saveToken: (wallet, token) =>
    apiFetch('/api/admin/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: wallet },
      body: JSON.stringify(token),
    }),
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14,
      background: type === 'success' ? '#00FFA3' : '#FF4D4D',
      color: type === 'success' ? '#000' : '#fff',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      animation: 'fadeSlideIn 0.2s ease',
    }}>
      {message}
    </div>
  );
}

function AdPreview({ ad }) {
  const accent = ad.accent || '#FF6A00';
  return (
    <div style={{
      marginTop: 14, borderRadius: 8, border: `1px solid ${accent}33`,
      background: '#0d0d0d', padding: '10px 14px',
    }}>
      <p style={{ margin: '0 0 8px', fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
        Widget Preview
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {ad.image
          ? <img src={ad.image} alt="" onError={e => { e.target.style.display = 'none'; }}
              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
          : <div style={{ width: 44, height: 44, borderRadius: 8, background: `${accent}18`, border: `1px solid ${accent}44`, flexShrink: 0 }} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'inline-block', fontSize: 9, fontWeight: 700, color: accent,
            background: `${accent}18`, padding: '2px 6px', borderRadius: 4,
            letterSpacing: 0.5, marginBottom: 3,
          }}>
            {ad.badge || 'AD'}
          </span>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ad.title || 'Ad Title'}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ad.desc || 'Ad description goes here'}
          </p>
        </div>
      </div>
    </div>
  );
}

function AdCard({ ad, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }) {
  const field = (label, key, placeholder, fullWidth = false) => (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 11, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </label>
      <input
        value={ad[key] || ''}
        placeholder={placeholder}
        onChange={e => onUpdate(index, key, e.target.value)}
        style={INPUT}
      />
    </div>
  );

  return (
    <div style={{
      border: '1px solid #1e1e1e', borderRadius: 12, marginBottom: 16,
      background: '#0a0a0a', overflow: 'hidden',
      opacity: ad.active === false ? 0.55 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Card header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid #1a1a1a', background: '#0d0d0d',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#444', fontWeight: 600 }}>AD #{index + 1}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={ad.active !== false}
              onChange={e => onUpdate(index, 'active', e.target.checked)}
              style={{ accentColor: '#00FFA3', width: 13, height: 13, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: ad.active !== false ? '#00FFA3' : '#555' }}>
              {ad.active !== false ? 'Active' : 'Paused'}
            </span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { label: '↑', action: () => onMoveUp(index), disabled: index === 0 },
            { label: '↓', action: () => onMoveDown(index), disabled: index === total - 1 },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action} disabled={btn.disabled} style={{
              ...BTN_GHOST, color: btn.disabled ? '#333' : '#888',
              cursor: btn.disabled ? 'default' : 'pointer',
            }}>{btn.label}</button>
          ))}
          <button onClick={() => onRemove(index)} style={{ ...BTN_GHOST, color: '#FF4D4D', borderColor: '#FF4D4D33' }}>
            Remove
          </button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Image URL', 'image', 'https://example.com/banner.png')}
          {field('Badge Text', 'badge', 'SPONSORED')}
          {field('Title', 'title', 'Your Ad Title')}
          {field('Description', 'desc', 'Short compelling description')}
          {field('Click URL', 'link', 'https://yourproject.com')}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Accent Color
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(ad.accent || '') ? ad.accent : '#FF6A00'}
                onChange={e => onUpdate(index, 'accent', e.target.value)}
                style={{ width: 38, height: 36, padding: 2, borderRadius: 6, border: '1px solid #2a2a2a', background: '#0a0a0a', cursor: 'pointer', flexShrink: 0 }}
              />
              <input
                value={ad.accent || ''}
                placeholder="#FF6A00"
                onChange={e => onUpdate(index, 'accent', e.target.value)}
                style={{ ...INPUT, flex: 1 }}
              />
            </div>
          </div>
        </div>
        <AdPreview ad={ad} />
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const INPUT = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: '1px solid #1e1e1e', background: '#060606', color: '#e0e0e0',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const BTN_GHOST = {
  background: 'transparent', border: '1px solid #222',
  padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#666',
};

// ─── Token Config Section ─────────────────────────────────────────────────────

function TokenConfigSection({ token, setToken, onSave, saving }) {
  const iconUrl = token.icon_url?.trim();
  const field = (label, key, placeholder, type = 'text') => (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </label>
      <input
        type={type}
        value={token[key] || ''}
        placeholder={placeholder}
        onChange={e => setToken(prev => ({ ...prev, [key]: e.target.value }))}
        style={INPUT}
      />
    </div>
  );

  return (
    <div style={{ border: '1px solid #1e1e1e', borderRadius: 12, background: '#0a0a0a', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid #1a1a1a', background: '#0d0d0d',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Token Config</span>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: '6px 18px', fontSize: 13, fontWeight: 700,
            background: saving ? '#333' : '#00FFA3', color: saving ? '#666' : '#000',
            border: 'none', borderRadius: 8, cursor: saving ? 'default' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Saving…' : 'Save Token Config'}
        </button>
      </div>

      <div style={{ padding: 16 }}>
        {/* Icon preview + URL */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
            border: '1px solid #1e1e1e', background: '#060606',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {iconUrl
              ? <img src={iconUrl} alt="Token icon" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
              : <span style={{ fontSize: 22 }}>🪙</span>
            }
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Icon URL</label>
            <input
              value={token.icon_url || ''}
              placeholder="https://example.com/icon.png"
              onChange={e => setToken(prev => ({ ...prev, icon_url: e.target.value }))}
              style={INPUT}
            />
            <p style={{ margin: '5px 0 0', fontSize: 11, color: '#444' }}>Used in nav badge and token section on landing page.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {field('Symbol', 'symbol', 'PCAST')}
          {field('Name', 'name', 'PumpCast AI')}
          <div style={{ gridColumn: '1 / -1' }}>
            {field('Solana Address', 'address', 'AbcDef...')}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            {field('pump.fun URL', 'pumpfun_url', 'https://pump.fun/coin/...')}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 11, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Description
            </label>
            <textarea
              value={token.description || ''}
              placeholder="Short description shown on the landing page token section."
              onChange={e => setToken(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Live preview */}
        <div style={{ marginTop: 16, borderRadius: 8, border: '1px solid #1e1e1e', background: '#060606', padding: '10px 14px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Nav Preview</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#00FFA3', fontWeight: 700 }}>
            {iconUrl && <img src={iconUrl} alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} onError={e => { e.target.style.display = 'none'; }} />}
            <span>${token.symbol || 'PCAST'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Admin() {
  const [wallet, setWallet]         = useState(getSavedWallet);
  const [ads, setAds]               = useState([]);
  const [fetching, setFetching]     = useState(false);
  const [saving, setSaving]         = useState(false);
  const [token, setToken]           = useState({ symbol: '', name: '', address: '', pumpfun_url: '', icon_url: '', description: '' });
  const [savingToken, setSavingToken] = useState(false);
  const [toast, setToast]           = useState(null);
  const [banner, setBanner]         = useState(null); // { message, type }

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  // ── Fetch all ads (admin view) ──────────────────────────────────────────────
  const fetchAds = useCallback(async (w) => {
    setFetching(true);
    setBanner(null);
    try {
      const data = await api.getAds(w);
      setAds(data.ads.map(ad => ({ ...ad, active: ad.active !== false })));
    } catch (err) {
      setBanner({ message: `Could not load ads: ${err.message}`, type: 'error' });
    } finally {
      setFetching(false);
    }
  }, []);

  // ── Fetch token config ──────────────────────────────────────────────────────
  const fetchToken = useCallback(async () => {
    try {
      const data = await api.getToken();
      if (data.token) setToken(t => ({ ...t, ...data.token }));
    } catch {}
  }, []);

  // ── Save token config ───────────────────────────────────────────────────────
  const saveToken = useCallback(async () => {
    setSavingToken(true);
    try {
      await api.saveToken(wallet, token);
      showToast('Token config saved!', 'success');
    } catch (err) {
      showToast(`Failed to save token: ${err.message}`, 'error');
    } finally {
      setSavingToken(false);
    }
  }, [wallet, token, showToast]);

  // ── Connect MetaMask ────────────────────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setBanner({ message: 'MetaMask is not installed.', type: 'error' });
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const addr = accounts[0].toLowerCase();
      if (addr !== ADMIN_WALLET) {
        clearWallet();
        setBanner({ message: 'This wallet is not authorized.', type: 'error' });
      } else {
        saveWallet(addr);
        setBanner(null);
        setWallet(addr);
      }
    } catch (err) {
      setBanner({ message: `Wallet connection failed: ${err.message}`, type: 'error' });
    }
  }, []);

  useEffect(() => {
    if (wallet === ADMIN_WALLET) {
      fetchAds(wallet);
      fetchToken();
    }
  }, [wallet, fetchAds, fetchToken]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const saveAds = useCallback(async () => {
    setSaving(true);
    try {
      await api.saveAds(wallet, ads);
      showToast('Saved successfully!', 'success');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [wallet, ads, showToast]);

  // ── Ad mutations ────────────────────────────────────────────────────────────
  const addAd = useCallback(() => {
    setAds(prev => [...prev, { image: '', badge: 'SPONSORED', title: 'New Ad', desc: 'Description', link: '', accent: '#FF6A00', active: true }]);
  }, []);

  const updateAd = useCallback((index, field, value) => {
    setAds(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const removeAd = useCallback((index) => {
    setAds(prev => prev.filter((_, i) => i !== index));
  }, []);

  const moveAd = useCallback((index, dir) => {
    setAds(prev => {
      if (index + dir < 0 || index + dir >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[index + dir]] = [next[index + dir], next[index]];
      return next;
    });
  }, []);

  // ── Login screen ────────────────────────────────────────────────────────────
  if (wallet !== ADMIN_WALLET) {
    return (
      <div style={{ minHeight: '100vh', background: '#060606', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ width: 340, textAlign: 'center', padding: '0 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Admin Access</h2>
          <p style={{ fontSize: 13, color: '#555', margin: '0 0 24px' }}>
            Connect your authorized wallet to manage advertisements.
          </p>
          {banner && (
            <p style={{ fontSize: 13, color: '#FF4D4D', marginBottom: 16, padding: '10px 14px', background: '#FF4D4D11', borderRadius: 8, border: '1px solid #FF4D4D33' }}>
              {banner.message}
            </p>
          )}
          <button onClick={connectWallet} style={{
            width: '100%', padding: '13px', fontSize: 15, fontWeight: 700,
            background: '#FF6A00', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
          }}>
            Connect Wallet
          </button>
          <a href="/" style={{ display: 'block', marginTop: 16, fontSize: 13, color: '#444', textDecoration: 'none' }}>
            ← Back to Home
          </a>
        </div>
      </div>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────
  const activeCount = ads.filter(a => a.active !== false).length;

  return (
    <div style={{ minHeight: '100vh', background: '#060606', fontFamily: 'Inter, sans-serif', color: '#fff' }}>
      <style>{GLOBAL_CSS}</style>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        borderBottom: '1px solid #141414', background: '#060606',
        padding: '0 28px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Ad Manager</span>
          <span style={{ fontSize: 11, color: '#444', fontFamily: 'monospace', background: '#111', border: '1px solid #1e1e1e', padding: '3px 10px', borderRadius: 20 }}>
            {wallet.slice(0, 6)}…{wallet.slice(-4)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fetchAds(wallet)} disabled={fetching} style={{ ...BTN_GHOST, fontSize: 13, padding: '6px 14px', color: '#666' }}>
            {fetching ? 'Loading…' : '↻ Refresh'}
          </button>
          <a href="/" style={{ ...BTN_GHOST, fontSize: 13, padding: '6px 14px', color: '#666', textDecoration: 'none' }}>
            ← Home
          </a>
          <button onClick={saveAds} disabled={saving || fetching} style={{
            padding: '6px 20px', fontSize: 13, fontWeight: 700,
            background: saving ? '#333' : '#FF6A00', color: saving ? '#666' : '#fff',
            border: 'none', borderRadius: 8, cursor: saving ? 'default' : 'pointer',
            transition: 'background 0.2s',
          }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>
        {/* Token Config section */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Token Config</h1>
            <p style={{ fontSize: 13, color: '#555', margin: 0 }}>Controls the token info shown on the landing page — nav badge, token section heading, description, and buy link.</p>
          </div>
          <TokenConfigSection
            token={token}
            setToken={setToken}
            onSave={saveToken}
            saving={savingToken}
          />
        </div>

        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Advertisements</h1>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            {ads.length} slot{ads.length !== 1 ? 's' : ''} · {activeCount} active · rotate every 4 s in widget
          </p>
        </div>

        {/* Banner errors */}
        {banner && (
          <div style={{
            padding: '10px 16px', borderRadius: 8, fontSize: 13, marginBottom: 20,
            background: banner.type === 'error' ? '#FF4D4D11' : '#00FFA311',
            border: `1px solid ${banner.type === 'error' ? '#FF4D4D33' : '#00FFA333'}`,
            color: banner.type === 'error' ? '#FF4D4D' : '#00FFA3',
          }}>
            {banner.message}
          </div>
        )}

        {/* Loading skeleton */}
        {fetching && ads.length === 0 && (
          <div style={{ textAlign: 'center', color: '#333', padding: '80px 0', fontSize: 14 }}>
            Loading ads…
          </div>
        )}

        {/* Ad cards */}
        {!fetching && ads.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 0',
            border: '1px dashed #1e1e1e', borderRadius: 12, color: '#333',
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
            <p style={{ margin: 0, fontSize: 14 }}>No ad slots yet. Add one below.</p>
          </div>
        )}

        {ads.map((ad, i) => (
          <AdCard
            key={i}
            ad={ad}
            index={i}
            total={ads.length}
            onUpdate={updateAd}
            onRemove={removeAd}
            onMoveUp={(idx) => moveAd(idx, -1)}
            onMoveDown={(idx) => moveAd(idx, 1)}
          />
        ))}

        {/* Add slot button */}
        <button
          onClick={addAd}
          style={{
            width: '100%', padding: 14, marginTop: 4,
            background: 'transparent', color: '#444', fontSize: 14,
            border: '1px dashed #1e1e1e', borderRadius: 10, cursor: 'pointer',
            transition: 'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#FF6A00'; e.currentTarget.style.color = '#FF6A00'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e1e'; e.currentTarget.style.color = '#444'; }}
        >
          + Add New Ad Slot
        </button>
      </div>
    </div>
  );
}

const GLOBAL_CSS = `
  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  * { box-sizing: border-box; }
  input:focus { border-color: #FF6A00 !important; }
`;
