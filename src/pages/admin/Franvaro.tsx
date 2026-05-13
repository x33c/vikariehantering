import { useEffect, useMemo, useState } from 'react';
import { frånvaroApi, personalApi, passApi, historikApi, vikariApi, notisApi } from '../../lib/api';
import type { Frånvaro, Personal, Schemarad, Vikarie } from '../../types';
import {
  Button, Input, Select, Textarea, Modal, Confirm, TomtTillstånd, LaddaSida, Alert
} from '../../components/ui';

function datumIdag() {
  return new Date().toISOString().slice(0, 10);
}

function tid(tid?: string | null) {
  return tid?.slice(0, 5) ?? '';
}

function minuter(tid?: string | null) {
  const [h, m] = (tid?.slice(0, 5) ?? '00:00').split(':').map(Number);
  return h * 60 + m;
}

function kortDatum(datum: string) {
  return new Date(datum).toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  });
}

function datumÖverlappar(startA: string, slutA: string, startB: string, slutB: string) {
  return startA <= slutB && slutA >= startB;
}

function unikNyckel(rad: Schemarad) {
  return [
    rad.datum,
    rad.tid_från,
    rad.tid_till,
    rad.ämne,
    rad.grupp,
    rad.sal,
    rad.signatur,
  ].join('|');
}

function sorteraOchRensaSchemarader(rader: Schemarad[]) {
  const sedda = new Set<string>();

  return [...rader]
    .filter((rad) => {
      const nyckel = unikNyckel(rad);
      if (sedda.has(nyckel)) return false;
      sedda.add(nyckel);
      return true;
    })
    .sort((a, b) =>
      String(a.datum).localeCompare(String(b.datum)) ||
      minuter(a.tid_från) - minuter(b.tid_från) ||
      minuter(a.tid_till) - minuter(b.tid_till) ||
      String(a.grupp ?? '').localeCompare(String(b.grupp ?? ''))
    );
}

function byggLayout(rader: Schemarad[]) {
  const grupper = new Map<string, Schemarad[]>();

  for (const rad of rader) {
    const nyckel = `${rad.datum}|${rad.tid_från}|${rad.tid_till}`;
    grupper.set(nyckel, [...(grupper.get(nyckel) ?? []), rad]);
  }

  const layout = new Map<string, { index: number; antal: number }>();
  for (const grupp of grupper.values()) {
    grupp.forEach((rad, index) => layout.set(rad.id, { index, antal: grupp.length }));
  }

  return layout;
}

function SchemaVal({
  rader,
  valda,
  setValda,
}: {
  rader: Schemarad[];
  valda: Set<string>;
  setValda: (valda: Set<string>) => void;
}) {
  const sorterade = [...rader].sort((a, b) =>
    String(a.datum).localeCompare(String(b.datum)) ||
    minuter(a.tid_från) - minuter(b.tid_från) ||
    minuter(a.tid_till) - minuter(b.tid_till)
  );

  const valdaRader = sorterade.filter((rad) => valda.has(rad.id));
  const första = valdaRader[0];
  const sista = valdaRader.reduce((senast, rad) =>
    minuter(rad.tid_till) > minuter(senast.tid_till) ? rad : senast
  , valdaRader[0] ?? valdaRader[0]);

  function växla(id: string) {
    const ny = new Set(valda);
    ny.has(id) ? ny.delete(id) : ny.add(id);
    setValda(ny);
  }

  function markeraAlla() {
    setValda(new Set(rader.map((r) => r.id)));
  }

  function avmarkeraAlla() {
    setValda(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {valda.size === 0
            ? 'Inga lektioner valda'
            : `${valda.size} lektioner blir 1 sammanhållet vikariepass`}
        </p>
        {valda.size > 0 && första && sista && (
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {kortDatum(första.datum!)} · {tid(första.tid_från)}-{tid(sista.tid_till)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={markeraAlla}>Ta med alla</Button>
        <Button size="sm" variant="secondary" onClick={avmarkeraAlla}>Ta bort alla</Button>
      </div>

      <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1 pb-20">
        {sorterade.map((rad) => {
          const vald = valda.has(rad.id);

          return (
            <button
              key={rad.id}
              type="button"
              onClick={() => växla(rad.id)}
              className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:shadow-sm"
              style={{
                background: vald ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-card))' : 'var(--bg-card)',
                borderColor: vald ? 'var(--accent)' : 'var(--border)',
                color: 'var(--text)',
              }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                style={{
                  background: vald ? 'var(--accent)' : 'transparent',
                  borderColor: vald ? 'var(--accent)' : 'var(--border)',
                  color: vald ? '#fff' : 'var(--text-muted)',
                }}
              >
                {vald ? '✓' : ''}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {tid(rad.tid_från)}-{tid(rad.tid_till)}
                </p>
                <p className="mt-0.5 text-sm leading-tight" style={{ color: 'var(--text-muted)' }}>
                  {[rad.ämne || 'Lektion', rad.grupp, rad.sal ? `Sal ${rad.sal}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FrånvaroModal({
  öppen, onStäng, personal, vikarier, frånvaron, valtPersonalId, onRegistrerad,
}: {
  öppen: boolean;
  onStäng: () => void;
  personal: Personal[];
  vikarier: Vikarie[];
  frånvaron: Frånvaro[];
  valtPersonalId?: string;
  onRegistrerad: () => void;
}) {
  const [personalId, setPersonalId] = useState(valtPersonalId ?? '');
  const [datumFrån, setDatumFrån] = useState(datumIdag());
  const [datumTill, setDatumTill] = useState(datumIdag());
  const [helDag, setHelDag] = useState(true);
  const [tidFrån, setTidFrån] = useState('08:00');
  const [tidTill, setTidTill] = useState('17:00');
  const [orsak, setOrsak] = useState('');
  const [anteckning, setAnteckning] = useState('');
  const [steg, setSteg] = useState<'formulär' | 'pass'>('formulär');
  const [schemarader, setSchemarader] = useState<Schemarad[]>([]);
  const [skapadFrånvaro, setSkapadFrånvaro] = useState<Frånvaro | null>(null);
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [valdVikarieId, setValdVikarieId] = useState('');
  const [laddar, setLaddar] = useState(false);
  const [skaparPass, setSkaparPass] = useState(false);
  const [fel, setFel] = useState('');


  return (
    <Modal öppen={öppen} onStäng={onStäng} titel="Ny frånvaro" bredd="xl">
      {steg === 'formulär' ? (
        <div className="space-y-4">
          {fel && <Alert typ="error">{fel}</Alert>}
          <Select label="Vem är frånvarande? *" value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
            <option value="">Sök eller välj person</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>{p.namn} {p.arbetslag ? `(${p.arbetslag.namn})` : ''}</option>
            ))}
          </Select>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Första dag *" type="date" value={datumFrån} onChange={(e) => setDatumFrån(e.target.value)} />
            <Input label="Sista dag *" type="date" value={datumTill} onChange={(e) => setDatumTill(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
            <input type="checkbox" checked={helDag} onChange={(e) => setHelDag(e.target.checked)} className="h-4 w-4 rounded" />
            Heldag
          </label>
          {!helDag && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Från" type="time" value={tidFrån} onChange={(e) => setTidFrån(e.target.value)} />
              <Input label="Till" type="time" value={tidTill} onChange={(e) => setTidTill(e.target.value)} />
            </div>
          )}
          <Input label="Orsak, valfritt" value={orsak} onChange={(e) => setOrsak(e.target.value)} placeholder="Sjukdom, VAB..." />
          <Textarea label="Anteckning, valfritt" value={anteckning} onChange={(e) => setAnteckning(e.target.value)} rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
            <Button loading={laddar} onClick={registreraFrånvaro}>Fortsätt</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert typ="success">Frånvaron är sparad.</Alert>

          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <Select
              label="Vem ska vikariera?"
              value={valdVikarieId}
              onChange={(e) => setValdVikarieId(e.target.value)}
            >
              <option value="">Välj senare</option>
              {vikarier.map((vikarie) => (
                <option key={vikarie.id} value={vikarie.id}>{vikarie.namn}</option>
              ))}
            </Select>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Om du väljer vikarie nu skickas en förfrågan. Passet markeras som tillfrågat tills vikarien svarar.
            </p>
          </div>

          {schemarader.length > 0 ? (
            <SchemaVal rader={schemarader} valda={valda} setValda={setValda} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Inga schemarader hittades. Ett förenklat vikariepass skapas baserat på frånvarotiden.
            </p>
          )}



          <div
            className="sticky bottom-0 -mx-6 flex flex-wrap justify-end gap-2 border-t px-6 py-4 shadow-lg"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <Button variant="secondary" onClick={() => { onRegistrerad(); onStäng(); }}>Spara utan vikarie</Button>
            <Button loading={skaparPass} onClick={skapaVikariepass}>
              {valdVikarieId ? 'Skicka förfrågan' : 'Skapa pass för bemanning'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Franvaro() {
  const [frånvaron, setFrånvaron] = useState<Frånvaro[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [modal, setModal] = useState<{ öppen: boolean; personalId?: string }>({ öppen: false });
  const [raderaId, setRaderaId] = useState<string | null>(null);
  const [sök, setSök] = useState('');

  useEffect(() => { ladda(); }, []);

  async function ladda() {
    const [fRes, pRes, vRes] = await Promise.all([
      frånvaroApi.lista(),
      personalApi.lista(),
      vikariApi.lista(),
    ]);
    setFrånvaron((fRes.data ?? []) as Frånvaro[]);
    setPersonal((pRes.data ?? []) as Personal[]);
    setVikarier((vRes.data ?? []) as Vikarie[]);
    setLaddar(false);
  }

  const filtrerade = sök
    ? frånvaron.filter((f) => f.personal?.namn.toLowerCase().includes(sök.toLowerCase()))
    : frånvaron;

  if (laddar) return <LaddaSida />;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Bemanning
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--text)' }}>
            Frånvaro
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Lägg in frånvaro och välj vid behov vilka lektioner som behöver vikarie.
          </p>
        </div>
        <Button onClick={() => setModal({ öppen: true })}>Ny frånvaro</Button>
      </div>

      <input
        type="search"
        placeholder="Sök person"
        value={sök}
        onChange={(e) => setSök(e.target.value)}
        className="mb-4 w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
      />

      {filtrerade.length === 0 ? (
        <TomtTillstånd text="Ingen frånvaro ännu." åtgärd={
          <Button size="sm" onClick={() => setModal({ öppen: true })}>Ny frånvaro</Button>
        } />
      ) : (
        <div className="overflow-hidden rounded-lg border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs" style={{ background: 'var(--hover)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <th className="px-4 py-3 text-left font-medium">Personal</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Arbetslag</th>
                <th className="px-4 py-3 text-left font-medium">Datum</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">Typ</th>
                <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Orsak, valfritt</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrerade.map((f) => (
                <tr key={f.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{f.personal?.namn ?? '-'}</td>
                  <td className="hidden px-4 py-3 md:table-cell" style={{ color: 'var(--text-muted)' }}>{f.personal?.arbetslag?.namn ?? '-'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{f.datum_från} - {f.datum_till}</td>
                  <td className="hidden px-4 py-3 sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                    {f.hel_dag ? 'Heldag' : `${tid(f.tid_från)}-${tid(f.tid_till)}`}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell" style={{ color: 'var(--text-muted)' }}>{f.orsak ?? '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setRaderaId(f.id)} className="rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ color: 'var(--danger)' }}>
                      Ta bort
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FrånvaroModal
        öppen={modal.öppen}
        onStäng={() => setModal({ öppen: false })}
        personal={personal}
        vikarier={vikarier}
        frånvaron={frånvaron}
        valtPersonalId={modal.personalId}
        onRegistrerad={ladda}
      />

      <Confirm
        öppen={!!raderaId}
        titel="Ta bort"
        text="Ta bort frånvaron? Kopplade vikariepass påverkas inte."
        bekräftaText="Ta bort"
        farlig
        onBekräfta={async () => {
          if (!raderaId) return;
          await frånvaroApi.radera(raderaId);
          setFrånvaron((prev) => prev.filter((f) => f.id !== raderaId));
          setRaderaId(null);
        }}
        onAvbryt={() => setRaderaId(null)}
      />
    </div>
  );
}
