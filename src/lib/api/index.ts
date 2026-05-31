import { supabase } from '../supabase';

function signaleraTillgänglighetÄndrad(vikarieId?: string | null) {
  if (typeof window === 'undefined') return;

  const detail = { vikarieId: vikarieId ?? null, tid: Date.now() };
  window.dispatchEvent(new CustomEvent('passportalen:tillganglighet-andrad', { detail }));

  try {
    window.localStorage.setItem('passportalen:tillganglighet-andrad', JSON.stringify(detail));
  } catch {
    // Lokal synk är en förbättring, inte ett krav.
  }
}
function arVardag(datum?: string | null) {
  if (!datum) return false;
  const dag = new Date(`${datum}T12:00:00`).getDay();
  return dag >= 1 && dag <= 5;
}

import type {
  Arbetslag, NyArbetslag, UppdateraArbetslag,
  Personal, NyPersonal, UppdateraPersonal,
  Vikarie, NyVikarie, UppdateraVikarie,
  VikarieTillgänglighet,
  Frånvaro, NyFrånvaro,
  Vikariepass, NyttVikariepass, UppdateraVikariepass, VikariepassExkludering,
  PassStatus, HändelsTyp, Passmeddelande,
  Schemaimport, Schemarad, Matchningsstatus,
  DashboardStatistik, PassFilter,
} from '../../types';

export const auth = {
  async loggaIn(epost: string, lösenord: string) {
    return supabase.auth.signInWithPassword({ email: epost, password: lösenord });
  },
  async loggaUt() { return supabase.auth.signOut(); },
  async hämtaSession() { return supabase.auth.getSession(); },
  async hämtaProfil(userId: string) {
    return supabase.from('profiler').select('*').eq('id', userId).single();
  },
};


export const profilApi = {
  async lista() {
    return supabase.from('profiler').select('*').order('created_at', { ascending: false });
  },
  async uppdatera(id: string, data: { roll?: 'admin' | 'vikarie'; namn?: string | null; epost?: string | null; telefon?: string | null; aktiv?: boolean }) {
    return supabase.from('profiler').update(data).eq('id', id).select().single();
  },
};

export const arbetslagApi = {
  async lista() {
    return supabase.from('arbetslag').select('*').eq('aktiv', true).order('namn');
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

export const personalApi = {
  async lista(arbetslagId?: string) {
    let q = supabase.from('personal').select('*, arbetslag(*)').eq('aktiv', true).order('namn');
    if (arbetslagId) q = q.eq('arbetslag_id', arbetslagId);
    return q;
  },
  async hämta(id: string) {
    return supabase.from('personal').select('*, arbetslag(*)').eq('id', id).single();
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
  async raderaMånga(ids: string[]) {
    return supabase.from('personal').update({ aktiv: false }).in('id', ids);
  },
  async sök(term: string) {
    return supabase.from('personal').select('*, arbetslag(*)').eq('aktiv', true)
      .or(`namn.ilike.%${term}%,signatur.ilike.%${term}%,epost.ilike.%${term}%`);
  },
};

export const vikariApi = {
  async lista() {
    return supabase.from('vikarier').select('*').eq('aktiv', true).order('namn');
  },
  async hämta(id: string) {
    return supabase.from('vikarier').select('*').eq('id', id).single();
  },
  async hämtaViaProfilId(profilId: string) {
    return supabase.from('vikarier').select('*').eq('profil_id', profilId).eq('aktiv', true).maybeSingle();
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
    return supabase.from('vikarie_tillgänglighet').select('*').eq('vikarie_id', vikarieId)
      .order('created_at', { ascending: false });
  },
  async sättTillgänglighet(data: Omit<VikarieTillgänglighet, 'id' | 'created_at' | 'updated_at'>) {
    const res = await supabase.from('vikarie_tillgänglighet').insert(data).select().single();
    if (!res.error) signaleraTillgänglighetÄndrad(data.vikarie_id);
    return res;
  },
  async raderaTillgänglighet(id: string) {
    const befintlig = await supabase
      .from('vikarie_tillgänglighet')
      .select('vikarie_id')
      .eq('id', id)
      .maybeSingle();

    const res = await supabase.from('vikarie_tillgänglighet').delete().eq('id', id);
    if (!res.error) signaleraTillgänglighetÄndrad(befintlig.data?.vikarie_id ?? null);
    return res;
  },
  async kopplaProfil(vikarieId: string, profilId: string | null) {
    return supabase.from('vikarier').update({ profil_id: profilId }).eq('id', vikarieId).select().single();
  },
};

export const frånvaroApi = {
  async lista(datumFrån?: string, datumTill?: string) {
    let q = supabase.from('frånvaro').select('*, personal(*, arbetslag(*))')
      .order('datum_från', { ascending: false });
    if (datumFrån) q = q.gte('datum_från', datumFrån);
    if (datumTill) q = q.lte('datum_till', datumTill);
    return q;
  },
  async hämta(id: string) {
    return supabase.from('frånvaro').select('*, personal(*, arbetslag(*))').eq('id', id).single();
  },
  async skapa(data: NyFrånvaro) {
    return supabase.from('frånvaro').insert(data).select('*').single();
  },
  async uppdatera(id: string, data: Partial<NyFrånvaro>) {
    return supabase.from('frånvaro').update(data).eq('id', id).select('*, personal(*)').single();
  },
  async radera(id: string) {
    return supabase.from('frånvaro').delete().eq('id', id);
  },
  async hämtaSchemaraderFörFrånvaro(personalId: string, datumFrån: string, datumTill: string) {
    return supabase.from('schemarader').select('*').eq('personal_id', personalId)
      .gte('datum', datumFrån).lte('datum', datumTill).eq('matchningsstatus', 'matchad');
  },
};

export const passApi = {
  async lista(filter?: PassFilter) {
    let q: any = supabase.from('vikariepass')
      .select('*, personal(*, arbetslag(*)), frånvaro(*)')
      .order('datum').order('tid_från');
    if (filter?.datumFrån) q = q.gte('datum', filter.datumFrån);
    if (filter?.datumTill) q = q.lte('datum', filter.datumTill);
    if (filter?.status?.length) q = q.in('status', filter.status);
    return q;
  },
  async hämta(id: string) {
    return (supabase.from('vikariepass') as any)
      .select('*, personal(*, arbetslag(*)), frånvaro(*)')
      .eq('id', id).single();
  },
  async listaExkluderingar(passId: string) {
    return supabase
      .from('vikariepass_exkluderingar')
      .select('*, vikarie:vikarier(*)')
      .eq('pass_id', passId)
      .order('created_at', { ascending: true });
  },
  async listaMinaExkluderingar(vikarieId: string) {
    return supabase
      .from('vikariepass_exkluderingar')
      .select('pass_id')
      .eq('vikarie_id', vikarieId);
  },
  async sparaExkluderingar(passId: string, vikarieIds: string[]) {
    const rader = [...new Set(vikarieIds)]
      .filter(Boolean)
      .map((vikarie_id) => ({ pass_id: passId, vikarie_id }));

    const radera = await supabase
      .from('vikariepass_exkluderingar')
      .delete()
      .eq('pass_id', passId);

    if (radera.error) return radera;

    const röraPasset = async () => {
      await supabase
        .from('vikariepass')
        .update({ updated_at: new Date().toISOString() } as any)
        .eq('id', passId);
    };

    if (rader.length === 0) {
      await röraPasset();
      return { data: [] as VikariepassExkludering[], error: null };
    }

    const res = await supabase
      .from('vikariepass_exkluderingar')
      .insert(rader)
      .select('*, vikarie:vikarier(*)');

    if (!res.error) await röraPasset();
    return res;
  },
  async skapa(data: NyttVikariepass) {
    if (!arVardag(data.datum)) {
      return { data: null, error: null };
    }

    if (data.personal_id && data.tid_från && data.tid_till) {
      const befintligt = await supabase
        .from('vikariepass')
        .select('id, datum, tid_från, tid_till, personal_id, personal(namn)')
        .eq('personal_id', data.personal_id)
        .eq('datum', data.datum)
        .neq('status', 'avbokat')
        .lt('tid_från', data.tid_till)
        .gt('tid_till', data.tid_från)
        .limit(1);

      if (befintligt.error) return { data: null, error: befintligt.error };

      if ((befintligt.data ?? []).length > 0) {
        return {
          data: null,
          error: {
            message: 'Det finns redan ett aktivt vikariepass för personen som överlappar den här tiden. Öppna det befintliga passet och ändra det istället.',
          },
        };
      }
    }

    const payload = {
      ...data,
      publicerad: data.publicerad ?? false,
      personal_id: data.personal_id || null,
      frånvaro_id: data.frånvaro_id || null,
      schemarad_id: data.schemarad_id || null,
      vikarie_id: data.vikarie_id || null,
      riktad_till_vikarie_id: data.riktad_till_vikarie_id || null,
      skapad_av: data.skapad_av || null,
    };

    return supabase.from('vikariepass')
      .insert(payload)
      .select('*, personal(*)')
      .single();
  },
  async uppdatera(id: string, data: UppdateraVikariepass) {
    return supabase.from('vikariepass').update(data).eq('id', id).select('*, personal(*)').single();
  },
  async uppdateraStatus(id: string, status: PassStatus) {
    return supabase.from('vikariepass').update({ status }).eq('id', id).select().single();
  },
  async tilldelVikarie(passId: string, vikarieId: string) {
    return supabase.from('vikariepass')
      .update({ vikarie_id: vikarieId, status: 'bokat' })
      .eq('id', passId).select('*, personal(*)').single();
  },
  async bokaPass(passId: string, vikarieId: string) {
    return supabase.from('vikariepass')
      .update({ vikarie_id: vikarieId, status: 'bokat' })
      .eq('id', passId).in('status', ['obokat', 'notifierat']).is('vikarie_id', null)
      .select().single();
  },
  async tackaJa(passId: string, vikarieId: string) {
    return supabase.from('vikariepass')
      .update({ vikarie_id: vikarieId, status: 'bokat', riktad_till_vikarie_id: null })
      .eq('id', passId).in('status', ['obokat', 'notifierat']).is('vikarie_id', null)
      .select('*').single();
  },
  async tackaNej(passId: string, vikarieId: string) {
    return supabase.from('vikariepass')
      .update({ status: 'obokat', riktad_till_vikarie_id: null })
      .eq('id', passId).eq('riktad_till_vikarie_id', vikarieId).eq('status', 'notifierat')
      .select('*').single();
  },
  async hämtaVikarie(vikarieId: string) {
    return supabase.from('vikarier').select('*').eq('id', vikarieId).single();
  },
  async radera(id: string) {
    return supabase.from('vikariepass')
      .update({ status: 'avbokat' })
      .eq('id', id)
      .select()
      .single();
  },
  async dashboardStatistik(): Promise<DashboardStatistik> {
    const idag = new Date().toISOString().slice(0, 10);
    const omSjuDagar = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [dagensRes, kommandeRes, statRes] = await Promise.all([
      supabase.from('vikariepass').select('*, personal(*, arbetslag(*))')
        .eq('datum', idag).neq('status', 'avbokat').order('tid_från'),
      supabase.from('vikariepass').select('*, personal(*, arbetslag(*))')
        .gt('datum', idag).lte('datum', omSjuDagar).neq('status', 'avbokat').order('datum'),
      supabase.from('vikariepass').select('status').gte('datum', idag),
    ]);
    const statusRäkning = (statRes.data ?? []).reduce((acc, row) => {
      acc[row.status as PassStatus] = (acc[row.status as PassStatus] ?? 0) + 1;
      return acc;
    }, {} as Record<PassStatus, number>);
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

export const historikApi = {
  async listaFörPass(passId: string) {
    return (supabase.from('passhistorik') as any)
      .select('*, utförd_av_profil:profiler(namn, epost)')
      .eq('pass_id', passId).order('created_at', { ascending: false });
  },
  async skapa(passId: string, händelse: HändelsTyp, metadata?: Record<string, unknown>, anteckning?: string) {
    const { data: userRes } = await supabase.auth.getUser();
    return supabase.from('passhistorik').insert({
      pass_id: passId,
      händelse,
      utförd_av: userRes.user?.id ?? null,
      metadata: metadata ?? null,
      anteckning: anteckning ?? null,
    });
  },
};

export const passmeddelandeApi = {
  async lista(passId: string) {
    return supabase
      .from('passmeddelanden')
      .select('*, avsandare:profiler(namn, epost, roll)')
      .eq('pass_id', passId)
      .order('created_at', { ascending: true });
  },
  async skapa(passId: string, meddelande: string, roll: 'admin' | 'vikarie') {
    const { data: userRes } = await supabase.auth.getUser();
    return supabase
      .from('passmeddelanden')
      .insert({
        pass_id: passId,
        avsandare_profil_id: userRes.user?.id ?? null,
        avsandare_roll: roll,
        meddelande,
      })
      .select()
      .single();
  },
  async radera(id: string) {
    return supabase.from('passmeddelanden').delete().eq('id', id);
  },
};

export const notisApi = {
  async listaAdmin() {
    return supabase
      .from('notiser')
      .select('*, vikarie:vikarier(namn, epost), pass:vikariepass(*, personal(namn))')
      .eq('mottagare', 'admin')
      .order('created_at', { ascending: false })
      .limit(100);
  },
  async listaFörPass(passId: string) {
    return supabase.from('notiser').select('*')
      .eq('pass_id', passId).order('created_at', { ascending: false });
  },
  async skickaNotiser(passId: string, vikariIds: string[]) {
    return supabase.functions.invoke('skicka-epost', {
      body: { pass_id: passId, vikarie_ids: vikariIds },
    });
  },
  async skickaLedigtPass(passId: string) {
    return supabase.functions.invoke('skicka-epost', {
      body: { typ: 'ledigt_pass_publicerat', pass_id: passId },
    });
  },
  async skickaPassAndrat(passId: string, vikarieId: string) {
    return supabase.functions.invoke('skicka-epost', {
      body: { typ: 'bokat_pass_andrat', pass_id: passId, vikarie_id: vikarieId },
    });
  },
  async skapaAdminBokning(passId: string, vikarieId: string, vikarieNamn?: string) {
    const namn = vikarieNamn?.trim() || 'Vikarien';
    return supabase.from('notiser').insert({
      pass_id: passId,
      vikarie_id: vikarieId,
      kanal: 'push',
      status: 'skickat',
      mottagare: 'admin',
      ämne: 'Pass bokat',
      innehåll: `${namn} har bokat ett ledigt pass.`,
      skickat_kl: new Date().toISOString(),
    });
  },
  async skapaAdminSvar(passId: string, vikarieId: string, svar: 'ja' | 'nej', vikarieNamn?: string) {
    const namn = vikarieNamn?.trim() || 'Vikarien';
    return supabase.from('notiser').insert({
      pass_id: passId,
      vikarie_id: vikarieId,
      kanal: 'push',
      status: 'skickat',
      mottagare: 'admin',
      ämne: svar === 'ja' ? 'Vikarie tackade ja' : 'Vikarie tackade nej',
      innehåll: svar === 'ja'
        ? `${namn} har tackat ja till förfrågan.`
        : `${namn} har tackat nej till förfrågan.`,
      skickat_kl: new Date().toISOString(),
    });
  },
  async skickaAdminSvar(passId: string, vikarieId: string, svar: 'ja' | 'nej') {
    return supabase.functions.invoke('skicka-epost', {
      body: { typ: 'admin_vikarie_svar', pass_id: passId, vikarie_id: vikarieId, svar },
    });
  },
  async skapaAdminAvbokning(passId: string) {
    return supabase.from('notiser').insert({
      pass_id: passId,
      vikarie_id: null,
      kanal: 'push',
      status: 'skickat',
      mottagare: 'admin',
      ämne: 'Avbokningsförfrågan',
      innehåll: 'En vikarie har begärt att avboka ett pass.',
      skickat_kl: new Date().toISOString(),
    });
  },
  async skickaAdminAvbokning(passId: string) {
    return supabase.functions.invoke('skicka-epost', {
      body: { typ: 'admin_avbokning', pass_id: passId },
    });
  },
  async skickaMeddelandeNotifiering(passId: string, avsandareRoll: 'admin' | 'vikarie', meddelande: string) {
    return supabase.functions.invoke('skicka-epost', {
      body: { typ: 'pass_meddelande', pass_id: passId, avsandare_roll: avsandareRoll, meddelande },
    });
  },
};

export const importApi = {
  async listaImporter() {
    return supabase.from('schemaimport').select('*').order('created_at', { ascending: false });
  },
  async skapaImport(filnamn: string, radantal: number, kolumnmappning: Record<string, string>) {
    return supabase.from('schemaimport').insert({ filnamn, radantal, kolumnmappning }).select().single();
  },
  async skapaSchemarader(rader: Omit<Schemarad, 'id' | 'created_at' | 'personal'>[]) {
    return supabase.from('schemarader').insert(rader).select();
  },
  async listaSchemarader(importId: string) {
    return supabase.from('schemarader').select('*, personal(*, arbetslag(*))')
      .eq('import_id', importId).order('datum').order('tid_från');
  },
  async uppdateraMatchning(radId: string, personalId: string | null, status: Matchningsstatus) {
    return supabase.from('schemarader')
      .update({ personal_id: personalId, matchningsstatus: status }).eq('id', radId);
  },
  async uppdateraImportStatistik(importId: string, matchade: number, omatchade: number) {
    return supabase.from('schemaimport').update({ matchade, omatchade }).eq('id', importId);
  },
  async matchaSchemaraderMotPersonal(personer: Pick<Personal, 'id' | 'signatur'>[]) {
    for (const person of personer) {
      if (!person.signatur) continue;
      const res = await supabase.from('schemarader')
        .update({ personal_id: person.id, matchningsstatus: 'matchad' })
        .ilike('signatur', person.signatur);
      if (res.error) return res;
    }
    return { data: null, error: null };
  },
};
