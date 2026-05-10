import { supabase } from '../supabase';
import type {
  Arbetslag, NyArbetslag, UppdateraArbetslag,
  Personal, NyPersonal, UppdateraPersonal,
  Vikarie, NyVikarie, UppdateraVikarie,
  VikarieTillgänglighet,
  Frånvaro, NyFrånvaro,
  Vikariepass, NyttVikariepass, UppdateraVikariepass,
  PassStatus, Passhistorik, HändelsTyp, Notis,
  Schemaimport, Schemarad, Matchningsstatus,
  DashboardStatistik, PassFilter,
} from '../../types';

// ============================================================
// AUTH
// ============================================================

export const auth = {
  async loggaIn(epost: string, lösenord: string) {
    return supabase.auth.signInWithPassword({ email: epost, password: lösenord });
  },
  async loggaUt() {
    return supabase.auth.signOut();
  },
  async hämtaSession() {
    return supabase.auth.getSession();
  },
  async hämtaProfil(userId: string) {
    return supabase.from('profiler').select('*').eq('id', userId).single();
  },
};

// ============================================================
// ARBETSLAG
// ============================================================

export const arbetslagApi = {
  async lista() {
    return supabase
      .from('arbetslag')
      .select('*')
      .eq('aktiv', true)
      .order('namn');
  },
  async hämta(id: string) {
    return supabase.from('arbetslag').select('*').eq('id', id).single();
  },
  async skapa(data: NyArbetslag) {
    return supabase.from('arbetslag').insert(data).select().single();
  },
  async uppdatera(id: string, data: UppdateraArbetslag) {
    return supabase.from('arbetslag').update(data).eq('id', id).select().single();
  },
  async radera(id: string) {
    return supabase.from('arbetslag').update({ aktiv: false }).eq('id', id);
  },
};

// ============================================================
// PERSONAL
// ============================================================

export const personalApi = {
  async lista(arbetslagId?: string) {
    let q = supabase
      .from('personal')
      .select('*, arbetslag(*)')
      .eq('aktiv', true)
      .order('namn');
    if (arbetslagId) q = q.eq('arbetslag_id', arbetslagId);
    return q;
  },
  async hämta(id: string) {
    return supabase
      .from('personal')
      .select('*, arbetslag(*)')
      .eq('id', id)
      .single();
  },
  async skapa(data: NyPersonal) {
    return supabase.from('personal').insert(data).select('*, arbetslag(*)').single();
  },
  async uppdatera(id: string, data: UppdateraPersonal) {
    return supabase.from('personal').update(data).eq('id', id).select('*, arbetslag(*)').single();
  },
  async radera(id: string) {
    return supabase.from('personal').update({ aktiv: false }).eq('id', id);
  },
  async sök(term: string) {
    return supabase
      .from('personal')
      .select('*, arbetslag(*)')
      .eq('aktiv', true)
      .or(`namn.ilike.%${term}%,signatur.ilike.%${term}%,epost.ilike.%${term}%`);
  },
};

// ============================================================
// VIKARIER
// ============================================================

export const vikariApi = {
  async lista() {
    return supabase
      .from('vikarier')
      .select('*')
      .eq('aktiv', true)
      .order('namn');
  },
  async hämta(id: string) {
    return supabase.from('vikarier').select('*').eq('id', id).single();
  },
  async hämtaViaProfilId(profilId: string) {
    return supabase.from('vikarier').select('*').eq('profil_id', profilId).single();
  },
  async skapa(data: NyVikarie) {
    return supabase.from('vikarier').insert(data).select().single();
  },
  async uppdatera(id: string, data: UppdateraVikarie) {
    return supabase.from('vikarier').update(data).eq('id', id).select().single();
  },
  async radera(id: string) {
    return supabase.from('vikarier').update({ aktiv: false }).eq('id', id);
  },
  async hämtaTillgänglighet(vikarieId: string) {
    return supabase
      .from('vikarie_tillgänglighet')
      .select('*')
      .eq('vikarie_id', vikarieId)
      .order('created_at', { ascending: false });
  },
  async sättTillgänglighet(data: Omit<VikarieTillgänglighet, 'id' | 'created_at' | 'updated_at'>) {
    return supabase.from('vikarie_tillgänglighet').insert(data).select().single();
  },
  async raderaTillgänglighet(id: string) {
    return supabase.from('vikarie_tillgänglighet').delete().eq('id', id);
  },
};

// ============================================================
// FRÅNVARO
// ============================================================

export const frånvaroApi = {
  async lista(datumFrån?: string, datumTill?: string) {
    let q = supabase
      .from('frånvaro')
      .select('*, personal(*, arbetslag(*))')
      .order('datum_från', { ascending: false });
    if (datumFrån) q = q.gte('datum_från', datumFrån);
    if (datumTill) q = q.lte('datum_till', datumTill);
    return q;
  },
  async hämta(id: string) {
    return supabase
      .from('frånvaro')
      .select('*, personal(*, arbetslag(*))')
      .eq('id', id)
      .single();
  },
  async skapa(data: NyFrånvaro) {
    return supabase.from('frånvaro').insert(data).select('*, personal(*, arbetslag(*))').single();
  },
  async uppdatera(id: string, data: Partial<NyFrånvaro>) {
    return supabase.from('frånvaro').update(data).eq('id', id).select('*, personal(*)').single();
  },
  async radera(id: string) {
    return supabase.from('frånvaro').delete().eq('id', id);
  },
  // Hämta schemarader för given personal och datum
  async hämtaSchemaraderFörFrånvaro(personalId: string, datumFrån: string, datumTill: string) {
    return supabase
      .from('schemarader')
      .select('*')
      .eq('personal_id', personalId)
      .gte('datum', datumFrån)
      .lte('datum', datumTill)
      .eq('matchningsstatus', 'matchad');
  },
};

// ============================================================
// VIKARIEPASS
// ============================================================

export const passApi = {
  async lista(filter?: PassFilter) {
    let q = supabase
      .from('vikariepass')
      .select('*, personal(*, arbetslag(*)), vikarie(*), frånvaro(*)')
      .order('datum')
      .order('tid_från');
    if (filter?.datumFrån) q = q.gte('datum', filter.datumFrån);
    if (filter?.datumTill) q = q.lte('datum', filter.datumTill);
    if (filter?.status?.length) q = q.in('status', filter.status);
    return q;
  },
  async hämta(id: string) {
    return supabase
      .from('vikariepass')
      .select('*, personal(*, arbetslag(*)), vikarie(*), frånvaro(*)')
      .eq('id', id)
      .single();
  },
  async skapa(data: NyttVikariepass) {
    return supabase.from('vikariepass').insert(data).select('*, personal(*), vikarie(*)').single();
  },
  async uppdatera(id: string, data: UppdateraVikariepass) {
    return supabase.from('vikariepass').update(data).eq('id', id).select('*, personal(*), vikarie(*)').single();
  },
  async uppdateraStatus(id: string, status: PassStatus) {
    return supabase.from('vikariepass').update({ status }).eq('id', id).select().single();
  },
  async tilldelVikarie(passId: string, vikarieId: string) {
    return supabase
      .from('vikariepass')
      .update({ vikarie_id: vikarieId, status: 'bokat' })
      .eq('id', passId)
      .select('*, personal(*), vikarie(*)')
      .single();
  },
  // Vikarie bokar pass (konkurrens-säkert via RPC eller optimistisk)
  async bokaPass(passId: string, vikarieId: string) {
    const { data, error } = await supabase
      .from('vikariepass')
      .update({ vikarie_id: vikarieId, status: 'bokat' })
      .eq('id', passId)
      .in('status', ['obokat', 'notifierat'])
      .is('vikarie_id', null)
      .select()
      .single();
    return { data, error };
  },
  async dagensPass() {
    const idag = new Date().toISOString().slice(0, 10);
    return supabase
      .from('vikariepass')
      .select('*, personal(*, arbetslag(*)), vikarie(*)')
      .eq('datum', idag)
      .neq('status', 'avbokat')
      .order('tid_från');
  },
  async dashboardStatistik(): Promise<DashboardStatistik> {
    const idag = new Date().toISOString().slice(0, 10);
    const omSjuDagar = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const [dagensRes, kommandeRes, statRes] = await Promise.all([
      supabase
        .from('vikariepass')
        .select('*, personal(*, arbetslag(*)), vikarie(*)')
        .eq('datum', idag)
        .neq('status', 'avbokat')
        .order('tid_från'),
      supabase
        .from('vikariepass')
        .select('*, personal(*, arbetslag(*)), vikarie(*)')
        .gt('datum', idag)
        .lte('datum', omSjuDagar)
        .neq('status', 'avbokat')
        .order('datum'),
      supabase
        .from('vikariepass')
        .select('status')
        .gte('datum', idag),
    ]);

    const statusRäkning = (statRes.data ?? []).reduce(
      (acc, row) => {
        acc[row.status as PassStatus] = (acc[row.status as PassStatus] ?? 0) + 1;
        return acc;
      },
      {} as Record<PassStatus, number>
    );

    return {
      obokade: statusRäkning.obokat ?? 0,
      notifierade: statusRäkning.notifierat ?? 0,
      bokade: statusRäkning.bokat ?? 0,
      bekräftade: statusRäkning.bekräftat ?? 0,
      avbokade: statusRäkning.avbokat ?? 0,
      dagensPass: (dagensRes.data ?? []) as Vikariepass[],
      kommandePass: (kommandeRes.data ?? []) as Vikariepass[],
    };
  },
};

// ============================================================
// PASSHISTORIK
// ============================================================

export const historikApi = {
  async listaFörPass(passId: string) {
    return supabase
      .from('passhistorik')
      .select('*, utförd_av_profil:profiler(namn, epost)')
      .eq('pass_id', passId)
      .order('created_at', { ascending: false });
  },
  async skapa(passId: string, händelse: HändelsTyp, metadata?: Record<string, unknown>, anteckning?: string) {
    return supabase.from('passhistorik').insert({
      pass_id: passId,
      händelse,
      metadata: metadata ?? null,
      anteckning: anteckning ?? null,
    });
  },
};

// ============================================================
// NOTISER
// ============================================================

export const notisApi = {
  async listaFörPass(passId: string) {
    return supabase
      .from('notiser')
      .select('*, vikarie(*)')
      .eq('pass_id', passId)
      .order('created_at', { ascending: false });
  },
  async skickaNotiser(passId: string, vikariIds: string[]) {
    const { data, error } = await supabase.functions.invoke('skicka-epost', {
      body: { pass_id: passId, vikarie_ids: vikariIds },
    });
    return { data, error };
  },
};

// ============================================================
// SCHEMAIMPORT
// ============================================================

export const importApi = {
  async listaImporter() {
    return supabase
      .from('schemaimport')
      .select('*')
      .order('created_at', { ascending: false });
  },
  async skapaImport(filnamn: string, radantal: number, kolumnmappning: Record<string, string>) {
    return supabase
      .from('schemaimport')
      .insert({ filnamn, radantal, kolumnmappning })
      .select()
      .single();
  },
  async skapaSchemarader(rader: Omit<Schemarad, 'id' | 'created_at' | 'personal'>[]) {
    return supabase.from('schemarader').insert(rader).select();
  },
  async listaSchemarader(importId: string) {
    return supabase
      .from('schemarader')
      .select('*, personal(*, arbetslag(*))')
      .eq('import_id', importId)
      .order('datum')
      .order('tid_från');
  },
  async uppdateraMatchning(radId: string, personalId: string | null, status: Matchningsstatus) {
    return supabase
      .from('schemarader')
      .update({ personal_id: personalId, matchningsstatus: status })
      .eq('id', radId);
  },
  async uppdateraImportStatistik(importId: string, matchade: number, omatchade: number) {
    return supabase
      .from('schemaimport')
      .update({ matchade, omatchade })
      .eq('id', importId);
  },
};
