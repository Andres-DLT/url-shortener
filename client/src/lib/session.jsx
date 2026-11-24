import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const DEFAULT_SESSION = { mode: 'open', authenticated: false, canEdit: false, canView: true };
const SessionContext = createContext(null);

/** Configuración del servidor (baseUrl) y estado de la sesión de administrador. */
export function SessionProvider({ children }) {
  const [state, setState] = useState({ loaded: false, baseUrl: null, session: DEFAULT_SESSION });
  const [loginOpen, setLoginOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { baseUrl, session } = await api.config();
      setState({ loaded: true, baseUrl, session });
    } catch {
      setState((s) => ({ ...s, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    ...state,
    refresh,
    loginOpen,
    openLogin: () => setLoginOpen(true),
    closeLogin: () => setLoginOpen(false),
    login: async (password) => {
      const { session } = await api.login(password);
      setState((s) => ({ ...s, session }));
      setLoginOpen(false);
    },
    logout: async () => {
      await api.logout();
      await refresh();
    },
  }), [state, refresh, loginOpen]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
