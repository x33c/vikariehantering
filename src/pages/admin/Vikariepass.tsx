import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { historikApi, passApi, personalApi, vikariApi } from '../../lib/api';
import type { Bemanning, PassStatus, Personal, Vikarie } from '../../types';
import { PASS_STATUS_LABELS } from '../../types';
import { Button, Input, LaddaSida, Select, TomtTillstånd } from '../../components/ui';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

type Filter = 'att_gora' | 'vecka' | 'bokade' | 'alla';

type PassGrupp = {
  key: string;
  datum: string;
  personalId: string | null;
  personalNamn: string;
  vikarieId: string | null;
  pass: Bemanning[];
};

const DAGAR = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

function idagIso() {
  return new Date().toISOString().slice(0, 10);
}

function datumPlus(datum: string, dagar: number) {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + dagar);
  return d.toISOString().slice(0, 10);
}

function veckaStartIso(datum: string) {
  const d = new Date(`${datum}T12:00:00`);
  const dag = d.getDay() || 7;
  d.setDate(d.getDate() - dag + 1);
  return d.toISOString().slice(0, 10);
}

function formatDatum(datum: string) {
  const d = new Date(`${datum}T12:00:00`);
  return `${DAGAR[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function minuter(tid: string | null | undefined) {
  if (!tid) return 0;
  const [h, m] = tid.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function tidIntervall(grupp: PassGrupp) {
  const tider = grupp.pass.filter((p) => p.tid_från && p.tid_till);
  if (tider.length === 0) return 'Heldag';
  const start = tider.reduce((min, p) => minuter(p.tid_från) < minuter(min.tid_från) ? p : min, tider[0]);
  const slut = tider.reduce((max, p) => minuter(p.tid_till) > minuter(max.tid_till) ? p : max, tider[0]);
  return `${start.tid_från?.slice(0, 5)}-${slut.tid_till?.slice(0, 5)}`;
}

function gruppStatus(grupp: PassGrupp): PassStatus {
  if (grupp.pass.some((p) => p.status === 'bekräftat')) return 'bekräftat';
  if (grupp.pass.some((p) => p.status === 'bokat')) return 'bokat';
  if (grupp.pass.some((p) => p.status === 'notifierat')) return 'notifierat';
  if (grupp.pass.every((p) => p.status === 'avbokat')) return 'avbokat';
  return 'obokat';
}

function behöverVikarie(grupp: PassGrupp) {
  const status = gruppStatus(grupp);
  return status === 'obokat' || status === 'notifierat';
}

function statusStil(status: PassStatus) {
  const stilar: Record<PassStatus, string> = {
    obokat: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800',
    notifierat: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800',
    bokat: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
    bekräftat: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
    avbokat: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700',
  };
  return stilar[status];
}

function grupperaPass(pass: Bemanning[]): PassGrupp[] {
  const grupper = new Map<string, PassGrupp>();

  for (const p of pass) {
    const datum = p.datum;
    const personalId = p.personal_id ?? 'utan-personal';
    const key = `${datum}-${personalId}-${p.frånvaro_id ?? ''}`;

    if (!grupper.has(key)) {
      grupper.set(key, {
        key,
        datum,
        personalId: p.personal_id,
        personalNamn: p.personal?.namn ?? 'Okänd personal',
        vikarieId: p.vikarie_id,
        pass: [],
      });
    }

    const grupp = grupper.get(key)!;
    grupp.pass.push(p);
    if (!grupp.vikarieId && p.vikarie_id) grupp.vikarieId = p.vikarie_id;
  }

  return [...grupper.values()]
    .map((grupp) => ({
      ...grupp,
      pass: [...grupp.pass].sort((a, b) => minuter(a.tid_från) - minuter(b.tid_från)),
    }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || minuter(a.pass[0]?.tid_från) - minuter(b.pass[0]?.tid_från));
}

function skapaPassBeskrivning(grupp: PassGrupp) {
  if (grupp.pass.length === 1) {
    const p = grupp.pass[0];
    return [p.ämne, p.grupp, p.sal].filter(Boolean).join(' · ') || 'Pass';
  }
  return `${grupp.pass.length} lektioner samlade`;
}

export default function Bemanning() {
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') as PassStatus | null;
  const initialPassId = searchParams.get('pass');

  const [pass, setPass] = useState<Bemanning[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState('');
  const [sök, setSök] = useState('');
  const [filter, setFilter] = useState<Filter>(initialStatus === 'bokat' || initialStatus === 'bekräftat' ? 'bokade' : initialStatus === 'obokat' || initialStatus === 'notifierat' ? 'att_gora' : 'vecka');
  const [veckaStart, setVeckaStart] = useState(() => veckaStartIso(idagIso()));
  const [vikarieFilter, setVikarieFilter] = useState('');
  const [valt, setValt] = useState<PassGrupp | null>(null);
  const [nyttÖppet, setNyttÖppet] = useState(false);

  const hämta = useCallback(async () => {
    setFel('');
    const [passRes, vikarieRes, personalRes] = await Promise.all([
      passApi.lista(),
      vikariApi.lista(),
      personalApi.lista(),
    ]);

    if (passRes.error) setFel(passRes.error.message ?? 'Kunde inte hämta pass.');
    setPass((passRes.data ?? []) as Bemanning[]);
    setVikarier((vikarieRes.data ?? []) as Vikarie[]);
    setPersonal((personalRes.data ?? []) as Personal[]);
    setLaddar(false);
  }, []);

  useEffect(() => { hämta(); }, [hämta]);
  useRealtimeRefresh('vikariepass', hämta);

  const vikarierById = useMemo(() => new Map(vikarier.map((v) => [v.id, v])), [vikarier]);
  const grupper = useMemo(() => grupperaPass(pass), [pass]);
  const veckaSlut = datumPlus(veckaStart, 6);

  const filtrerade = useMemo(() => {
    const term = sök.trim().toLowerCase();

    return grupper.filter((grupp) => {
      const status = gruppStatus(grupp);
      const vikarie = grupp.vikarieId ? vikarierById.get(grupp.vikarieId) : null;
      const text = [grupp.personalNamn, vikarie?.namn, grupp.datum, tidIntervall(grupp), ...grupp.pass.flatMap((p) => [p.ämne, p.grupp, p.sal])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (term && !text.includes(term)) return false;
      if (vikarieFilter && grupp.vikarieId !== vikarieFilter) return false;
      if (filter === 'att_gora' && !behöverVikarie(grupp)) return false;
      if (filter === 'vecka' && (grupp.datum < veckaStart || grupp.datum > veckaSlut)) return false;
      if (filter === 'bokade' && status !== 'bokat' && status !== 'bekräftat') return false;
      return true;
    });
  }, [filter, grupper, sök, veckaSlut, veckaStart, vikarieFilter, vikarierById]);

  useEffect(() => {
    if (!initialPassId || valt) return;
    const grupp = grupper.find((g) => g.pass.some((p) => p.id === initialPassId));
    if (grupp) setValt(grupp);
  }, [grupper, initialPassId, valt]);

  const antalAttGöra = grupper.filter(behöverVikarie).length;
  const antalBokade = grupper.filter((g) => ['bokat', 'bekräftat'].includes(gruppStatus(g))).length;

  if (laddar) return <LaddaSida />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 pb-24 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Bemanning</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Pass som behöver lösas</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Välj ett pass, tillsätt vikarie och gå vidare.
          </p>
        </div>
        <Button onClick={() => setNyttÖppet(true)} className="h-11 w-full sm:w-auto">+ Lägg till pass</Button>
      </div>

      {fel && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{fel}</div>}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={sök}
          onChange={(e) => setSök(e.target.value)}
          placeholder="Sök person, vikarie, klass eller sal"
          className="h-12 w-full rounded-xl border px-4 text-base outline-none focus:ring-2"
          style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
        />
        <Select value={vikarieFilter} onChange={(e) => setVikarieFilter(e.target.value)} className="h-12 min-w-44">
          <option value="">Alla vikarier</option>
          {vikarier.map((v) => <option key={v.id} value={v.id}>{v.namn}</option>)}
        </Select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterKnapp aktiv={filter === 'att_gora'} onClick={() => setFilter('att_gora')}>Att göra ({antalAttGöra})</FilterKnapp>
        <FilterKnapp aktiv={filter === 'vecka'} onClick={() => setFilter('vecka')}>Denna vecka</FilterKnapp>
        <FilterKnapp aktiv={filter === 'bokade'} onClick={() => setFilter('bokade')}>Bokade ({antalBokade})</FilterKnapp>
        <FilterKnapp aktiv={filter === 'alla'} onClick={() => setFilter('alla')}>Alla</FilterKnapp>
      </div>

      {filter === 'vecka' && (
        <div className="flex items-center justify-between rounded-2xl border p-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <button className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ color: 'var(--text)' }} onClick={() => setVeckaStart(datumPlus(veckaStart, -7))}>← Föregående</button>
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{formatDatum(veckaStart)} – {formatDatum(veckaSlut)}</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Vecka</p>
          </div>
          <button className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ color: 'var(--text)' }} onClick={() => setVeckaStart(datumPlus(veckaStart, 7))}>Nästa →</button>
        </div>
      )}

      {filtrerade.length === 0 ? (
        <TomtTillstånd text="Inga pass matchar filtret." />
      ) : (
        <div className="space-y-3">
          {filtrerade.map((grupp) => (
            <PassKort key={grupp.key} grupp={grupp} vikarierById={vikarierById} onClick={() => setValt(grupp)} />
          ))}
        </div>
      )}

      {valt && (
        <PassPanel
          grupp={valt}
          vikarier={vikarier}
          vikarierById={vikarierById}
          onClose={() => setValt(null)}
          onChanged={async () => { await hämta(); setValt(null); }}
        />
      )}

      {nyttÖppet && (
        <NyttPassPanel
          personal={personal}
          vikarier={vikarier}
          onClose={() => setNyttÖppet(false)}
          onChanged={async () => { await hämta(); setNyttÖppet(false); }}
        />
      )}
    </div>
  );
}

function FilterKnapp({ aktiv, onClick, children }: { aktiv: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition"
      style={{
        background: aktiv ? 'var(--text)' : 'var(--bg-card)',
        color: aktiv ? 'var(--bg)' : 'var(--text)',
        borderColor: aktiv ? 'var(--text)' : 'var(--border)',
      }}
    >
      {children}
    </button>
  );
}

function PassKort({ grupp, vikarierById, onClick }: { grupp: PassGrupp; vikarierById: Map<string, Vikarie>; onClick: () => void }) {
  const status = gruppStatus(grupp);
  const vikarie = grupp.vikarieId ? vikarierById.get(grupp.vikarieId) : null;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}>{formatDatum(grupp.datum)}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{tidIntervall(grupp)}</span>
          </div>
          <p className="truncate text-lg font-bold" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {vikarie ? `Vikarie: ${vikarie.namn}` : skapaPassBeskrivning(grupp)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusStil(status)}`}>
          {PASS_STATUS_LABELS[status]}
        </span>
      </div>
    </button>
  );
}

function Panel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border shadow-xl sm:rounded-3xl" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} className="rounded-full px-3 py-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Stäng</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function PassPanel({ grupp, vikarier, vikarierById, onClose, onChanged }: {
  grupp: PassGrupp;
  vikarier: Vikarie[];
  vikarierById: Map<string, Vikarie>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [vikarieId, setVikarieId] = useState(grupp.vikarieId ?? '');
  const [sparar, setSparar] = useState(false);
  const status = gruppStatus(grupp);
  const vikarie = grupp.vikarieId ? vikarierById.get(grupp.vikarieId) : null;

  async function uppdateraAlla(data: Partial<Bemanning>, händelse?: 'pass_uppdaterat' | 'vikarie_bokat' | 'pass_avbokat') {
    setSparar(true);
    await Promise.all(grupp.pass.map(async (p) => {
      await passApi.uppdatera(p.id, data);
      if (händelse) await historikApi.skapa(p.id, händelse);
    }));
    setSparar(false);
    await onChanged();
  }

  async function boka() {
    if (!vikarieId) return;
    await uppdateraAlla({ vikarie_id: vikarieId, status: 'bokat' }, 'vikarie_bokat');
  }

  async function skickaFörfrågan() {
    if (!vikarieId) return;
    await uppdateraAlla({ riktad_till_vikarie_id: vikarieId, status: 'notifierat' }, 'pass_uppdaterat');
  }

  async function avboka() {
    if (!window.confirm('Avboka passet?')) return;
    await uppdateraAlla({ status: 'avbokat' }, 'pass_avbokat');
  }

  async function taBort() {
    if (!window.confirm('Ta bort passet permanent?')) return;
    setSparar(true);
    await Promise.all(grupp.pass.map((p) => passApi.radera(p.id)));
    setSparar(false);
    await onChanged();
  }

  return (
    <Panel title="Bemanna pass" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-2xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{formatDatum(grupp.datum)} · {tidIntervall(grupp)}</p>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{skapaPassBeskrivning(grupp)}</p>
              {vikarie && <p className="mt-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>Nuvarande vikarie: {vikarie.namn}</p>}
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStil(status)}`}>{PASS_STATUS_LABELS[status]}</span>
          </div>
        </div>

        <Select label="Välj vikarie" value={vikarieId} onChange={(e) => setVikarieId(e.target.value)}>
          <option value="">Ingen vald</option>
          {vikarier.map((v) => <option key={v.id} value={v.id}>{v.namn}</option>)}
        </Select>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button disabled={!vikarieId || sparar} loading={sparar} onClick={boka}>Boka vikarie</Button>
          <Button variant="secondary" disabled={!vikarieId || sparar} onClick={skickaFörfrågan}>Skicka förfrågan</Button>
          <Button variant="secondary" disabled={sparar} onClick={() => uppdateraAlla({ status: 'obokat', publicerad: true }, 'pass_uppdaterat')}>Lägg som ledigt</Button>
          <Button variant="secondary" disabled={sparar} onClick={avboka}>Avboka</Button>
        </div>

        <button onClick={taBort} disabled={sparar} className="w-full rounded-xl border px-4 py-3 text-sm font-semibold text-red-600" style={{ borderColor: 'var(--border)' }}>
          Ta bort pass
        </button>

        <div className="rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
          {grupp.pass.map((p) => (
            <div key={p.id} className="border-b px-4 py-3 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{p.tid_från?.slice(0, 5)}-{p.tid_till?.slice(0, 5)} · {p.ämne || 'Pass'}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{[p.grupp, p.sal].filter(Boolean).join(' · ') || 'Ingen grupp/sal'}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function NyttPassPanel({ personal, vikarier, onClose, onChanged }: {
  personal: Personal[];
  vikarier: Vikarie[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [personalId, setPersonalId] = useState('');
  const [vikarieId, setVikarieId] = useState('');
  const [datum, setDatum] = useState(idagIso());
  const [tidFrån, setTidFrån] = useState('08:00');
  const [tidTill, setTidTill] = useState('17:00');
  const [ämne, setÄmne] = useState('');
  const [grupp, setGrupp] = useState('');
  const [sparar, setSparar] = useState(false);

  async function spara() {
    if (!personalId) return;
    setSparar(true);
    await passApi.skapa({
      frånvaro_id: null,
      schemarad_id: null,
      personal_id: personalId,
      vikarie_id: vikarieId || null,
      datum,
      tid_från: tidFrån,
      tid_till: tidTill,
      typ: tidFrån === '08:00' && tidTill === '17:00' ? 'hel_dag' : 'del_av_dag',
      ämne: ämne || null,
      grupp: grupp || null,
      sal: null,
      anteckning: null,
      riktad_till_vikarie_id: null,
      status: vikarieId ? 'bokat' : 'obokat',
      skapad_av: null,
      publicerad: !vikarieId,
    });
    setSparar(false);
    await onChanged();
  }

  return (
    <Panel title="Lägg till pass" onClose={onClose}>
      <div className="space-y-4">
        <Select label="Frånvarande personal" value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
          <option value="">Välj person</option>
          {personal.map((p) => <option key={p.id} value={p.id}>{p.namn}</option>)}
        </Select>
        <Select label="Vikarie, valfritt" value={vikarieId} onChange={(e) => setVikarieId(e.target.value)}>
          <option value="">Ingen vald</option>
          {vikarier.map((v) => <option key={v.id} value={v.id}>{v.namn}</option>)}
        </Select>
        <Input label="Datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Från" type="time" value={tidFrån} onChange={(e) => setTidFrån(e.target.value)} />
          <Input label="Till" type="time" value={tidTill} onChange={(e) => setTidTill(e.target.value)} />
        </div>
        <Input label="Ämne" value={ämne} onChange={(e) => setÄmne(e.target.value)} placeholder="t.ex. MA" />
        <Input label="Grupp" value={grupp} onChange={(e) => setGrupp(e.target.value)} placeholder="t.ex. 4A" />
        <Button className="h-12 w-full" disabled={!personalId || sparar} loading={sparar} onClick={spara}>Spara pass</Button>
      </div>
    </Panel>
  );
}
