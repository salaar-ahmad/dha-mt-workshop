import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { backend, TABLES } from './backend.js';
import { buildIndex } from './metrics.js';
import { permsFor, canOpen } from './roles.js';

const Ctx = createContext(null);
const EMPTY = { vehicles: [], job_cards: [], spares: [], job_events: [] };

export function StoreProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const reload = useCallback(async () => {
    try {
      const res = await Promise.all(TABLES.map((t) => backend.fetchAll(t)));
      setData(Object.fromEntries(TABLES.map((t, i) => [t, res[i]])));
      setLastSync(new Date());
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { backend.getUser().then(setUser).catch(() => setUser(null)); }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    reload();
    const unsub = backend.subscribe(() => {
      clearTimeout(timer.current);
      timer.current = setTimeout(reload, 400);
    });
    const poll = setInterval(reload, 120000); // safety net if live updates drop
    return () => { unsub && unsub(); clearInterval(poll); };
  }, [user, reload]);

  const idx = useMemo(() => buildIndex(data), [data]);

  const notify = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind, key: Date.now() });
  }, []);

  const value = useMemo(() => ({
    user, setUser, data, idx, loading, error, lastSync, reload, toast, notify,
    can: permsFor(user?.role),
    canOpen: (path) => canOpen(user?.role, path),
    canWrite: permsFor(user?.role).stages,
    canCorrect: permsFor(user?.role).correct,
  }), [user, data, idx, loading, error, lastSync, reload, toast, notify]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
