// ============================================================
// Database enums
// ============================================================

export type PassStatus = 'obokat' | 'notifierat' | 'bokat' | 'bekräftat' | 'avbokat';
export type HändelsTyp =
  | 'pass_skapat'
  | 'pass_uppdaterat'
  | 'vikarie_notifierat'
  | 'vikarie_bokat'
  | 'bokning_bekräftad'
  | 'pass_avbokat'
  | 'vikarie_borttagen';
export type NotisKanal = 'epost' | 'sms' | 'push';
export type NotisStatus = 'väntande' | 'skickat' | 'misslyckat';
export type PassTyp = 'hel_dag' | 'del_av_dag';
export type Matchningsstatus = 'matchad' | 'osäker' | 'omatchad' | 'ignorerad';
export type UserRoll = 'admin' | 'vikarie';

// ============================================================
// Database row types
// ============================================================

export interface Profil {
  id: string;
  roll: UserRoll;
  namn: string | null;
  epost: string | null;
  telefon: string | null;
  aktiv: boolean;
  maste_byta_losenord?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Arbetslag {
  id: string;
  namn: string;
  beskrivning: string | null;
  färg: string;
  aktiv: boolean;
  maste_byta_losenord?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Personal {
  id: string;
  arbetslag_id: string | null;
  namn: string;
  epost: string | null;
  telefon: string | null;
  signatur: string | null;
  skola24_id: string | null;
  titel: string | null;
  aktiv: boolean;
  maste_byta_losenord?: boolean;
  created_at: string;
  updated_at: string;
  // joined
  arbetslag?: Arbetslag;
}

export interface Vikarie {
  id: string;
  profil_id: string | null;
  namn: string;
  epost: string | null;
  telefon: string | null;
  ämnen: string[] | null;
  stadier: string[] | null;
  anteckning: string | null;
  aktiv: boolean;
  maste_byta_losenord?: boolean;
  created_at: string;
  updated_at: string;
}

export interface VikarieTillgänglighet {
  id: string;
  vikarie_id: string;
  datum: string | null;
  veckodag: number | null;
  tillgänglig: boolean;
  tid_från: string | null;
  tid_till: string | null;
  återkommande: boolean;
  anteckning: string | null;
  created_at: string;
  updated_at: string;
}

export interface Frånvaro {
  id: string;
  personal_id: string;
  datum_från: string;
  datum_till: string;
  hel_dag: boolean;
  tid_från: string | null;
  tid_till: string | null;
  orsak: string | null;
  anteckning: string | null;
  skapad_av: string | null;
  created_at: string;
  updated_at: string;
  // joined
  personal?: Personal;
}

export interface Schemaimport {
  id: string;
  filnamn: string;
  källa: string;
  kolumnmappning: Record<string, string> | null;
  radantal: number | null;
  matchade: number;
  omatchade: number;
  importerad_av: string | null;
  created_at: string;
}

export interface Schemarad {
  id: string;
  import_id: string;
  personal_id: string | null;
  rå_data: Record<string, unknown>;
  datum: string | null;
  tid_från: string | null;
  tid_till: string | null;
  ämne: string | null;
  grupp: string | null;
  sal: string | null;
  signatur: string | null;
  matchningsstatus: Matchningsstatus;
  created_at: string;
  // joined
  personal?: Personal;
}

export interface Vikariepass {
  id: string;
  frånvaro_id: string | null;
  schemarad_id: string | null;
  personal_id: string | null;
  vikarie_id: string | null;
  datum: string;
  tid_från: string;
  tid_till: string;
  typ: PassTyp;
  ämne: string | null;
  grupp: string | null;
  sal: string | null;
anteckning: string | null;
  riktad_till_vikarie_id: string | null;
  publicerad: boolean;
  status: PassStatus;
  skapad_av: string | null;
  created_at: string;
  updated_at: string;
  // joined
  personal?: Personal;
  vikarie?: Vikarie;
  frånvaro?: Frånvaro;
}

export interface Passhistorik {
  id: string;
  pass_id: string;
  händelse: HändelsTyp;
  utförd_av: string | null;
  metadata: Record<string, unknown> | null;
  anteckning: string | null;
  created_at: string;
  // joined
  utförd_av_profil?: Profil;
}

export interface Passmeddelande {
  id: string;
  pass_id: string;
  avsandare_profil_id: string | null;
  avsandare_roll: 'admin' | 'vikarie';
  meddelande: string;
  created_at: string;
  avsandare?: Profil;
}

export interface Notis {
  id: string;
  pass_id: string;
  vikarie_id: string | null;
  kanal: NotisKanal;
  status: NotisStatus;
  mottagare: string;
  ämne: string | null;
  innehåll: string | null;
  skickat_kl: string | null;
  felmeddelande: string | null;
  created_at: string;
  // joined
  vikarie?: Vikarie;
}

// ============================================================
// Insert/Update types
// ============================================================

export type NyArbetslag = Omit<Arbetslag, 'id' | 'created_at' | 'updated_at'>;
export type UppdateraArbetslag = Partial<NyArbetslag>;

export type NyPersonal = Omit<Personal, 'id' | 'created_at' | 'updated_at' | 'arbetslag'>;
export type UppdateraPersonal = Partial<NyPersonal>;

export type NyVikarie = Omit<Vikarie, 'id' | 'created_at' | 'updated_at'>;
export type UppdateraVikarie = Partial<NyVikarie>;

export type NyFrånvaro = Omit<Frånvaro, 'id' | 'created_at' | 'updated_at' | 'personal'>;
export type UppdateraFrånvaro = Partial<NyFrånvaro>;

export type NyttVikariepass = Omit<Vikariepass, 'id' | 'created_at' | 'updated_at' | 'personal' | 'vikarie' | 'frånvaro'>;
export type UppdateraVikariepass = Partial<NyttVikariepass>;

// ============================================================
// UI / application types
// ============================================================

export interface DashboardStatistik {
  obokade: number;
  notifierade: number;
  bokade: number;
  bekräftade: number;
  avbokade: number;
  dagensPass: Vikariepass[];
  kommandePass: Vikariepass[];
}

export interface ImportFörhandsvisning {
  rader: Record<string, string>[];
  kolumner: string[];
  mappning: Record<string, string>;
}

export interface PassFilter {
  datumFrån?: string;
  datumTill?: string;
  status?: PassStatus[];
  arbetslagId?: string;
  sökterm?: string;
}

export interface AuthState {
  användare: import('@supabase/supabase-js').User | null;
  profil: Profil | null;
  laddar: boolean;
}

export const PASS_STATUS_LABELS: Record<PassStatus, string> = {
  obokat: 'Obokat',
  notifierat: 'Notifierat',
  bokat: 'Bokat',
  bekräftat: 'Bekräftat',
  avbokat: 'Avbokat',
};

export const PASS_STATUS_COLORS: Record<PassStatus, string> = {
  obokat: 'bg-red-100 text-red-700',
  notifierat: 'bg-blue-100 text-blue-700',
  bokat: 'bg-yellow-100 text-yellow-700',
  bekräftat: 'bg-green-100 text-green-700',
  avbokat: 'bg-gray-100 text-gray-500',
};

export const HÄNDELSE_LABELS: Record<HändelsTyp, string> = {
  pass_skapat: 'Pass skapat',
  pass_uppdaterat: 'Pass uppdaterat',
  vikarie_notifierat: 'Vikarie notifierat',
  vikarie_bokat: 'Vikarie bokat',
  bokning_bekräftad: 'Bokning bekräftad',
  pass_avbokat: 'Pass avbokat',
  vikarie_borttagen: 'Vikarie borttagen',
};

export const VECKODAG_LABELS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
