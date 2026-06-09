import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { frånvaroApi, personalApi, passApi, historikApi, vikariApi, notisApi } from '../../lib/api';
import type { Frånvaro, Personal, Schemarad, Vikarie, Vikariepass } from '../../types';
import {
  Button, Input, Select, Textarea, Modal, Confirm, TomtTillstånd, LaddaSida, Alert
} from '../../components/ui';

const STANDARD_TID_FRÅN = '08:00';
const STANDARD_TID_TILL = '16:30';

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

function PeriodIkon({ typ }: { typ: 'föregående' | 'idag' | 'nästa' }) {
  if (typ === 'idag') {
    return (
      <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <path
        d={typ === 'föregående' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

function standardKalenderDatum() {
  const idag = new Date();
  const veckodag = idag.getDay();

  if (veckodag === 6 || veckodag === 0) {
    const nastaMandag = new Date(idag);
    nastaMandag.setDate(idag.getDate() + (veckodag === 6 ? 2 : 1));
    return isoDatum(nastaMandag);
  }

  return isoDatum(idag);
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

function frånvaroPassStatus(pass: Vikariepass[], löst: boolean) {
  if (löst) return { text: 'löst', färg: '#22c55e', bg: 'rgba(34,197,94,0.14)' };
  if (pass.length === 0) return { text: 'Inget pass', färg: 'var(--text-muted)', bg: 'var(--hover)' };

  const allaBemannade = pass.every((p) => !!p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
  if (allaBemannade) return { text: 'bemannat', färg: '#22c55e', bg: 'rgba(34,197,94,0.14)' };

  const saknarVikarie = pass.some((p) => !p.vikarie_id && p.status !== 'avbokat');
  if (saknarVikarie) return { text: 'utan vikarie', färg: '#fb923c', bg: 'rgba(249,115,22,0.14)' };

  return {
    text: pass.length === 1 ? '1 pass skapat' : `${pass.length} pass skapade`,
    färg: 'var(--text-muted)',
    bg: 'var(--hover)',
  };
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

const LOST_FRANVARO_MARKER = '[admin:franvaro-lost]';
const LOST_FRANVARO_DATUM_PREFIX = '[admin:franvaro-lost:';
const RADBRYTNING = String.fromCharCode(10);

function löstFrånvaroDatumMarker(datum: string) {
  return `${LOST_FRANVARO_DATUM_PREFIX}${datum}]`;
}

function ärLöstMarkerRad(rad: string) {
  const text = rad.trim();
  return text === LOST_FRANVARO_MARKER || /^\[admin:franvaro-lost:\d{4}-\d{2}-\d{2}\]$/.test(text);
}

function läsLöstaFrånvaroDatum(frånvaro: Frånvaro) {
  const datum = new Set<string>();

  for (const rad of (frånvaro.anteckning ?? '').split(RADBRYTNING)) {
    const text = rad.trim();
    const match = text.match(/^\[admin:franvaro-lost:(\d{4}-\d{2}-\d{2})\]$/);
    if (match) datum.add(match[1]);
  }

  const harGammalHelMarkering = (frånvaro.anteckning ?? '')
    .split(RADBRYTNING)
    .some(rad => rad.trim() === LOST_FRANVARO_MARKER);
  if (harGammalHelMarkering && frånvaro.datum_från === frånvaro.datum_till) {
    datum.add(frånvaro.datum_från);
  }

  return datum;
}

function synligFrånvaroAnteckning(anteckning?: string | null) {
  return (anteckning ?? '')
    .split(RADBRYTNING)
    .filter(rad => !ärLöstMarkerRad(rad))
    .join(RADBRYTNING)
    .trim();
}

function ärLöstFrånvaro(frånvaro: Frånvaro, datum?: string) {
  const löstaDatum = läsLöstaFrånvaroDatum(frånvaro);
  if (datum) return löstaDatum.has(datum);

  return datumIntervall(frånvaro.datum_från, frånvaro.datum_till)
    .every(dag => löstaDatum.has(dag));
}

function anteckningMedLöstMarkering(frånvaro: Frånvaro, löst: boolean, datum?: string) {
  const synlig = synligFrånvaroAnteckning(frånvaro.anteckning);
  const löstaDatum = läsLöstaFrånvaroDatum(frånvaro);
  const datumAttÄndra = datum ? [datum] : datumIntervall(frånvaro.datum_från, frånvaro.datum_till);

  for (const dag of datumAttÄndra) {
    if (löst) löstaDatum.add(dag);
    else löstaDatum.delete(dag);
  }

  const markörer = [...löstaDatum].sort().map(löstFrånvaroDatumMarker);
  return [synlig, ...markörer].filter(Boolean).join(RADBRYTNING) || null;
}

function anteckningFörPass(frånvaro: Frånvaro) {
  return synligFrånvaroAnteckning(frånvaro.anteckning)
    .split(RADBRYTNING)
    .filter(rad => rad.trim().toLowerCase() !== 'ingen vikarie behövs')
    .join(RADBRYTNING)
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
  öppen, onStäng, personal, vikarier, frånvaron, valtPersonalId, förvaltDatum, onRegistrerad,
}: {
  öppen: boolean;
  onStäng: () => void;
  personal: Personal[];
  vikarier: Vikarie[];
  frånvaron: Frånvaro[];
  valtPersonalId?: string;
  förvaltDatum?: string;
  onRegistrerad: () => void;
}) {
  const [personalId, setPersonalId] = useState(valtPersonalId ?? '');
  const [egenPersonalNamn, setEgenPersonalNamn] = useState('');
  const [datumFrån, setDatumFrån] = useState(datumIdag());
  const [datumTill, setDatumTill] = useState(datumIdag());
  const [helDag, setHelDag] = useState(true);
  const [ingenVikarieBehövs, setIngenVikarieBehövs] = useState(false);
  const [tidFrån, setTidFrån] = useState(STANDARD_TID_FRÅN);
  const [tidTill, setTidTill] = useState(STANDARD_TID_TILL);
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
    setEgenPersonalNamn('');
    const startDatum = förvaltDatum ?? datumIdag();
    setDatumFrån(startDatum);
    setDatumTill(startDatum);
    setHelDag(true);
    setIngenVikarieBehövs(false);
    setSteg('formulär');
    setFel('');
    setSchemarader([]);
    setValda(new Set());
    setValdVikarieId('');
  }, [öppen, valtPersonalId, förvaltDatum]);

  async function registreraFrånvaro() {
    const egetNamn = egenPersonalNamn.trim();

    if (!personalId && !egetNamn) {
      setFel('Välj person eller skriv ett namn.');
      return;
    }

    if (datumTill < datumFrån) {
      setFel('Slutdatum kan inte vara före startdatum.');
      return;
    }

    setLaddar(true);
    setFel('');

    let frånvarandePersonalId = personalId;
    let frånvarandeNamn = personal.find((p) => p.id === personalId)?.namn ?? egetNamn;

    if (!frånvarandePersonalId && egetNamn) {
      const befintlig = personal.find((p) => p.namn.trim().toLowerCase() === egetNamn.toLowerCase());

      if (befintlig) {
        frånvarandePersonalId = befintlig.id;
        frånvarandeNamn = befintlig.namn;
        setPersonalId(befintlig.id);
      } else {
        const nyPersonal = await personalApi.skapa({
          arbetslag_id: null,
          namn: egetNamn,
          epost: null,
          telefon: null,
          signatur: null,
          skola24_id: null,
          titel: null,
          aktiv: true,
        });

        if (nyPersonal.error || !nyPersonal.data) {
          setLaddar(false);
          setFel(nyPersonal.error?.message ?? 'Kunde inte skapa personal.');
          return;
        }

        const skapadPersonal = nyPersonal.data as Personal;
        frånvarandePersonalId = skapadPersonal.id;
        frånvarandeNamn = skapadPersonal.namn;
        setPersonalId(skapadPersonal.id);
      }
    }

    const finnsRedan = frånvaron.find((frånvaro) =>
      frånvaro.personal_id === frånvarandePersonalId &&
      datumÖverlappar(datumFrån, datumTill, frånvaro.datum_från, frånvaro.datum_till)
    );

    if (finnsRedan) {
      setLaddar(false);
      setFel(`${frånvarandeNamn || 'Personen'} har redan frånvaro ${finnsRedan.datum_från} - ${finnsRedan.datum_till}. Ändra eller arkivera den först.`);
      return;
    }

    const res = await frånvaroApi.skapa({
      personal_id: frånvarandePersonalId,
      datum_från: datumFrån,
      datum_till: datumTill,
      hel_dag: helDag,
      tid_från: helDag ? null : tidFrån,
      tid_till: helDag ? null : tidTill,
      orsak: null,
      anteckning: [
        anteckning.trim() || null,
        ingenVikarieBehövs ? 'Ingen vikarie behövs' : null,
      ].filter(Boolean).join('\n') || null,
      skapad_av: null,
    });

    setLaddar(false);

    if (res.error) {
      setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message);
      return;
    }

    setSkapadFrånvaro(res.data as Frånvaro);

    if (ingenVikarieBehövs) {
      onRegistrerad();
      onStäng();
      return;
    }

    const sRes = await frånvaroApi.hämtaSchemaraderFörFrånvaro(frånvarandePersonalId, datumFrån, datumTill);
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
          personal_id: skapadFrånvaro.personal_id,
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
          publicerad: false,
          status: bokarDirekt ? 'bokat' : skickarFörfrågan ? 'notifierat' : 'obokat',
          skapad_av: null,
        });

        if (res.error) {
          setFel(res.error.message);
          setSkaparPass(false);
          return;
        }

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
      for (const datum of datumIntervall(skapadFrånvaro.datum_från, skapadFrånvaro.datum_till)) {
        const res = await passApi.skapa({
          frånvaro_id: skapadFrånvaro.id,
          schemarad_id: null,
          personal_id: skapadFrånvaro.personal_id,
          vikarie_id: bokarDirekt ? valdVikarieId : null,
          datum,
          tid_från: helDag ? STANDARD_TID_FRÅN : tidFrån,
          tid_till: helDag ? STANDARD_TID_TILL : tidTill,
          typ: helDag ? 'hel_dag' : 'del_av_dag',
          ämne: null,
          grupp: null,
          sal: null,
          anteckning: null,
          riktad_till_vikarie_id: skickarFörfrågan ? valdVikarieId : null,
          publicerad: false,
          status: bokarDirekt ? 'bokat' : skickarFörfrågan ? 'notifierat' : 'obokat',
          skapad_av: null,
        });

        if (res.error) {
          setFel(res.error.message);
          setSkaparPass(false);
          return;
        }

        if (res.data) {
          await historikApi.skapa(res.data.id, 'pass_skapat');

          if (skickarFörfrågan) {
            await notisApi.skickaNotiser(res.data.id, [valdVikarieId]);
            await historikApi.skapa(res.data.id, 'vikarie_notifierat', { vikarie_id: valdVikarieId });
          }

          if (bokarDirekt) {
            await historikApi.skapa(res.data.id, 'vikarie_bokat', {
              vikarie_id: valdVikarieId,
              källa: 'frånvaro_boka_direkt',
            });
            await notisApi.skickaNotiser(res.data.id, [valdVikarieId]);
          }
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
          <Select
            label="Vem är frånvarande?"
            value={personalId}
            onChange={(e) => {
              setPersonalId(e.target.value);
              if (e.target.value) setEgenPersonalNamn('');
            }}
          >
            <option value="">Välj från personal</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>{p.namn} {p.arbetslag ? `(${p.arbetslag.namn})` : ''}</option>
            ))}
          </Select>

          <Input
            label="Eller skriv namn"
            value={egenPersonalNamn}
            onChange={(e) => {
              setEgenPersonalNamn(e.target.value);
              if (e.target.value.trim()) setPersonalId('');
            }}
            placeholder="Person som saknas i listan"
            hint="Skriv ett namn här om personen inte finns i rullistan. Personen sparas automatiskt."
          />
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
          <Textarea
            label="Intern anteckning, valfri"
            value={anteckning}
            onChange={(e) => setAnteckning(e.target.value)}
            placeholder="Skriv bara det som behövs för bemanningen."
          />
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
            Dataminimering: skriv inte diagnoser, detaljer om hälsa eller andra känsliga uppgifter här om det inte är absolut nödvändigt.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
            <Button loading={laddar} onClick={registreraFrånvaro}>Spara</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {fel && <Alert typ="error">{fel}</Alert>}
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


function RedigeraFrånvaroModal({
  frånvaro,
  personal,
  onStäng,
  onSparad,
}: {
  frånvaro: Frånvaro | null;
  personal: Personal[];
  onStäng: () => void;
  onSparad: () => void;
}) {
  const [personalId, setPersonalId] = useState('');
  const [datumFrån, setDatumFrån] = useState(datumIdag());
  const [datumTill, setDatumTill] = useState(datumIdag());
  const [helDag, setHelDag] = useState(true);
  const [ingenVikarieBehövs, setIngenVikarieBehövs] = useState(false);
  const [tidFrån, setTidFrån] = useState(STANDARD_TID_FRÅN);
  const [tidTill, setTidTill] = useState(STANDARD_TID_TILL);
  const [anteckning, setAnteckning] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (!frånvaro) return;

    const anteckningar = (frånvaro.anteckning ?? '').split('\n');
    const markeradIngenVikarie = anteckningar.some((rad) => rad.trim().toLowerCase() === 'ingen vikarie behövs');
    const synligAnteckning = anteckningar
      .filter((rad) => rad.trim().toLowerCase() !== 'ingen vikarie behövs')
      .join('\n')
      .trim();

    setPersonalId(frånvaro.personal_id);
    setDatumFrån(frånvaro.datum_från);
    setDatumTill(frånvaro.datum_till);
    setHelDag(frånvaro.hel_dag);
    setIngenVikarieBehövs(markeradIngenVikarie);
    setTidFrån(tid(frånvaro.tid_från) || STANDARD_TID_FRÅN);
    setTidTill(tid(frånvaro.tid_till) || STANDARD_TID_TILL);
    setAnteckning(synligAnteckning);
    setFel('');
  }, [frånvaro]);

  if (!frånvaro) return null;
  const aktuellFrånvaro = frånvaro;

  async function spara() {
    if (!personalId) { setFel('Välj person.'); return; }
    if (datumTill < datumFrån) { setFel('Slutdatum kan inte vara före startdatum.'); return; }

    setSparar(true);
    setFel('');

    const res = await frånvaroApi.uppdatera(aktuellFrånvaro.id, {
      personal_id: personalId,
      datum_från: datumFrån,
      datum_till: datumTill,
      hel_dag: helDag,
      tid_från: helDag ? null : tidFrån,
      tid_till: helDag ? null : tidTill,
      orsak: null,
      anteckning: [
        anteckning.trim() || null,
        ingenVikarieBehövs ? 'Ingen vikarie behövs' : null,
      ].filter(Boolean).join('\n') || null,
      skapad_av: aktuellFrånvaro.skapad_av,
    });

    setSparar(false);

    if (res.error) {
      setFel(res.error.message);
      return;
    }

    onSparad();
    onStäng();
  }

  return (
    <Modal öppen={!!frånvaro} onStäng={onStäng} titel="Redigera frånvaro" bredd="lg">
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}

        <Select label="Vem är frånvarande? *" value={personalId} onChange={(e) => setPersonalId(e.target.value)}>
          <option value="">Välj person</option>
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
            <input type="checkbox" checked={ingenVikarieBehövs} onChange={(e) => setIngenVikarieBehövs(e.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
            <span>
              Ingen vikarie behövs
              <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>Frånvaron sparas utan vikariepass.</span>
            </span>
          </label>
        </div>

        {!helDag && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Från" type="time" value={tidFrån} onChange={(e) => setTidFrån(e.target.value)} />
            <Input label="Till" type="time" value={tidTill} onChange={(e) => setTidTill(e.target.value)} />
          </div>
        )}

        <Textarea
          label="Intern anteckning, valfri"
          value={anteckning}
          onChange={(e) => setAnteckning(e.target.value)}
          placeholder="Skriv bara det som behövs för bemanningen."
        />
        <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
          Dataminimering: skriv inte diagnoser, detaljer om hälsa eller andra känsliga uppgifter här om det inte är absolut nödvändigt.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
          <Button loading={sparar} onClick={spara}>Spara ändringar</Button>
        </div>
      </div>
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
  const [modal, setModal] = useState<{ öppen: boolean; personalId?: string; datum?: string }>({ öppen: false });
  const [raderaId, setRaderaId] = useState<string | null>(null);
  const [skaparPassId, setSkaparPassId] = useState<string | null>(null);
  const [löserFrånvaroId, setLöserFrånvaroId] = useState<string | null>(null);
  const [redigeraFrånvaro, setRedigeraFrånvaro] = useState<Frånvaro | null>(null);
  const [sidFel, setSidFel] = useState('');
  const [sök, setSök] = useState('');
  const [visaLista, setVisaLista] = useState(false);
  const [kalenderDatum, setKalenderDatum] = useState(standardKalenderDatum());

  useEffect(() => { ladda(); }, []);

  async function ladda() {
    const [fRes, pRes, vRes, passRes] = await Promise.all([
      frånvaroApi.lista(),
      personalApi.lista(),
      vikariApi.lista(),
      passApi.lista(),
    ]);
    setFrånvaron(((fRes.data ?? []) as Frånvaro[]).filter((f) => !ärLöstFrånvaro(f)));
    setPersonal((pRes.data ?? []) as Personal[]);
    setVikarier((vRes.data ?? []) as Vikarie[]);
    setVikariepass((passRes.data ?? []) as Vikariepass[]);
    setLaddar(false);
  }

  function aktivaPassFör(frånvaro: Frånvaro) {
    return vikariepass.filter((pass) => pass.frånvaro_id === frånvaro.id && pass.status !== 'avbokat');
  }

  function öppnaPassFörFrånvaro(frånvaro: Frånvaro) {
    const pass = aktivaPassFör(frånvaro);
    navigate(pass.length === 1 ? `/admin/vikariepass?pass=${pass[0].id}` : '/admin/vikariepass');
  }

  async function växlaLöstFrånvaro(frånvaro: Frånvaro, datum?: string) {
    const nästaLöst = !ärLöstFrånvaro(frånvaro, datum);
    const anteckning = anteckningMedLöstMarkering(frånvaro, nästaLöst, datum);
    const laddningsId = datum ? `${frånvaro.id}:${datum}` : frånvaro.id;

    setLöserFrånvaroId(laddningsId);
    setSidFel('');

    const res = await frånvaroApi.uppdatera(frånvaro.id, { anteckning } as any);

    if (res.error) {
      setSidFel(res.error.message);
    } else {
      setFrånvaron(prev => prev.map(f => f.id === frånvaro.id ? { ...f, anteckning } : f));
    }

    setLöserFrånvaroId(null);
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
            tid_från: frånvaro.hel_dag ? STANDARD_TID_FRÅN : tid(frånvaro.tid_från) || STANDARD_TID_FRÅN,
            tid_till: frånvaro.hel_dag ? STANDARD_TID_TILL : tid(frånvaro.tid_till) || STANDARD_TID_TILL,
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
    ? frånvaron.filter((f) => {
        const term = sök.toLowerCase();
        return (
          f.personal?.namn.toLowerCase().includes(term) ||
          f.personal?.arbetslag?.namn.toLowerCase().includes(term) ||
          synligFrånvaroAnteckning(f.anteckning).toLowerCase().includes(term)
        );
      })
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
  const antalMedPass = kalenderDagar.reduce((summa, dag) => summa + (frånvaroPerDag.get(dag) ?? [])
    .filter((frånvaro) => !ärLöstFrånvaro(frånvaro, dag) && aktivaPassFör(frånvaro).some((pass) => pass.datum === dag))
    .length, 0);

  function sorteraDagensFrånvaro(dag: string) {
    return [...(frånvaroPerDag.get(dag) ?? [])].sort((a, b) => {
      const aSaknar = !ärLöstFrånvaro(a, dag) && aktivaPassFör(a).filter((pass) => pass.datum === dag).length === 0;
      const bSaknar = !ärLöstFrånvaro(b, dag) && aktivaPassFör(b).filter((pass) => pass.datum === dag).length === 0;
      if (aSaknar !== bSaknar) return aSaknar ? -1 : 1;

      const aLöst = ärLöstFrånvaro(a, dag);
      const bLöst = ärLöstFrånvaro(b, dag);
      if (aLöst !== bLöst) return aLöst ? 1 : -1;

      return (a.personal?.arbetslag?.namn ?? '').localeCompare(b.personal?.arbetslag?.namn ?? '', 'sv') ||
        (a.personal?.namn ?? '').localeCompare(b.personal?.namn ?? '', 'sv');
    });
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="flex min-h-full flex-col px-2 pb-24 pt-2 sm:px-4 sm:pb-24 sm:pt-3 lg:px-5">
      <div className="mb-3 flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            Planering
          </p>
          <h1 className="text-xl font-semibold leading-tight" style={{ color: 'var(--text)' }}>
            Frånvaro
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Registrera frånvaro och skapa vikariepass vid behov.
          </p>
        </div>
        <Button size="sm" onClick={() => setModal({ öppen: true })}>+ Ny frånvaro</Button>
      </div>

      {sidFel && <div className="mb-4"><Alert typ="error">{sidFel}</Alert></div>}

      <div className="sticky top-1 z-10 mb-3 rounded-xl border p-2 shadow-sm backdrop-blur sm:static sm:p-3 sm:shadow-none" style={{ background: 'color-mix(in srgb, var(--bg-card) 94%, transparent)', borderColor: 'var(--border)' }}>
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
          <label className="min-w-0">
            <span className="sr-only">Sök frånvaro</span>
            <input
              type="search"
              placeholder="Sök personal, arbetslag eller anteckning"
              value={sök}
              onChange={(e) => setSök(e.target.value)}
              className="min-h-10 w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: sök ? 'var(--accent)' : 'var(--border)' }}
            />
          </label>

          <div className="-mx-2 flex min-w-0 snap-x gap-1.5 overflow-x-auto px-2 pb-1 text-xs sm:mx-0 sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0 sm:pb-0">
            <span className="flex shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-1.5 font-semibold" style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <span>{filtrerade.length} frånvaro</span>
            </span>
            <span className="flex shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-1.5 font-semibold" style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              {totaltIKalendern} i veckan
            </span>
            {antalMedPass > 0 && (
              <span className="flex shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-1.5 font-semibold" style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                {antalMedPass} med pass
              </span>
            )}
            {sök && (
              <button
                type="button"
                onClick={() => setSök('')}
                className="shrink-0 snap-start rounded-full border px-3 py-1.5 font-semibold transition hover:shadow-sm focus:outline-none focus:ring-2"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Rensa
              </button>
            )}
            <button
              type="button"
              aria-pressed={visaLista}
              onClick={() => setVisaLista(!visaLista)}
              className="shrink-0 snap-start rounded-full border px-3 py-1.5 font-semibold transition hover:shadow-sm focus:outline-none focus:ring-2"
              style={{ background: visaLista ? 'var(--accent)' : 'var(--bg)', borderColor: visaLista ? 'var(--accent)' : 'var(--border)', color: visaLista ? '#fff' : 'var(--text)' }}
            >
              {visaLista ? 'Dölj lista' : 'Visa lista'}
            </button>
          </div>
        </div>
      </div>


      <section className="mb-4 min-h-0 rounded-xl border p-2 sm:rounded-2xl sm:p-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(190px,240px)_auto] lg:items-center lg:justify-between">
          <div className="rounded-lg px-2 py-1.5" style={{ background: 'var(--bg)' }}>
            <h2 className="mt-1 text-lg font-semibold" style={{ color: 'var(--text)' }}>Vecka {veckonummer(veckaStart)}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {kortDatum(kalenderDagar[0])} - {kortDatum(kalenderDagar[4])}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{totaltIKalendern} frånvaro i veckan</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:flex sm:justify-end sm:gap-2">
            <Button size="sm" variant="secondary" onClick={() => setKalenderDatum(läggTillDagar(veckaStart, -7))}>
              <PeriodIkon typ="föregående" />
              <span className="hidden min-[390px]:inline">Föregående</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setKalenderDatum(standardKalenderDatum())}>
              <PeriodIkon typ="idag" />
              <span>Idag</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setKalenderDatum(läggTillDagar(veckaStart, 7))}>
              <span className="hidden min-[390px]:inline">Nästa</span>
              <PeriodIkon typ="nästa" />
            </Button>
          </div>
        </div>

        <div className="space-y-2 md:hidden">
          {kalenderDagar
            .filter((dag) => dag === datumIdag() || (frånvaroPerDag.get(dag)?.length ?? 0) > 0)
            .map((dag) => {
              const dagensFrånvaro = sorteraDagensFrånvaro(dag);
              const ärIdag = dag === datumIdag();

              return (
                <section
                  key={dag}
                  className="rounded-2xl border p-2.5"
                  style={{
                    background: 'var(--bg)',
                    borderColor: ärIdag ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-xl px-2 py-1.5" style={{ background: 'var(--bg-card)' }}>
                    <div>
                      <h2 className="text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>{kortDatum(dag)}</h2>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {dagensFrånvaro.length > 0 ? `${dagensFrånvaro.length} frånvaro` : 'Ingen frånvaro'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModal({ öppen: true, datum: dag })}
                      className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2"
                      style={{ background: 'var(--accent)' }}
                      aria-label={`Registrera frånvaro ${kortDatum(dag)}`}
                    >
                      + Frånvaro
                    </button>
                  </div>

                  {dagensFrånvaro.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
                      Ingen frånvaro.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dagensFrånvaro.map((frånvaro) => {
                        const pass = aktivaPassFör(frånvaro).filter((pass) => pass.datum === dag);
                        const löst = ärLöstFrånvaro(frånvaro, dag);
                        const status = frånvaroPassStatus(pass, löst);

                        return (
                          <article
                            key={`${dag}-${frånvaro.id}`}
                            className="rounded-2xl border p-3 shadow-sm"
                            style={{
                              background: 'var(--bg-card)',
                              borderColor: löst ? '#22c55e' : 'var(--border)',
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-base font-semibold" style={{ color: 'var(--text)' }}>{frånvaro.personal?.namn ?? '-'}</p>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{frånvaro.personal?.arbetslag?.namn ?? 'Inget arbetslag'}</p>
                              </div>
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: status.bg, color: status.färg }}>
                                {status.text}
                              </span>
                            </div>

                            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                              {frånvaro.hel_dag ? 'Heldag' : `${tid(frånvaro.tid_från)}-${tid(frånvaro.tid_till)}`}
                            </p>

                            <div className="mt-3 grid grid-cols-2 gap-1.5 min-[420px]:gap-2">
                              {pass.length > 0 ? (
                                <Button size="sm" variant="secondary" onClick={() => navigate(pass.length === 1 ? `/admin/vikariepass?pass=${pass[0].id}` : '/admin/vikariepass')}>
                                  Öppna pass
                                </Button>
                              ) : (
                                <Button size="sm" loading={skaparPassId === frånvaro.id} onClick={() => skapaPassFrånFrånvaro(frånvaro)}>
                                  Skapa pass
                                </Button>
                              )}
                              <Button size="sm" variant="secondary" onClick={() => setRedigeraFrånvaro(frånvaro)}>
                                Redigera
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
        </div>

        <div className="hidden grid-cols-1 gap-2 md:grid md:grid-cols-2 xl:grid-cols-5">
          {kalenderDagar.map((dag) => {
            const dagensFrånvaro = sorteraDagensFrånvaro(dag);
            const ärIdag = dag === datumIdag();

            return (
              <div
                key={dag}
                className="scroll-mt-32 rounded-xl border p-2 transition-all duration-200 ease-out md:min-h-[240px] xl:rounded-2xl"
                style={{
                  background: 'var(--bg)',
                  borderColor: ärIdag ? 'var(--accent)' : 'var(--border)',
                  boxShadow: ärIdag ? '0 0 0 1px var(--accent)' : 'none',
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2 rounded-xl px-2 py-1.5" style={{ background: 'var(--bg-card)' }}>
                  <div>
                    <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>{kortDatum(dag)}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{dagensFrånvaro.length} frånvaro</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModal({ öppen: true, datum: dag })}
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white opacity-80 shadow-sm transition hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2"
                    style={{ background: 'var(--accent)' }}
                    aria-label={`Registrera frånvaro ${kortDatum(dag)}`}
                  >
                    + Frånvaro
                  </button>
                </div>

                {dagensFrånvaro.length === 0 ? (
                  <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed px-3 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
                    Ingen frånvaro
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dagensFrånvaro.map((frånvaro) => {
                      const pass = aktivaPassFör(frånvaro).filter((pass) => pass.datum === dag);
                      const harPass = pass.length > 0;
                      const löst = ärLöstFrånvaro(frånvaro, dag);
                      const status = frånvaroPassStatus(pass, löst);

                      return (
                        <article
                          key={`${dag}-${frånvaro.id}`}
                          className="rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm"
                          style={{
                            background: 'var(--bg-card)',
                            borderColor: löst ? '#22c55e' : 'var(--border)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold" style={{ color: 'var(--text)' }}>{frånvaro.personal?.namn ?? '-'}</p>
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{frånvaro.personal?.arbetslag?.namn ?? 'Inget arbetslag'}</p>
                            </div>
                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{
                              background: status.bg,
                              color: status.färg,
                            }}>
                              {status.text}
                            </span>
                          </div>

                          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                            {frånvaro.hel_dag ? 'Heldag' : `${tid(frånvaro.tid_från)}-${tid(frånvaro.tid_till)}`}
                          </p>

                          <div className="mt-3 grid grid-cols-2 gap-1.5 2xl:flex 2xl:flex-wrap 2xl:items-center">
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={löserFrånvaroId === `${frånvaro.id}:${dag}`}
                              onClick={() => växlaLöstFrånvaro(frånvaro, dag)}
                            >
                              {löst ? 'Ångra löst' : 'Markera löst'}
                            </Button>
                            <button
                              type="button"
                              onClick={() => setRedigeraFrånvaro(frånvaro)}
                              className="rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:shadow-sm focus:outline-none focus:ring-2"
                              style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--bg)' }}
                            >
                              Redigera
                            </button>
                            {harPass ? (
                              <button
                                type="button"
                                onClick={() => navigate(pass.length === 1 ? `/admin/vikariepass?pass=${pass[0].id}` : '/admin/vikariepass')}
                                className="rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:shadow-sm focus:outline-none focus:ring-2"
                                style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--bg)' }}
                              >
                                Öppna pass
                              </button>
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

      {visaLista && (filtrerade.length === 0 ? (
        <TomtTillstånd text="Ingen frånvaro ännu." åtgärd={
          <Button size="sm" onClick={() => setModal({ öppen: true })}>Ny frånvaro</Button>
        } />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Alla frånvaror</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Detaljlista för sök, redigering och arkivering.</p>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {filtrerade.map((f) => (
              <article
                key={f.id}
                className="rounded-2xl border p-3 shadow-sm"
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
                    Arkivera
                  </button>
                </div>

                <div className="grid gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                  <div className="flex justify-between gap-3">
                    <span>Datum</span>
                    <span className="text-right font-semibold" style={{ color: 'var(--text)' }}>
                      {f.datum_från === f.datum_till ? f.datum_från : `${f.datum_från} - ${f.datum_till}`}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Tid</span>
                    <span className="text-right font-semibold" style={{ color: 'var(--text)' }}>
                      {f.hel_dag ? 'Heldag' : `${tid(f.tid_från)}-${tid(f.tid_till)}`}
                    </span>
                  </div>
                  {(() => {
                    const status = frånvaroPassStatus(aktivaPassFör(f), ärLöstFrånvaro(f));
                    return (
                      <div className="flex items-center justify-between gap-3">
                        <span>Bemanning</span>
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: status.färg, background: status.bg }}>
                          {status.text}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1.5 min-[420px]:flex min-[420px]:flex-wrap min-[420px]:gap-2">
                  <Button size="sm" variant="secondary" loading={löserFrånvaroId === f.id} onClick={() => växlaLöstFrånvaro(f)}>
                    {ärLöstFrånvaro(f) ? 'Ångra löst' : 'Markera löst'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRedigeraFrånvaro(f)}>Redigera</Button>
                  {aktivaPassFör(f).length > 0 ? (
                    <Button size="sm" variant="secondary" onClick={() => öppnaPassFörFrånvaro(f)}>Öppna pass</Button>
                  ) : (
                    <Button size="sm" loading={skaparPassId === f.id} onClick={() => skapaPassFrånFrånvaro(f)}>Skapa pass</Button>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border md:block" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs" style={{ background: 'var(--hover)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <th className="px-4 py-3 text-left font-medium">Personal</th>
                  <th className="px-4 py-3 text-left font-medium">Arbetslag</th>
                  <th className="px-4 py-3 text-left font-medium">Datum</th>
                  <th className="px-4 py-3 text-left font-medium">Typ</th>
                  <th className="px-4 py-3 text-left font-medium">Bemanning</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrerade.map((f) => (
                  <tr key={f.id} className="border-b transition-colors last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text)' }}>{f.personal?.namn ?? '-'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{f.personal?.arbetslag?.namn ?? '-'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{f.datum_från} - {f.datum_till}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                      {f.hel_dag ? 'Heldag' : `${tid(f.tid_från)}-${tid(f.tid_till)}`}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const status = frånvaroPassStatus(aktivaPassFör(f), ärLöstFrånvaro(f));
                        return (
                          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color: status.färg, background: status.bg }}>
                            {status.text}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" loading={löserFrånvaroId === f.id} onClick={() => växlaLöstFrånvaro(f)}>
                          {ärLöstFrånvaro(f) ? 'Ångra löst' : 'Markera löst'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setRedigeraFrånvaro(f)}>Redigera</Button>
                        {aktivaPassFör(f).length > 0 ? (
                          <Button size="sm" variant="secondary" onClick={() => öppnaPassFörFrånvaro(f)}>Öppna pass</Button>
                        ) : (
                          <Button size="sm" loading={skaparPassId === f.id} onClick={() => skapaPassFrånFrånvaro(f)}>Skapa pass</Button>
                        )}
                        <button onClick={() => setRaderaId(f.id)} className="rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ color: 'var(--danger)' }}>
                          Arkivera
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ))}

      <RedigeraFrånvaroModal
        frånvaro={redigeraFrånvaro}
        personal={personal}
        onStäng={() => setRedigeraFrånvaro(null)}
        onSparad={ladda}
      />

      <FrånvaroModal
        öppen={modal.öppen}
        onStäng={() => setModal({ öppen: false })}
        personal={personal}
        vikarier={vikarier}
        frånvaron={frånvaron}
        valtPersonalId={modal.personalId}
        förvaltDatum={modal.datum}
        onRegistrerad={ladda}
      />

      <Confirm
        öppen={!!raderaId}
        titel="Arkivera frånvaro"
        text="Arkivera frånvaron? Den döljs från arbetsvyn men sparas för historik och export. Kopplade vikariepass påverkas inte."
        bekräftaText="Arkivera"
        farlig
        onBekräfta={async () => {
          if (!raderaId) return;
          const frånvaro = frånvaron.find((f) => f.id === raderaId);
          if (frånvaro) {
            await frånvaroApi.uppdatera(raderaId, {
              anteckning: anteckningMedLöstMarkering(frånvaro, true),
            });
          }
          setFrånvaron((prev) => prev.filter((f) => f.id !== raderaId));
          setRaderaId(null);
        }}
        onAvbryt={() => setRaderaId(null)}
      />
    </div>
  );
}
