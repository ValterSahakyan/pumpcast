import { useState, useEffect } from 'react';
import { BrowserProvider } from 'ethers';
import './App.css';

const ADMIN_WALLET = '0xd21760A4ad624d15ee37570B3C09Fd3Bff489309'.toLowerCase();
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [wallet, setWallet] = useState('');
  const [error, setError] = useState('');
  const [ads, setAds] = useState([]);

  useEffect(() => {
    if (wallet === ADMIN_WALLET) {
      fetchAds();
    }
  }, [wallet]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask!');
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const address = accounts[0].toLowerCase();
      if (address !== ADMIN_WALLET) {
        setError('Unauthorized wallet address.');
        setWallet('');
      } else {
        setError('');
        setWallet(address);
      }
    } catch (err) {
      setError('Failed to connect wallet: ' + err.message);
    }
  };

  const fetchAds = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ads`);
      const data = await res.json();
      if (data.success) {
        setAds(data.ads);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch ads');
    }
  };

  const saveAds = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet, ads })
      });
      const data = await res.json();
      if (data.success) {
        alert('Ads saved successfully!');
      } else {
        setError('Failed to save ads: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to save ads');
    }
  };

  const addAd = () => {
    setAds([...ads, { image: '', badge: 'AD', title: 'New Ad', desc: 'Description', link: '', accent: '#FFFFFF' }]);
  };

  const updateAd = (index, field, value) => {
    const newAds = [...ads];
    newAds[index][field] = value;
    setAds(newAds);
  };

  const removeAd = (index) => {
    const newAds = [...ads];
    newAds.splice(index, 1);
    setAds(newAds);
  };

  if (wallet !== ADMIN_WALLET) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
        <h2>Admin Panel</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button onClick={connectWallet} style={{ padding: '10px 20px', fontSize: '16px' }}>
          Connect Wallet to Login
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Manage Advertisements</h2>
        <button onClick={saveAds} style={{ background: '#4CAF50', color: 'white', padding: '10px 20px' }}>Save Changes</button>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ marginTop: '20px' }}>
        {ads.map((ad, index) => (
          <div key={index} style={{ border: '1px solid #ccc', padding: '20px', marginBottom: '20px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3>Ad #{index + 1}</h3>
              <button onClick={() => removeAd(index)} style={{ background: 'red', color: 'white' }}>Remove</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
              <input placeholder="Image URL" value={ad.image || ''} onChange={e => updateAd(index, 'image', e.target.value)} />
              <input placeholder="Badge (e.g. SPONSORED)" value={ad.badge || ''} onChange={e => updateAd(index, 'badge', e.target.value)} />
              <input placeholder="Title" value={ad.title || ''} onChange={e => updateAd(index, 'title', e.target.value)} />
              <input placeholder="Description" value={ad.desc || ''} onChange={e => updateAd(index, 'desc', e.target.value)} />
              <input placeholder="Link (URL)" value={ad.link || ''} onChange={e => updateAd(index, 'link', e.target.value)} />
              <input placeholder="Accent Color (e.g. #FF6A00)" value={ad.accent || ''} onChange={e => updateAd(index, 'accent', e.target.value)} />
            </div>
          </div>
        ))}
        <button onClick={addAd} style={{ padding: '10px 20px' }}>+ Add New Ad Slot</button>
      </div>
    </div>
  );
}

export default App;
