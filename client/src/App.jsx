import { Icon } from './components/Icon.jsx';
import { LoginDialog } from './components/LoginDialog.jsx';
import { ToastHost } from './components/ui.jsx';
import { navigate, toast, useLocation, useTheme } from './lib/hooks.js';
import { SessionProvider, useSession } from './lib/session.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { LinkPage } from './pages/LinkPage.jsx';

function SessionButton() {
  const { session, openLogin, logout } = useSession();
  if (session.mode !== 'password') return null;
  if (session.authenticated) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={async () => {
          await logout();
          toast('Sesión cerrada');
        }}
      >
        Cerrar sesión
      </button>
    );
  }
  return <button type="button" className="btn btn-sm" onClick={openLogin}>Iniciar sesión</button>;
}

function LoginGate() {
  const { openLogin } = useSession();
  return (
    <section className="hero">
      <h1>Panel privado</h1>
      <p>Inicia sesión para ver los enlaces y sus analíticas.</p>
      <button type="button" className="btn btn-primary btn-lg" onClick={openLogin}>Iniciar sesión</button>
    </section>
  );
}

function Shell() {
  const location = useLocation();
  const [theme, toggleTheme] = useTheme();
  const { loaded, session } = useSession();
  const linkMatch = location.pathname.match(/^\/links\/([^/]+)\/?$/);
  const code = linkMatch ? decodeURIComponent(linkMatch[1]) : null;

  let content = null;
  if (loaded && !session.canView) content = <LoginGate />;
  else if (loaded) content = code ? <LinkPage key={code} code={code} /> : <HomePage />;

  return (
    <>
      <header className="app-header">
        <div className="container">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            <span className="brand-mark"><Icon name="link" size={16} strokeWidth={2.2} /></span>
            <span>
              Acortador
              <small>Enlaces cortos con analíticas</small>
            </span>
          </a>
          <div className="header-actions">
            <SessionButton />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="container">{content}</main>

      <footer className="container app-footer">
        Node.js · PostgreSQL · Redis — las IPs se anonimizan y los bots se excluyen de las estadísticas.
      </footer>
      <LoginDialog />
      <ToastHost />
    </>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
