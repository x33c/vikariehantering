import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/admin/register/vikarier', label: 'Vikarier' },
  { to: '/admin/register/personal', label: 'Personal' },
  { to: '/admin/register/konton', label: 'Konton' },
];

export default function Register() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition"
              style={({ isActive }) => ({
                background: isActive ? 'var(--nav-active)' : 'transparent',
                color: isActive ? 'var(--nav-active-text)' : 'var(--text-muted)',
                boxShadow: isActive ? '0 0 0 2px var(--nav-active-ring-soft)' : 'none',
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      <Outlet />
    </div>
  );
}
