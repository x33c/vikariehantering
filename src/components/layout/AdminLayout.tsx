import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import PushButton from '../PushButton';
import AdminNotiser from '../AdminNotiser';

const huvudNavItems = [
  { to: '/admin', label: 'Start', icon: 'home', end: true },
  { to: '/admin/franvaro', label: 'Frånvaro', icon: 'calendar' },
  { to: '/admin/vikariepass', label: 'Bemanning', icon: 'board' },
  { to: '/admin/utskick', label: 'Utskick', icon: 'mail' },
  { to: '/admin/register', label: 'Personer', icon: 'users' },
];

const merNavItems = [
  { to: '/admin/import', label: 'Schema', icon: 'table' },
  { to: '/admin/historik', label: 'Historik', icon: 'history' },
  { to: '/admin/export', label: 'Export', icon: 'download' },
  { to: '/admin/datastadning', label: 'Datastädning', icon: 'tool' },
  { to: '/admin/beta', label: 'Beta', icon: 'layers' },
];

function NavIkon({ namn }: { namn: string }) {
  const gemensam = {
    className: 'h-5 w-5 shrink-0',
    fill: 'none',
    viewBox: '0 0 24 24',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (namn === 'calendar') return <svg {...gemensam}><path d="M8 2v4M16 2v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>;
  if (namn === 'board') return <svg {...gemensam}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 4v16M16 4v16M3 10h18" /></svg>;
  if (namn === 'mail') return <svg {...gemensam}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>;
  if (namn === 'users') return <svg {...gemensam}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  if (namn === 'people') return <svg {...gemensam}><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
  if (namn === 'table') return <svg {...gemensam}><path d="M4 4h16v16H4zM4 10h16M10 4v16" /></svg>;
  if (namn === 'history') return <svg {...gemensam}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v6h6M12 7v5l3 2" /></svg>;
  if (namn === 'download') return <svg {...gemensam}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>;
  if (namn === 'tool') return <svg {...gemensam}><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-2-2 2.4-2.4Z" /></svg>;
  if (namn === 'account') return <svg {...gemensam}><rect x="4" y="3" width="16" height="18" rx="3" /><circle cx="12" cy="9" r="3" /><path d="M8 17a4 4 0 0 1 8 0" /></svg>;
  if (namn === 'layers') return <svg {...gemensam}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></svg>;
  return <svg {...gemensam}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
}

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
  const [sidopanelKollapsad, setSidopanelKollapsad] = useState(false);
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
          fixed inset-y-0 left-0 z-30 flex max-w-[88vw] flex-col border-r lg:max-w-none
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${menyÖppen ? 'translate-x-0' : '-translate-x-full'}
          ${sidopanelKollapsad ? 'w-64 lg:w-[84px]' : 'w-64'}
        `}
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={() => setSidopanelKollapsad(!sidopanelKollapsad)}
          className="absolute -right-3 top-6 z-10 hidden h-7 w-7 items-center justify-center rounded-full border text-xs shadow-sm transition lg:flex"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          aria-label={sidopanelKollapsad ? 'Visa sidopanel' : 'Dölj sidopanel'}
          title={sidopanelKollapsad ? 'Visa sidopanel' : 'Dölj sidopanel'}
        >
          {sidopanelKollapsad ? '›' : '‹'}
        </button>

        <div className="px-5 pb-4 pt-5">
          <div className={`flex items-center ${sidopanelKollapsad ? 'justify-center gap-0' : 'gap-4'}`}>
            <img
              src={mörkt ? "/sundbyberg-silver.png" : "/sundbyberg-halm.png"}
              alt=""
              className="h-14 w-14 shrink-0 object-contain"
            />
            <div className={`min-w-0 ${sidopanelKollapsad ? 'hidden' : ''}`}>
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
                className={`group flex min-h-11 items-center gap-3 rounded-2xl border py-2.5 text-sm font-semibold transition-all ${sidopanelKollapsad ? 'justify-center px-2' : 'px-4'}`}
                style={({ isActive }) => ({
                  background: isActive ? 'var(--nav-active)' : 'transparent',
                  color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                  borderColor: isActive ? 'var(--nav-active-ring)' : 'transparent',
                  boxShadow: isActive ? `0 0 0 3px var(--nav-active-ring-soft), var(--nav-active-shadow)` : 'none',
                })}
                title={item.label}
              >
                <NavIkon namn={item.icon} />
                <span className={`truncate ${sidopanelKollapsad ? 'sr-only' : ''}`}>{item.label}</span>
              </NavLink>
            ))}
            <details className={`group/mer ${sidopanelKollapsad ? 'hidden' : ''}`} open={merÄrAktiv}>
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
            {sidopanelKollapsad && (
              <div className="space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                {merNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/admin/beta'}
                    onClick={() => setMenyÖppen(false)}
                    className="group flex min-h-11 items-center justify-center rounded-2xl border px-2 py-2.5 text-sm font-semibold transition-all"
                    style={({ isActive }) => ({
                      background: isActive ? 'var(--nav-active)' : 'transparent',
                      color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                      borderColor: isActive ? 'var(--nav-active-ring)' : 'transparent',
                      boxShadow: isActive ? `0 0 0 3px var(--nav-active-ring-soft), var(--nav-active-shadow)` : 'none',
                    })}
                    title={item.label}
                  >
                    <NavIkon namn={item.icon} />
                    <span className="sr-only">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className={`hidden border-t p-4 lg:block ${sidopanelKollapsad ? 'px-3' : ''}`} style={{ borderColor: 'var(--border)' }}>
          <div className={`mb-3 rounded-2xl border ${sidopanelKollapsad ? 'px-2 py-3' : 'px-4 py-3'}`} style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <p className={`truncate text-sm font-semibold ${sidopanelKollapsad ? 'text-center' : ''}`} style={{ color: 'var(--text)' }}>
              {sidopanelKollapsad ? (profil?.namn ?? profil?.epost ?? '').slice(0, 1).toUpperCase() : (profil?.namn ?? profil?.epost)}
            </p>
            <p className={`text-xs ${sidopanelKollapsad ? 'hidden' : ''}`} style={{ color: 'var(--text-muted)' }}>Administratör</p>
          </div>

          <div className={`grid gap-2 ${sidopanelKollapsad ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
            {!sidopanelKollapsad && <PushButton />}
          </div>

          <button
            onClick={() => setBekraftaLoggaUt(true)}
            className={`mt-2 flex w-full items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors hover:opacity-80 ${sidopanelKollapsad ? 'text-center' : 'text-left'}`}
            style={{ color: 'var(--text)', borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            title="Logga ut"
          >
            {sidopanelKollapsad ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 17l5-5-5-5M15 12H3" />
              </svg>
            ) : 'Logga ut'}
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
          className="sticky top-0 z-[70] flex h-16 shrink-0 items-center border-b px-3 backdrop-blur sm:px-4 lg:hidden"
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
