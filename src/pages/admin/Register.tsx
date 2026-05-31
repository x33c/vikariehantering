import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/admin/register/vikarier', label: 'Vikarier', beskrivning: 'Inloggning och kontakt' },
  { to: '/admin/register/personal', label: 'Personal', beskrivning: 'Ordinarie medarbetare' },
  { to: '/admin/register/konton', label: 'Admin', beskrivning: 'Administratörer' },
];

export default function Register() {
  return (
    <div className="pb-6 pt-2">
      <div className="space-y-4 px-2 sm:px-4 lg:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Register</p>
          <h1 className="text-xl font-semibold leading-tight" style={{ color: 'var(--text)' }}>Personer</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Samlad hantering av vikarier, personal och admin-konton.
          </p>
        </div>

        <div className="rounded-2xl border p-1.5" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className="rounded-xl px-3 py-2.5 text-sm font-semibold transition"
                style={({ isActive }) => ({
                  background: isActive ? 'var(--nav-active)' : 'transparent',
                  color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                  boxShadow: isActive ? '0 0 0 2px var(--nav-active-ring-soft)' : 'none',
                })}
              >
                <span className="block">{tab.label}</span>
                <span className="mt-0.5 block text-xs font-medium opacity-70">{tab.beskrivning}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      <Outlet />
    </div>
  );
}
