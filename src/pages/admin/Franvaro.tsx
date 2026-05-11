import { useEffect, useMemo, useState } from 'react';
import { frånvaroApi, personalApi, passApi, historikApi, vikariApi } from '../../lib/api';
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
  const startMin = 8 * 60;
  const slutMin = 17 * 60;
  const totalMin = slutMin - startMin;
  const datum = [...new Set(rader.map((r) => r.datum).filter(Boolean))] as string[];
  const layout = byggLayout(rader);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Välj vilka lektioner som behöver vikarie. Appen skapar ett sammanhållet pass per dag.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={markeraAlla}>Alla</Button>
          <Button size="sm" variant="secondary" onClick={avmarkeraAlla}>Ingen</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="min-w-[760px]">
          <div
            className="grid border-b text-xs font-medium"
            style={{ gridTemplateColumns: `64px repeat(${datum.length}, minmax(190px, 1fr))`, borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <div className="px-3 py-3">Tid</div>
            {datum.map((d) => (
              <div key={d} className="border-l px-3 py-3" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                {kortDatum(d)}
              </div>
            ))}
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: `64px repeat(${datum.length}, minmax(190px, 1fr))` }}
          >
            <div className="relative h-[500px] border-r" style={{ borderColor: 'var(--border)' }}>
              {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 px-2 text-xs"
                  style={{ top: `${((h * 60 - startMin) / totalMin) * 100}%`, color: 'var(--text-muted)' }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {datum.map((d) => (
              <div key={d} className="relative h-[500px] border-r last:border-r-0" style={{ borderColor: 'var(--border)' }}>
                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t"
                    style={{ top: `${((h * 60 - startMin) / totalMin) * 100}%`, borderColor: 'var(--border)', opacity: 0.55 }}
                  />
                ))}

                {rader.filter((r) => r.datum === d).map((rad) => {
                  const från = Math.max(minuter(rad.tid_från), startMin);
                  const till = Math.min(minuter(rad.tid_till), slutMin);
                  const top = ((från - startMin) / totalMin) * 100;
                  const height = Math.max(((till - från) / totalMin) * 100, 6);
                  const vald = valda.has(rad.id);
                  const lane = layout.get(rad.id) ?? { index: 0, antal: 1 };
                  const width = 100 / lane.antal;
                  const left = lane.index * width;

                  return (
                    <button
                      key={rad.id}
                      onClick={() => växla(rad.id)}
                      className="absolute overflow-hidden rounded-md border px-2 py-1 text-left text-xs transition hover:shadow-sm"
                      style={{
                        top: `${top}%`,
                        height: `${height}%`,
                        left: `calc(${left}% + 4px)`,
                        width: `calc(${width}% - 8px)`,
                        background: vald ? 'color-mix(in srgb, var(--accent) 22%, var(--bg-card))' : 'var(--bg-card)',
                        borderColor: vald ? 'var(--accent)' : 'var(--border)',
                        color: 'var(--text)',
                      }}
                      title={`${tid(rad.tid_från)}-${tid(rad.tid_till)} ${rad.ämne ?? ''} ${rad.grupp ?? ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold">{tid(rad.tid_från)}</span>
                        <span
                          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: vald ? 'var(--accent)' : 'var(--text-subtle)' }}
                        />
                      </div>
                      <div className="mt-1 truncate font-medium">{rad.ämne || 'Lektion'}</div>
                      <div className="truncate" style={{ color: 'var(--text-muted)' }}>{rad.grupp || '-'}</div>
                      {rad.sal && <div className="truncate" style={{ color: 'var(--text-subtle)' }}>Sal {rad.sal}</div>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {valda.size} av {rader.length} lektioner valda
        </p>
      </div>
    </div>
  );
}

function FrånvaroModal({
  öppen, onStäng, personal, vikarier, valtPersonalId, onRegistrerad,
}: {
  öppen: boolean;
  onStäng: () => void;
  personal: Personal[];
  vikarier: Vikarie[];
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

  useEffect(() => {
    if (!öppen) return;
    setPersonalId(valtPersonalId ?? '');
    setDatumFrån(datumIdag());
    setDatumTill(datumIdag());
    setHelDag(true);
    setSteg('formulär');
    setFel('');
    setSchemarader([]);
    setValda(new Set());
    setValdVikarieId('');
  }, [öppen, valtPersonalId]);

  async function registreraFrånvaro() {
    if (!personalId) { setFel('Sök eller välj person.'); return; }
    if (datumTill < datumFrån) { setFel('Slutdatum kan inte vara före startdatum.'); return; }

    setLaddar(true);
    setFel('');

    const res = await frånvaroApi.skapa({
      personal_id: personalId,
      datum_från: datumFrån,
      datum_till: datumTill,
      hel_dag: helDag,
      tid_från: helDag ? null : tidFrån,
      tid_till: helDag ? null : tidTill,
      orsak: orsak || null,
      anteckning: anteckning || null,
      skapad_av: null,
    });

    setLaddar(false);

    if (res.error) { setFel(res.error.message); return; }
    setSkapadFrånvaro(res.data as Frånvaro);

    const sRes = await frånvaroApi.hämtaSchemaraderFörFrånvaro(personalId, datumFrån, datumTill);
    const rader = sorteraOchRensaSchemarader((sRes.data ?? []) as Schemarad[]);
    setSchemarader(rader);
    setValda(new Set(rader.map((r) => r.id)));
    setSteg('pass');
  }

  async function skapaVikariepass() {
    if (!skapadFrånvaro) return;
    setSkaparPass(true);

    const valdaRader = schemarader
      .filter((r) => valda.has(r.id))
      .sort((a, b) =>
        String(a.datum).localeCompare(String(b.datum)) ||
        minuter(a.tid_från) - minuter(b.tid_från) ||
        minuter(a.tid_till) - minuter(b.tid_till)
      );

    if (valdaRader.length > 0) {
      const raderPerDatum = new Map<string, Schemarad[]>();

      for (const rad of valdaRader) {
        if (!rad.datum) continue;
        raderPerDatum.set(rad.datum, [...(raderPerDatum.get(rad.datum) ?? []), rad]);
      }

      for (const [datum, dagensRader] of raderPerDatum) {
        const sorterade = [...dagensRader].sort((a, b) =>
          minuter(a.tid_från) - minuter(b.tid_från) ||
          minuter(a.tid_till) - minuter(b.tid_till)
        );

        const första = sorterade[0];
        const sista = sorterade.reduce((senast, rad) =>
          minuter(rad.tid_till) > minuter(senast.tid_till) ? rad : senast
        , sorterade[0]);

        const ämnen = [...new Set(sorterade.map((r) => r.ämne).filter(Boolean))] as string[];
        const grupper = [...new Set(sorterade.map((r) => r.grupp).filter(Boolean))] as string[];
        const salar = [...new Set(sorterade.map((r) => r.sal).filter(Boolean))] as string[];

        const lektionslista = sorterade
          .map((rad) => `${tid(rad.tid_från)}-${tid(rad.tid_till)} ${rad.ämne ?? 'Lektion'}${rad.grupp ? ` · ${rad.grupp}` : ''}${rad.sal ? ` · ${rad.sal}` : ''}`)
          .join('\n');

        const res = await passApi.skapa({
          frånvaro_id: skapadFrånvaro.id,
          schemarad_id: sorterade.length === 1 ? sorterade[0].id : null,
          personal_id: personalId,
          vikarie_id: valdVikarieId || null,
          datum,
          tid_från: första.tid_från!,
          tid_till: sista.tid_till!,
          typ: 'del_av_dag',
          ämne: ämnen.length === 1 ? ämnen[0] : `${sorterade.length} lektioner`,
          grupp: grupper.length <= 3 ? grupper.join(', ') || null : `${grupper.length} grupper`,
          sal: salar.length === 1 ? salar[0] : null,
          anteckning: `Sammanhållet pass från ${sorterade.length} lektioner:\n${lektionslista}`,
          riktad_till_vikarie_id: null,
          status: valdVikarieId ? 'bokat' : 'obokat',
          skapad_av: null,
        });

        if (res.data) {
          await historikApi.skapa(res.data.id, 'pass_skapat');
          if (valdVikarieId) await historikApi.skapa(res.data.id, 'vikarie_bokat', { vikarie_id: valdVikarieId });
        }
      }
    } else {
      const res = await passApi.skapa({
        frånvaro_id: skapadFrånvaro.id,
        schemarad_id: null,
        personal_id: personalId,
        vikarie_id: valdVikarieId || null,
        datum: datumFrån,
        tid_från: helDag ? '08:00' : tidFrån,
        tid_till: helDag ? '17:00' : tidTill,
        typ: helDag ? 'hel_dag' : 'del_av_dag',
        ämne: null,
        grupp: null,
        sal: null,
        anteckning: null,
        riktad_till_vikarie_id: null,
        status: valdVikarieId ? 'bokat' : 'obokat',
        skapad_av: null,
      });
      if (res.data) {
        await historikApi.skapa(res.data.id, 'pass_skapat');
        if (valdVikarieId) await historikApi.skapa(res.data.id, 'vikarie_bokat', { vikarie_id: valdVikarieId });
      }
    }

    setSkaparPass(false);
    onRegistrerad();
    onStäng();
  }

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

          {schemarader.length > 0 ? (
            <SchemaVal rader={schemarader} valda={valda} setValda={setValda} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Inga schemarader hittades. Ett förenklat vikariepass skapas baserat på frånvarotiden.
            </p>
          )}


          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <Select
              label="Vikarie, valfritt"
              value={valdVikarieId}
              onChange={(e) => setValdVikarieId(e.target.value)}
            >
              <option value="">Ingen vald ännu</option>
              {vikarier.map((vikarie) => (
                <option key={vikarie.id} value={vikarie.id}>{vikarie.namn}</option>
              ))}
            </Select>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Välj en vikarie här om du redan vet vem som ska ta passet. Annars kan du bemanna senare.
            </p>
          </div>

          <div
            className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t px-6 py-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <Button variant="secondary" onClick={onStäng}>Spara utan vikarie</Button>
            <Button loading={skaparPass} onClick={skapaVikariepass}>
              Skapa vikariepass
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
