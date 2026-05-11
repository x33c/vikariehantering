import { useEffect, useMemo, useState } from 'react';
import { arbetslagApi, personalApi } from '../../lib/api';
import type { Arbetslag, Personal, NyArbetslag, NyPersonal } from '../../types';
import {
  Button, Input, Select, Modal, Confirm, TomtTillstånd, LaddaSida, Alert
} from '../../components/ui';

function PersonalModal({
  öppen, onStäng, personal, arbetslag, onSparad,
}: {
  öppen: boolean;
  onStäng: () => void;
  personal?: Personal;
  arbetslag: Arbetslag[];
  onSparad: (p: Personal) => void;
}) {
  const [form, setForm] = useState<NyPersonal>({
    namn: personal?.namn ?? '',
    epost: personal?.epost ?? '',
    telefon: personal?.telefon ?? '',
    signatur: personal?.signatur ?? '',
    skola24_id: personal?.skola24_id ?? '',
    titel: personal?.titel ?? '',
    arbetslag_id: personal?.arbetslag_id ?? null,
    aktiv: personal?.aktiv ?? true,
  });
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (!öppen) return;
    setForm({
      namn: personal?.namn ?? '',
      epost: personal?.epost ?? '',
      telefon: personal?.telefon ?? '',
      signatur: personal?.signatur ?? '',
      skola24_id: personal?.skola24_id ?? '',
      titel: personal?.titel ?? '',
      arbetslag_id: personal?.arbetslag_id ?? null,
      aktiv: personal?.aktiv ?? true,
    });
    setFel('');
  }, [öppen, personal]);

  async function spara() {
    if (!form.namn.trim()) {
      setFel('Namn krävs.');
      return;
    }

    setLaddar(true);
    setFel('');

    const res = personal
      ? await personalApi.uppdatera(personal.id, form)
      : await personalApi.skapa(form);

    setLaddar(false);

    if (res.error) {
      setFel(res.error.message);
      return;
    }

    onSparad(res.data as Personal);
    onStäng();
  }

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel={personal ? 'Redigera personal' : 'Lägg till personal'}>
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}
        <Input label="Namn *" value={form.namn} onChange={(e) => setForm({ ...form, namn: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="E-post" type="email" value={form.epost ?? ''} onChange={(e) => setForm({ ...form, epost: e.target.value })} />
          <Input label="Telefon" value={form.telefon ?? ''} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Signatur" value={form.signatur ?? ''} onChange={(e) => setForm({ ...form, signatur: e.target.value })} />
          <Input label="Skola24-ID" value={form.skola24_id ?? ''} onChange={(e) => setForm({ ...form, skola24_id: e.target.value })} />
        </div>
        <Input label="Titel/roll" value={form.titel ?? ''} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
        <Select
          label="Arbetslag"
          value={form.arbetslag_id ?? ''}
          onChange={(e) => setForm({ ...form, arbetslag_id: e.target.value || null })}
        >
          <option value="">Inget arbetslag</option>
          {arbetslag.map((a) => <option key={a.id} value={a.id}>{a.namn}</option>)}
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
          <Button loading={laddar} onClick={spara}>Spara</Button>
        </div>
      </div>
    </Modal>
  );
}

function ArbetslagModal({
  öppen, onStäng, arbetslag, onSparad,
}: {
  öppen: boolean;
  onStäng: () => void;
  arbetslag?: Arbetslag;
  onSparad: (a: Arbetslag) => void;
}) {
  const [form, setForm] = useState<NyArbetslag>({
    namn: arbetslag?.namn ?? '',
    beskrivning: arbetslag?.beskrivning ?? '',
    färg: arbetslag?.färg ?? '#0f766e',
    aktiv: true,
  });
  const [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (!öppen) return;
    setForm({
      namn: arbetslag?.namn ?? '',
      beskrivning: arbetslag?.beskrivning ?? '',
      färg: arbetslag?.färg ?? '#0f766e',
      aktiv: true,
    });
    setFel('');
  }, [öppen, arbetslag]);

  async function spara() {
    if (!form.namn.trim()) {
      setFel('Namn krävs.');
      return;
    }

    setLaddar(true);
    const res = arbetslag
      ? await arbetslagApi.uppdatera(arbetslag.id, form)
      : await arbetslagApi.skapa(form);
    setLaddar(false);

    if (res.error) {
      setFel(res.error.message);
      return;
    }

    onSparad(res.data as Arbetslag);
    onStäng();
  }

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel={arbetslag ? 'Redigera arbetslag' : 'Nytt arbetslag'} bredd="sm">
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}
        <Input label="Namn *" value={form.namn} onChange={(e) => setForm({ ...form, namn: e.target.value })} />
        <Input label="Beskrivning" value={form.beskrivning ?? ''} onChange={(e) => setForm({ ...form, beskrivning: e.target.value })} />
        <label className="flex items-center gap-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
          Färg
          <input
            type="color"
            value={form.färg ?? '#0f766e'}
            onChange={(e) => setForm({ ...form, färg: e.target.value })}
            className="h-9 w-14 cursor-pointer rounded border"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
          <Button loading={laddar} onClick={spara}>Spara</Button>
        </div>
      </div>
    </Modal>
  );
}

function PersonalTabell({
  rader,
  markeradeIds,
  onMarkera,
  onMarkeraAlla,
  onRedigera,
  onRadera,
}: {
  rader: Personal[];
  markeradeIds: Set<string>;
  onMarkera: (id: string, markerad: boolean) => void;
  onMarkeraAlla: (rader: Personal[], markerad: boolean) => void;
  onRedigera: (p: Personal) => void;
  onRadera: (p: Personal) => void;
}) {
  const allaMarkerade = rader.length > 0 && rader.every((p) => markeradeIds.has(p.id));

  return (
    <div className="overflow-hidden rounded-lg border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs" style={{ background: 'var(--hover)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <th className="w-11 px-4 py-3">
              <input
                type="checkbox"
                checked={allaMarkerade}
                onChange={(e) => onMarkeraAlla(rader, e.target.checked)}
                className="h-4 w-4 rounded"
                aria-label="Markera alla"
              />
            </th>
            <th className="px-4 py-3 text-left font-medium">Namn</th>
            <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Titel</th>
            <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Signatur</th>
            <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">E-post</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rader.map((person) => (
            <tr key={person.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={markeradeIds.has(person.id)}
                  onChange={(e) => onMarkera(person.id, e.target.checked)}
                  className="h-4 w-4 rounded"
                  aria-label={`Markera ${person.namn}`}
                />
              </td>
              <td className="px-4 py-3">
                <p className="font-medium" style={{ color: 'var(--text)' }}>{person.namn}</p>
                <p className="mt-0.5 text-xs sm:hidden" style={{ color: 'var(--text-muted)' }}>
                  {person.signatur || person.titel || 'Ingen signatur'}
                </p>
              </td>
              <td className="hidden px-4 py-3 sm:table-cell" style={{ color: 'var(--text-muted)' }}>{person.titel ?? '-'}</td>
              <td className="hidden px-4 py-3 font-mono text-xs md:table-cell" style={{ color: 'var(--text-muted)' }}>{person.signatur ?? '-'}</td>
              <td className="hidden px-4 py-3 lg:table-cell" style={{ color: 'var(--text-muted)' }}>{person.epost ?? '-'}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <button onClick={() => onRedigera(person)} className="rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Redigera
                  </button>
                  <button onClick={() => onRadera(person)} className="rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ color: 'var(--danger)' }}>
                    Ta bort
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Arbetslag() {
  const [arbetslag, setArbetslag] = useState<Arbetslag[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [sök, setSök] = useState('');
  const [arbetslagFilter, setArbetslagFilter] = useState('');

  const [arbetslagModal, setArbetslagModal] = useState<{ öppen: boolean; rad?: Arbetslag }>({ öppen: false });
  const [personalModal, setPersonalModal] = useState<{ öppen: boolean; rad?: Personal }>({ öppen: false });
  const [raderaPersonal, setRaderaPersonal] = useState<Personal | null>(null);
  const [raderaMarkerade, setRaderaMarkerade] = useState(false);
  const [markeradeIds, setMarkeradeIds] = useState<Set<string>>(new Set());
  const [raderaArbetslag, setRaderaArbetslag] = useState<Arbetslag | null>(null);

  useEffect(() => {
    async function ladda() {
      const [aRes, pRes] = await Promise.all([arbetslagApi.lista(), personalApi.lista()]);
      setArbetslag((aRes.data ?? []) as Arbetslag[]);
      setPersonal((pRes.data ?? []) as Personal[]);
      setLaddar(false);
    }
    ladda();
  }, []);

  const filtreradPersonal = useMemo(() => {
    const term = sök.trim().toLowerCase();

    return personal.filter((p) => {
      const matcharSök = !term ||
        p.namn.toLowerCase().includes(term) ||
        p.signatur?.toLowerCase().includes(term) ||
        p.epost?.toLowerCase().includes(term);

      const matcharArbetslag =
        !arbetslagFilter ||
        (arbetslagFilter === 'utan' ? !p.arbetslag_id : p.arbetslag_id === arbetslagFilter);

      return matcharSök && matcharArbetslag;
    });
  }, [personal, sök, arbetslagFilter]);

  const grupper = useMemo(() => {
    const resultat = arbetslag.map((a) => ({
      arbetslag: a,
      rader: filtreradPersonal.filter((p) => p.arbetslag_id === a.id),
    }));

    const utanArbetslag = filtreradPersonal.filter((p) => !p.arbetslag_id);
    if (utanArbetslag.length > 0) {
      resultat.push({ arbetslag: null as unknown as Arbetslag, rader: utanArbetslag });
    }

    return resultat.filter((g) => g.rader.length > 0);
  }, [arbetslag, filtreradPersonal]);

  function markera(id: string, markerad: boolean) {
    setMarkeradeIds((prev) => {
      const ny = new Set(prev);
      markerad ? ny.add(id) : ny.delete(id);
      return ny;
    });
  }

  function markeraAlla(rader: Personal[], markerad: boolean) {
    setMarkeradeIds((prev) => {
      const ny = new Set(prev);
      rader.forEach((p) => markerad ? ny.add(p.id) : ny.delete(p.id));
      return ny;
    });
  }

  async function bekräftaRaderaMarkerade() {
    const ids = [...markeradeIds];
    if (ids.length === 0) return;

    await personalApi.raderaMånga(ids);
    setPersonal((prev) => prev.filter((p) => !markeradeIds.has(p.id)));
    setMarkeradeIds(new Set());
    setRaderaMarkerade(false);
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Register
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Personal
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {personal.length} aktiva personer i {arbetslag.length} arbetslag.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setArbetslagModal({ öppen: true })}>
            Nytt arbetslag
          </Button>
          <Button onClick={() => setPersonalModal({ öppen: true })}>
            Lägg till personal
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_240px_auto]">
        <input
          type="search"
          placeholder="Sök namn, signatur eller e-post"
          value={sök}
          onChange={(e) => setSök(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        />
        <select
          value={arbetslagFilter}
          onChange={(e) => setArbetslagFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Alla arbetslag</option>
          <option value="utan">Utan arbetslag</option>
          {arbetslag.map((a) => <option key={a.id} value={a.id}>{a.namn}</option>)}
        </select>
        {markeradeIds.size > 0 && (
          <Button variant="danger" onClick={() => setRaderaMarkerade(true)}>
            Ta bort {markeradeIds.size} valda
          </Button>
        )}
      </div>

      {markeradeIds.size > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            {markeradeIds.size} personer markerade.
          </p>
          <button onClick={() => setMarkeradeIds(new Set())} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
            Avmarkera alla
          </button>
        </div>
      )}

      {filtreradPersonal.length === 0 ? (
        <TomtTillstånd text="Ingen personal matchade filtret." />
      ) : sök || arbetslagFilter ? (
        <PersonalTabell
          rader={filtreradPersonal}
          markeradeIds={markeradeIds}
          onMarkera={markera}
          onMarkeraAlla={markeraAlla}
          onRedigera={(p) => setPersonalModal({ öppen: true, rad: p })}
          onRadera={setRaderaPersonal}
        />
      ) : (
        <div className="space-y-7">
          {grupper.map((grupp) => (
            <section key={grupp.arbetslag?.id ?? 'utan'}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {grupp.arbetslag && (
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: grupp.arbetslag.färg }} />
                  )}
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {grupp.arbetslag?.namn ?? 'Utan arbetslag'}
                  </h2>
                  <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                    {grupp.rader.length}
                  </span>
                </div>

                {grupp.arbetslag && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setArbetslagModal({ öppen: true, rad: grupp.arbetslag })}>
                      Redigera
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRaderaArbetslag(grupp.arbetslag)}>
                      Ta bort
                    </Button>
                  </div>
                )}
              </div>

              <PersonalTabell
                rader={grupp.rader}
                markeradeIds={markeradeIds}
                onMarkera={markera}
                onMarkeraAlla={markeraAlla}
                onRedigera={(p) => setPersonalModal({ öppen: true, rad: p })}
                onRadera={setRaderaPersonal}
              />
            </section>
          ))}
        </div>
      )}

      <ArbetslagModal
        öppen={arbetslagModal.öppen}
        onStäng={() => setArbetslagModal({ öppen: false })}
        arbetslag={arbetslagModal.rad}
        onSparad={(a) => {
          setArbetslag((prev) => arbetslagModal.rad ? prev.map((x) => (x.id === a.id ? a : x)) : [...prev, a]);
        }}
      />

      <PersonalModal
        öppen={personalModal.öppen}
        onStäng={() => setPersonalModal({ öppen: false })}
        personal={personalModal.rad}
        arbetslag={arbetslag}
        onSparad={(p) => {
          setPersonal((prev) => personalModal.rad ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]);
        }}
      />

      <Confirm
        öppen={!!raderaPersonal}
        titel="Ta bort personal"
        text={`Ta bort ${raderaPersonal?.namn}? Registrerade frånvaron och pass påverkas inte.`}
        bekräftaText="Ta bort"
        farlig
        onBekräfta={async () => {
          if (!raderaPersonal) return;
          await personalApi.radera(raderaPersonal.id);
          setPersonal((prev) => prev.filter((p) => p.id !== raderaPersonal.id));
          markera(raderaPersonal.id, false);
          setRaderaPersonal(null);
        }}
        onAvbryt={() => setRaderaPersonal(null)}
      />

      <Confirm
        öppen={raderaMarkerade}
        titel="Ta bort markerade"
        text={`Ta bort ${markeradeIds.size} markerade personer? Registrerade frånvaron och pass påverkas inte.`}
        bekräftaText="Ta bort markerade"
        farlig
        onBekräfta={bekräftaRaderaMarkerade}
        onAvbryt={() => setRaderaMarkerade(false)}
      />

      <Confirm
        öppen={!!raderaArbetslag}
        titel="Ta bort arbetslag"
        text={`Ta bort ${raderaArbetslag?.namn}? Personal tas inte bort.`}
        bekräftaText="Ta bort"
        farlig
        onBekräfta={async () => {
          if (!raderaArbetslag) return;
          await arbetslagApi.radera(raderaArbetslag.id);
          setArbetslag((prev) => prev.filter((a) => a.id !== raderaArbetslag.id));
          setRaderaArbetslag(null);
        }}
        onAvbryt={() => setRaderaArbetslag(null)}
      />
    </div>
  );
}
