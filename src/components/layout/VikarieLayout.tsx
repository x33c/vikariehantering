import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import PushButton from '../PushButton';

const navItems = [
  { to: '/vikarie', label: 'Pass', end: true },
  { to: '/vikarie/mina-pass', label: 'Mina pass' },
  { to: '/vikarie/tillganglighet', label: 'Tillgänglighet' },
  { to: '/vikarie/profil', label: 'Profil' },
];

function useDarkMode() {
  const [mörkt, setMörkt] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  function toggla() {
    const nytt = !mörkt;
    setMörkt(nytt);
    document.documentElement.classList.toggle('dark', nytt);
    localStorage.setItem('tema', nytt ? 'dark' : 'light');
  }

  return { mörkt, toggla };
}

export default function VikarieLayout() {
  const { profil, loggaUt } = useAuth();
  const [menyÖppen, setMenyÖppen] = useState(false);
  const { mörkt, toggla } = useDarkMode();

  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: 'var(--bg)' }}>
      {false && menyÖppen && (
        <div
          className="fixed inset-0 z-20 bg-black/35 backdrop-blur-sm lg:hidden"
          onClick={() => setMenyÖppen(false)}
        />
      )}

      <aside
        className={`
          hidden lg:static lg:flex lg:w-72 lg:flex-col lg:border-r
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${menyÖppen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        {/* Logotyp */}
        <div className="px-5 pb-6 pt-6">
          <div className="flex items-center gap-4">
            <img
              src={mörkt ? '/sundbyberg-silver.png' : '/sundbyberg-halm.png'}
              alt=""
              className="h-16 w-16 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                Lediga pass
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenyÖppen(false)}
              className="group flex items-center rounded-2xl border px-4 py-3 text-sm font-medium transition-all"
              style={({ isActive }) => ({
                background: isActive ? 'var(--nav-active)' : 'transparent',
                color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                borderColor: isActive ? 'var(--nav-active-ring)' : 'transparent',
                boxShadow: isActive
                  ? '0 0 0 3px var(--nav-active-ring-soft), var(--nav-active-shadow)'
                  : 'none',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Botten */}
        <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-3">
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{profil?.namn ?? profil?.epost}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Vikarie</p>
          </div>
          <div className="mb-3">
            <PushButton />
          </div>
          <div className="mb-2 hidden items-center justify-between lg:flex">
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
            className="w-full rounded-2xl border px-4 py-2.5 text-left text-sm font-medium transition-all"
            style={{ color: 'var(--text-muted)', borderColor: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Logga ut
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar mobil */}
        <header
          className="flex h-14 items-center border-b px-4 lg:hidden"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Lediga pass</span>
          <div className="ml-auto flex items-center gap-2">
            <PushButton compact />
            <button
              onClick={loggaUt}
              className="rounded-xl border p-2"
              style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
              aria-label="Logga ut"
              title="Logga ut"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 9V5.75A1.75 1.75 0 0 0 14 4h-7A1.75 1.75 0 0 0 5.25 5.75v12.5C5.25 19.22 6.03 20 7 20h7a1.75 1.75 0 0 0 1.75-1.75V15M12 8l-4 4m0 0 4 4m-4-4h12" />
              </svg>
            </button>
            <button
              onClick={toggla}
              className="rounded-xl border p-2"
              style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
              aria-label="Växla tema"
              title="Växla tema"
            >
            {mörkt ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
              </svg>
            )}
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto pb-3 lg:pb-0">
          <Outlet />
        </main>
        <nav
          className="shrink-0 grid grid-cols-4 border-t px-2 py-2 lg:hidden"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="flex min-h-12 items-center justify-center rounded-xl px-2 text-center text-xs font-semibold"
              style={({ isActive }) => ({
                background: isActive ? 'var(--nav-active)' : 'transparent',
                color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                boxShadow: isActive ? '0 0 0 2px var(--nav-active-ring-soft)' : 'none',
              })}
            >
              {item.label === 'Tillgänglighet' ? 'Tid' : item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}