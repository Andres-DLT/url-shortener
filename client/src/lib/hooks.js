import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/* ---------- Router mínimo basado en History API ---------- */
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());
window.addEventListener('popstate', notify);

export function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  notify();
  if (!replace) window.scrollTo(0, 0);
}

export function useLocation() {
  const subscribe = useCallback((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, []);
  const href = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
  return new URL(href, window.location.origin);
}

/** Parámetro de la query string sincronizado con el estado (p. ej. ?range=30d). */
export function useQueryParam(name, fallback, allowed) {
  const location = useLocation();
  const raw = location.searchParams.get(name);
  const value = raw && (!allowed || allowed.includes(raw)) ? raw : fallback;
  const setValue = useCallback((next) => {
    const url = new URL(window.location.href);
    if (next === fallback) url.searchParams.delete(name);
    else url.searchParams.set(name, next);
    navigate(url.pathname + url.search, { replace: true });
  }, [name, fallback]);
  return [value, setValue];
}

/* ---------- Datos asíncronos con refresco que conserva el render previo ---------- */
export function useAsyncData(load, deps, { refreshMs } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const requestId = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loader = useCallback(load, deps);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loader();
      if (id === requestId.current) setState({ data, error: null, loading: false, updatedAt: Date.now() });
    } catch (error) {
      if (id === requestId.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [loader]);

  useEffect(() => {
    run();
  }, [run]);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run();
    }, refreshMs);
    return () => clearInterval(timer);
  }, [run, refreshMs]);

  return { ...state, reload: run };
}

/* ---------- Ancho de un elemento (para los gráficos SVG) ---------- */
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/* ---------- Tema claro / oscuro ---------- */
const THEME_KEY = 'acortador-theme';
const readStoredTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
};

export function useTheme() {
  const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const [theme, setTheme] = useState(() => readStoredTheme() ?? (systemDark() ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* almacenamiento no disponible: el cambio dura lo que la pestaña */
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}

/* ---------- Avisos (toasts) ---------- */
const toastListeners = new Set();
let toastId = 0;
export function toast(message, { error = false } = {}) {
  const item = { id: ++toastId, message, error };
  toastListeners.forEach((l) => l(item));
}
export function useToasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (item) => {
      setItems((list) => [...list, item]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== item.id)), 2800);
    };
    toastListeners.add(onToast);
    return () => toastListeners.delete(onToast);
  }, []);
  return items;
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Enlace copiado al portapapeles');
  } catch {
    toast('No se pudo copiar. Selecciona el enlace y cópialo a mano.', { error: true });
  }
}
