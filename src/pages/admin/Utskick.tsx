import { useEffect, useMemo, useState } from 'react';
import { frånvaroApi, passApi, vikariApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { Frånvaro, Vikariepass, Vikarie } from '../../types';
import { Button, LaddaSida } from '../../components/ui';

type CellTyp = 'franvaro' | 'vikarie' | 'ovrigt';
type ExtraTyp = 'ingress' | 'lankar' | 'kontakt';
type UtskickTyp = CellTyp | ExtraTyp;

const cellTyper: CellTyp[] = ['franvaro', 'vikarie', 'ovrigt'];
const extraTyper: ExtraTyp[] = ['ingress', 'lankar', 'kontakt'];
const GLOBAL_CELL_DATE = '1970-01-01';

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

function långtDatum(datum: Date) {
  return datum.toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function standardIngress() {
  return [
    'God morgon,',
    'här är frånvaron för {datum}',
    '',
    'Vi påminner om rutinen att medarbetares frånvaroanmälan vid VAB och sjukdom görs till Nima (+ närmsta chef) via sms till nummer: 070-087 63 05 före kl. 07.00. Du återkommer till mig senast kl. 14.00 dagen innan du beräknar vara i tjänst eller fortsatt sjuk.',
  ].join('\n');
}

function byggIngress(template: string, datum: Date) {
  return (template.trim() || standardIngress()).replace(/\{datum\}/g, långtDatum(datum));
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

function tid(t?: string | null) {
  return t?.slice(0, 5) ?? '';
}

function esc(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellKey(datum: string, typ: UtskickTyp) {
  return `${datum}:${typ}`;
}

function frånvaroFörDag(frånvaro: Frånvaro[], dag: string) {
  return frånvaro.filter((f) => f.datum_från <= dag && f.datum_till >= dag);
}

function passFörDag(pass: Vikariepass[], dag: string) {
  return pass.filter((p) => p.datum === dag && p.status !== 'avbokat');
}

function slåIhopText(befintlig: string, nyText: string, typ: CellTyp) {
  const ny = nyText.trim();
  if (!ny) return befintlig;
  if (!befintlig.trim()) return ny;

  const separator = typ === 'vikarie' ? '\n\n' : '\n';
  const delar = typ === 'vikarie'
    ? ny.split(/\n{2,}/).map((del) => del.trim()).filter(Boolean)
    : ny.split('\n').map((del) => del.trim()).filter(Boolean);

  if (typ === 'vikarie') {
    const befintligaBlock = befintlig.split(/\n{2,}/).map((del) => del.trim()).filter(Boolean);

    for (const nyttBlock of delar) {
      const nyttNyckel = vikarieBlockNyckel(nyttBlock);
      const nyttPersonTid = vikarieBlockPersonTidNyckel(nyttBlock);
      const nyttHarGrupp = vikarieBlockHarGrupp(nyttBlock);
      const skaErsättaSaknas = nyttNyckel && !nyttBlock.toLowerCase().startsWith('vikarie saknas');
      const ersättIndex = skaErsättaSaknas
        ? befintligaBlock.findIndex((block) =>
            block.toLowerCase().startsWith('vikarie saknas') && vikarieBlockNyckel(block) === nyttNyckel
          )
        : -1;
      const dubblettIndex = nyttPersonTid
        ? befintligaBlock.findIndex((block) =>
            vikarieBlockPersonTidNyckel(block) === nyttPersonTid &&
            (nyttHarGrupp || vikarieBlockHarGrupp(block))
          )
        : -1;

      if (ersättIndex !== -1) {
        befintligaBlock[ersättIndex] = nyttBlock;
      } else if (dubblettIndex !== -1) {
        if (nyttHarGrupp || !vikarieBlockHarGrupp(befintligaBlock[dubblettIndex])) {
          befintligaBlock[dubblettIndex] = nyttBlock;
        }
      } else if (!befintligaBlock.includes(nyttBlock)) {
        befintligaBlock.push(nyttBlock);
      }
    }

    return befintligaBlock.sort(sorteraVikarieBlock).join(separator);
  }

  let resultat = befintlig.trimEnd();
  for (const del of delar) {
    if (!resultat.includes(del)) resultat += `${separator}${del}`;
  }

  return resultat;
}

function vikarieBlockNyckel(block: string) {
  const rader = block.split('\n').map((rad) => rad.trim()).filter(Boolean);
  const huvudrad = rader[0] ?? '';
  const tidrad = rader.find((rad) => /^\(?\d{1,2}[:.]\d{2}/.test(rad)) ?? '';
  const grupp = huvudrad.split(' - ').slice(1).join(' - ').trim().toLowerCase();
  const tidText = tidrad.replace(/[()]/g, '').replace(/\s+/g, '');

  return grupp && tidText ? `${grupp}|${tidText}` : null;
}

function vikarieBlockPersonTidNyckel(block: string) {
  const rader = block.split('\n').map((rad) => rad.trim()).filter(Boolean);
  const huvudrad = rader[0] ?? '';
  const tidrad = rader.find((rad) => /^\(?\d{1,2}[:.]\d{2}/.test(rad)) ?? '';
  const namn = huvudrad.split(' - ')[0]?.trim().toLowerCase();
  const tidText = tidrad.replace(/[()]/g, '').replace(/\s+/g, '');

  return namn && tidText ? `${namn}|${tidText}` : null;
}

function vikarieBlockHarGrupp(block: string) {
  const huvudrad = block.split('\n').map((rad) => rad.trim()).find(Boolean) ?? '';
  return huvudrad.includes(' - ');
}

function sorteraVikarieBlock(a: string, b: string) {
  return (
    vikarieBlockGruppIndex(a) - vikarieBlockGruppIndex(b) ||
    vikarieBlockStartMinuter(a) - vikarieBlockStartMinuter(b) ||
    a.localeCompare(b, 'sv')
  );
}

function vikarieBlockGruppIndex(block: string) {
  const huvudrad = block.split('\n').map((rad) => rad.trim()).find(Boolean) ?? '';
  const grupp = huvudrad.split(' - ').slice(1).join(' - ').trim().toLowerCase().replace(/\s+/g, '');

  if (!grupp) return 98;
  if (grupp.includes('fsk') || grupp.includes('förskole') || grupp.includes('forskole')) return 0;

  const match = grupp.match(/(?:åk\.?|ak\.?)?([1-6])/);
  if (match) return Number(match[1]);

  if (grupp.includes('prest')) return 7;
  return 99;
}

function vikarieBlockStartMinuter(block: string) {
  const tidrad = block.split('\n').map((rad) => rad.trim()).find((rad) => /^\(?\d{1,2}[:.]\d{2}/.test(rad)) ?? '';
  const match = tidrad.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return 24 * 60;

  return Number(match[1]) * 60 + Number(match[2]);
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

function baraFörnamn(namn?: string | null, fallback = 'Okänd') {
  const text = namn?.trim();
  return text ? text.split(/\s+/)[0] : fallback;
}

function frånvaroText(f: Frånvaro, _formatNamn: NamnFormatter) {
  const tidText = f.hel_dag ? '' : ` (${tid(f.tid_från)}-${tid(f.tid_till)})`;
  return `${baraFörnamn(f.personal?.namn)}${tidText}`;
}

function utskickGruppText(grupp?: string | null) {
  const text = (grupp ?? '').trim();
  if (!text) return '';

  const kompakt = text.toLowerCase().replace(/\s+/g, '');

  if (kompakt.includes('fsk') || kompakt.includes('förskole') || kompakt.includes('forskole')) return 'FSK';
  if (kompakt.includes('prest')) return 'PREST';

  const delar = text.split(/[,/]+/).map((del) => del.trim()).filter(Boolean);
  const årskurser = delar
    .map((del) => del.match(/(?:åk\.?|ak\.?)?\s*([1-6])\s*[a-zåäö]?/i)?.[1])
    .filter(Boolean);

  if (årskurser.length > 0 && årskurser.length === delar.length && new Set(årskurser).size === 1) {
    return `Åk.${årskurser[0]}`;
  }

  const ensam = text.match(/^(?:åk\.?|ak\.?)?\s*([1-6])\s*[a-zåäö]?$/i)?.[1];
  if (ensam) return `Åk.${ensam}`;

  return text;
}

function vikarieText(pass: Vikariepass, formatNamn: NamnFormatter, vikarierById: Map<string, Vikarie>) {
  const bokadVikarie = pass.vikarie_id ? vikarierById.get(pass.vikarie_id)?.namn ?? pass.vikarie?.namn : null;
  const riktadVikarie = pass.riktad_till_vikarie_id ? vikarierById.get(pass.riktad_till_vikarie_id)?.namn : null;
  const namn = bokadVikarie
    ? formatNamn(bokadVikarie)
    : riktadVikarie
      ? `Tillfrågad: ${formatNamn(riktadVikarie)}`
      : 'Vikarie saknas';

  const grupp = utskickGruppText(pass.grupp ?? pass.personal?.arbetslag?.namn);
  const gruppText = grupp ? ` - ${grupp}` : '';
  return `${namn}${gruppText}\n(${tid(pass.tid_från)}-${tid(pass.tid_till)})`;
}

function htmlCell(text: string) {
  const trimmed = text.trim();
  return trimmed ? esc(trimmed).replace(/\n/g, '<br>') : '&nbsp;';
}

function htmlVikarieCell(text: string) {
  const trimmed = normaliseraVikarieRadbrytningar(text);
  if (!trimmed) return '&nbsp;';

  return trimmed
    .split('\n')
    .map((rad) => {
      const clean = rad.trim();
      if (!clean) return '';
      const ärTid = /^\(?\d{1,2}[:.]\d{2}/.test(clean);
      const innehåll = esc(clean);
      return ärTid ? innehåll : `<strong>${innehåll}</strong>`;
    })
    .join('<br>');
}

function normaliseraVikarieRadbrytningar(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((rad) => rad.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlLänkRad(rad: string) {
  const trimmed = rad.trim();
  if (!trimmed) return '';

  const delar = trimmed.split('|').map((del) => del.trim());
  let label = delar[0];
  let url = delar[1];

  const urlMatch = trimmed.match(/https?:\/\/\S+/);
  if (!url && urlMatch) {
    url = urlMatch[0];
    label = trimmed.replace(url, '').replace(/[-–|:]+$/g, '').trim() || url;
  }

  if (!url) {
    return `<div style="margin:0 0 2px 0;line-height:1.25;font-weight:400;">${esc(trimmed)}</div>`;
  }

  return `<div style="margin:0 0 2px 0;line-height:1.25;"><a href="${esc(url)}" style="color:#8fc7da;text-decoration:underline;font-weight:400;">${esc(label)}</a></div>`;
}

function htmlKontaktRad(rad: string) {
  const trimmed = rad.trim();
  if (!trimmed) return '';
  return `<div style="margin:0 0 2px 0;line-height:1.25;font-weight:400;">${esc(trimmed)}</div>`;
}

function htmlExtraBlock(rubrik: string, text: string, typ: 'lankar' | 'kontakt') {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const innehåll = typ === 'lankar'
    ? trimmed.split('\n').map(htmlLänkRad).join('')
    : trimmed.split('\n').map(htmlKontaktRad).join('');

  return `
  <div style="margin-top:18px;font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt;line-height:1.25;font-weight:400;">
    <div style="font-size:12pt;font-weight:700;margin:0 0 5px 0;">${esc(rubrik)}:</div>
    ${innehåll}
  </div>`;
}

function byggHtml({
  dagar,
  cellText,
  extraText,
  ingressText,
}: {
  dagar: Date[];
  cellText: (datum: string, typ: CellTyp) => string;
  extraText: (typ: ExtraTyp) => string;
  ingressText: string;
}) {
  const font = 'font-family:Aptos,Calibri,Arial,sans-serif;font-size:10pt;line-height:1.25;';
  const axisFont = 'font-family:Aptos,Calibri,Arial,sans-serif;font-size:12pt;line-height:1.25;font-weight:700;';
  const cell = `border:1px solid #666666;padding:10px;text-align:center;vertical-align:middle;white-space:normal;${font}`;
  const head = `border:1px solid #666666;padding:7px;text-align:center;${axisFont}`;
  const label = `border:1px solid #666666;padding:10px;text-align:center;vertical-align:middle;${axisFont}`;

  const rows = [
    `<tr><th style="${label};width:80px;">Vecka</th>${dagar.map((dag) => `<th style="${head};width:216px;">${esc(dag.toLocaleDateString('sv-SE', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase()))}</th>`).join('')}</tr>`,
    `<tr><th style="${head}">${veckaNummer(dagar[0])}</th>${dagar.map((dag) => `<th style="${head}">${esc(kortDatum(dag))}</th>`).join('')}</tr>`,
    `<tr><th style="${label};height:110px;">Frånvaro</th>${dagar.map((dag) => `<td style="${cell};height:110px;">${htmlCell(cellText(iso(dag), 'franvaro'))}</td>`).join('')}</tr>`,
    `<tr><th style="${label};height:230px;">Vikarie</th>${dagar.map((dag) => `<td style="${cell};height:230px;">${htmlVikarieCell(cellText(iso(dag), 'vikarie'))}</td>`).join('')}</tr>`,
    `<tr><th style="${label};height:170px;">Övrigt</th>${dagar.map((dag) => `<td style="${cell};height:170px;">${htmlCell(cellText(iso(dag), 'ovrigt'))}</td>`).join('')}</tr>`,
  ].join('');

  return `
<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt;line-height:1.25;">
<div style="margin:0 0 24px 0;white-space:normal;">${esc(ingressText).replace(/\n/g, '<br>')}<br><br></div>  
  <table width="1160" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;font-family:Aptos,Calibri,Arial,sans-serif;">
    ${rows}
  </table>
  ${extraText('lankar').trim() ? '<br><br>' : ''}
  ${htmlExtraBlock('Länkar', extraText('lankar'), 'lankar')}
  ${extraText('kontakt').trim() ? '<br>' : ''}
  ${htmlExtraBlock('Kontaktuppgifter', extraText('kontakt'), 'kontakt')}
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
  const [uppdaterar, setUppdaterar] = useState(false);
  const [kopierat, setKopierat] = useState(false);
  const [fel, setFel] = useState('');
  const [uppdateringsInfo, setUppdateringsInfo] = useState('');
  const [uppdateringsDetaljer, setUppdateringsDetaljer] = useState<string[]>([]);
  const [rutaStorlek, setRutaStorlek] = useState<'normal' | 'stor' | 'max'>('normal');

  const start = useMemo(() => startPåVecka(new Date(`${veckaStart}T12:00:00`)), [veckaStart]);
  const dagar = useMemo(() => [0, 1, 2, 3, 4].map((i) => läggTillDagar(start, i)), [start]);
  const startIso = iso(dagar[0]);
  const slutIso = iso(dagar[4]);
  const formatNamn = useMemo(() => skapaNamnFormatter(frånvaro, pass, vikarier), [frånvaro, pass, vikarier]);
  const vikarierById = useMemo(() => new Map(vikarier.map((v) => [v.id, v])), [vikarier]);

  const rutaStorlekKlasser = {
    normal: { franvaro: 'min-h-32', vikarie: 'min-h-64', ovrigt: 'min-h-36' },
    stor: { franvaro: 'min-h-48', vikarie: 'min-h-96', ovrigt: 'min-h-56' },
    max: { franvaro: 'min-h-64', vikarie: 'min-h-[34rem]', ovrigt: 'min-h-72' },
  } as const;
  const aktuellRutaStorlek = rutaStorlekKlasser[rutaStorlek];

  useEffect(() => {
    async function ladda() {
      setLaddar(true);
      setFel('');

      const [fRes, pRes, vRes, cRes, eRes] = await Promise.all([
        frånvaroApi.lista(startIso, slutIso),
        passApi.lista({ datumFrån: startIso, datumTill: slutIso }),
        vikariApi.lista(),
        supabase.from('utskick_celler').select('*').gte('datum', startIso).lte('datum', slutIso),
        supabase.from('utskick_celler').select('*').eq('datum', GLOBAL_CELL_DATE).in('typ', extraTyper),
      ]);

      const frånvaroData = (fRes.data ?? []) as Frånvaro[];
      const passData = (pRes.data ?? []) as Vikariepass[];
      const vikarieData = (vRes.data ?? []) as Vikarie[];

      setFrånvaro(frånvaroData);
      setPass(passData);
      setVikarier(vikarieData);

      if (cRes.error || eRes.error) {
        setFel('Redigering kan inte sparas förrän databasmigrationen är körd.');
        setCeller({});
      } else {
        const map: Record<string, string> = {};
        for (const rad of cRes.data ?? []) map[cellKey(rad.datum, rad.typ as CellTyp)] = rad.text ?? '';
        for (const rad of eRes.data ?? []) map[cellKey(GLOBAL_CELL_DATE, rad.typ as ExtraTyp)] = rad.text ?? '';
        setCeller(map);
      }

      setLaddar(false);
    }

    ladda();
  }, [startIso, slutIso]);

  function grundText(
    datum: string,
    typ: CellTyp,
    frånvaroKälla = frånvaro,
    passKälla = pass,
    vikarierKälla = vikarier
  ) {
    const namnFormatter = skapaNamnFormatter(frånvaroKälla, passKälla, vikarierKälla);
    const vikarieMap = new Map(vikarierKälla.map((v) => [v.id, v]));

    if (typ === 'franvaro') {
      return frånvaroFörDag(frånvaroKälla, datum)
        .map((f) => frånvaroText(f, namnFormatter))
        .join('\n');
    }

    if (typ === 'vikarie') {
      return passFörDag(passKälla, datum)
        .sort(sorteraPass)
        .map((p) => vikarieText(p, namnFormatter, vikarieMap))
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

  function textFörExtra(typ: ExtraTyp) {
    if (typ === 'ingress') return celler[cellKey(GLOBAL_CELL_DATE, typ)] ?? standardIngress();
    return celler[cellKey(GLOBAL_CELL_DATE, typ)] ?? '';
  }

  function uppdateraExtra(typ: ExtraTyp, text: string) {
    setCeller((prev) => ({ ...prev, [cellKey(GLOBAL_CELL_DATE, typ)]: text }));
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

    const extraRader = extraTyper.map((typ) => ({
      datum: GLOBAL_CELL_DATE,
      typ,
      text: textFörExtra(typ),
    }));

    const res = await supabase.from('utskick_celler').upsert([...rader, ...extraRader], { onConflict: 'datum,typ' });
    setSparar(false);

    if (res.error) {
      setFel(res.error.message);
      return false;
    }

    return true;
  }

  async function uppdateraFrånvaroOchBemanning() {
    setUppdaterar(true);
    setFel('');
    setUppdateringsInfo('');
    setUppdateringsDetaljer([]);

    const [fRes, pRes, vRes] = await Promise.all([
      frånvaroApi.lista(startIso, slutIso),
      passApi.lista({ datumFrån: startIso, datumTill: slutIso }),
      vikariApi.lista(),
    ]);

    if (fRes.error || pRes.error || vRes.error) {
      setFel(fRes.error?.message ?? pRes.error?.message ?? vRes.error?.message ?? 'Kunde inte uppdatera utskicket.');
      setUppdaterar(false);
      return;
    }

    const nyFrånvaro = (fRes.data ?? []) as Frånvaro[];
    const nyaPass = (pRes.data ?? []) as Vikariepass[];
    const nyaVikarier = (vRes.data ?? []) as Vikarie[];

    setFrånvaro(nyFrånvaro);
    setPass(nyaPass);
    setVikarier(nyaVikarier);
    const nästa = { ...celler };
    let ändrade = 0;
    const detaljer: string[] = [];

    for (const dag of dagar) {
      const datum = iso(dag);
      for (const typ of ['franvaro', 'vikarie'] as const) {
        const key = cellKey(datum, typ);
        const gammalText = nästa[key] ?? '';
        const nyText = grundText(datum, typ, nyFrånvaro, nyaPass, nyaVikarier);
        const uppdateradText = slåIhopText(gammalText, nyText, typ);
        if (uppdateradText !== gammalText) {
          ändrade += 1;
          detaljer.push(`${kortDatum(dag)} · ${typ === 'franvaro' ? 'Frånvaro' : 'Vikarie'}`);
        }
        nästa[key] = uppdateradText;
      }
    }

    setCeller(nästa);
    setUppdateringsDetaljer(detaljer);
    setUppdateringsInfo(
      ändrade > 0
        ? `${ändrade} auto-fält uppdaterades. Manuell övrigt-text ändrades inte.`
        : 'Ingen ny auto-data hittades. Manuell övrigt-text ändrades inte.'
    );

    setUppdaterar(false);
  }

  async function skickaMail() {
    const sparat = await sparaCeller();
    if (!sparat) return;

    const textFörMail = (datum: string, typ: CellTyp) => {
      const text = textFörCell(datum, typ);
      return typ === 'vikarie' ? normaliseraVikarieRadbrytningar(text) : text;
    };

    const dagensDatum = new Date();
    const ingressText = byggIngress(textFörExtra('ingress'), dagensDatum);
    const html = byggHtml({ dagar, cellText: textFörMail, extraText: textFörExtra, ingressText });
    const plain = [
      ingressText,
      '',
      ...dagar.map((dag) => {
        const datum = iso(dag);
        return [
          dag.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'numeric' }),
          `Frånvaro:\n${textFörCell(datum, 'franvaro') || '-'}`,
          `Vikarie:\n${textFörMail(datum, 'vikarie') || '-'}`,
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

    const ämne = `Frånvarolista - ${långtDatum(dagensDatum)}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(ämne)}`;
  }

  if (laddar) return <LaddaSida />;

  return (
    <div className="flex min-h-full flex-col overflow-hidden p-2 pb-24 sm:p-3 lg:p-4">
      <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Utskick</h1>
          <p className="text-sm leading-5" style={{ color: 'var(--text-muted)' }}>
            Vecka {veckaNummer(start)} · {kortDatum(dagar[0])} - {kortDatum(dagar[4])}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button variant="secondary" onClick={uppdateraFrånvaroOchBemanning} loading={uppdaterar}>Uppdatera</Button>
          <Button onClick={skickaMail}>{kopierat ? 'Kopierat' : 'Skicka mail'}</Button>
        </div>
      </div>

      {uppdateringsInfo && (
        <div className="mb-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
          <p>{uppdateringsInfo}</p>
          {uppdateringsDetaljer.length > 0 && (
            <p className="mt-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
              Ändrat: {uppdateringsDetaljer.slice(0, 8).join(', ')}
              {uppdateringsDetaljer.length > 8 ? ` + ${uppdateringsDetaljer.length - 8} till` : ''}
            </p>
          )}
        </div>
      )}

      <div className="mb-2 flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-2">
          <Button variant="secondary" size="sm" onClick={() => bytVecka(-1)}>
            <PeriodIkon typ="föregående" />
            <span className="hidden min-[390px]:inline">Föregående</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setVeckaStart(iso(startPåVecka(new Date())))}>
            <PeriodIkon typ="idag" />
            <span>Idag</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => bytVecka(1)}>
            <span className="hidden min-[390px]:inline">Nästa</span>
            <PeriodIkon typ="nästa" />
          </Button>
        </div>

        <details className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <summary className="cursor-pointer list-none text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Inställningar
          </summary>
          <div className="mt-3 grid gap-2 sm:flex sm:items-center">
            <div className="flex items-center gap-1 rounded-xl border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            {(['normal', 'stor', 'max'] as const).map((storlek) => {
              const aktiv = rutaStorlek === storlek;
              const label = storlek === 'normal' ? 'Normal' : storlek === 'stor' ? 'Stor' : 'Max';

              return (
                <button
                  key={storlek}
                  type="button"
                  onClick={() => setRutaStorlek(storlek)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                  style={{
                    background: aktiv ? 'var(--accent)' : 'transparent',
                    color: aktiv ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {label}
                </button>
              );
            })}
            </div>
            <input
              type="date"
              value={veckaStart}
              onChange={(e) => setVeckaStart(iso(startPåVecka(new Date(`${e.target.value}T12:00:00`))))}
              className="rounded-xl border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <Button variant="secondary" size="sm" onClick={sparaCeller} loading={sparar}>Spara text</Button>
          </div>
        </details>
      </div>

      {fel && (
        <div className="mb-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#f97316', background: 'rgba(249,115,22,0.12)', color: '#fb923c' }}>
          {fel}
        </div>
      )}

      <div className="hidden flex-1 overflow-auto rounded-xl border md:block" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <table className="min-w-[1180px] w-full border-collapse text-sm" style={{ color: 'var(--text)' }}>
          <thead>
            <tr>
              <th className="w-24 border px-3 py-3 text-left" style={{ borderColor: 'var(--border)' }}>Vecka</th>
              {dagar.map((dag) => (
                <th key={iso(dag)} className="border px-3 py-3 text-center" style={{ borderColor: 'var(--border)' }}>
                  {dag.toLocaleDateString('sv-SE', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase())}
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
              { typ: 'franvaro' as const, label: 'Frånvaro', minH: aktuellRutaStorlek.franvaro },
              { typ: 'vikarie' as const, label: 'Vikarie', minH: aktuellRutaStorlek.vikarie },
              { typ: 'ovrigt' as const, label: 'Övrigt', minH: aktuellRutaStorlek.ovrigt },
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
                        className={`${rad.minH} w-full resize-y rounded-lg border px-3 py-2 text-center text-sm leading-6`}
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

      <div className="flex flex-1 snap-x gap-3 overflow-x-auto pb-3 md:hidden">
        {dagar.map((dag) => {
          const datum = iso(dag);

          return (
            <section
              key={datum}
              className="w-[86vw] shrink-0 snap-start rounded-xl border p-3"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
            >
              <div className="mb-3">
                <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>
                  {dag.toLocaleDateString('sv-SE', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase())}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {kortDatum(dag)} · vecka {veckaNummer(start)}
                </p>
              </div>

              <div className="space-y-3">
                {cellTyper.map((typ) => {
                  const label = typ === 'franvaro' ? 'Frånvaro' : typ === 'vikarie' ? 'Vikarie' : 'Övrigt';
                  const minH = aktuellRutaStorlek[typ];

                  return (
                    <label key={typ} className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        {label}
                      </span>
                      <textarea
                        value={textFörCell(datum, typ)}
                        onChange={(e) => uppdateraCell(datum, typ, e.target.value)}
                        placeholder="Skriv egen text..."
                        className={`${minH} w-full resize-y rounded-lg border px-3 py-2 text-center text-sm leading-6`}
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>


      <details className="mt-3 rounded-xl border p-3 md:mt-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Fasta uppgifter i utskick
        </summary>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Ingress, länkar och kontaktuppgifter sparas globalt och följer med oavsett vecka.
        </p>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section className="lg:col-span-2">
            <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text)' }}>Ingress</label>
            <textarea
              value={textFörExtra('ingress')}
              onChange={(e) => uppdateraExtra('ingress', e.target.value)}
              placeholder={'God morgon,\nhär är frånvaron för {datum}\n\nPåminnelsetext...'}
              className="min-h-32 w-full resize-y rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Skriv {'{datum}'} där dagens datum ska stå.
            </p>
          </section>

          <section>
            <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text)' }}>Länkar</label>
            <textarea
              value={textFörExtra('lankar')}
              onChange={(e) => uppdateraExtra('lankar', e.target.value)}
              placeholder={'En rad per länk. Exempel:\nAnmälan - kränkning | https://...\nSchema | https://...'}
              className="min-h-32 w-full resize-y rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
          </section>

          <section>
            <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text)' }}>Kontaktuppgifter</label>
            <textarea
              value={textFörExtra('kontakt')}
              onChange={(e) => uppdateraExtra('kontakt', e.target.value)}
              placeholder={'Exempel:\nNamn: 08 - 000 00 00\nNamn: 08 - 000 00 00'}
              className="min-h-32 w-full resize-y rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
          </section>
        </div>
      </details>

      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        Skicka mail kopierar tabellen och öppnar ett tomt mejl med ämnesrad. Klistra in direkt med Ctrl+V.
      </p>
    </div>
  );
}
