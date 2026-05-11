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
  måndag: 1, tisdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lördag: 6, söndag: 7,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
};

export function detekteraNovaschema(text: string): boolean {
  return text.split(/\r?\n/).slice(0, 80).some((rad) => {
    const kolumner = rad.split('\t');
    return kolumner.length >= 10 && parseVeckodag(kolumner[2]) !== null && /^\d{1,2}:\d{2}$/.test(kolumner[3]?.trim() ?? '');
  });
}

export function parsaNovaschemaFil(text: string): NovaschemaLektion[] {
  return text.split(/\r?\n/).map(parsaLektionsrad).filter((rad): rad is NovaschemaLektion => rad !== null);
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

function parsaLektionsrad(rad: string): NovaschemaLektion | null {
  const kolumner = rad.split('\t').map((kolumn) => kolumn.trim());
  if (kolumner.length < 10) return null;

  const veckodag = parseVeckodag(kolumner[2]);
  const tidFrån = normaliseraTid(kolumner[3]);
  const minuter = Number.parseInt(kolumner[4], 10);
  const veckor = parseVeckor(kolumner.slice(10).find((kolumn) => /\d/.test(kolumn)) ?? kolumner[13] ?? '');

  if (!veckodag || !tidFrån || !Number.isFinite(minuter) || minuter <= 0 || veckor.length === 0) return null;

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

function parseVeckodag(värde: string | undefined): number | null {
  const text = värde?.trim().toLowerCase();
  if (!text) return null;
  const nummer = Number.parseInt(text, 10);
  if (nummer >= 1 && nummer <= 7) return nummer;
  if (nummer === 0) return 7;
  return VECKODAGAR[text] ?? null;
}

function normaliseraTid(värde: string | undefined): string | null {
  const match = värde?.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function parseVeckor(värde: string): number[] {
  const veckor = new Set<number>();

  for (const del of värde.split(/[,;\s]+/)) {
    if (!del) continue;
    const intervall = del.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);

    if (intervall) {
      const start = Number.parseInt(intervall[1], 10);
      const slut = Number.parseInt(intervall[2], 10);
      const steg = start <= slut ? 1 : -1;
      for (let vecka = start; vecka !== slut + steg; vecka += steg) läggTillVecka(veckor, vecka);
    } else {
      läggTillVecka(veckor, Number.parseInt(del, 10));
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
