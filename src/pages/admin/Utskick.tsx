import { useEffect, useMemo, useState } from 'react';
import { frånvaroApi, passApi, vikariApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { Frånvaro, Vikariepass, Vikarie } from '../../types';
import { Button, LaddaSida } from '../../components/ui';

type CellTyp = 'franvaro' | 'vikarie' | 'ovrigt';

const cellTyper: CellTyp[] = ['franvaro', 'vikarie', 'ovrigt'];

function iso(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function startPåVecka(datum: Date) {
  const d = new Date(datum);
  const veckodag = d.getDay() || 7;
  d.setDate(d.getDate() - veckodag + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function läggTillDagar(datum: Date, dagar: number) {
  const d = new Date(datum);
  d.setDate(d.getDate() + dagar);
  return d;
}

function veckaNummer(datum: Date) {
  const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const årStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - årStart.getTime()) / 86400000) + 1) / 7);
}

function kortDatum(datum: Date) {
  return datum.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}

function tid(t?: string | null) {
  return t?.slice(0, 5) ?? '';
}

function esc(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function cellKey(datum: string, typ: CellTyp) {
  return `${datum}:${typ}`;
}

function frånvaroFörDag(frånvaro: Frånvaro[], dag: string) {
  return frånvaro.filter((f) => f.datum_från <= dag && f.datum_till >= dag);
}

function passFörDag(pass: Vikariepass[], dag: string) {
  return pass.filter((p) => p.datum === dag && p.status !== 'avbokat');
}

function arbetslagSortIndex(value?: string | null) {
  const text = (value ?? '').toLowerCase().replace(/\s+/g, '');
  if (!text) return 99;
  if (text.includes('fsk') || text.includes('förskole') || text.includes('forskole')) return 0;

  const match = text.match(/(?:åk\.?|ak\.?)?([1-6])/) ?? text.match(/^([1-6])/);
  if (match) return Number(match[1]);

  if (text.includes('prest')) return 7;
  return 99;
}

function sorteraPass(a: Vikariepass, b: Vikariepass) {
  return (
    arbetslagSortIndex(a.grupp ?? a.personal?.arbetslag?.namn) -
      arbetslagSortIndex(b.grupp ?? b.personal?.arbetslag?.namn) ||
    (a.vikarie?.namn ?? a.personal?.namn ?? '').localeCompare(b.vikarie?.namn ?? b.personal?.namn ?? '', 'sv') ||
    tid(a.tid_från).localeCompare(tid(b.tid_från))
  );
}

type NamnFormatter = (namn?: string | null, fallback?: string) => string;

function skapaNamnFormatter(frånvaro: Frånvaro[], pass: Vikariepass[], vikarier: Vikarie[]): NamnFormatter {
  const namn = [
    ...frånvaro.map((f) => f.personal?.namn),
    ...pass.map((p) => p.personal?.namn),
    ...pass.map((p) => p.vikarie?.namn),
    ...vikarier.map((v) => v.namn),
  ].filter(Boolean) as string[];

  const antalFörnamn = new Map<string, number>();
  for (const heltNamn of namn) {
    const förnamn = heltNamn.trim().split(/\s+/)[0]?.toLowerCase();
    if (förnamn) antalFörnamn.set(förnamn, (antalFörnamn.get(förnamn) ?? 0) + 1);
  }

  return (heltNamn, fallback = 'Okänd') => {
    if (!heltNamn) return fallback;
    const delar = heltNamn.trim().split(/\s+/);
    const förnamn = delar[0] ?? heltNamn;
    const behöverInitial = (antalFörnamn.get(förnamn.toLowerCase()) ?? 0) > 1;

    if (!behöverInitial || delar.length < 2) return förnamn;

    const efternamn = delar[delar.length - 1];
    return `${förnamn} ${efternamn[0]?.toUpperCase()}.`;
  };
}

function frånvaroText(f: Frånvaro, formatNamn: NamnFormatter) {
  const tidText = f.hel_dag ? '' : ` (${tid(f.tid_från)}-${tid(f.tid_till)})`;
  return `${formatNamn(f.personal?.namn)}${tidText}`;
}

function vikarieText(pass: Vikariepass, formatNamn: NamnFormatter, vikarierById: Map<string, Vikarie>) {
  const bokadVikarie = pass.vikarie_id ? vikarierById.get(pass.vikarie_id)?.namn ?? pass.vikarie?.namn : null;
  const riktadVikarie = pass.riktad_till_vikarie_id ? vikarierById.get(pass.riktad_till_vikarie_id)?.namn : null;
  const namn = bokadVikarie
    ? formatNamn(bokadVikarie)
    : riktadVikarie
      ? `Tillfrågad: ${formatNamn(riktadVikarie)}`
      : 'Vikarie saknas';

  const grupp = pass.grupp ? ` - ${pass.grupp}` : '';
  return `${namn}${grupp}\n(${tid(pass.tid_från)}-${tid(pass.tid_till)})`;
}

function htmlCell(text: string) {
  const trimmed = text.trim();
  return trimmed ? esc(trimmed).replaceAll('\n', '<br>') : '-';
}

function byggHtml({
  dagar,
  cellText,
}: {
  dagar: Date[];
  cellText: (datum: string, typ: CellTyp) => string;
}) {
  const cell = 'border:1px solid #666;background-color:#333;color:#fff;padding:10px;text-align:center;vertical-align:middle;font-family:Arial,sans-serif;font-size:12px;line-height:1.35;white-space:normal;';
  const head = 'border:1px solid #666;background-color:#3a3a3a;color:#fff;padding:8px;text-align:center;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;';
  const label = 'border:1px solid #666;background-color:#333;color:#fff;padding:10px;text-align:left;vertical-align:middle;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;';

  const rows = [
    `<tr><th style="${label};width:80px;">Vecka</th>${dagar.map((dag) => `<th style="${head};width:170px;">${esc(dag.toLocaleDateString('sv-SE', { weekday: 'long' }))}</th>`).join('')}</tr>`,
    `<tr><th style="${head}">${veckaNummer(dagar[0])}</th>${dagar.map((dag) => `<th style="${head}">${esc(kortDatum(dag))}</th>`).join('')}</tr>`,
    `<tr><th style="${label};height:110px;">Frånvaro</th>${dagar.map((dag) => `<td style="${cell};height:110px;">${htmlCell(cellText(iso(dag), 'franvaro'))}</td>`).join('')}</tr>`,
    `<tr><th style="${label};height:220px;">Vikarie</th>${dagar.map((dag) => `<td style="${cell};height:220px;">${htmlCell(cellText(iso(dag), 'vikarie'))}</td>`).join('')}</tr>`,
    `<tr><th style="${label};height:150px;">Övrigt</th>${dagar.map((dag) => `<td style="${cell};height:150px;">${htmlCell(cellText(iso(dag), 'ovrigt'))}</td>`).join('')}</tr>`,
  ].join('');

  return `
<div style="font-family:Arial,sans-serif;font-size:13px;color:#111;background-color:#fff;">
  <p style="margin:0 0 10px 0;">God morgon,<br>här är frånvaron.</p>
  <p style="margin:0 0 16px 0;">Vi påminner om rutinen för frånvaroanmälan och återkoppling inför kommande tjänstgöring.</p>
  <table width="930" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;background-color:#333;color:#fff;">
    ${rows}
  </table>
</div>`.trim();
}

export default function Utskick() {
  const [veckaStart, setVeckaStart] = useState(() => iso(startPåVecka(new Date())));
  const [frånvaro, setFrånvaro] = useState<Frånvaro[]>([]);
  const [pass, setPass] = useState<Vikariepass[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [celler, setCeller] = useState<Record<string, string>>({});
  const [laddar, setLaddar] = useState(true);
  const [sparar, setSparar] = useState(false);
  const [kopierat, setKopierat] = useState(false);
  const [fel, setFel] = useState('');

  const start = useMemo(() => startPåVecka(new Date(`${veckaStart}T12:00:00`)), [veckaStart]);
  const dagar = useMemo(() => [0, 1, 2, 3, 4].map((i) => läggTillDagar(start, i)), [start]);
  const startIso = iso(dagar[0]);
  const slutIso = iso(dagar[4]);
  const formatNamn = useMemo(() => skapaNamnFormatter(frånvaro, pass, vikarier), [frånvaro, pass, vikarier]);
  const vikarierById = useMemo(() => new Map(vikarier.map((v) => [v.id, v])), [vikarier]);

  useEffect(() => {
    async function ladda() {
      setLaddar(true);
      setFel('');

      const [fRes, pRes, vRes, cRes] = await Promise.all([
        frånvaroApi.lista(startIso, slutIso),
        passApi.lista({ datumFrån: startIso, datumTill: slutIso }),
        vikariApi.lista(),
        supabase.from('utskick_celler').select('*').gte('datum', startIso).lte('datum', slutIso),
      ]);

      const frånvaroData = (fRes.data ?? []) as Frånvaro[];
      const passData = (pRes.data ?? []) as Vikariepass[];
      const vikarieData = (vRes.data ?? []) as Vikarie[];

      setFrånvaro(frånvaroData);
      setPass(passData);
      setVikarier(vikarieData);

      if (cRes.error) {
        setFel('Redigering kan inte sparas förrän databasmigrationen är körd.');
        setCeller({});
      } else {
        const map: Record<string, string> = {};
        for (const rad of cRes.data ?? []) map[cellKey(rad.datum, rad.typ as CellTyp)] = rad.text ?? '';
        setCeller(map);
      }

      setLaddar(false);
    }

    ladda();
  }, [startIso, slutIso]);

  function grundText(datum: string, typ: CellTyp) {
    if (typ === 'franvaro') {
      return frånvaroFörDag(frånvaro, datum)
        .map((f) => frånvaroText(f, formatNamn))
        .join('\n');
    }

    if (typ === 'vikarie') {
      return passFörDag(pass, datum)
        .sort(sorteraPass)
        .map((p) => vikarieText(p, formatNamn, vikarierById))
        .join('\n\n');
    }

    return '';
  }

  function textFörCell(datum: string, typ: CellTyp) {
    const key = cellKey(datum, typ);
    return key in celler ? celler[key] : grundText(datum, typ);
  }

  function uppdateraCell(datum: string, typ: CellTyp, text: string) {
    setCeller((prev) => ({ ...prev, [cellKey(datum, typ)]: text }));
  }

  function bytVecka(steg: number) {
    setVeckaStart(iso(startPåVecka(läggTillDagar(start, steg * 7))));
  }

  async function sparaCeller() {
    setSparar(true);
    setFel('');

    const rader = dagar.flatMap((dag) => {
      const datum = iso(dag);
      return cellTyper.map((typ) => ({
        datum,
        typ,
        text: textFörCell(datum, typ),
      }));
    });

    const res = await supabase.from('utskick_celler').upsert(rader, { onConflict: 'datum,typ' });
    setSparar(false);

    if (res.error) {
      setFel(res.error.message);
      return false;
    }

    return true;
  }

  async function skickaMail() {
    await sparaCeller();

    const html = byggHtml({ dagar, cellText: textFörCell });
    const plain = [
      'God morgon,',
      '',
      'här är frånvaron.',
      '',
      ...dagar.map((dag) => {
        const datum = iso(dag);
        return [
          dag.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'numeric' }),
          `Frånvaro:\n${textFörCell(datum, 'franvaro') || '-'}`,
          `Vikarie:\n${textFörCell(datum, 'vikarie') || '-'}`,
          `Övrigt:\n${textFörCell(datum, 'ovrigt') || '-'}`,
        ].join('\n');
      }),
    ].join('\n\n');

    const ClipboardItemCtor = (window as any).ClipboardItem;
    if (ClipboardItemCtor && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItemCtor({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(plain);
    }

    setKopierat(true);
    setTimeout(() => setKopierat(false), 2500);

    const ämne = `Frånvarolista vecka ${veckaNummer(start)}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(ämne)}&body=${encodeURIComponent(plain)}`;
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="flex h-full flex-col overflow-hidden p-3 sm:p-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Beta</p>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Utskick</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Redigerbar veckovy. Grundtext hämtas från Frånvaro och Bemanning.
          </p>
        </div>

        <div className="grid gap-2 sm:flex sm:items-center">
          <input
            type="date"
            value={veckaStart}
            onChange={(e) => setVeckaStart(iso(startPåVecka(new Date(`${e.target.value}T12:00:00`))))}
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
          />
          <Button variant="secondary" onClick={() => bytVecka(-1)}>Föregående</Button>
          <Button variant="secondary" onClick={() => setVeckaStart(iso(startPåVecka(new Date())))}>Idag</Button>
          <Button variant="secondary" onClick={() => bytVecka(1)}>Nästa</Button>
          <Button variant="secondary" onClick={sparaCeller} loading={sparar}>Spara text</Button>
          <Button onClick={skickaMail}>{kopierat ? 'Kopierat' : 'Skicka mail'}</Button>
        </div>
      </div>

      {fel && (
        <div className="mb-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#f97316', background: 'rgba(249,115,22,0.12)', color: '#fb923c' }}>
          {fel}
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <table className="min-w-[1180px] w-full border-collapse text-sm" style={{ color: 'var(--text)' }}>
          <thead>
            <tr>
              <th className="w-24 border px-3 py-3 text-left" style={{ borderColor: 'var(--border)' }}>Vecka</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center" style={{ borderColor: 'var(--border)' }}>
                  {dag.toLocaleDateString('sv-SE', { weekday: 'long' })}
                </th>
              ))}
            </tr>
            <tr>
              <th className="border px-3 py-3 text-center text-lg" style={{ borderColor: 'var(--border)' }}>{veckaNummer(start)}</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center text-base" style={{ borderColor: 'var(--border)' }}>
                  {kortDatum(dag)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {[
              { typ: 'franvaro' as const, label: 'Frånvaro', minH: 'min-h-32' },
              { typ: 'vikarie' as const, label: 'Vikarie', minH: 'min-h-64' },
              { typ: 'ovrigt' as const, label: 'Övrigt', minH: 'min-h-36' },
            ].map((rad) => (
              <tr key={rad.typ}>
                <th className="border px-3 py-4 text-left align-middle" style={{ borderColor: 'var(--border)' }}>{rad.label}</th>
                {dagar.map((dag) => {
                  const datum = iso(dag);
                  return (
                    <td key={`${datum}-${rad.typ}`} className="border p-2 align-top" style={{ borderColor: 'var(--border)' }}>
                      <textarea
                        value={textFörCell(datum, rad.typ)}
                        onChange={(e) => uppdateraCell(datum, rad.typ, e.target.value)}
                        placeholder="Skriv egen text..."
                        className={`${rad.minH} w-full resize-none rounded-lg border px-3 py-2 text-center text-sm leading-6`}
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        Skicka mail öppnar mejl med vanlig text och kopierar samtidigt den formaterade tabellen. Klistra in i mejlet om du vill behålla tabellformatet.
      </p>
    </div>
  );
}
