import { useCallback, useEffect, useState } from 'react';
import App from '../App.jsx';
import LoginScreen from './LoginScreen.jsx';
import { api, onUnauthorized, resetSocket } from '../api.js';
import { colors, fonts } from '../theme.js';

// Decides between the login mask and the app. On load it asks the server
// whether the browser's session cookie is still valid; while that request is
// in flight it shows a neutral splash so the login form never flashes for an
// already-authenticated user. A 401 (or a rejected socket handshake) anywhere
// in the app flips this back to the login mask.
export default function AuthGate() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'out' | 'in'

  useEffect(() => {
    let alive = true;
    api
      .getSession()
      .then((r) => {
        if (alive) setStatus(r.authenticated ? 'in' : 'out');
      })
      .catch(() => {
        if (alive) setStatus('out');
      });
    const off = onUnauthorized(() => {
      resetSocket();
      setStatus('out');
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const handleLoggedIn = useCallback(() => setStatus('in'), []);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Even if the request fails, drop the local session and socket.
    }
    resetSocket();
    setStatus('out');
  }, []);

  if (status === 'checking') {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.sidebarBg,
          color: '#7f918c',
          fontFamily: fonts.sans,
          fontSize: 14,
        }}
      >
        Lädt…
      </div>
    );
  }

  if (status === 'out') return <LoginScreen onLoggedIn={handleLoggedIn} />;

  return <App onLogout={handleLogout} />;
}
