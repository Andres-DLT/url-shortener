import { useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session.jsx';
import { toast } from '../lib/hooks.js';
import { Icon } from './Icon.jsx';

export function LoginDialog() {
  const { loginOpen, closeLogin, login } = useSession();
  const ref = useRef(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (loginOpen && !dialog.open) {
      setPassword('');
      setError(null);
      dialog.showModal();
    }
    if (!loginOpen && dialog.open) dialog.close();
  }, [loginOpen]);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      toast('Sesión iniciada');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="modal" onClose={closeLogin} aria-labelledby="login-title">
      <form onSubmit={onSubmit}>
        <h2 id="login-title">Iniciar sesión</h2>
        <p>Acceso de administración para crear, editar y borrar enlaces.</p>
        <div className="field">
          <label htmlFor="admin-password">Contraseña</label>
          <input
            id="admin-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={closeLogin}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !password}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Tarjeta que sustituye al formulario cuando el visitante no puede editar. */
export function ReadOnlyNotice() {
  const { session, openLogin } = useSession();
  const locked = session.mode === 'locked';
  return (
    <div className="card shorten-card readonly-notice">
      <div>
        <strong>{locked ? 'Gestión desactivada' : 'Panel público de solo lectura'}</strong>
        <p>
          {locked
            ? 'El servidor no tiene contraseña de administración configurada (ADMIN_PASSWORD), así que no se pueden crear enlaces.'
            : 'Puedes explorar los enlaces y sus analíticas. Para crear, editar o borrar enlaces, inicia sesión como administrador.'}
        </p>
      </div>
      {!locked && (
        <button type="button" className="btn btn-primary" onClick={openLogin}>Iniciar sesión</button>
      )}
    </div>
  );
}
