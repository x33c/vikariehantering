import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import PushButton from '../PushButton';
import AdminNotiser from '../AdminNotiser';

const huvudNavItems = [
  { to: '/admin', label: 'Start', end: true },
  { to: '/admin/franvaro', label: 'Frånvaro' },
  { to: '/admin/vikariepass', label: 'Bemanning' },
  { to: '/admin/utskick', label: 'Utskick' },
  { to: '/admin/vikarier', label: 'Vikarier' },
];

const merNavItems = [
  { to: '/admin/arbetslag', label: 'Personal' },
  { to: '/admin/import', label: 'Schema' },
  { to: '/admin/historik', label: 'Historik' },
  { to: '/admin/konton', label: 'Konton' },
  { to: '/admin/beta', label: 'Beta' },
];

function useDarkMode() {
  const [mörkt, setMörkt] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  function toggla() {
    const nytt = !mörkt;
    document.documentElement.classList.add('tema-vaxlar');
    window.setTimeout(() => document.documentElement.classList.remove('tema-vaxlar'), 260);
    setMörkt(nytt);
    document.documentElement.classList.toggle('dark', nytt);
    localStorage.setItem('tema', nytt ? 'dark' : 'light');
  }

  return { mörkt, toggla };
}


function TemaIkon({ mörkt }: { mörkt: boolean }) {
  if (mörkt) {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64" />
        <circle cx="12" cy="12" r="4" strokeWidth={2} />
      </svg>
    );
  }

  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

export default function AdminLayout() {
  const { profil, loggaUt } = useAuth();
  const location = useLocation();
  const [menyÖppen, setMenyÖppen] = useState(false);
  const [bekraftaLoggaUt, setBekraftaLoggaUt] = useState(false);
  const { mörkt, toggla } = useDarkMode();
  const merÄrAktiv = merNavItems.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));

  return (
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {menyÖppen && (
        <div className="fixed inset-0 z-20 bg-black/35 backdrop-blur-sm lg:hidden" onClick={() => setMenyÖppen(false)} />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex w-64 max-w-[88vw] flex-col border-r lg:max-w-none
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${menyÖppen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center gap-4">
            <img
              src={mörkt ? "/sundbyberg-silver.png" : "/sundbyberg-halm.png"}
              alt=""
              className="h-14 w-14 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
                Passportalen
              </p>
              
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1.5">
            {huvudNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenyÖppen(false)}
                className="group flex min-h-11 items-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all"
                style={({ isActive }) => ({
                  background: isActive ? 'var(--nav-active)' : 'transparent',
                  color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                  borderColor: isActive ? 'var(--nav-active-ring)' : 'transparent',
                  boxShadow: isActive ? `0 0 0 3px var(--nav-active-ring-soft), var(--nav-active-shadow)` : 'none',
                })}
              >
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
            <details className="group/mer" open={merÄrAktiv}>
              <summary
                className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all [&::-webkit-details-marker]:hidden"
                style={{
                  background: merÄrAktiv ? 'var(--nav-active)' : 'transparent',
                  color: merÄrAktiv ? 'var(--nav-active-text)' : 'var(--text-muted)',
                  borderColor: merÄrAktiv ? 'var(--nav-active-ring)' : 'transparent',
                  boxShadow: merÄrAktiv ? '0 0 0 2px var(--nav-active-ring-soft)' : 'none',
                }}
              >
                <span>Mer</span>
                <svg className="h-4 w-4 transition-transform group-open/mer:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </summary>
              <div className="mt-1 space-y-1 pl-3">
                {merNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin/beta'}
                    onClick={() => setMenyÖppen(false)}
                    className="group flex min-h-10 items-center rounded-xl border px-3 py-2 text-sm font-medium transition-all"
                    style={({ isActive }) => ({
                      background: isActive ? 'var(--nav-active)' : 'transparent',
                      color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                      borderColor: isActive ? 'var(--nav-active-ring)' : 'transparent',
                      boxShadow: isActive ? '0 0 0 2px var(--nav-active-ring-soft)' : 'none',
                    })}
                  >
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </details>
          </div>
        </nav>

        <div className="hidden border-t p-4 lg:block" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {profil?.namn ?? profil?.epost}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Administratör</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <AdminNotiser placement="up" />
            <button
              onClick={toggla}
              className="flex min-h-10 items-center justify-center rounded-xl border px-3 transition-all hover:opacity-85"
              style={{ color: 'var(--text)', borderColor: 'var(--border)', background: 'var(--bg-card)' }}
              aria-label={mörkt ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
              title={mörkt ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
            >
              <TemaIkon mörkt={mörkt} />
            </button>
          </div>

          <div className="mt-2">
            <PushButton />
          </div>

          <button
            onClick={() => setBekraftaLoggaUt(true)}
            className="mt-2 w-full rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--text)', borderColor: 'var(--border)', background: 'var(--bg-card)' }}
          >
            Logga ut
          </button>
        </div>

        <div className="border-t p-3 lg:hidden" style={{ borderColor: 'var(--border)' }} data-admin-mobile-sidebar-footer>
          <div className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {profil?.namn ?? profil?.epost}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Administratör</p>
            </div>
            <button
              onClick={() => setBekraftaLoggaUt(true)}
              className="shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              Logga ut
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="sticky top-0 z-10 flex h-16 shrink-0 items-center border-b px-3 backdrop-blur sm:px-4 lg:hidden"
          style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
        >
          <button onClick={() => setMenyÖppen(true)} className="rounded-xl border p-2" style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="ml-3 min-w-0 truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>Passportalen</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AdminNotiser />
            <PushButton compact />
            <button
              onClick={toggla}
              className="rounded-xl border p-2"
              style={{ color: 'var(--text)', borderColor: 'var(--border)' }}
              aria-label={mörkt ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
              title={mörkt ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
            >
              <TemaIkon mörkt={mörkt} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="w-full max-w-none overflow-x-hidden px-1.5 py-0 sm:px-4 sm:py-2 lg:px-5 lg:py-3">
            <Outlet />
          </div>
        </main>
      </div>

      {bekraftaLoggaUt && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-2xl border p-4 shadow-xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Vill du logga ut?</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Du behöver logga in igen för att administrera pass.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBekraftaLoggaUt(false)}
                className="min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={loggaUt}
                className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                style={{ background: 'var(--danger)' }}
              >
                Logga ut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
