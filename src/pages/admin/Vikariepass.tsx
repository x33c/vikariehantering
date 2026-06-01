import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { passApi, historikApi, vikariApi, notisApi, personalApi, frånvaroApi, passmeddelandeApi } from '../../lib/api';
import type { Bemanning, PassStatus, Vikarie, Passhistorik, Personal, VikarieTillgänglighet, Schemarad, Passmeddelande } from '../../types';
import { PASS_STATUS_LABELS, PASS_STATUS_COLORS, HÄNDELSE_LABELS } from '../../types';
import { Button, Input, Select, TomtTillstånd, LaddaSida, StatusBadge, Alert, Modal, Confirm } from '../../components/ui';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

const ALLA_STATUSAR: PassStatus[] = ['obokat', 'notifierat', 'bokat', 'bekräftat', 'avbokat'];
const STANDARD_TID_FRÅN = '08:00';
const STANDARD_TID_TILL = '16:30';
type SnabbFilterTyp = 'alla' | 'atgard' | 'lediga' | 'bokade' | 'ej_publicerade' | 'arkiv';

const SNABBFILTER: { id: SnabbFilterTyp; label: string }[] = [
  { id: 'atgard', label: 'Att göra' },
  { id: 'alla', label: 'Alla' },
  { id: 'lediga', label: 'Lediga' },
  { id: 'bokade', label: 'Bokade' },
  { id: 'ej_publicerade', label: 'Ej publicerade' },
  { id: 'arkiv', label: 'Arkiv' },
];

const SYNLIGA_SNABBFILTER_KEY = 'bemanning_synliga_snabbfilter_v1';

function minuter(tid?: string | null) {
  const [h, m] = (tid?.slice(0, 5) ?? '00:00').split(':').map(Number);
  return h * 60 + m;
}

function isoDatum(datum: Date) {
  return datum.toISOString().slice(0, 10);
}

function veckaStartIso(datum: string) {
  const d = new Date(`${datum}T12:00:00`);
  const veckodag = d.getDay() || 7;
  d.setDate(d.getDate() - veckodag + 1);
  return isoDatum(d);
}

function läggTillDagarIso(datum: string, dagar: number) {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + dagar);
  return isoDatum(d);
}

function datumIntervall(start: string, slut: string) {
  const datum: string[] = [];
  const aktuell = new Date(`${start}T12:00:00`);
  const sista = new Date(`${slut}T12:00:00`);

  while (aktuell <= sista) {
    datum.push(isoDatum(aktuell));
    aktuell.setDate(aktuell.getDate() + 1);
  }

  return datum;
}

function datumSegment(datum: string[]) {
  const sorterade = [...datum].sort();
  const segment: Array<{ start: string; slut: string }> = [];

  for (const dag of sorterade) {
    const senaste = segment[segment.length - 1];
    if (!senaste || läggTillDagarIso(senaste.slut, 1) !== dag) {
      segment.push({ start: dag, slut: dag });
    } else {
      senaste.slut = dag;
    }
  }

  return segment;
}

function kortVeckodag(datum: string) {
  return new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', {
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

function veckonummer(datum: string) {
  const d = new Date(`${datum}T12:00:00`);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const vecka1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - vecka1.getTime()) / 86400000 - 3 + ((vecka1.getDay() + 6) % 7)) / 7);
}


function ärPassPasserat(pass: { datum: string; tid_till: string }) {
  const sluttid = pass.tid_till?.slice(0, 5) || '23:59';
  return new Date(`${pass.datum}T${sluttid}:00`).getTime() < Date.now();
}

function ärGruppPasserad(grupp: { pass: Array<{ datum: string; tid_till: string }> }) {
  return grupp.pass.length > 0 && grupp.pass.every(ärPassPasserat);
}

function tomTillNull(value?: string | null) {
  return value && value.trim() ? value : null;
}

function veckodagarFörVecka(start: string) {
  const bas = new Date(`${start}T12:00:00`);
  const dag = bas.getDay() || 7;
  bas.setDate(bas.getDate() - dag + 1);

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(bas);
    d.setDate(bas.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function veckodagFörDatum(datum: string) {
  return new Date(`${datum}T12:00:00`).getDay();
}

function hittaTillgänglighetFörDatum(poster: VikarieTillgänglighet[], datum: string) {
  const specifik = poster.find(t => t.datum === datum);
  if (specifik) return specifik;

  const veckodag = veckodagFörDatum(datum);
  return poster.find(t => t.återkommande && t.veckodag === veckodag) ?? null;
}

function ärAvbokningsförfrågan(meddelande?: string | null) {
  const text = (meddelande ?? '').toLowerCase();
  return text.includes('avboka') || text.includes('avbokning');
}

function notisFelText(error: unknown) {
  if (!error) return 'Okänt fel.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message);
  return String(error);
}


interface Passgrupp {
  personal_id: string;
  personalNamn: string;
  arbetslagNamn?: string;
  datum: string;
  pass: Bemanning[];
}

function arbetslagSortIndex(value?: string | null) {
  const text = (value ?? '').toLowerCase().replace(/\s+/g, '');

  if (!text) return 99;
  if (text.includes('fsk') || text.includes('förskole') || text.includes('forskole')) return 0;
  if (text.includes('prest') || text.includes('PREST')) return 7;

  const match = text.match(/(?:åk\.?|ak\.?)?([1-6])/) ?? text.match(/^([1-6])/);
  return match ? Number(match[1]) : 99;
}

function passgruppSortIndex(grupp: Passgrupp) {
  const passGruppIndex = grupp.pass
    .map((p) => arbetslagSortIndex(p.grupp))
    .reduce((bäst, index) => Math.min(bäst, index), 99);

  if (passGruppIndex !== 99) return passGruppIndex;

  const fallbackIndex = [
    grupp.arbetslagNamn,
    ...grupp.pass.map((p) => p.personal?.arbetslag?.namn),
  ].reduce((bäst, värde) => Math.min(bäst, arbetslagSortIndex(värde)), 99);

  return fallbackIndex;
}

function sorteraPassgrupper(a: Passgrupp, b: Passgrupp, fallandeDatum = false) {
  const datumSort = fallandeDatum ? b.datum.localeCompare(a.datum) : a.datum.localeCompare(b.datum);
  if (datumSort !== 0) return datumSort;

  return (
    passgruppSortIndex(a) - passgruppSortIndex(b) ||
    a.personalNamn.localeCompare(b.personalNamn, 'sv') ||
    minuter(a.pass[0]?.tid_från) - minuter(b.pass[0]?.tid_från)
  );
}

function grupperaPasser(pass: Bemanning[]): Passgrupp[] {
  const grupper = new Map<string, Passgrupp>();
  for (const p of pass) {
    const nyckel = `${p.personal_id ?? p.id}_${p.datum}`;
    if (!grupper.has(nyckel)) {
      grupper.set(nyckel, {
        personal_id: p.personal_id ?? p.id,
        personalNamn: p.personal?.namn ?? 'Fristående pass',
        arbetslagNamn: p.personal?.arbetslag?.namn,
        datum: p.datum,
        pass: [],
      });
    }
    grupper.get(nyckel)!.pass.push(p);
  }
  return [...grupper.values()].sort((a, b) =>
    a.datum !== b.datum ? a.datum.localeCompare(b.datum) : a.personalNamn.localeCompare(b.personalNamn)
  );
}

function meddelandeAvsandareNamn(m: Passmeddelande, fallbackVikarie?: string | null) {
  const namn = m.avsandare?.namn ?? m.avsandare?.epost;
  if (namn) return m.avsandare_roll === 'admin' ? `Admin: ${namn}` : namn;
  return m.avsandare_roll === 'admin' ? 'Admin' : fallbackVikarie ?? 'Vikarie';
}

function notisHistorikText(metadata: Record<string, unknown>) {
  const mottagare = typeof metadata.notis_mottagare === 'string' && metadata.notis_mottagare.trim()
    ? ` till ${metadata.notis_mottagare}`
    : '';
  const meddelande = typeof metadata.notis_meddelande === 'string' && metadata.notis_meddelande.trim()
    ? `: ${metadata.notis_meddelande}`
    : '';

  if (metadata.notis_skickad === true || metadata.notifiering === 'skickad') {
    return `Notis skickad${mottagare}${meddelande}`;
  }

  if (metadata.notis_skickad === false || metadata.notifiering === 'misslyckades') {
    const fel = typeof metadata.notis_fel === 'string' && metadata.notis_fel.trim()
      ? ` (${metadata.notis_fel})`
      : '';
    return `Notis misslyckades${mottagare}${fel}${meddelande}`;
  }

  return null;
}

function historikText(h: Passhistorik, vikarier: Vikarie[] = []) {
  const metadata = h.metadata ?? {};
  const vikarieId = typeof metadata.vikarie_id === 'string' ? metadata.vikarie_id : null;
  const uppslagetVikarieNamn = vikarieId ? vikarier.find(v => v.id === vikarieId)?.namn ?? null : null;
  const vikarieNamn = typeof metadata.vikarie_namn === 'string' ? metadata.vikarie_namn : uppslagetVikarieNamn;
  const profilNamn = h.utförd_av_profil?.namn ?? h.utförd_av_profil?.epost ?? null;
  const tillfrågad = typeof metadata.tillfrågad_vikarie_namn === 'string'
    ? metadata.tillfrågad_vikarie_namn
    : vikarieNamn ?? profilNamn;

  if (h.händelse === 'vikarie_borttagen' && metadata.svar === 'nej') {
    return tillfrågad ? `Vikarie tackade nej: ${tillfrågad}` : 'Vikarie tackade nej';
  }

  if (h.händelse === 'vikarie_bokat' && metadata.svar === 'ja') {
    return tillfrågad ? `Vikarie tackade ja: ${tillfrågad}` : 'Vikarie tackade ja';
  }

  if (h.händelse === 'vikarie_notifierat') {
    return tillfrågad ? `Förfrågan skickad till ${tillfrågad}` : 'Förfrågan skickad';
  }

  if (h.händelse === 'pass_uppdaterat' && metadata['åtgärd'] === 'ändrade_exkluderingar') {
    const namn = typeof metadata.exkluderade_vikarier === 'string' && metadata.exkluderade_vikarier.trim()
      ? metadata.exkluderade_vikarier
      : 'inga vikarier';
    return `Synlighet ändrad: dolt för ${namn}`;
  }

  if (h.händelse === 'pass_uppdaterat' && metadata['åtgärd'] === 'ändrade_grupp') {
    const tidigare = typeof metadata.tidigare_grupp === 'string' && metadata.tidigare_grupp.trim() ? metadata.tidigare_grupp : 'Ingen grupp';
    const ny = typeof metadata.grupp === 'string' && metadata.grupp.trim() ? metadata.grupp : 'Ingen grupp';
    const notisText = notisHistorikText(metadata);
    const text = `Grupp ändrad: ${tidigare} -> ${ny}`;
    return notisText ? `${text} · ${notisText}` : text;
  }

  if (h.händelse === 'pass_uppdaterat' && metadata['åtgärd'] === 'ändrade_ersatt_personal') {
    const tidigare = typeof metadata.tidigare_personal === 'string' && metadata.tidigare_personal.trim() ? metadata.tidigare_personal : 'Fristående pass';
    const ny = typeof metadata.personal === 'string' && metadata.personal.trim() ? metadata.personal : 'Fristående pass';
    const notisText = notisHistorikText(metadata);
    const text = `Ersätter ändrad: ${tidigare} -> ${ny}`;
    return notisText ? `${text} · ${notisText}` : text;
  }

  const bastext = HÄNDELSE_LABELS[h.händelse] ?? h.händelse.replace(/_/g, ' ');
  const notisText = notisHistorikText(metadata);
  return notisText ? `${bastext} · ${notisText}` : bastext;
}

function PassDetaljer({ pass, vikarier, personal, onStäng, onUppdaterad }: {
  pass: Bemanning;
  vikarier: Vikarie[];
  personal: Personal[];
  onStäng: () => void;
  onUppdaterad: (p: Bemanning) => void;
}) {
  const [historik, setHistorik] = useState<Passhistorik[]>([]);
  const [valdVikarieId, setValdVikarieId] = useState(pass.vikarie_id ?? pass.riktad_till_vikarie_id ?? '');
  const [tidFrån, setTidFrån] = useState(pass.tid_från.slice(0, 5));
  const [tidTill, setTidTill] = useState(pass.tid_till.slice(0, 5));
  const [grupp, setGrupp] = useState(pass.grupp ?? '');
  const [valdPersonalId, setValdPersonalId] = useState(pass.personal_id ?? '');
  const [personalSök, setPersonalSök] = useState('');
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState('');
  const [sparar, setSparar] = useState(false);
  const [meddelanden, setMeddelanden] = useState<Passmeddelande[]>([]);
  const [bokadeVikarier, setBokadeVikarier] = useState<Record<string, Bemanning>>({});
  const [tillgMap, setTillgMap] = useState<Record<string, VikarieTillgänglighet | null>>({});
  const [nyttMeddelande, setNyttMeddelande] = useState('');
  const [skickarMeddelande, setSkickarMeddelande] = useState(false);
  const [visaHistorik, setVisaHistorik] = useState(false);
  const [visaAllaVikarier, setVisaAllaVikarier] = useState(false);
  const [vikarieSök, setVikarieSök] = useState('');
  const [exkluderadeVikarieIds, setExkluderadeVikarieIds] = useState<Set<string>>(new Set());
  const [exkluderingSök, setExkluderingSök] = useState('');
  const [spararExkluderingar, setSpararExkluderingar] = useState(false);
  const [visaExkluderingar, setVisaExkluderingar] = useState(false);

  useEffect(() => {
    setTidFrån(pass.tid_från.slice(0, 5));
    setTidTill(pass.tid_till.slice(0, 5));
    setGrupp(pass.grupp ?? '');
    setValdPersonalId(pass.personal_id ?? '');
    setValdVikarieId(pass.vikarie_id ?? pass.riktad_till_vikarie_id ?? '');
  }, [pass.id, pass.tid_från, pass.tid_till, pass.grupp, pass.personal_id, pass.vikarie_id, pass.riktad_till_vikarie_id]);

  async function laddaHistorikFörPass() {
    const res = await historikApi.listaFörPass(pass.id);
    setHistorik((res.data ?? []) as Passhistorik[]);
  }

  async function laddaExkluderingar() {
    const res = await passApi.listaExkluderingar(pass.id);
    const ids = (res.data ?? []).map((rad: { vikarie_id: string }) => rad.vikarie_id);
    setExkluderadeVikarieIds(new Set(ids));
  }

  useEffect(() => {
    async function laddaPassdata() {
      const [historikRes, meddelandeRes] = await Promise.all([
        historikApi.listaFörPass(pass.id),
        passmeddelandeApi.lista(pass.id),
      ]);
      setHistorik((historikRes.data ?? []) as Passhistorik[]);
      setMeddelanden((meddelandeRes.data ?? []) as Passmeddelande[]);
      await laddaExkluderingar();
      setLaddar(false);
    }
    laddaPassdata();
  }, [pass.id]);
  useEffect(() => {
    async function laddaBokade() {
      const res = await passApi.lista({ datumFrån: pass.datum, datumTill: pass.datum, status: ["bokat", "bekräftat"] });
      const bokade: Record<string, Bemanning> = {};

      ((res.data ?? []) as Bemanning[]).forEach(p => {
        if (!p.vikarie_id || p.id === pass.id) return;

        const överlappar = pass.tid_från < p.tid_till && pass.tid_till > p.tid_från;
        if (överlappar) bokade[p.vikarie_id] = p;
      });

      setBokadeVikarier(bokade);
    }

    laddaBokade();
  }, [pass.datum, pass.id, pass.tid_från, pass.tid_till]);

  async function notifieraBokadVikarieOmPassÄndrats(data: Partial<Bemanning>) {
    const målVikarieId = typeof data.vikarie_id === 'string' ? data.vikarie_id : pass.vikarie_id;
    const målStatus = (data.status ?? pass.status) as PassStatus;
    const blirBokat = målStatus === 'bokat' || målStatus === 'bekräftat';
    const varBokat = !!pass.vikarie_id && (pass.status === 'bokat' || pass.status === 'bekräftat');
    const ändrarRelevant =
      'datum' in data ||
      'tid_från' in data ||
      'tid_till' in data ||
      'status' in data ||
      'publicerad' in data ||
      'grupp' in data ||
      'personal_id' in data ||
      'vikarie_id' in data;

    if (!målVikarieId || !blirBokat || !ändrarRelevant) return {};

    const vikarieNamn = vikarier.find(v => v.id === målVikarieId)?.namn ?? 'vikarien';
    const ärNyBokning = !varBokat || målVikarieId !== pass.vikarie_id;
    const ändringar: string[] = [];

    if (!ärNyBokning && 'grupp' in data && (data.grupp ?? '') !== (pass.grupp ?? '')) {
      ändringar.push(`Grupp ändrad: ${pass.grupp || 'Ingen grupp'} -> ${data.grupp || 'Ingen grupp'}`);
    }

    if (!ärNyBokning && 'personal_id' in data && (data.personal_id ?? '') !== (pass.personal_id ?? '')) {
      const nyPersonal = data.personal_id ? personal.find(p => p.id === data.personal_id)?.namn ?? 'vald personal' : 'Fristående pass';
      ändringar.push(`Ersätter ändrad: ${pass.personal?.namn ?? 'Fristående pass'} -> ${nyPersonal}`);
    }

    if (!ärNyBokning && typeof data.datum === 'string' && data.datum !== pass.datum) {
      ändringar.push(`Datum ändrat: ${pass.datum} -> ${data.datum}`);
    }

    const gammalStart = pass.tid_från.slice(0, 5);
    const gammaltSlut = pass.tid_till.slice(0, 5);
    const nyStart = (data.tid_från ?? pass.tid_från).slice(0, 5);
    const nyttSlut = (data.tid_till ?? pass.tid_till).slice(0, 5);

    if (!ärNyBokning && (nyStart !== gammalStart || nyttSlut !== gammaltSlut)) {
      if (nyStart !== gammalStart && nyttSlut !== gammaltSlut) {
        ändringar.push(`Tid ändrad: ${gammalStart}-${gammaltSlut} -> ${nyStart}-${nyttSlut}`);
      } else if (nyStart !== gammalStart) {
        ändringar.push(`Starttid ändrad: ${gammalStart} -> ${nyStart}`);
      } else {
        ändringar.push(`Sluttid ändrad: ${gammaltSlut} -> ${nyttSlut}`);
      }
    }

    if (!ärNyBokning && data.status === 'avbokat' && pass.status !== 'avbokat') {
      ändringar.push('Passet avbokades');
    }

    if (!ärNyBokning && 'publicerad' in data && data.publicerad !== pass.publicerad) {
      ändringar.push(data.publicerad ? 'Passet publicerades' : 'Passet doldes');
    }

    const meddelande = ärNyBokning
      ? 'Du har bokats på passet.'
      : ändringar.length > 0
        ? ändringar.join(' · ')
        : 'Passet har uppdaterats.';

    try {
      const { error } = await notisApi.skickaMeddelandeNotifiering(pass.id, 'admin', meddelande);
      return {
        notis_skickad: !error,
        notifiering: error ? 'misslyckades' : 'skickad',
        notis_typ: ärNyBokning ? 'ny_bokning' : 'pass_uppdaterat',
        notis_mottagare: vikarieNamn,
        notis_meddelande: meddelande,
        notis_fel: error?.message ?? null,
      };
    } catch (error) {
      return {
        notis_skickad: false,
        notifiering: 'misslyckades',
        notis_typ: ärNyBokning ? 'ny_bokning' : 'pass_uppdaterat',
        notis_mottagare: vikarieNamn,
        notis_meddelande: meddelande,
        notis_fel: error instanceof Error ? error.message : String(error),
      };
    }
  }


  async function uppdateraPass(data: Partial<Bemanning>, historik: Record<string, unknown>) {
    setSparar(true);
    setFel('');

    const res = await passApi.uppdatera(pass.id, data as any);

    if (res.error) {
      setSparar(false);
      setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message);
      return false;
    }

    const notisMetadata = await notifieraBokadVikarieOmPassÄndrats(data);

    await historikApi.skapa(pass.id, 'pass_uppdaterat', { ...historik, ...notisMetadata });
    await laddaHistorikFörPass();

    setSparar(false);
    const uppdateradPersonal = 'personal_id' in data
      ? personal.find(p => p.id === data.personal_id)
      : pass.personal;

    onUppdaterad({ ...pass, ...data, personal: uppdateradPersonal });
    return true;
  }

  async function sparaTider() {
    if (!tidFrån || !tidTill || tidFrån >= tidTill) {
      setFel('Ange en giltig start- och sluttid.');
      return;
    }

    await uppdateraPass(
      { tid_från: tidFrån, tid_till: tidTill } as Partial<Bemanning>,
      { åtgärd: 'ändrade_tider', tid_från: tidFrån, tid_till: tidTill }
    );
  }

  async function sparaPassÄndringar() {
    if (!tidFrån || !tidTill || tidFrån >= tidTill) {
      setFel('Ange en giltig start- och sluttid.');
      return;
    }

    if (!harPassÄndringar) return;

    const data: Partial<Bemanning> = {};
    const historik: Record<string, unknown> = {
      åtgärd: gruppÄndrad && tiderÄndrade ? 'ändrade_passdetaljer' : gruppÄndrad ? 'ändrade_grupp' : 'ändrade_tider',
    };

    if (gruppÄndrad) {
      data.grupp = normaliseradGrupp || null;
      historik.grupp = normaliseradGrupp || null;
      historik.gammal_grupp = pass.grupp ?? null;
    }

    if (tiderÄndrade) {
      data.tid_från = tidFrån;
      data.tid_till = tidTill;
      historik.tid_från = tidFrån;
      historik.tid_till = tidTill;
    }

    await uppdateraPass(data, historik);
  }

  async function sparaGrupp() {
    const nyGrupp = grupp.trim() || null;
    const gammalGrupp = pass.grupp ?? null;

    if ((nyGrupp ?? '') === (gammalGrupp ?? '')) return;

    await uppdateraPass(
      { grupp: nyGrupp } as Partial<Bemanning>,
      {
        åtgärd: 'ändrade_grupp',
        tidigare_grupp: gammalGrupp,
        grupp: nyGrupp,
      }
    );
  }

  async function sparaErsattPersonal() {
    const nyPersonalId = valdPersonalId || null;
    const gammalPersonalId = pass.personal_id ?? null;

    if ((nyPersonalId ?? '') === (gammalPersonalId ?? '')) return;

    const valdPersonal = nyPersonalId ? personal.find(p => p.id === nyPersonalId) : undefined;

    await uppdateraPass(
      { personal_id: nyPersonalId } as Partial<Bemanning>,
      {
        åtgärd: 'ändrade_ersatt_personal',
        tidigare_personal: pass.personal?.namn ?? null,
        personal: valdPersonal?.namn ?? null,
      }
    );
  }


  async function publiceraLedigt() {
    const skaNotifiera = !pass.publicerad;

    const ok = await uppdateraPass(
      {
        status: 'obokat',
        publicerad: true,
        vikarie_id: null,
        riktad_till_vikarie_id: null,
      } as Partial<Bemanning>,
      { åtgärd: 'publicerade_ledigt' }
    );

    if (ok && skaNotifiera) {
      const { error } = await notisApi.skickaLedigtPass(pass.id);
      if (error) {
        setFel(`Passet publicerades, men notisen kunde inte skickas: ${notisFelText(error)}`);
      }
    }
  }

  async function avpublicera() {
    await uppdateraPass(
      { publicerad: false } as Partial<Bemanning>,
      { åtgärd: 'avpublicerade_ledigt' }
    );
  }

  async function skickaFörfrågan() {
    if (!valdVikarieId) {
      setFel('Välj en vikarie först.');
      return;
    }

    setSparar(true);
    setFel('');

    const res = await passApi.uppdatera(pass.id, {
      status: 'notifierat',
      publicerad: false,
      vikarie_id: null,
      riktad_till_vikarie_id: valdVikarieId,
    } as any);

    if (res.error) {
      setSparar(false);
      setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message);
      return;
    }

    let notisMetadata: Record<string, unknown>;
    try {
      const { error } = await notisApi.skickaNotiser(pass.id, [valdVikarieId]);
      notisMetadata = {
        notis_skickad: !error,
        notifiering: error ? 'misslyckades' : 'skickad',
        notis_typ: 'förfrågan',
        notis_mottagare: valdVikarie?.namn ?? 'vikarien',
        notis_fel: error?.message ?? null,
      };
    } catch (error) {
      notisMetadata = {
        notis_skickad: false,
        notifiering: 'misslyckades',
        notis_typ: 'förfrågan',
        notis_mottagare: valdVikarie?.namn ?? 'vikarien',
        notis_fel: error instanceof Error ? error.message : String(error),
      };
    }

    await historikApi.skapa(pass.id, 'vikarie_notifierat', {
      vikarie_id: valdVikarieId,
      tillfrågad_vikarie_namn: valdVikarie?.namn,
      ...notisMetadata,
    });
    await laddaHistorikFörPass();

    setSparar(false);
    onUppdaterad({
      ...pass,
      status: 'notifierat',
      publicerad: false,
      vikarie_id: null,
      riktad_till_vikarie_id: valdVikarieId,
    });
  }

  async function bokaDirekt() {
    if (!valdVikarieId) {
      setFel('Välj en vikarie först.');
      return;
    }

    const ok = await uppdateraPass(
      {
        status: 'bokat',
        publicerad: false,
        vikarie_id: valdVikarieId,
        riktad_till_vikarie_id: null,
      } as Partial<Bemanning>,
      { åtgärd: 'bokade_direkt', vikarie_id: valdVikarieId }
    );

    if (ok) await historikApi.skapa(pass.id, 'vikarie_bokat', { vikarie_id: valdVikarieId, vikarie_namn: valdVikarie?.namn });
  }

  async function avbokaPass() {
    await uppdateraPass(
      {
        status: 'avbokat',
        publicerad: false,
        vikarie_id: null,
        riktad_till_vikarie_id: null,
      } as Partial<Bemanning>,
      { åtgärd: 'avbokade_pass' }
    );
  }

  async function skickaMeddelande() {
    if (!nyttMeddelande.trim()) return;
    const text = nyttMeddelande.trim();
    setSkickarMeddelande(true);
    setFel('');

    const res = await passmeddelandeApi.skapa(pass.id, text, 'admin');

    if (res.error) {
      setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad') ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.' : res.error.message);
    } else {
      await notisApi.skickaMeddelandeNotifiering(pass.id, 'admin', text);
      await historikApi.skapa(pass.id, 'pass_uppdaterat', { åtgärd: 'admin_meddelande' }, text);
      const ny = await passmeddelandeApi.lista(pass.id);
      setMeddelanden((ny.data ?? []) as Passmeddelande[]);
      setNyttMeddelande('');
    }

    setSkickarMeddelande(false);
  }

  async function raderaMeddelande(id: string) {
    if (!window.confirm('Ta bort meddelandet?')) return;

    const res = await passmeddelandeApi.radera(id);
    if (res.error) {
      setFel(res.error.message);
      return;
    }

    setMeddelanden(prev => prev.filter(m => m.id !== id));
    await historikApi.skapa(pass.id, 'pass_uppdaterat', { åtgärd: 'raderade_meddelande', meddelande_id: id });
  }


  const laddaTillgänglighet = useCallback(async () => {
    const poster = await Promise.all(
      vikarier.map(async (v) => {
        const res = await vikariApi.hämtaTillgänglighet(v.id);
        const rad = hittaTillgänglighetFörDatum((res.data ?? []) as VikarieTillgänglighet[], pass.datum);
        return [v.id, rad] as const;
      })
    );

    setTillgMap(Object.fromEntries(poster));
  }, [vikarier, pass.datum]);

  useEffect(() => {
    void laddaTillgänglighet();
  }, [laddaTillgänglighet]);

  useEffect(() => {
    function skaUppdatera(vikarieId?: string | null) {
      return !vikarieId || vikarier.some((v) => v.id === vikarieId);
    }

    function vidTillgänglighetÄndrad(event: Event) {
      const detail = (event as CustomEvent<{ vikarieId?: string | null }>).detail;
      if (skaUppdatera(detail?.vikarieId)) void laddaTillgänglighet();
    }

    function vidStorage(event: StorageEvent) {
      if (event.key !== 'passportalen:tillganglighet-andrad' || !event.newValue) return;

      try {
        const detail = JSON.parse(event.newValue) as { vikarieId?: string | null };
        if (skaUppdatera(detail.vikarieId)) void laddaTillgänglighet();
      } catch {
        void laddaTillgänglighet();
      }
    }

    window.addEventListener('passportalen:tillganglighet-andrad', vidTillgänglighetÄndrad);
    window.addEventListener('storage', vidStorage);

    return () => {
      window.removeEventListener('passportalen:tillganglighet-andrad', vidTillgänglighetÄndrad);
      window.removeEventListener('storage', vidStorage);
    };
  }, [laddaTillgänglighet, vikarier]);

  const tillsattVikarie = vikarier.find(v => v.id === pass.vikarie_id);
  const riktadVikarie = vikarier.find(v => v.id === pass.riktad_till_vikarie_id);
  const valdVikarie = vikarier.find(v => v.id === valdVikarieId);
  const personalSökTerm = personalSök.trim().toLowerCase();
  const filtreradPersonal = personal
    .filter(p => {
      if (!personalSökTerm) return true;
      return [p.namn, p.signatur, p.epost, p.arbetslag?.namn]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(personalSökTerm);
    })
    .slice(0, 80);
  const ersattPersonalÄndrad = valdPersonalId !== (pass.personal_id ?? '');
  const normaliseradGrupp = grupp.trim();
  const gruppÄndrad = normaliseradGrupp !== (pass.grupp ?? '');
  const tiderÄndrade = tidFrån !== pass.tid_från.slice(0, 5) || tidTill !== pass.tid_till.slice(0, 5);
  const harPassÄndringar = gruppÄndrad || tiderÄndrade;
  const rekommenderadeVikarier = [...vikarier]
    .map(v => {
      const tillg = tillgMap[v.id];
      const bokad = bokadeVikarier[v.id];
      let status = "okänd";
      let detalj = "Okänd tillgänglighet";

      if (bokad) {
        status = "bokad";
        detalj = `Bokad ${bokad.tid_från.slice(0, 5)}-${bokad.tid_till.slice(0, 5)}`;
      } else if (tillg?.tillgänglig) {
        status = "ledig";
        detalj = tillg.tid_från && tillg.tid_till
          ? `Tillgänglig ${tillg.tid_från.slice(0, 5)}-${tillg.tid_till.slice(0, 5)}`
          : "Tillgänglig heldag";
      } else if (tillg) {
        status = "otillgänglig";
        detalj = tillg.tid_från && tillg.tid_till
          ? `Inte tillgänglig ${tillg.tid_från.slice(0, 5)}-${tillg.tid_till.slice(0, 5)}`
          : "Inte tillgänglig";
      }

      return { vikarie: v, status, detalj };
    })
    .sort((a, b) => {
      const prioritet: Record<string, number> = { ledig: 0, okänd: 1, otillgänglig: 2, bokad: 3 };
      return (prioritet[a.status] ?? 9) - (prioritet[b.status] ?? 9) || a.vikarie.namn.localeCompare(b.vikarie.namn);
    });
  const rekommenderadeSynliga = rekommenderadeVikarier.slice(0, 4);
  const sökText = vikarieSök.trim().toLowerCase();
  const filtreradeVikarier = sökText
    ? rekommenderadeVikarier.filter(({ vikarie }) => vikarie.namn.toLowerCase().includes(sökText))
    : rekommenderadeVikarier;

  function vikarieStatusFärg(status: string) {
    if (status === 'ledig') return '#16a34a';
    if (status === 'bokad') return '#ef4444';
    if (status === 'otillgänglig') return '#f59e0b';
    return 'var(--text-muted)';
  }

  function väljVikarie(id: string) {
    setValdVikarieId(id);
    setVisaAllaVikarier(false);
    setVikarieSök('');
  }

  function växlaExkluderadVikarie(id: string) {
    setExkluderadeVikarieIds(prev => {
      const nästa = new Set(prev);
      if (nästa.has(id)) nästa.delete(id);
      else nästa.add(id);
      return nästa;
    });
  }

  async function sparaExkluderingar() {
    setSpararExkluderingar(true);
    setFel('');

    const ids = [...new Set([...exkluderadeVikarieIds].flatMap((id) => {
      const vald = vikarier.find(v => v.id === id);
      const epost = vald?.epost?.trim().toLowerCase();
      const profilId = vald?.profil_id;

      return vikarier
        .filter(v =>
          v.id === id ||
          (!!profilId && v.profil_id === profilId) ||
          (!!epost && v.epost?.trim().toLowerCase() === epost)
        )
        .map(v => v.id);
    }))];
    const res = await passApi.sparaExkluderingar(pass.id, ids);
    setSpararExkluderingar(false);

    if (res.error) {
      setFel(res.error.message);
      return;
    }

    const namn = ids
      .map(id => vikarier.find(v => v.id === id)?.namn)
      .filter(Boolean)
      .join(', ');

    await historikApi.skapa(pass.id, 'pass_uppdaterat', {
      åtgärd: 'ändrade_exkluderingar',
      exkluderade_vikarie_ids: ids,
      exkluderade_vikarier: namn || null,
    });
    await laddaHistorikFörPass();
  }

  const exkluderadeVikarier = vikarier.filter(v => exkluderadeVikarieIds.has(v.id));
  const exkluderingSökText = exkluderingSök.trim().toLowerCase();
  const filtreradeExkluderingVikarier = exkluderingSökText
    ? vikarier.filter(v => `${v.namn} ${v.epost ?? ''}`.toLowerCase().includes(exkluderingSökText))
    : vikarier;
  const harAktivBokning = !!pass.vikarie_id && (pass.status === 'bokat' || pass.status === 'bekräftat');
  const harAvbokningsförfrågan = harAktivBokning && meddelanden.some(m => m.avsandare_roll === 'vikarie' && ärAvbokningsförfrågan(m.meddelande));
  const valdVikarieHarKrock = !!valdVikarieId && !!bokadeVikarier[valdVikarieId];
  const valdVikarieÄrRedanBokadPåPasset = harAktivBokning && pass.vikarie_id === valdVikarieId;
  const kanBemannaMedValdVikarie = !!valdVikarieId && !valdVikarieHarKrock && !valdVikarieÄrRedanBokadPåPasset && pass.status !== 'avbokat';
  const kanSkickaFörfrågan = !!valdVikarieId && !valdVikarieHarKrock && pass.status !== 'avbokat';
  const bemanningsKnappText = harAktivBokning ? 'Byt vikarie' : 'Boka vald vikarie';

  return (
    <div className="flex max-h-[88vh] flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{pass.personal?.namn ?? 'Fristående pass'}</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {pass.datum} · {pass.tid_från.slice(0, 5)}-{pass.tid_till.slice(0, 5)}
          </p>
        </div>
        <button onClick={onStäng} className="rounded-full px-2 py-1 text-lg leading-none" style={{ color: 'var(--text-muted)' }}>×</button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {fel && <Alert typ="error">{fel}</Alert>}

        {harAvbokningsförfrågan && (
          <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#f97316', background: 'rgba(249, 115, 22, 0.12)', color: '#fb923c' }}>
            Vikarien har skickat en avbokningsförfrågan. Läs meddelandet nedan innan du ändrar passet.
          </div>
        )}

        <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Översikt</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {pass.grupp ? `Grupp: ${pass.grupp}` : 'Ingen grupp angiven'}
              </p>
              {pass.anteckning && (
                <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{pass.anteckning}</p>
              )}
            </div>
            <StatusBadge status={pass.status} />
          </div>

          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
              Synlighet<br />
              <span className="font-semibold" style={{ color: pass.publicerad ? 'var(--blue)' : 'var(--text)' }}>
                {pass.publicerad ? 'Publicerad som ledig' : 'Inte publicerad'}
              </span>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
              Vikarie<br />
              <span className="font-semibold" style={{ color: tillsattVikarie ? '#22c55e' : 'var(--text)' }}>
                {tillsattVikarie?.namn ?? riktadVikarie?.namn ?? 'Ingen vald'}
              </span>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
              Frånvaro<br />
              <span className="font-semibold" style={{ color: pass.frånvaro_id ? '#22c55e' : '#f97316' }}>
                {pass.frånvaro
                  ? `${pass.frånvaro.hel_dag ? 'Heldag' : `${pass.frånvaro.tid_från?.slice(0, 5) ?? ''}-${pass.frånvaro.tid_till?.slice(0, 5) ?? ''}`}${pass.frånvaro.orsak ? ` · ${pass.frånvaro.orsak}` : ''}`
                  : pass.frånvaro_id ? 'Kopplad' : 'Saknar frånvaro'}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="mb-3 flex items-start justify-between gap-2 sm:gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Ersätter</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {pass.personal?.namn ?? 'Fristående pass'}
              </p>
            </div>
            {pass.personal_id ? (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: '#22c55e', background: 'rgba(34, 197, 94, 0.12)' }}>Kopplat</span>
            ) : (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: '#f97316', background: 'rgba(249, 115, 22, 0.12)' }}>Fristående</span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="search"
              value={personalSök}
              onChange={e => setPersonalSök(e.target.value)}
              placeholder="Sök personal..."
              className="rounded-md border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <select
              value={valdPersonalId}
              onChange={e => setValdPersonalId(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            >
              <option value="">Fristående pass</option>
              {filtreradPersonal.map(p => (
                <option key={p.id} value={p.id}>
                  {p.namn}{p.arbetslag?.namn ? ` · ${p.arbetslag.namn}` : ''}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={sparaErsattPersonal} loading={sparar} disabled={!ersattPersonalÄndrad}>
              Spara
            </Button>
          </div>
        </section>

                <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Grupp</p>
          <div className="grid gap-2">
            <input
              value={grupp}
              onChange={e => setGrupp(e.target.value)}
              placeholder="Exempel: Åk.5, FSK eller PREST"
              className="rounded-md border px-3 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
          </div>
        </section>

<section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Tid</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={tidFrån}
              onChange={e => setTidFrån(e.target.value)}
              className="rounded-md border px-2 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <input
              type="time"
              value={tidTill}
              onChange={e => setTidTill(e.target.value)}
              className="rounded-md border px-2 py-2 text-sm"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
          </div>

          
        </section>
        <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
          <div className="mb-3">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Bemanning</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {valdVikarie ? valdVikarie.namn : 'Välj vikarie'}
            </p>
          </div>

          {rekommenderadeSynliga.length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Rekommenderade vikarier</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {rekommenderadeSynliga.map(({ vikarie, status, detalj }) => {
                  const vald = vikarie.id === valdVikarieId;
                  const ärBokad = status === 'bokad';

                  return (
                    <button
                      key={vikarie.id}
                      type="button"
                      onClick={() => väljVikarie(vikarie.id)}
                      disabled={ärBokad}
                      className="rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55"
                      style={{
                        borderColor: vald ? 'var(--blue)' : 'var(--border)',
                        background: vald ? 'color-mix(in srgb, var(--blue) 10%, var(--bg-card))' : 'var(--bg-card)',
                      }}
                    >
                      <span className="block text-sm font-semibold" style={{ color: 'var(--text)' }}>{vikarie.namn}</span>
                      <span className="block text-xs" style={{ color: vikarieStatusFärg(status) }}>{detalj}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-3 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <button
              type="button"
              onClick={() => setVisaAllaVikarier(v => !v)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              style={{ color: 'var(--text)' }}
            >
              <span>
                <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Alla vikarier</span>
                <span className="block text-sm font-semibold">{valdVikarie?.namn ?? 'Ingen vald'}</span>
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                {visaAllaVikarier ? 'Dölj' : 'Visa'}
              </span>
            </button>

            {visaAllaVikarier && (
              <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
                <input
                  value={vikarieSök}
                  onChange={e => setVikarieSök(e.target.value)}
                  placeholder="Sök vikarie..."
                  className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
                  style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                />
                <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                  {filtreradeVikarier.map(({ vikarie, status, detalj }) => {
                    const vald = vikarie.id === valdVikarieId;
                    const ärBokad = status === 'bokad';

                    return (
                      <button
                        key={vikarie.id}
                        type="button"
                        onClick={() => väljVikarie(vikarie.id)}
                        disabled={ärBokad}
                        className="rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-55"
                        style={{
                          borderColor: vald ? 'var(--blue)' : 'var(--border)',
                          background: vald ? 'color-mix(in srgb, var(--blue) 10%, var(--bg-card))' : 'var(--bg-card)',
                        }}
                      >
                        <span className="block text-sm font-semibold" style={{ color: 'var(--text)' }}>{vikarie.namn}</span>
                        <span className="block text-xs" style={{ color: vikarieStatusFärg(status) }}>{detalj}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {valdVikarieId && bokadeVikarier[valdVikarieId] && (
            <p className="mt-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: '#ef4444', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.10)' }}>
              Den valda vikarien är redan bokad {bokadeVikarier[valdVikarieId].tid_från.slice(0, 5)}-{bokadeVikarier[valdVikarieId].tid_till.slice(0, 5)}.
            </p>
          )}
        </section>

        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Synlighet</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="sm" variant="secondary" onClick={publiceraLedigt} loading={sparar}>
              Gör ledigt
            </Button>
            <Button size="sm" variant="secondary" onClick={avpublicera} loading={sparar} disabled={!pass.publicerad}>
              Dölj
            </Button>
          </div>

          <div className="mt-2 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <button
              type="button"
              onClick={() => setVisaExkluderingar(v => !v)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
              style={{ color: 'var(--text)' }}
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Dölj för vikarier</span>
                <span className="block truncate text-sm font-semibold">
                  {exkluderadeVikarier.length === 0 ? 'Ingen vikarie dold' : `Dolt för ${exkluderadeVikarier.length}`}
                </span>
              </span>
              <span className="shrink-0 text-lg leading-none" style={{ color: 'var(--text-muted)' }}>
                {visaExkluderingar ? '▲' : '▼'}
              </span>
            </button>

            {visaExkluderingar && (
              <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
                {exkluderadeVikarier.length > 0 && (
                  <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {exkluderadeVikarier.map(v => v.namn).join(', ')}
                  </p>
                )}

                <input
                  value={exkluderingSök}
                  onChange={e => setExkluderingSök(e.target.value)}
                  placeholder="Sök vikarie att dölja för..."
                  className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
                  style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                />

                <div className="grid max-h-44 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {filtreradeExkluderingVikarier.map(v => {
                    const vald = exkluderadeVikarieIds.has(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => växlaExkluderadVikarie(v.id)}
                        className="rounded-lg border px-3 py-2 text-left text-sm font-semibold transition"
                        style={{
                          borderColor: vald ? '#f97316' : 'var(--border)',
                          background: vald ? 'rgba(249, 115, 22, 0.12)' : 'var(--bg-card)',
                          color: vald ? '#fb923c' : 'var(--text)',
                        }}
                      >
                        <span className="block">
                          {v.namn}
                          {vald && <span className="ml-2 text-xs">Dold</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-xs font-normal" style={{ color: vald ? '#fdba74' : 'var(--text-muted)' }}>
                          {v.epost ?? (v.profil_id ? 'Konto kopplat' : 'Inget konto')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="secondary" onClick={sparaExkluderingar} loading={spararExkluderingar}>
                    Spara dolda vikarier
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>


        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Meddelanden</p>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
              {meddelanden.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Inga meddelanden ännu.</p>
              ) : meddelanden.map(m => (
                <div key={m.id} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="mb-1 flex items-center justify-between gap-2" style={{ color: 'var(--text-muted)' }}>
                    <span>{meddelandeAvsandareNamn(m, tillsattVikarie?.namn ?? riktadVikarie?.namn)}</span>
                    <div className="flex items-center gap-2">
                      <span>{new Date(m.created_at).toLocaleString('sv-SE')}</span>
                      <button
                        type="button"
                        onClick={() => raderaMeddelande(m.id)}
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.10)' }}
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text)' }}>{m.meddelande}</p>
                </div>
              ))}
            </div>
            <textarea
              value={nyttMeddelande}
              onChange={e => setNyttMeddelande(e.target.value)}
              rows={3}
              placeholder={pass.vikarie_id ? 'Skriv meddelande till vikarien...' : 'Meddelanden kan skickas när passet är bokat.'}
              disabled={!pass.vikarie_id}
              className="mb-2 w-full rounded-md border px-3 py-2 text-sm disabled:opacity-50"
              style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
            />
            <Button size="sm" onClick={skickaMeddelande} loading={skickarMeddelande} disabled={!pass.vikarie_id || !nyttMeddelande.trim()}>
              Skicka meddelande
            </Button>
          </div>
        </section>

        <section>
          <button
            type="button"
            onClick={() => setVisaHistorik(!visaHistorik)}
            className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg)' }}
          >
            <span>Historik ({historik.length})</span>
            <span>{visaHistorik ? 'Dölj' : 'Visa'}</span>
          </button>
          {visaHistorik && (
            <div className="mt-2 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              {laddar ? <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Laddar...</p>
                : historik.length === 0 ? <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Ingen historik.</p>
                : historik.map(h => (
                  <div key={h.id} className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--text-subtle)' }}>{new Date(h.created_at).toLocaleString('sv-SE')}</span>
                    {' '}{historikText(h, vikarier)}
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>

      <div className="border-t p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {(harAktivBokning || pass.frånvaro_id) && (
          <div className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--text-muted)' }}>
            {harAktivBokning && valdVikarie && !valdVikarieÄrRedanBokadPåPasset && (
              <p>
                Byter från <strong style={{ color: 'var(--text)' }}>{tillsattVikarie?.namn ?? 'nuvarande vikarie'}</strong> till <strong style={{ color: 'var(--text)' }}>{valdVikarie.namn}</strong>.
              </p>
            )}
            {pass.frånvaro_id && (
              <p>Kopplad frånvaro behålls när passet arkiveras.</p>
            )}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Button onClick={bokaDirekt} loading={sparar} disabled={!kanBemannaMedValdVikarie}>
            {bemanningsKnappText}
          </Button>
          <Button variant="secondary" onClick={skickaFörfrågan} loading={sparar} disabled={!kanSkickaFörfrågan}>
            Skicka förfrågan
          </Button>
          <Button variant="secondary" onClick={sparaPassÄndringar} loading={sparar} disabled={!harPassÄndringar || pass.status === 'avbokat'}>
            Spara ändringar
          </Button>
          <Button variant="danger" onClick={avbokaPass} loading={sparar} disabled={pass.status === 'avbokat'}>
            Arkivera pass
          </Button>
        </div>
      </div>
    </div>
  );
}
function NyttPassModal({ öppen, onStäng, personal, onSkapad, förvaltDatum }: {
  öppen: boolean; onStäng: () => void; personal: Personal[]; onSkapad: () => void; förvaltDatum?: string;
}) {
  const [form, setForm] = useState({
    personal_id: '', datum: new Date().toISOString().slice(0, 10),
    tid_från: STANDARD_TID_FRÅN, tid_till: STANDARD_TID_TILL, grupp: '', anteckning: '', publicerad: false,
    veckopass: false,
    registreraFrånvaro: false, frånvaroOrsak: '', frånvaroHelDag: true,
  });
  const [laddar, setLaddar] = useState(false);
  const [hämtarSchema, setHämtarSchema] = useState(false);
  const [schemaInfo, setSchemaInfo] = useState('');
  const [veckopassTider, setVeckopassTider] = useState<Record<string, { aktiv: boolean; tid_från: string; tid_till: string }>>({});
  const [fel, setFel] = useState('');

  useEffect(() => {
    if (!öppen || !förvaltDatum) return;
    setForm(prev => ({ ...prev, datum: förvaltDatum }));
    setVeckopassTider({});
  }, [öppen, förvaltDatum]);

  const veckopassDatum = form.veckopass && form.datum ? veckodagarFörVecka(form.datum) : [];

  function tidFörDatum(datum: string) {
    return veckopassTider[datum] ?? { aktiv: true, tid_från: form.tid_från, tid_till: form.tid_till };
  }

  function uppdateraVeckopassTid(datum: string, data: Partial<{ aktiv: boolean; tid_från: string; tid_till: string }>) {
    setVeckopassTider(prev => ({
      ...prev,
      [datum]: {
        aktiv: prev[datum]?.aktiv ?? true,
        tid_från: prev[datum]?.tid_från ?? form.tid_från,
        tid_till: prev[datum]?.tid_till ?? form.tid_till,
        ...data,
      },
    }));
  }

  async function hämtaSchemaTid(personalId: string, datum: string) {
    if (!personalId || !datum) {
      setSchemaInfo('');
      return;
    }

    setHämtarSchema(true);
    setSchemaInfo('');

    const res = await frånvaroApi.hämtaSchemaraderFörFrånvaro(personalId, datum, datum);
    const rader = ((res.data ?? []) as Schemarad[])
      .filter(r => r.datum === datum && r.tid_från && r.tid_till)
      .sort((a, b) => minuter(a.tid_från) - minuter(b.tid_från));

    setHämtarSchema(false);

    if (rader.length === 0) {
      setSchemaInfo('Inget schema hittades för vald person och dag. Tiderna kan anges manuellt.');
      return;
    }

    const första = rader[0];
    const sista = rader.reduce((senast, rad) =>
      minuter(rad.tid_till) > minuter(senast.tid_till) ? rad : senast
    , rader[0]);

    setForm(prev => ({
      ...prev,
      tid_från: första.tid_från!.slice(0, 5),
      tid_till: sista.tid_till!.slice(0, 5),
      grupp: [...new Set(rader.map(r => r.grupp).filter(Boolean))].slice(0, 3).join(', ') || prev.grupp,
    }));

    setSchemaInfo(`Tider hämtade från schema: ${första.tid_från!.slice(0, 5)}-${sista.tid_till!.slice(0, 5)} (${rader.length} lektioner).`);
  }

  async function spara() {
    setLaddar(true);
    setFel('');

    const passSomSkaSkapas = form.veckopass
      ? veckopassDatum
          .map((datum) => ({ datum, ...tidFörDatum(datum) }))
          .filter((dag) => dag.aktiv)
      : [{ datum: form.datum, aktiv: true, tid_från: form.tid_från, tid_till: form.tid_till }];

    if (passSomSkaSkapas.length === 0) {
      setLaddar(false);
      setFel('Välj minst en dag för veckopasset.');
      return;
    }

    for (const dag of passSomSkaSkapas) {
      if (!dag.tid_från || !dag.tid_till || dag.tid_från >= dag.tid_till) {
        setLaddar(false);
        setFel('Kontrollera tiderna för veckopasset.');
        return;
      }
    }

    if (form.personal_id) {
      for (const dag of passSomSkaSkapas) {
        const befintliga = await passApi.lista({ datumFrån: dag.datum, datumTill: dag.datum });
        const krock = ((befintliga.data ?? []) as Bemanning[]).find(p =>
          p.personal_id === form.personal_id &&
          p.status !== 'avbokat' &&
          dag.tid_från < p.tid_till &&
          dag.tid_till > p.tid_från
        );

        if (krock) {
          setLaddar(false);
          const namn = personal.find(p => p.id === form.personal_id)?.namn ?? 'Personen';
          setFel(`${namn} har redan ett pass ${dag.datum} ${krock.tid_från.slice(0, 5)}-${krock.tid_till.slice(0, 5)} som överlappar.`);
          return;
        }
      }
    }

    for (const dag of passSomSkaSkapas) {
      let frånvaroId: string | null = null;

      if (form.registreraFrånvaro && form.personal_id) {
        const frånvaroRes = await frånvaroApi.skapa({
          personal_id: form.personal_id,
          datum_från: dag.datum,
          datum_till: dag.datum,
          hel_dag: form.frånvaroHelDag,
          tid_från: form.frånvaroHelDag ? null : dag.tid_från,
          tid_till: form.frånvaroHelDag ? null : dag.tid_till,
          orsak: form.frånvaroOrsak || null,
          anteckning: form.anteckning || null,
          skapad_av: null,
        });

        if (frånvaroRes.error) {
          setLaddar(false);
          setFel(frånvaroRes.error.message);
          return;
        }

        frånvaroId = frånvaroRes.data?.id ?? null;
      }

      const res = await passApi.skapa({
        personal_id: form.personal_id || null,
        frånvaro_id: frånvaroId,
        schemarad_id: null,
        vikarie_id: null,
        datum: dag.datum,
        tid_från: dag.tid_från,
        tid_till: dag.tid_till,
        typ: 'del_av_dag',
        ämne: null,
        grupp: form.grupp || null,
        sal: null,
        anteckning: form.anteckning || null,
        riktad_till_vikarie_id: null,
        publicerad: form.publicerad,
        status: 'obokat',
        skapad_av: null,
      });

      if (res.error) {
        setLaddar(false);
        setFel(res.error.message.includes('dubbelbokad') || res.error.message.includes('redan bokad')
          ? 'Vikarien är redan bokad på ett pass som överlappar denna tid.'
          : res.error.message);
        return;
      }

      if (res.data) {
        await historikApi.skapa(res.data.id, 'pass_skapat', {
          ...(form.veckopass ? { typ: 'veckopass', datum: dag.datum } : {}),
          ...(frånvaroId ? { frånvaro_id: frånvaroId, åtgärd: 'skapade_pass_med_frånvaro' } : {}),
        });
      }
    }

    setLaddar(false);
    onSkapad();
    onStäng();
  }


  useEffect(() => {
    if (!öppen || laddar) return;

    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        spara();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [öppen, laddar, form]);

  return (
    <Modal öppen={öppen} onStäng={onStäng} titel="Skapa vikariepass" bredd="lg">
      <div className="space-y-4">
        {fel && <Alert typ="error">{fel}</Alert>}

        <Select
          label="Personal, valfritt"
          value={form.personal_id}
          onChange={e => {
            const personal_id = e.target.value;
            setForm({ ...form, personal_id, registreraFrånvaro: personal_id ? form.registreraFrånvaro : false });
            hämtaSchemaTid(personal_id, form.datum);
          }}
        >
          <option value="">Fristående pass</option>
          {personal.map(p => <option key={p.id} value={p.id}>{p.namn}</option>)}
        </Select>
        <Input
          label={form.veckopass ? "Vecka som ska skapas *" : "Datum *"}
          type="date"
          value={form.datum}
          onChange={e => {
            const datum = e.target.value;
            setForm({ ...form, datum });
            setVeckopassTider({});
            hämtaSchemaTid(form.personal_id, datum);
          }}
        />
        <label className="flex items-start gap-2 rounded-xl border p-3 text-sm" style={{ color: 'var(--text)', borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <input
            type="checkbox"
            checked={form.veckopass}
            onChange={e => {
              setForm({ ...form, veckopass: e.target.checked });
              setVeckopassTider({});
            }}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span>
            Skapa veckopass
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
              Skapar ett pass per vald vardag i veckan. Tider kan justeras per dag.
            </span>
          </span>
        </label>

        {form.veckopass && veckopassDatum.length > 0 && (
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Veckans pass
              </p>
              <button
                type="button"
                onClick={() => setVeckopassTider({})}
                className="text-xs font-medium"
                style={{ color: 'var(--text-muted)' }}
              >
                Återställ
              </button>
            </div>

            <div className="space-y-2">
              {veckopassDatum.map(datum => {
                const dagensTid = tidFörDatum(datum);

                return (
                  <div key={datum} className="grid grid-cols-[24px_1fr_92px_92px] items-end gap-2 rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
                    <input
                      type="checkbox"
                      checked={dagensTid.aktiv}
                      onChange={e => uppdateraVeckopassTid(datum, { aktiv: e.target.checked })}
                      className="mb-2 h-4 w-4 rounded"
                    />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {new Date(`${datum}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{datum}</p>
                    </div>
                    <label>
                      <span className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>Från</span>
                      <input
                        type="time"
                        value={dagensTid.tid_från}
                        disabled={!dagensTid.aktiv}
                        onChange={e => uppdateraVeckopassTid(datum, { tid_från: e.target.value })}
                        className="w-full rounded-md border px-2 py-1.5 text-sm disabled:opacity-40"
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    </label>
                    <label>
                      <span className="mb-1 block text-[11px]" style={{ color: 'var(--text-muted)' }}>Till</span>
                      <input
                        type="time"
                        value={dagensTid.tid_till}
                        disabled={!dagensTid.aktiv}
                        onChange={e => uppdateraVeckopassTid(datum, { tid_till: e.target.value })}
                        className="w-full rounded-md border px-2 py-1.5 text-sm disabled:opacity-40"
                        style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(hämtarSchema || schemaInfo) && (
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {hämtarSchema ? 'Hämtar tider från schema...' : schemaInfo}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label={form.veckopass ? "Standard från kl *" : "Från kl *"} type="time" value={form.tid_från} onChange={e => setForm({ ...form, tid_från: e.target.value })} />
          <Input label={form.veckopass ? "Standard till kl *" : "Till kl *"} type="time" value={form.tid_till} onChange={e => setForm({ ...form, tid_till: e.target.value })} />
        </div>
        <Input label="Grupp" value={form.grupp} onChange={e => setForm({ ...form, grupp: e.target.value })} />
        {form.personal_id && (
          <section className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
            <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={form.registreraFrånvaro}
                onChange={e => setForm({ ...form, registreraFrånvaro: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span>
                Registrera även frånvaro
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                  Skapar frånvaro för vald personal och kopplar passet till den.
                </span>
              </span>
            </label>

            {form.registreraFrånvaro && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input
                  label="Orsak, valfritt"
                  value={form.frånvaroOrsak}
                  onChange={e => setForm({ ...form, frånvaroOrsak: e.target.value })}
                  placeholder="Sjuk, VAB, ledig..."
                />
                <label className="flex items-center gap-2 self-end rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={form.frånvaroHelDag}
                    onChange={e => setForm({ ...form, frånvaroHelDag: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Heldag
                </label>
              </div>
            )}
          </section>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Kommentar</label>
          <textarea
            value={form.anteckning}
            onChange={e => setForm({ ...form, anteckning: e.target.value })}
            rows={3}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ background: 'var(--input-bg)', color: 'var(--text)', borderColor: 'var(--border)' }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input
            type="checkbox"
            checked={form.publicerad}
            onChange={e => setForm({ ...form, publicerad: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300"
          />
          Publicera direkt för vikarier
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onStäng}>Avbryt</Button>
          <Button loading={laddar} onClick={spara}>
            {form.veckopass ? 'Skapa veckopass' : 'Skapa pass'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Bemanning() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pass, setPass] = useState<Bemanning[]>([]);
  const [vikarier, setVikarier] = useState<Vikarie[]>([]);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [valtPass, setValtPass] = useState<Bemanning | null>(null);
  const [skapaModal, setSkapaModal] = useState(false);
  const [skapaDatum, setSkapaDatum] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<PassStatus | ''>('');
  const [vikarieFilter, setVikarieFilter] = useState('');
  const [snabbFilter, setSnabbFilter] = useState<SnabbFilterTyp>('alla');
  const [synligaSnabbfilter, setSynligaSnabbfilter] = useState<Set<SnabbFilterTyp>>(() => {
    try {
      const sparade = window.localStorage.getItem(SYNLIGA_SNABBFILTER_KEY);
      if (!sparade) return new Set();
      const värden = JSON.parse(sparade) as SnabbFilterTyp[];
      return new Set(värden.filter((värde) => SNABBFILTER.some((filter) => filter.id === värde)));
    } catch {
      return new Set();
    }
  });
  const [bemanningSok, setBemanningSok] = useState('');
  const [datumFrån, setDatumFrån] = useState('');
  const [datumTill, setDatumTill] = useState('');
  const [döljPasserade, setDöljPasserade] = useState(false);
  const [veckaStart, setVeckaStart] = useState(() => veckaStartIso(new Date().toISOString().slice(0, 10)));
  const [valda, setValda] = useState<Set<string>>(new Set());
  const [avbokningsPassIds, setAvbokningsPassIds] = useState<Set<string>>(new Set());
  const [arkiveraValda, setArkiveraValda] = useState(false);
  const [arkiverar, setArkiverar] = useState(false);
  const [senastMarkeradIndex, setSenastMarkeradIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SYNLIGA_SNABBFILTER_KEY, JSON.stringify([...synligaSnabbfilter]));
    } catch {
      // Synliga genvägar är en lokal preferens, inte kritisk data.
    }
  }, [synligaSnabbfilter]);

  const ladda = useCallback(async () => {
    const [pRes, vRes, perRes] = await Promise.all([
      passApi.lista({
        status: statusFilter ? [statusFilter] : undefined,
        datumFrån: datumFrån || undefined,
        datumTill: datumTill || undefined,
      }),
      vikariApi.lista(),
      personalApi.lista(),
    ]);
    const passLista = (pRes.data ?? []) as Bemanning[];
    setPass(passLista);
    setVikarier((vRes.data ?? []) as Vikarie[]);
    setPersonal((perRes.data ?? []) as Personal[]);

    const avbokningsIds = new Set<string>();
    await Promise.all(passLista.map(async (passrad) => {
      const res = await passmeddelandeApi.lista(passrad.id);
      const meddelanden = (res.data ?? []) as Passmeddelande[];
      const harAktivBokning = !!passrad.vikarie_id && (passrad.status === 'bokat' || passrad.status === 'bekräftat');
      if (harAktivBokning && meddelanden.some(m => m.avsandare_roll === 'vikarie' && ärAvbokningsförfrågan(m.meddelande))) {
        avbokningsIds.add(passrad.id);
      }
    }));
    setAvbokningsPassIds(avbokningsIds);

    setLaddar(false);
  }, [statusFilter, datumFrån, datumTill]);

  useEffect(() => { ladda(); }, [ladda]);
  useRealtimeRefresh(true, ladda, ['vikariepass', 'passmeddelanden', 'notiser']);

  const passIdFrånUrl = searchParams.get('pass');

  useEffect(() => {
    if (!passIdFrånUrl) return;

    const hittatPass = pass.find(p => p.id === passIdFrånUrl);
    if (hittatPass) {
      setValtPass(hittatPass);
      return;
    }

    let aktiv = true;
    passApi.hämta(passIdFrånUrl).then((res) => {
      if (!aktiv || res.error || !res.data) return;
      const hämtatPass = res.data as Bemanning;
      setValtPass(hämtatPass);
      setPass(prev => prev.some(p => p.id === hämtatPass.id) ? prev : [...prev, hämtatPass]);
    });

    return () => {
      aktiv = false;
    };
  }, [passIdFrånUrl, pass]);

  function stängPassModal() {
    setValtPass(null);

    if (searchParams.has('pass')) {
      const nästa = new URLSearchParams(searchParams);
      nästa.delete('pass');
      setSearchParams(nästa, { replace: true });
    }
  }

  async function arkiveraMånga() {
    setArkiverar(true);
    const ids = [...valda];

    for (const id of ids) {
      const res = await passApi.radera(id);
      if (!res.error) {
        await historikApi.skapa(id, 'pass_avbokat', { åtgärd: 'arkiverad_från_bemanning' }, 'Pass arkiverat från bemanningsvyn.');
      }
    }

    setPass(prev => prev.map(p => ids.includes(p.id) ? { ...p, status: 'avbokat' as PassStatus } : p));
    setValda(new Set());
    setArkiveraValda(false);
    setArkiverar(false);
    ladda();
  }

  if (laddar) return <LaddaSida />;

  const bemanningSokTerm = bemanningSok.trim().toLowerCase();
  const visadePass = bemanningSokTerm
    ? pass.filter((p) => {
        const bokadVikarie = p.vikarie_id ? vikarier.find(v => v.id === p.vikarie_id)?.namn : '';
        const riktadVikarie = p.riktad_till_vikarie_id ? vikarier.find(v => v.id === p.riktad_till_vikarie_id)?.namn : '';
        const text = [
          p.personal?.namn,
          p.personal?.arbetslag?.namn,
          p.grupp,
          p.ämne,
          p.anteckning,
          p.datum,
          p.tid_från,
          p.tid_till,
          p.status,
          p.status ? PASS_STATUS_LABELS[p.status] : '',
          bokadVikarie,
          riktadVikarie,
        ].filter(Boolean).join(' ').toLowerCase();

        return text.includes(bemanningSokTerm);
      })
    : pass;

  const grupper = grupperaPasser(visadePass);
  const grupperEfterVikarie = vikarieFilter
    ? grupper.filter(grupp => grupp.pass.some(p => p.vikarie_id === vikarieFilter))
    : grupper;
  function gruppInfo(grupp: Passgrupp) {
    const harBokad = grupp.pass.some(p => !!p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
    const harAvbokningsförfrågan = grupp.pass.some(p => avbokningsPassIds.has(p.id) && !!p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
    const harRiktadFörfrågan = grupp.pass.some(p => !!p.riktad_till_vikarie_id && p.status === 'notifierat');
    const publicerad = grupp.pass.some(p => p.publicerad);
    const avbokad = grupp.pass.every(p => p.status === 'avbokat');
    const passerad = ärGruppPasserad(grupp);
    const ejPublicerad = !publicerad && !harBokad && !harRiktadFörfrågan && !avbokad;
    const ledigtPassKräverÅtgärd = publicerad && !harBokad && !harRiktadFörfrågan && !avbokad;
    const atgard = !passerad && (harAvbokningsförfrågan || harRiktadFörfrågan || ejPublicerad || ledigtPassKräverÅtgärd);

    return { harBokad, harAvbokningsförfrågan, harRiktadFörfrågan, publicerad, avbokad, passerad, ejPublicerad, atgard };
  }

  function matcharSnabbFilter(grupp: Passgrupp, filter: SnabbFilterTyp) {
    const info = gruppInfo(grupp);

    if (filter === 'arkiv') return info.passerad || info.avbokad;
    if ((info.passerad || info.avbokad) && döljPasserade) return false;

    if (filter === 'alla') return true;
    if (filter === 'atgard') return info.atgard;
    if (filter === 'lediga') return info.publicerad && !info.harBokad && !info.avbokad;
    if (filter === 'bokade') return info.harBokad;
    if (filter === 'ej_publicerade') return info.ejPublicerad;
    return true;
  }

  const filterCounts: Record<SnabbFilterTyp, number> = {
    alla: grupperEfterVikarie.filter(g => matcharSnabbFilter(g, 'alla')).length,
    atgard: grupperEfterVikarie.filter(g => matcharSnabbFilter(g, 'atgard')).length,
    lediga: grupperEfterVikarie.filter(g => matcharSnabbFilter(g, 'lediga')).length,
    bokade: grupperEfterVikarie.filter(g => matcharSnabbFilter(g, 'bokade')).length,
    ej_publicerade: grupperEfterVikarie.filter(g => matcharSnabbFilter(g, 'ej_publicerade')).length,
    arkiv: grupperEfterVikarie.filter(g => matcharSnabbFilter(g, 'arkiv')).length,
  };

  const filtreradeGrupper = grupperEfterVikarie
    .filter(grupp => matcharSnabbFilter(grupp, snabbFilter))
    .sort((a, b) => sorteraPassgrupper(a, b, snabbFilter === 'arkiv'));
  const veckodagar = Array.from({ length: 5 }, (_, index) => läggTillDagarIso(veckaStart, index));
  const kalenderGrupper = snabbFilter === 'arkiv'
    ? filtreradeGrupper
    : filtreradeGrupper.filter(grupp => veckodagar.includes(grupp.datum));
  const grupperPerDag = veckodagar.map((datum) => ({
    datum,
    grupper: kalenderGrupper.filter(grupp => grupp.datum === datum),
  }));
  const synligaDagar = döljPasserade && snabbFilter !== 'arkiv'
    ? grupperPerDag.filter(({ grupper }) => grupper.length > 0)
    : grupperPerDag;
  const kalenderKolumner = Math.max(1, Math.min(synligaDagar.length, 5));
  const kalenderKolumnerMd = Math.max(1, Math.min(synligaDagar.length, 2));
  const veckaSlut = veckodagar[4];
  const idag = new Date().toLocaleDateString('sv-SE');
  const aktivaFilterAntal = [
    bemanningSok,
    statusFilter,
    datumFrån,
    datumTill,
    vikarieFilter,
    snabbFilter !== 'alla' ? snabbFilter : '',
  ].filter(Boolean).length;
  const valdaPass = pass.filter(p => valda.has(p.id));
  const valdaPassMedFrånvaro = valdaPass.filter(p => !!p.frånvaro_id).length;
  const arkiveringsText = valdaPassMedFrånvaro > 0
    ? `Arkivera ${valda.size} markerade pass? ${valdaPassMedFrånvaro} av passen är kopplade till frånvaro. Passen flyttas till Arkiv och frånvaron behålls.`
    : `Arkivera ${valda.size} markerade pass? Passen flyttas till Arkiv. Historik, notiser och meddelanden behålls.`;

  function snabbfilterLabel(filterId: SnabbFilterTyp) {
    const filter = SNABBFILTER.find((f) => f.id === filterId);
    if (!filter) return filterId;
    return filter.id === 'alla' && döljPasserade ? 'Aktiva' : filter.label;
  }

  function togglaSynligtSnabbfilter(filterId: SnabbFilterTyp) {
    setSynligaSnabbfilter((prev) => {
      const nästa = new Set(prev);
      if (nästa.has(filterId)) nästa.delete(filterId);
      else nästa.add(filterId);
      return nästa;
    });
  }

  function sättGruppMarkerad(grupp: Passgrupp, markerad: boolean, index: number, shiftKey = false) {
    const ny = new Set(valda);

    if (shiftKey && senastMarkeradIndex !== null) {
      const start = Math.min(senastMarkeradIndex, index);
      const slut = Math.max(senastMarkeradIndex, index);
      filtreradeGrupper.slice(start, slut + 1).forEach(g => {
        g.pass.forEach(p => markerad ? ny.add(p.id) : ny.delete(p.id));
      });
    } else {
      grupp.pass.forEach(p => markerad ? ny.add(p.id) : ny.delete(p.id));
    }

    setValda(ny);
    setSenastMarkeradIndex(index);
  }

  function öppnaSkapaPass(datum?: string) {
    setSkapaDatum(datum);
    setSkapaModal(true);
  }

  function öppnaPassDetaljer(pass: Bemanning, element?: HTMLElement | null) {
    element?.blur();
    setValtPass(pass);
    const nästa = new URLSearchParams(searchParams);
    nästa.set('pass', pass.id);
    setSearchParams(nästa, { replace: true });
  }


  return (
    <div className="flex h-full min-h-0">
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-24 pt-2 sm:px-4 sm:pb-24 sm:pt-3 lg:px-5 ${valtPass ? 'hidden lg:flex' : ''}`}>
        <div className="mb-3 flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>Veckoplanering</p>
            <h1 className="text-xl font-semibold leading-tight" style={{ color: 'var(--text)' }}>Bemanning</h1>
            <p className="mt-1 text-sm" style={{ color: filterCounts.atgard > 0 ? '#f97316' : 'var(--text-muted)' }}>
              {filterCounts.atgard > 0 ? `${filterCounts.atgard} pass behöver åtgärd` : 'Inga akuta pass just nu'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {valda.size > 0 && (
              <Button variant="danger" size="sm" onClick={() => setArkiveraValda(true)}>
                Arkivera ({valda.size})
              </Button>
            )}
          </div>
        </div>

        <div className="sticky top-1 z-10 mb-3 rounded-xl border p-2 shadow-sm backdrop-blur sm:static sm:p-3 sm:shadow-none" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg-card) 94%, transparent)' }}>
          <div className="grid gap-3 xl:grid-cols-[minmax(190px,240px)_minmax(260px,1fr)_auto] xl:items-center">
            <div className="rounded-lg px-2 py-1.5" style={{ background: 'var(--bg)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Vecka {veckonummer(veckaStart)}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{kortVeckodag(veckaStart)} - {kortVeckodag(veckaSlut)}</p>
            </div>

            <label className="min-w-0">
              <span className="sr-only">Sök pass</span>
              <input
                type="search"
                value={bemanningSok}
                onChange={e => setBemanningSok(e.target.value)}
                placeholder="Sök personal, vikarie, grupp eller datum..."
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2"
                style={{
                  background: 'var(--input-bg)',
                  borderColor: bemanningSok ? 'var(--blue)' : 'var(--border)',
                  color: 'var(--text)',
                }}
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
              <details className="relative">
                <summary className="flex h-full cursor-pointer list-none items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--border)', color: aktivaFilterAntal ? 'var(--blue)' : 'var(--text)', background: 'var(--bg)' }}>
                  Filter{aktivaFilterAntal ? ` (${aktivaFilterAntal})` : ''}
                </summary>
                <div className="fixed inset-x-3 top-24 z-50 grid max-h-[72vh] gap-3 overflow-y-auto rounded-xl border p-3 shadow-xl sm:absolute sm:inset-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(92vw,640px)] sm:grid-cols-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="grid gap-2 sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
                      Visa
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SNABBFILTER.map((filter) => {
                        const aktiv = snabbFilter === filter.id;
                        return (
                          <button
                            key={filter.id}
                            type="button"
                            aria-pressed={aktiv}
                            onClick={() => setSnabbFilter(filter.id)}
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold"
                            style={{
                              background: aktiv ? 'var(--blue)' : 'var(--bg)',
                              borderColor: aktiv ? 'var(--blue)' : 'var(--border)',
                              color: aktiv ? '#fff' : 'var(--text-muted)',
                            }}
                          >
                            {snabbfilterLabel(filter.id)}
                            <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: aktiv ? 'rgba(255,255,255,0.22)' : 'var(--hover)' }}>
                              {filterCounts[filter.id]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as PassStatus | '')}>
                    <option value="">Alla statusar</option>
                    {ALLA_STATUSAR.map(s => <option key={s} value={s}>{PASS_STATUS_LABELS[s]}</option>)}
                  </Select>
                  <Select value={vikarieFilter} onChange={e => setVikarieFilter(e.target.value)}>
                    <option value="">Alla vikarier</option>
                    {vikarier.map(v => <option key={v.id} value={v.id}>{v.namn}</option>)}
                  </Select>
                  <Input type="date" value={datumFrån} onChange={e => {
                    setDatumFrån(e.target.value);
                    if (e.target.value) setVeckaStart(veckaStartIso(e.target.value));
                  }} />
                  <Input type="date" value={datumTill} onChange={e => setDatumTill(e.target.value)} />
                  <div className="grid gap-2 sm:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
                      Synliga genvägar
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {SNABBFILTER.map((filter) => (
                        <label key={filter.id} className="flex min-h-9 items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--bg)' }}>
                          <input
                            type="checkbox"
                            checked={synligaSnabbfilter.has(filter.id)}
                            onChange={() => togglaSynligtSnabbfilter(filter.id)}
                          />
                          {snabbfilterLabel(filter.id)}
                        </label>
                      ))}
                    </div>
                  </div>
                  {aktivaFilterAntal > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setBemanningSok('');
                        setStatusFilter('');
                        setDatumFrån('');
                        setDatumTill('');
                        setVikarieFilter('');
                        setSnabbFilter('alla');
                      }}
                      className="rounded-lg border px-3 py-2 text-sm font-semibold sm:col-span-2"
                      style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--bg)' }}
                    >
                      Rensa filter
                    </button>
                  )}
                </div>
              </details>

              <div className="grid grid-cols-3 gap-1.5 sm:flex sm:justify-center sm:gap-2">
                <Button size="sm" variant="secondary" onClick={() => setVeckaStart(läggTillDagarIso(veckaStart, -7))}>
                  <PeriodIkon typ="föregående" />
                  <span className="hidden min-[390px]:inline">Föregående</span>
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setVeckaStart(veckaStartIso(new Date().toISOString().slice(0, 10)))}>
                  <PeriodIkon typ="idag" />
                  <span>Idag</span>
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setVeckaStart(läggTillDagarIso(veckaStart, 7))}>
                  <span className="hidden min-[390px]:inline">Nästa</span>
                  <PeriodIkon typ="nästa" />
                </Button>
              </div>
            </div>
          </div>

          <div className="-mx-2 mt-3 flex min-w-0 snap-x gap-1.5 overflow-x-auto px-2 pb-1 sm:mx-0 sm:px-0 sm:gap-2">
              {SNABBFILTER.filter((filter) => synligaSnabbfilter.has(filter.id)).map(f => {
                const aktiv = snabbFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={aktiv}
                    onClick={() => setSnabbFilter(f.id)}
                    className="flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-2 sm:px-3"
                    style={{
                      background: aktiv ? 'var(--blue)' : 'var(--bg-card)',
                      borderColor: aktiv ? 'var(--blue)' : 'var(--border)',
                      color: aktiv ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    <span>{snabbfilterLabel(f.id)}</span>
                    <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: aktiv ? 'rgba(255,255,255,0.22)' : 'var(--hover)' }}>
                      {filterCounts[f.id]}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                data-hide-past-toggle
                aria-pressed={döljPasserade}
                onClick={() => setDöljPasserade(!döljPasserade)}
                className="flex shrink-0 snap-start items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-3"
                style={{
                  background: döljPasserade ? 'var(--blue)' : 'var(--bg-card)',
                  borderColor: döljPasserade ? 'var(--blue)' : 'var(--border)',
                  color: döljPasserade ? '#fff' : 'var(--text-muted)',
                }}
              >
                {döljPasserade ? 'Visar aktiva' : 'Dölj passerade'}
              </button>
            </div>
        </div>

        {filtreradeGrupper.length === 0 ? (
          <TomtTillstånd text="Inga vikariepass matchar filtret." />
        ) : snabbFilter === 'arkiv' ? (
          <div className="space-y-3">
            {kalenderGrupper.map((grupp, index) => {
              const tidFrån = grupp.pass[0].tid_från.slice(0, 5);
              const tidTill = grupp.pass[grupp.pass.length - 1].tid_till.slice(0, 5);
              const alleMarkerade = grupp.pass.every(p => valda.has(p.id));

              return (
                <div key={`${grupp.personal_id}_${grupp.datum}`} className="rounded-xl border p-3 shadow-sm sm:p-4" style={{ background: 'var(--bg-card)', borderColor: alleMarkerade ? 'var(--blue)' : 'var(--border)' }}>
                  <div className="flex items-start gap-3">
                    <button type="button" aria-pressed={alleMarkerade} onClick={(e) => { e.stopPropagation(); sättGruppMarkerad(grupp, !alleMarkerade, index, e.shiftKey); }} className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border" style={{ background: alleMarkerade ? 'var(--blue)' : 'var(--input-bg)', borderColor: alleMarkerade ? 'var(--blue)' : 'var(--border)', color: alleMarkerade ? '#fff' : 'var(--text-subtle)' }}>{alleMarkerade ? '✓' : ''}</button>
                    <button type="button" onClick={(e) => öppnaPassDetaljer(grupp.pass[0], e.currentTarget)} className="min-w-0 flex-1 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{new Date(`${grupp.datum}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{tidFrån}–{tidTill}</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}><span className="font-medium" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</span>{grupp.arbetslagNamn && <> · {grupp.arbetslagNamn}</>}</p>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
              <div className="space-y-5 md:hidden">
                {synligaDagar.map(({ datum, grupper }) => {
                  const dagHarÅtgärd = grupper.some(grupp => gruppInfo(grupp).atgard);
                  return (
                    <section
                      key={datum}
                      className="bemanning-dag"
                      style={{
                        borderColor: 'transparent',
                        background: 'transparent',
                      }}
                    >
                      <div
                        className="mb-2 flex items-center justify-between gap-2 rounded-2xl border px-3 py-2"
                        style={{
                          borderColor: datum === idag ? 'var(--blue)' : dagHarÅtgärd ? '#f97316' : 'var(--border)',
                          background: 'var(--bg-card)',
                        }}
                      >
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>{kortVeckodag(datum)}</h2>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{grupper.length} pass</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {dagHarÅtgärd && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#f97316', background: 'rgba(249, 115, 22, 0.12)' }}>
                              Åtgärd
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => öppnaSkapaPass(datum)}
                            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            style={{ borderColor: 'var(--blue)', background: 'var(--blue)', color: '#fff' }}
                          >
                            + Pass
                          </button>
                        </div>
                      </div>

                      {grupper.length === 0 ? (
                        <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
                          Inga pass
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {grupper.map((grupp) => {
                            const globalIndex = filtreradeGrupper.findIndex(g => g.personal_id === grupp.personal_id && g.datum === grupp.datum);
                            const tidFrån = grupp.pass[0].tid_från.slice(0, 5);
                            const tidTill = grupp.pass[grupp.pass.length - 1].tid_till.slice(0, 5);
                            const vikarie = grupp.pass.find(p => p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
                            const vikarieNamn = vikarie ? vikarier.find(v => v.id === vikarie.vikarie_id)?.namn : null;
                            const statusar = [...new Set(grupp.pass.map(p => p.status))];
                            const dominerandStatus = statusar.length === 1 ? statusar[0] : 'obokat';
                            const alleMarkerade = grupp.pass.every(p => valda.has(p.id));
                            const info = gruppInfo(grupp);

                            return (
                              <article
                                key={`${grupp.personal_id}_${grupp.datum}`}
                                className="rounded-2xl border p-3 shadow-sm"
                                style={{
                                  borderColor: alleMarkerade ? 'var(--blue)' : info.atgard ? '#f97316' : 'var(--border)',
                                  background: alleMarkerade ? 'color-mix(in srgb, var(--blue) 8%, var(--bg-card))' : 'var(--bg-card)',
                                }}
                              >
                                <div className="flex items-start gap-2.5">
                                  <button
                                    type="button"
                                    aria-pressed={alleMarkerade}
                                    aria-label={alleMarkerade ? 'Avmarkera pass' : 'Markera pass'}
                                    onClick={(e) => { e.stopPropagation(); sättGruppMarkerad(grupp, !alleMarkerade, Math.max(globalIndex, 0), e.shiftKey); }}
                                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    style={{
                                      background: alleMarkerade ? 'var(--blue)' : 'var(--input-bg)',
                                      borderColor: alleMarkerade ? 'var(--blue)' : 'var(--border)',
                                      color: alleMarkerade ? '#fff' : 'var(--text-subtle)',
                                    }}
                                  >
                                    {alleMarkerade ? '✓' : ''}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => öppnaPassDetaljer(grupp.pass[0], e.currentTarget)}
                                    className="min-w-0 flex-1 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        {vikarieNamn ? (
                                          <>
                                            <p className="truncate text-base font-semibold" style={{ color: info.passerad ? 'var(--text)' : '#22c55e' }}>{vikarieNamn}</p>
                                            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>Ersätter {grupp.personalNamn}</p>
                                          </>
                                        ) : (
                                          <p className="truncate text-base font-semibold" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</p>
                                        )}
                                      </div>
                                      <StatusBadge status={dominerandStatus as PassStatus} />
                                    </div>

                                    <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
                                      <div>
                                        <p className="text-lg font-semibold leading-tight" style={{ color: 'var(--text)' }}>{tidFrån}–{tidTill}</p>
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{grupp.arbetslagNamn || grupp.pass[0].grupp || 'Ingen grupp'}</p>
                                      </div>
                                      {info.atgard && !vikarieNamn && (
                                        <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ color: '#f97316', background: 'rgba(249, 115, 22, 0.12)' }}>
                                          Åtgärd
                                        </span>
                                      )}
                                    </div>
                                  </button>
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

              <div
                className="bemanning-kalender-grid hidden gap-2 transition-[grid-template-columns,opacity] duration-300 ease-out md:grid md:[grid-template-columns:repeat(var(--bemanning-kolumner-md),minmax(0,1fr))] xl:[grid-template-columns:repeat(var(--bemanning-kolumner),minmax(0,1fr))]"
                style={{ ['--bemanning-kolumner']: kalenderKolumner, ['--bemanning-kolumner-md']: kalenderKolumnerMd } as any}
              >
                {synligaDagar.map(({ datum, grupper }) => (
                  <section key={datum} className="bemanning-dag scroll-mt-32 rounded-xl border p-2 transition-[border-color,background-color,box-shadow,transform,opacity] duration-300 ease-out md:min-h-[240px] xl:min-h-[300px]" style={{ borderColor: datum === idag ? 'var(--blue)' : 'var(--border)', background: 'var(--bg-card)', boxShadow: datum === idag ? 'inset 0 0 0 2px color-mix(in srgb, var(--blue) 55%, transparent)' : 'none' }}>
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-lg px-1.5 py-1" style={{ background: grupper.some(grupp => gruppInfo(grupp).atgard) ? 'rgba(249, 115, 22, 0.08)' : 'transparent' }}>
                      <div>
                        <h2 className="text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>{kortVeckodag(datum)}</h2>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{grupper.length} pass</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {grupper.some(grupp => gruppInfo(grupp).atgard) && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#f97316', background: 'rgba(249, 115, 22, 0.12)' }}>Åtgärd</span>
                        )}
                        <button
                          type="button"
                          onClick={() => öppnaSkapaPass(datum)}
                          className="rounded-full border px-2.5 py-1 text-[11px] font-semibold opacity-90 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:opacity-60 sm:hover:opacity-100 sm:focus-visible:opacity-100"
                          style={{ borderColor: 'var(--blue)', background: 'var(--blue)', color: '#fff' }}
                        >
                          + Pass
                        </button>
                      </div>
                    </div>

                    {grupper.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-3 py-8 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
                        Inga pass
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {grupper.map((grupp) => {
                          const globalIndex = filtreradeGrupper.findIndex(g => g.personal_id === grupp.personal_id && g.datum === grupp.datum);
                          const tidFrån = grupp.pass[0].tid_från.slice(0, 5);
                          const tidTill = grupp.pass[grupp.pass.length - 1].tid_till.slice(0, 5);
                          const vikarie = grupp.pass.find(p => p.vikarie_id && (p.status === 'bokat' || p.status === 'bekräftat'));
                          const vikariNamn = vikarie ? vikarier.find(v => v.id === vikarie.vikarie_id)?.namn : null;
                          const statusar = [...new Set(grupp.pass.map(p => p.status))];
                          const dominerandStatus = statusar.length === 1 ? statusar[0] : 'obokat';
                          const alleMarkerade = grupp.pass.every(p => valda.has(p.id));
                          const info = gruppInfo(grupp);
                          const statusText = info.passerad ? 'Passerat' : info.avbokad ? 'Avbokat' : info.harAvbokningsförfrågan ? 'Avbokning' : vikariNamn ? 'Bokad' : info.harRiktadFörfrågan ? 'Förfrågan' : info.publicerad ? 'Ledigt' : 'Ej publicerad';
                          const statusColor = info.passerad ? 'var(--text-muted)' : vikariNamn ? '#22c55e' : info.atgard ? '#f97316' : info.publicerad ? 'var(--blue)' : 'var(--text-muted)';

                          return (
                            <div key={`${grupp.personal_id}_${grupp.datum}`} className="min-h-[104px] rounded-xl border p-2.5 transition hover:-translate-y-0.5 hover:shadow-sm sm:min-h-[116px] sm:p-3" style={{ borderColor: alleMarkerade ? 'var(--blue)' : info.atgard ? '#f97316' : 'var(--border)', background: alleMarkerade ? 'color-mix(in srgb, var(--blue) 8%, var(--bg))' : 'var(--bg)' }}>
                              <div className="flex items-start gap-2.5 sm:gap-3">
                                <button type="button" aria-pressed={alleMarkerade} aria-label={alleMarkerade ? 'Avmarkera pass' : 'Markera pass'} onClick={(e) => { e.stopPropagation(); sättGruppMarkerad(grupp, !alleMarkerade, Math.max(globalIndex, 0), e.shiftKey); }} className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" style={{ background: alleMarkerade ? 'var(--blue)' : 'var(--input-bg)', borderColor: alleMarkerade ? 'var(--blue)' : 'var(--border)', color: alleMarkerade ? '#fff' : 'var(--text-subtle)' }}>{alleMarkerade ? '✓' : ''}</button>
                                <button type="button" onClick={(e) => öppnaPassDetaljer(grupp.pass[0], e.currentTarget)} className="min-w-0 flex-1 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      {vikariNamn ? (
                                        <>
                                          <p className="truncate text-sm font-semibold" style={{ color: info.passerad ? 'var(--text)' : '#22c55e' }}>{vikariNamn}</p>
                                          <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>Ersätter: {grupp.personalNamn}</p>
                                        </>
                                      ) : (
                                        <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{grupp.personalNamn}</p>
                                      )}
                                    </div>
                                    <div className="shrink-0">
                                      {info.passerad ? (
                                        <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ color: 'var(--text-muted)', background: 'var(--hover)' }}>
                                          Passerat
                                        </span>
                                      ) : (
                                        <StatusBadge status={dominerandStatus as PassStatus} />
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-2.5 grid grid-cols-[1fr_auto] items-end gap-2 sm:mt-3">
                                    <div className="min-w-0">
                                      <p className="text-base font-semibold leading-tight" style={{ color: 'var(--text)' }}>{tidFrån}–{tidTill}</p>
                                      <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{grupp.arbetslagNamn || grupp.pass[0].grupp || 'Ingen grupp'}</p>
                                    </div>
                                    {!vikariNamn && (
                                      <span className="truncate rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: statusColor, background: 'var(--hover)' }}>{statusText}</span>
                                    )}
                                  </div>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                ))}
              </div>
          </>
        )}
      </div>

      {valtPass && (
        <Modal öppen={!!valtPass} onStäng={stängPassModal} bredd="xl">
          <PassDetaljer
            pass={valtPass}
            vikarier={vikarier}
            personal={personal}
            onStäng={stängPassModal}
            onUppdaterad={uppdaterad => {
              setPass(prev => prev.map(p => p.id === uppdaterad.id ? { ...p, ...uppdaterad } : p));
              setValtPass(uppdaterad);
            }}
          />
        </Modal>
      )}

      <NyttPassModal öppen={skapaModal} onStäng={() => setSkapaModal(false)} personal={personal} onSkapad={ladda} förvaltDatum={skapaDatum} />

      <Confirm
        öppen={arkiveraValda}
        titel="Arkivera pass"
        text={arkiveringsText}
        bekräftaText={arkiverar ? 'Arkiverar…' : `Arkivera ${valda.size} pass`}
        farlig
        onBekräfta={arkiveraMånga}
        onAvbryt={() => setArkiveraValda(false)}
      />
    </div>
  );
}
