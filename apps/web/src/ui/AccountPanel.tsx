import { useEffect, useRef, useState } from 'react';
import { rememberRoom } from '../net';

export interface Account { id: string; name: string }
interface Session { user: Account | null; clientId: string | null; csrf: string }
interface GoogleIdentity {
  initialize(options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: { type: string; theme: string; size: string }): void;
  disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }

let googleScript: Promise<void> | undefined;
function loadGoogle() {
  if (window.google) return Promise.resolve();
  if (!googleScript) googleScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error('Google could not be reached. Try again later.')); };
    document.head.appendChild(script);
  }).catch((error: unknown) => { googleScript = undefined; throw error; });
  return googleScript;
}

export function AccountPanel({ onChange }: { onChange: (account: Account | null) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const response = await fetch('/api/auth/session');
      if (!response.ok) throw new Error('Sign-in needs the game server. You can still play as a guest.');
      const next = await response.json() as Session;
      if (active) { setSession(next); change.current(next.user); }
    };
    void refresh().catch(() => { if (active) setError('Sign-in is unavailable. You can still play as a guest.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session?.clientId || session.user) return;
    let active = true;
    void loadGoogle().then(() => {
      if (!active || !button.current) return;
      window.google!.accounts.id.initialize({
        client_id: session.clientId!, nonce: session.csrf,
        callback: ({ credential }) => {
          if (!active) return;
          setBusy(true); setError('');
          void fetch('/api/auth/google', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf },
            body: JSON.stringify({ credential }),
          }).then(async (response) => {
            const result = await response.json() as { user: Account; error?: string };
            if (!response.ok) throw new Error(result.error ?? 'Sign-in failed');
            rememberRoom(null);
            change.current(result.user);
            const fresh = await fetch('/api/auth/session');
            if (!fresh.ok) throw new Error('Please reopen the account panel.');
            const next = await fresh.json() as Session;
            if (active) setSession(next);
          }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Sign-in failed'); })
            .finally(() => { if (active) setBusy(false); });
        },
      });
      window.google!.accounts.id.renderButton(button.current, { type: 'standard', theme: 'outline', size: 'large' });
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Sign-in failed'); });
    return () => { active = false; };
  }, [session]);

  const logout = async () => {
    if (!session) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session.csrf } });
      if (!response.ok) throw new Error('Sign-out failed. Reopen this panel and try again.');
      window.google?.accounts.id.disableAutoSelect();
      rememberRoom(null);
      change.current(null);
      setSession({ ...session, user: null });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-out failed'); }
    finally { setBusy(false); }
  };

  return <>
    <p className="hint">Guest play is always available. Google sign-in identifies you when joining online rooms; saved offline games stay on this device.</p>
    {error && <p className="net-error" role="alert">{error}</p>}
    {session?.user ? <>
      <p>Signed in as <strong>{session.user.name}</strong></p>
      <button className="mode" disabled={busy} onClick={() => void logout()}><strong>Sign out</strong></button>
    </> : session?.clientId ? <div ref={button} aria-label="Sign in with Google" />
      : session ? <p className="hint">Google sign-in is not configured on this server yet.</p> : !error && <p role="status">Loading account…</p>}
    {busy && <p role="status">Updating account…</p>}
  </>;
}
