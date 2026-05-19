import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { frånvaroApi, personalApi, passApi, historikApi, vikariApi, notisApi } from '../../lib/api';
import type { Frånvaro, Personal, Schemarad, Vikarie, Vikariepass } from '../../types';
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

function isoDatum(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function startPåVecka(datum: string) {
  const d = new Date(`${datum}T12:00:00`);
  const dagIndex = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dagIndex);
  return isoDatum(d);
}

function läggTillDagar(datum: string, dagar: number) {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + dagar);
  return isoDatum(d);
}

function veckonummer(datum: string) {
  const d = new Date(`${datum}T12:00:00`);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);

  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function frånvaroTäckerDatum(frånvaro: Frånvaro, datum: string) {
  return frånvaro.datum_från <= datum && frånvaro.datum_till >= datum;
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

function datumIntervall(start: string, slut: string) {
  const datum: string[] = [];
  const aktuell = new Date(`${start}T12:00:00`);
  const sista = new Date(`${slut}T12:00:00`);

  while (aktuell <= sista) {
    datum.push(aktuell.toISOString().slice(0, 10));
    aktuell.setDate(aktuell.getDate() + 1);
  }

  return datum;
}

function anteckningFörPass(frånvaro: Frånvaro) {
  return (frånvaro.anteckning ?? '')
    .split('\n')
    .filter(rad => rad.trim().toLowerCase() !== 'ingen vikarie behövs')
    .join('\n')
    .trim() || null;
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
  const [ingenVikarieBehövs, setIngenVikarieBehövs] = useState(false);
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
    setIngenVikarieBehövs(false);
    setSteg('formulär');
    setFel('');
    setSchemarader([]);
    setValda(new Set());
    setValdVikarieId('');
  }, [öppen, valtPersonalId]);

  async function registreraFrånvaro() {
    if (!personalId) { setFel('Sök eller välj person.'); return; }
    if (datumTill < datumFrån) { setFel('Slutdatum kan inte vara före startdatum.'); return; }

    const finnsRedan = frånvaron.find((frånvaro) =>
      frånvaro.personal_id === personalId &&
      datumÖverlappar(datumFrån, datumTill, frånvaro.datum_från, frånvaro.datum_till)
    );

    if (finnsRedan) {
      const namn = personal.find((p) => p.id === personalId)?.namn ?? 'Personen';
      setFel(`${namn} har redan frånvaro ${finnsRedan.datum_från} - ${finnsRedan.datum_till}. Ta bort eller ändra den först.`);
      return;
    }

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
      anteckning: [
        anteckning.trim() || null,
        ingenVikarieBehövs ? 'Ingen vikarie behövs' : null,
      ].filter(Boolean).join('\n') || null,
      skapad_av: null,
    });

    setLaddar(false);

    if (res.error) { setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message); return; }
    setSkapadFrånvaro(res.data as Frånvaro);

    if (ingenVikarieBehövs) {
      onRegistrerad();
      onStäng();
      return;
    }

    const sRes = await frånvaroApi.hämtaSchemaraderFörFrånvaro(personalId, datumFrån, datumTill);
    const rader = sorteraOchRensaSchemarader((sRes.data ?? []) as Schemarad[]);
    setSchemarader(rader);
    setValda(new Set(rader.map((r) => r.id)));
    setSteg('pass');
  }

  async function skapaVikariepass(läge: 'bemanning' | 'förfrågan' | 'direkt') {
    if (!skapadFrånvaro) return;
    if ((läge === 'förfrågan' || läge === 'direkt') && !valdVikarieId) {
      setFel('Välj vikarie först.');
      return;
    }

    const skickarFörfrågan = läge === 'förfrågan';
    const bokarDirekt = läge === 'direkt';
    setSkaparPass(true);
    setFel('');

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
          vikarie_id: bokarDirekt ? valdVikarieId : null,
          datum,
          tid_från: första.tid_från!,
          tid_till: sista.tid_till!,
          typ: 'del_av_dag',
          ämne: ämnen.length === 1 ? ämnen[0] : `${sorterade.length} lektioner`,
          grupp: grupper.length <= 3 ? grupper.join(', ') || null : `${grupper.length} grupper`,
          sal: salar.length === 1 ? salar[0] : null,
          anteckning: `Sammanhållet pass från ${sorterade.length} lektioner:\n${lektionslista}`,
          riktad_till_vikarie_id: skickarFörfrågan ? valdVikarieId : null,
          status: bokarDirekt ? 'bokat' : skickarFörfrågan ? 'notifierat' : 'obokat',
          skapad_av: null,
        });

        if (res.data) {
          await historikApi.skapa(res.data.id, 'pass_skapat');
          if (skickarFörfrågan) {
            await notisApi.skickaNotiser(res.data.id, [valdVikarieId]);
            await historikApi.skapa(res.data.id, 'vikarie_notifierat', { vikarie_id: valdVikarieId });
          }
          if (bokarDirekt) {
            await historikApi.skapa(res.data.id, 'vikarie_bokat', { vikarie_id: valdVikarieId, källa: 'frånvaro_boka_direkt' });
            await notisApi.skickaNotiser(res.data.id, [valdVikarieId]);
          }
        }
      }
    } else {
      const res = await passApi.skapa({
        frånvaro_id: skapadFrånvaro.id,
        schemarad_id: null,
        personal_id: personalId,
        vikarie_id: bokarDirekt ? valdVikarieId : null,
        datum: datumFrån,
        tid_från: helDag ? '08:00' : tidFrån,
        tid_till: helDag ? '17:00' : tidTill,
        typ: helDag ? 'hel_dag' : 'del_av_dag',
        ämne: null,
        grupp: null,
        sal: null,
        anteckning: null,
        riktad_till_vikarie_id: skickarFörfrågan ? valdVikarieId : null,
        status: bokarDirekt ? 'bokat' : skickarFörfrågan ? 'notifierat' : 'obokat',
        skapad_av: null,
      });
      if (res.data) {
        await historikApi.skapa(res.data.id, 'pass_skapat');
        if (skickarFörfrågan) {
          await notisApi.skickaNotiser(res.data.id, [valdVikarieId]);
          await historikApi.skapa(res.data.id, 'vikarie_notifierat', { vikarie_id: valdVikarieId });
        }
        if (bokarDirekt) {
          await historikApi.skapa(res.data.id, 'vikarie_bokat', { vikarie_id: valdVikarieId, källa: 'frånvaro_boka_direkt' });
          await notisApi.skickaNotiser(res.data.id, [valdVikarieId]);
        }
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
          <div className="grid gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={helDag} onChange={(e) => setHelDag(e.target.checked)} className="h-4 w-4 rounded" />
              Heldag
            </label>
            <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={ingenVikarieBehövs}
                onChange={(e) => setIngenVikarieBehövs(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded"
              />
              <span>
                Ingen vikarie behövs
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                  Frånvaron sparas, men inget vikariepass skapas.
                </span>
              </span>
            </label>
          </div>
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
            <Button loading={laddar} onClick={registreraFrånvaro}>
              {ingenVikarieBehövs ? 'Spara frånvaro' : 'Fortsätt'}
            </Button>
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
              Välj vikarie om du vill skicka förfrågan eller boka personen direkt. Lämna tomt för att bara skapa pass för bemanning.
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
            <Button variant="secondary" onClick={() => { onRegistrerad(); onStäng(); }}>Spara utan pass</Button>
            {valdVikarieId ? (
              <>
                <Button variant="secondary" loading={skaparPass} onClick={() => skapaVikariepass('förfrågan')}>
                  Skicka förfrågan
                </Button>
                <Button loading={skaparPass} onClick={() => skapaVikariepass('direkt')}>
                  Boka direkt
                </Button>
              </>
            ) : (
              <Button loading={skaparPass} onClick={() => skapaVikariepass('bemanning')}>
                Skapa pass för bemanning
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Franvaro() {
  const navigate = useNavigate();
  const [frånvaron, setFrånvaron] = useState<Frånvaro[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [vikariepass, setVikariepass] = useState<Vikariepass[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [modal, setModal] = useState<{ öppen: boolean; personalId?: string }>({ öppen: false });
  const [raderaId, setRaderaId] = useState<string | null>(null);
  const [skaparPassId, setSkaparPassId] = useState<string | null>(null);
  const [sidFel, setSidFel] = useState('');
  const [sök, setSök] = useState('');
  const [kalenderDatum, setKalenderDatum] = useState(datumIdag());

  useEffect(() => { ladda(); }, []);

  async function ladda() {
    const [fRes, pRes, vRes, passRes] = await Promise.all([
      frånvaroApi.lista(),
      personalApi.lista(),
      vikariApi.lista(),
      passApi.lista(),
    ]);
    setFrånvaron((fRes.data ?? []) as Frånvaro[]);
    setPersonal((pRes.data ?? []) as Personal[]);
    setVikarier((vRes.data ?? []) as Vikarie[]);
    setVikariepass((passRes.data ?? []) as Vikariepass[]);
    setLaddar(false);
  }

  function aktivaPassFör(frånvaro: Frånvaro) {
    return vikariepass.filter((pass) => pass.frånvaro_id === frånvaro.id && pass.status !== 'avbokat');
  }

  async function skapaPassFrånFrånvaro(frånvaro: Frånvaro) {
    const befintligaPass = aktivaPassFör(frånvaro);
    if (befintligaPass.length > 0) {
      navigate('/admin/vikariepass');
      return;
    }

    setSkaparPassId(frånvaro.id);
    setSidFel('');

    const schemaRes = await frånvaroApi.hämtaSchemaraderFörFrånvaro(
      frånvaro.personal_id,
      frånvaro.datum_från,
      frånvaro.datum_till
    );

    if (schemaRes.error) {
      setSidFel(schemaRes.error.message);
      setSkaparPassId(null);
      return;
    }

    const schemarader = sorteraOchRensaSchemarader((schemaRes.data ?? []) as Schemarad[])
      .filter((rad) => rad.datum && rad.tid_från && rad.tid_till);

    try {
      if (schemarader.length > 0) {
        const raderPerDatum = new Map<string, Schemarad[]>();

        for (const rad of schemarader) {
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
          const grupper = [...new Set(sorterade.map((rad) => rad.grupp).filter(Boolean))] as string[];

          const res = await passApi.skapa({
            frånvaro_id: frånvaro.id,
            schemarad_id: sorterade.length === 1 ? sorterade[0].id : null,
            personal_id: frånvaro.personal_id,
            vikarie_id: null,
            datum,
            tid_från: första.tid_från!,
            tid_till: sista.tid_till!,
            typ: 'del_av_dag',
            ämne: null,
            grupp: grupper.length <= 3 ? grupper.join(', ') || null : `${grupper.length} grupper`,
            sal: null,
            anteckning: anteckningFörPass(frånvaro),
            riktad_till_vikarie_id: null,
            publicerad: false,
            status: 'obokat',
            skapad_av: null,
          });

          if (res.error) throw new Error(res.error.message);
          if (res.data) await historikApi.skapa(res.data.id, 'pass_skapat', { frånvaro_id: frånvaro.id, källa: 'frånvaro_i_efterhand' });
        }
      } else {
        for (const datum of datumIntervall(frånvaro.datum_från, frånvaro.datum_till)) {
          const res = await passApi.skapa({
            frånvaro_id: frånvaro.id,
            schemarad_id: null,
            personal_id: frånvaro.personal_id,
            vikarie_id: null,
            datum,
            tid_från: frånvaro.hel_dag ? '08:00' : tid(frånvaro.tid_från) || '08:00',
            tid_till: frånvaro.hel_dag ? '17:00' : tid(frånvaro.tid_till) || '17:00',
            typ: frånvaro.hel_dag ? 'hel_dag' : 'del_av_dag',
            ämne: null,
            grupp: null,
            sal: null,
            anteckning: anteckningFörPass(frånvaro),
            riktad_till_vikarie_id: null,
            publicerad: false,
            status: 'obokat',
            skapad_av: null,
          });

          if (res.error) throw new Error(res.error.message);
          if (res.data) await historikApi.skapa(res.data.id, 'pass_skapat', { frånvaro_id: frånvaro.id, källa: 'frånvaro_i_efterhand' });
        }
      }

      await ladda();
      navigate('/admin/vikariepass');
    } catch (error) {
      setSidFel(error instanceof Error ? error.message : 'Passet kunde inte skapas.');
    } finally {
      setSkaparPassId(null);
    }
  }

  const filtrerade = sök
    ? frånvaron.filter((f) => f.personal?.namn.toLowerCase().includes(sök.toLowerCase()))
    : frånvaron;

  const veckaStart = startPåVecka(kalenderDatum);
  const kalenderDagar = useMemo(
    () => Array.from({ length: 5 }, (_, index) => läggTillDagar(veckaStart, index)),
    [veckaStart]
  );
  const frånvaroPerDag = useMemo(() => {
    const map = new Map<string, Frånvaro[]>();
    for (const dag of kalenderDagar) {
      map.set(dag, filtrerade.filter((frånvaro) => frånvaroTäckerDatum(frånvaro, dag)));
    }
    return map;
  }, [filtrerade, kalenderDagar]);
  const totaltIKalendern = kalenderDagar.reduce((summa, dag) => summa + (frånvaroPerDag.get(dag)?.length ?? 0), 0);

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

      {sidFel && <div className="mb-4"><Alert typ="error">{sidFel}</Alert></div>}

      <input
        type="search"
        placeholder="Sök person"
        value={sök}
        onChange={(e) => setSök(e.target.value)}
        className="mb-4 w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
      />


      <section className="mb-6 rounded-2xl border p-3 sm:p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Kalender</p>
            <h2 className="mt-1 text-lg font-semibold" style={{ color: 'var(--text)' }}>Vecka {veckonummer(veckaStart)}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {kortDatum(kalenderDagar[0])} - {kortDatum(kalenderDagar[4])} · {totaltIKalendern} frånvaro
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Button size="sm" variant="secondary" onClick={() => setKalenderDatum(läggTillDagar(veckaStart, -7))}>Föregående</Button>
            <Button size="sm" variant="secondary" onClick={() => setKalenderDatum(datumIdag())}>Idag</Button>
            <Button size="sm" variant="secondary" onClick={() => setKalenderDatum(läggTillDagar(veckaStart, 7))}>Nästa</Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          {kalenderDagar.map((dag) => {
            const dagensFrånvaro = frånvaroPerDag.get(dag) ?? [];
            const ärIdag = dag === datumIdag();

            return (
              <div
                key={dag}
                className="min-h-44 rounded-2xl border p-3"
                style={{
                  background: 'var(--bg)',
                  borderColor: ärIdag ? 'var(--accent)' : 'var(--border)',
                  boxShadow: ärIdag ? 'inset 0 0 0 1px var(--accent)' : 'none',
                }}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>{kortDatum(dag)}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{dagensFrånvaro.length} frånvaro</p>
                  </div>
                  {dagensFrånvaro.some((frånvaro) => aktivaPassFör(frånvaro).length === 0) && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(249,115,22,0.14)', color: '#fb923c' }}>
                      Åtgärd
                    </span>
                  )}
                </div>

                {dagensFrånvaro.length === 0 ? (
                  <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed px-3 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
                    Ingen frånvaro
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dagensFrånvaro.map((frånvaro) => {
                      const pass = aktivaPassFör(frånvaro);
                      const harPass = pass.length > 0;

                      return (
                        <article key={`${dag}-${frånvaro.id}`} className="rounded-xl border p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{frånvaro.personal?.namn ?? '-'}</p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{frånvaro.personal?.arbetslag?.namn ?? 'Inget arbetslag'}</p>
                            </div>
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{
                              background: harPass ? 'rgba(34,197,94,0.14)' : 'rgba(249,115,22,0.14)',
                              color: harPass ? '#22c55e' : '#fb923c',
                            }}>
                              {harPass ? `${pass.length} pass` : 'Saknar pass'}
                            </span>
                          </div>

                          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            {frånvaro.hel_dag ? 'Heldag' : `${tid(frånvaro.tid_från)}-${tid(frånvaro.tid_till)}`}
                            {frånvaro.orsak ? ` · ${frånvaro.orsak}` : ''}
                          </p>

                          <div className="mt-3">
                            {harPass ? (
                              <Button size="sm" variant="secondary" onClick={() => navigate('/admin/vikariepass')}>Till bemanning</Button>
                            ) : (
                              <Button size="sm" loading={skaparPassId === frånvaro.id} onClick={() => skapaPassFrånFrånvaro(frånvaro)}>Skapa pass</Button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {filtrerade.length === 0 ? (
        <TomtTillstånd text="Ingen frånvaro ännu." åtgärd={
          <Button size="sm" onClick={() => setModal({ öppen: true })}>Ny frånvaro</Button>
        } />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filtrerade.map((f) => (
              <article
                key={f.id}
                className="rounded-xl border p-4"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {f.personal?.namn ?? '-'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {f.personal?.arbetslag?.namn ?? 'Inget arbetslag'}
                    </p>
                  </div>
                  <button
                    onClick={() => setRaderaId(f.id)}
                    className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium"
                    style={{ color: 'var(--danger)' }}
                  >
                    Ta bort
                  </button>
                </div>

                <div className="grid gap-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <p>
                    <span className="font-medium" style={{ color: 'var(--text)' }}>Datum:</span>{' '}
                    {f.datum_från === f.datum_till ? f.datum_från : `${f.datum_från} - ${f.datum_till}`}
                  </p>
                  <p>
                    <span className="font-medium" style={{ color: 'var(--text)' }}>Tid:</span>{' '}
                    {f.hel_dag ? 'Heldag' : `${tid(f.tid_från)}-${tid(f.tid_till)}`}
                  </p>
                  {f.orsak && (
                    <p>
                      <span className="font-medium" style={{ color: 'var(--text)' }}>Orsak:</span>{' '}
                      {f.orsak}
                    </p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {aktivaPassFör(f).length > 0 ? (
                    <Button size="sm" variant="secondary" onClick={() => navigate('/admin/vikariepass')}>Till bemanning</Button>
                  ) : (
                    <Button size="sm" loading={skaparPassId === f.id} onClick={() => skapaPassFrånFrånvaro(f)}>Skapa pass</Button>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-lg border md:block" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs" style={{ background: 'var(--hover)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <th className="px-4 py-3 text-left font-medium">Personal</th>
                  <th className="px-4 py-3 text-left font-medium">Arbetslag</th>
                  <th className="px-4 py-3 text-left font-medium">Datum</th>
                  <th className="px-4 py-3 text-left font-medium">Typ</th>
                  <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">Orsak</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrerade.map((f) => (
                  <tr key={f.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{f.personal?.namn ?? '-'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{f.personal?.arbetslag?.namn ?? '-'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{f.datum_från} - {f.datum_till}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {f.hel_dag ? 'Heldag' : `${tid(f.tid_från)}-${tid(f.tid_till)}`}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell" style={{ color: 'var(--text-muted)' }}>{f.orsak ?? '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {aktivaPassFör(f).length > 0 ? (
                          <Button size="sm" variant="secondary" onClick={() => navigate('/admin/vikariepass')}>Till bemanning</Button>
                        ) : (
                          <Button size="sm" loading={skaparPassId === f.id} onClick={() => skapaPassFrånFrånvaro(f)}>Skapa pass</Button>
                        )}
                        <button onClick={() => setRaderaId(f.id)} className="rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ color: 'var(--danger)' }}>
                          Ta bort
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
