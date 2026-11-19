import { useState } from 'react';

export function usePlanningDay(weekStart: string) {
  const [chosen, setChosen] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const end = new Date(`${weekStart}T12:00:00`);
  end.setDate(end.getDate() + 4);
  const weekEnd = end.toLocaleDateString('sv-SE');
  const today = new Date().toLocaleDateString('sv-SE');
  const selected = chosen >= weekStart && chosen <= weekEnd ? chosen
    : today >= weekStart && today <= weekEnd ? today : weekStart;
  return [selected, setChosen] as const;
}

export function MobilePlanningDay({ days, selected, counts, onSelect, disabled = false }: {
  days: string[]; selected: string; counts: number[]; onSelect: (day: string) => void; disabled?: boolean;
}) {
  return <div className="sticky top-0 z-10 mb-3 border-b py-2 md:hidden" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
    <div role="group" aria-label="Välj dag" className="grid grid-cols-5 gap-1">
      {days.map((day, index) => {
        const date = new Date(`${day}T12:00:00`);
        const active = day === selected;
        return <button key={day} type="button" disabled={disabled} aria-pressed={active}
          aria-label={date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          onClick={() => onSelect(day)} className="min-h-16 min-w-0 rounded-md border px-1 py-2 text-center disabled:opacity-50"
          style={{ background: active ? 'var(--blue)' : 'var(--bg-card)', color: active ? '#fff' : 'var(--text)', borderColor: active ? 'var(--blue)' : 'var(--border)' }}>
          <span className="block text-xs capitalize">{date.toLocaleDateString('sv-SE', { weekday: 'short' })}</span>
          <span className="block text-sm font-semibold">{date.getDate()}/{date.getMonth() + 1}</span>
          <span className="block text-[10px]">{counts[index] ?? 0} st</span>
        </button>;
      })}
    </div>
    <p aria-live="polite" className="mt-2 text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>
      {new Date(`${selected}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
    </p>
  </div>;
}
