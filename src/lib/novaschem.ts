export interface NovaschemaLektion {
  lektionsId: string;
  veckodag: number;
  tidFrån: string;
  minuter: number;
  ämne: string;
  signatur: string;
  grupp: string;
  sal: string;
  veckor: number[];
}

export interface NovaschemaImportRad {
  datum: string;
  tidFrån: string;
  tidTill: string;
  ämne: string;
  signatur: string;
  grupp: string;
  sal: string;
  lektionsId: string;
  vecka: number;
}

const VECKODAGAR: Record<string, number> = {
  måndag: 1, mån: 1, må: 1, monday: 1, mon: 1,
  tisdag: 2, tis: 2, ti: 2, tuesday: 2, tue: 2,
  onsdag: 3, ons: 3, on: 3, wednesday: 3, wed: 3,
  torsdag: 4, tor: 4, to: 4, thursday: 4, thu: 4,
  fredag: 5, fre: 5, fr: 5, friday: 5, fri: 5,
  lördag: 6, lör: 6, lö: 6, saturday: 6, sat: 6,
  söndag: 7, sön: 7, sö: 7, sunday: 7, sun: 7,
};

export function detekteraNovaschema(text: string): boolean {
  return hittaLektionsrader(text).some((rad) => parsaLektionsrad(rad) !== null);
}

export function parsaNovaschemaFil(text: string): NovaschemaLektion[] {
  return hittaLektionsrader(text)
    .map(parsaLektionsrad)
    .filter((rad): rad is NovaschemaLektion => rad !== null);
}

export function expanderaLektioner(lektioner: NovaschemaLektion[]): NovaschemaImportRad[] {
  return lektioner.flatMap((lektion) => {
    const tidTill = läggTillMinuter(lektion.tidFrån, lektion.minuter);
    return lektion.veckor.map((vecka) => ({
      datum: isoDatumFörVecka(vecka >= 27 ? 2025 : 2026, vecka, lektion.veckodag),
      tidFrån: lektion.tidFrån,
      tidTill,
      ämne: lektion.ämne,
      signatur: lektion.signatur,
      grupp: lektion.grupp,
      sal: lektion.sal,
      lektionsId: lektion.lektionsId,
      vecka,
    }));
  });
}

function hittaLektionsrader(text: string): string[] {
  const allaRader = text.split(/\r?\n/);
  const lessonIndex = allaRader.findIndex((rad) => rad.trim() === 'Lesson (7100)');
  if (lessonIndex === -1) return allaRader;

  const rowsIndex = allaRader.findIndex((rad, index) => index > lessonIndex && rad.trim() === '[Rows]');
  if (rowsIndex === -1) return [];

  const dataStart = rowsIndex + 2;
  const dataSlut = allaRader.findIndex((rad, index) =>
    index > dataStart && /^\[[^\]]+\]$/.test(rad.trim())
  );

  return allaRader
    .slice(dataStart, dataSlut === -1 ? undefined : dataSlut)
    .filter((rad) => rad.trim() && !rad.startsWith('PK (7100)'));
}

function parsaLektionsrad(rad: string): NovaschemaLektion | null {
  const kolumner = rad.split('\t').map((kolumn) => kolumn.trim());
  if (kolumner.length < 6) return null;

  const fast = parsaFastNovaschemRad(kolumner);
  if (fast) return fast;

  return parsaFlexibelNovaschemRad(kolumner);
}

function parsaFastNovaschemRad(kolumner: string[]): NovaschemaLektion | null {
  const veckodag = parseVeckodag(kolumner[2]);
  const tidFrån = normaliseraTid(kolumner[3]);
  const minuter = parseMinuter(kolumner[4]);
  const veckor = parseVeckor(kolumner.slice(10).join(' '));

  if (!veckodag || !tidFrån || !minuter || veckor.length === 0) return null;

  return {
    lektionsId: kolumner[0] || kolumner[1] || `${kolumner[2]}-${kolumner[3]}-${kolumner[7]}`,
    veckodag,
    tidFrån,
    minuter,
    ämne: kolumner[6] ?? '',
    signatur: kolumner[7] ?? '',
    grupp: kolumner[8] ?? '',
    sal: kolumner[9] ?? '',
    veckor,
  };
}

function parsaFlexibelNovaschemRad(kolumner: string[]): NovaschemaLektion | null {
  const tidIndex = kolumner.findIndex((kolumn) => normaliseraTid(kolumn) !== null);
  if (tidIndex === -1) return null;

  const veckodagIndex = Math.max(0, tidIndex - 1);
  const veckodag = parseVeckodag(kolumner[veckodagIndex]);
  const tidFrån = normaliseraTid(kolumner[tidIndex]);
  const minuter = parseMinuter(kolumner[tidIndex + 1]);
  const veckor = parseVeckor(kolumner.slice(tidIndex + 2).join(' '));

  if (!veckodag || !tidFrån || !minuter || veckor.length === 0) return null;

  const efterTid = kolumner.slice(tidIndex + 2).filter(Boolean);
  const utanVeckor = efterTid.filter((kolumn) => parseVeckor(kolumn).length === 0);

  const ämne = utanVeckor[0] ?? '';
  const signatur = utanVeckor.find((kolumn, index) =>
    index > 0 && /^[A-Za-zÅÄÖåäö]{2,8}$/.test(kolumn)
  ) ?? utanVeckor[1] ?? '';
  const signaturIndex = utanVeckor.indexOf(signatur);

  return {
    lektionsId: kolumner[0] || `${kolumner[veckodagIndex]}-${kolumner[tidIndex]}-${signatur}`,
    veckodag,
    tidFrån,
    minuter,
    ämne,
    signatur,
    grupp: signaturIndex >= 0 ? utanVeckor[signaturIndex + 1] ?? '' : '',
    sal: signaturIndex >= 0 ? utanVeckor[signaturIndex + 2] ?? '' : '',
    veckor,
  };
}

function parseVeckodag(värde: string | undefined): number | null {
  const text = värde?.trim().toLowerCase().replace(/\.$/, '');
  if (!text) return null;

  const nummer = Number.parseInt(text, 10);
  if (nummer >= 1 && nummer <= 7) return nummer;
  if (nummer === 0) return 7;

  return VECKODAGAR[text] ?? null;
}

function normaliseraTid(värde: string | undefined): string | null {
  const text = värde?.trim();
  if (!text) return null;

  const kolon = text.match(/^(\d{1,2})[:.](\d{2})$/);
  if (kolon) return `${kolon[1].padStart(2, '0')}:${kolon[2]}`;

  const kompakt = text.match(/^(\d{1,2})(\d{2})$/);
  if (kompakt) return `${kompakt[1].padStart(2, '0')}:${kompakt[2]}`;

  return null;
}

function parseMinuter(värde: string | undefined): number | null {
  const minuter = Number.parseInt(värde?.trim() ?? '', 10);
  return Number.isFinite(minuter) && minuter > 0 && minuter <= 300 ? minuter : null;
}

function parseVeckor(värde: string): number[] {
  const veckor = new Set<number>();
  const text = värde.replace(/[vV]\.?/g, '');

  for (const match of text.matchAll(/(\d{1,2})\s*-\s*(\d{1,2})|(\d{1,2})/g)) {
    if (match[1] && match[2]) {
      const start = Number.parseInt(match[1], 10);
      const slut = Number.parseInt(match[2], 10);
      const steg = start <= slut ? 1 : -1;
      for (let vecka = start; vecka !== slut + steg; vecka += steg) läggTillVecka(veckor, vecka);
    } else if (match[3]) {
      läggTillVecka(veckor, Number.parseInt(match[3], 10));
    }
  }

  return [...veckor].sort((a, b) => (a >= 27 ? 2025 : 2026) - (b >= 27 ? 2025 : 2026) || a - b);
}

function läggTillVecka(veckor: Set<number>, vecka: number) {
  if (Number.isInteger(vecka) && vecka >= 1 && vecka <= 53) veckor.add(vecka);
}

function läggTillMinuter(tid: string, minuter: number): string {
  const [timme, minut] = tid.split(':').map(Number);
  const totalt = timme * 60 + minut + minuter;
  return `${String(Math.floor(totalt / 60) % 24).padStart(2, '0')}:${String(totalt % 60).padStart(2, '0')}`;
}

function isoDatumFörVecka(år: number, vecka: number, veckodag: number): string {
  const fjärdeJanuari = new Date(Date.UTC(år, 0, 4));
  const dag = fjärdeJanuari.getUTCDay() || 7;
  const måndagVeckaEtt = new Date(fjärdeJanuari);
  måndagVeckaEtt.setUTCDate(fjärdeJanuari.getUTCDate() - dag + 1);

  const datum = new Date(måndagVeckaEtt);
  datum.setUTCDate(måndagVeckaEtt.getUTCDate() + (vecka - 1) * 7 + (veckodag - 1));
  return datum.toISOString().slice(0, 10);
}

export interface NovaschemaPersonal {
  signatur: string;
  namn: string;
  förnamn: string;
  efternamn: string;
  titel: string;
  telefon: string;
  epost: string;
}

export function parsaPersonalFrånNovaschema(text: string): NovaschemaPersonal[] {
  const allaRader = text.split(/\r?\n/);
  const teacherIndex = allaRader.findIndex((rad) => rad.trim() === 'Teacher (6000)');
  if (teacherIndex === -1) return [];

  const rowsIndex = allaRader.findIndex((rad, index) => index > teacherIndex && rad.trim() === '[Rows]');
  if (rowsIndex === -1) return [];

  const dataStart = rowsIndex + 2;
  const dataSlut = allaRader.findIndex((rad, index) =>
    index > dataStart && /^\[[^\]]+\]$/.test(rad.trim())
  );

  return allaRader
    .slice(dataStart, dataSlut === -1 ? undefined : dataSlut)
    .map((rad) => {
      const kolumner = rad.split('\t').map((kolumn) => kolumn.trim());
      const signatur = kolumner[0] ?? '';
      const efternamn = kolumner[4] ?? '';
      const titel = kolumner[5] ?? '';
      const förnamn = kolumner[6] ?? '';
      const telefon = kolumner[7] ?? '';
      const epost = kolumner[8] ?? '';
      const namn = [förnamn, efternamn].filter(Boolean).join(' ').trim();

      return { signatur, namn, förnamn, efternamn, titel, telefon, epost };
    })
    .filter((person) => person.signatur && person.namn);
}
