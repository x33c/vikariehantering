import { useState } from 'react';
import type { Personal } from '../types';
import { Input, Select } from './ui';

export function PersonalSelect({ personal, value, onChange }: {
  personal: Personal[]; value: string; onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase('sv');
  const matches = personal.filter(person => `${person.namn} ${person.arbetslag?.namn ?? ''}`.toLocaleLowerCase('sv').includes(term));
  const selected = personal.find(person => person.id === value);
  return <div className="space-y-2">
    <Input label="Sök personal" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Namn eller arbetslag" autoComplete="off" />
    <Select label="Vem är frånvarande?" value={value} onChange={event => { onChange(event.target.value); setSearch(''); }}>
      <option value="">Välj person</option>
      {selected && !matches.includes(selected) && <option value={selected.id}>{selected.namn} (vald)</option>}
      {matches.map(person => <option key={person.id} value={person.id}>{person.namn}{person.arbetslag ? ` (${person.arbetslag.namn})` : ''}</option>)}
    </Select>
    {term && <div className="max-h-52 overflow-y-auto rounded-md border" style={{ borderColor: 'var(--border)' }}>
      {matches.length ? matches.map(person => <button key={person.id} type="button" className="block min-h-11 w-full border-b px-3 py-2 text-left text-sm last:border-0" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
        onClick={() => { onChange(person.id); setSearch(''); }}>
        <span className="font-semibold">{person.namn}</span>{person.arbetslag && <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{person.arbetslag.namn}</span>}
      </button>) : <p role="status" className="p-3 text-sm">Ingen personal matchar sökningen.</p>}
    </div>}
  </div>;
}
