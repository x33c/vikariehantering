import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/vikarie', label: 'Lediga pass', end: true },
  { to: '/vikarie/mina-pass', label: 'Mina bokade pass' },
  { to: '/vikarie/tillganglighet', label: 'Min tillgänglighet' },
  { to: '/vikarie/profil', label: 'Profil & kontakt' },
];

function useDarkMode() {
  const [mörkt, setMörkt] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  function toggla() {
    const nytt = !mörkt;
    setMörkt(nytt);
    if (nytt) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('tema', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('tema', 'light');
    }
  }

  return { mörkt, toggla };
}

export default function VikarieLayout() {
  const { profil, loggaUt } = useAuth();
  const [menyÖppen, setMenyÖppen] = useState(false);
  const { mörkt, toggla } = useDarkMode();

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg)' }}>
      {menyÖppen && (
        <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setMenyÖppen(false)} />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r
        transform transition-transform duration-200 ease-in-out
        lg:static lg:translate-x-0
        ${menyÖppen ? 'translate-x-0' : '-translate-x-full'}
      `} style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
        <div className="flex h-14 items-center justify-between border-b px-5" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Vikariesystem</span>
          <button onClick={() => setMenyÖppen(false)} className="rounded p-1 lg:hidden" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenyÖppen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : ''
                }`
              }
              style={({ isActive }) => isActive ? {} : { color: 'var(--text-muted)' }}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-2 px-3 py-1">
            <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{profil?.namn ?? profil?.epost}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Vikarie</p>
          </div>
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{mörkt ? 'Mörkt läge' : 'Ljust läge'}</span>
            <button
              onClick={toggla}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{ background: mörkt ? 'var(--blue)' : 'var(--border)' }}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${mörkt ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>
          <button
            onClick={loggaUt}
            className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            style={{ color: 'var(--text-muted)' }}
          >
            Logga ut
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center border-b px-4 lg:hidden" style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}>
          <button onClick={() => setMenyÖppen(true)} className="rounded-md p-2" style={{ color: 'var(--text-muted)' }}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>Vikariesystem</span>
          <button onClick={toggla} className="ml-auto relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            style={{ background: mörkt ? 'var(--blue)' : 'var(--border)' }}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${mörkt ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}