import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7?target=deno';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const SKICKA_EPOST = Deno.env.get('SKICKA_EPOST') === 'true';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function kortNamn(namn: string | null | undefined) {
  if (!namn) return null;
  const delar = namn.trim().split(/\s+/).filter(Boolean);
  if (delar.length <= 1) return delar[0] ?? null;
  return `${delar[0]} ${delar[delar.length - 1].slice(0, 1)}.`;
}

function arskurs(grupp: string | null | undefined) {
  const text = (grupp ?? '').toLowerCase();
  if (!text.trim()) return 'Ej angiven årskurs';
  if (/fsk|förskoleklass|f-klass|fk/.test(text)) return 'FSK';

  const siffror = [...text.matchAll(/\b[1-6]\b/g)].map((m) => Number(m[0]));
  if (siffror.some((n) => n >= 1 && n <= 3)) return 'åk. 1-3';
  if (siffror.some((n) => n >= 4 && n <= 6)) return 'åk. 4-6';

  return 'Ej angiven årskurs';
}


async function hittaProfilIdForVikarie(supabase: ReturnType<typeof createClient>, vikarie: { profil_id?: string | null; epost?: string | null; id: string }) {
  if (vikarie.profil_id) return vikarie.profil_id;
  if (!vikarie.epost) return null;

  const { data: profil } = await supabase
    .from('profiler')
    .select('id')
    .ilike('epost', vikarie.epost)
    .eq('roll', 'vikarie')
    .eq('aktiv', true)
    .maybeSingle();

  if (profil?.id) {
    await supabase.from('vikarier').update({ profil_id: profil.id }).eq('id', vikarie.id);
    return profil.id as string;
  }

  return null;
}

async function raknaPushPrenumerationer(supabase: ReturnType<typeof createClient>, profilId: string | null) {
  if (!profilId) return 0;
  const { count } = await supabase
    .from('push_prenumerationer')
    .select('id', { count: 'exact', head: true })
    .eq('profil_id', profilId)
    .eq('aktiv', true);
  return count ?? 0;
}

async function skickaPush(supabase: ReturnType<typeof createClient>, profilId: string | null, title: string, body: string, url: string) {
  if (!profilId || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { data: subs } = await supabase
    .from('push_prenumerationer')
    .select('*')
    .eq('profil_id', profilId)
    .eq('aktiv', true);

  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, JSON.stringify({ title, body, url }));
    } catch (_) {
      await supabase.from('push_prenumerationer').update({ aktiv: false }).eq('id', sub.id);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json();
  const { pass_id, vikarie_ids, typ } = body;



  if (typ === 'test_push') {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'VAPID-nycklar saknas i Edge Function.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Du måste vara inloggad för att testa push.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subs } = await supabase
      .from('push_prenumerationer')
      .select('id')
      .eq('profil_id', userData.user.id)
      .eq('aktiv', true);

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ error: 'Ingen aktiv push-prenumeration hittades för kontot.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await skickaPush(supabase, userData.user.id, 'Testnotis', 'Push fungerar på denna enhet.', '/');

    return new Response(JSON.stringify({ ok: true, subscriptions: subs.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typ === 'admin_avbokning') {
    if (!pass_id) {
      return new Response(JSON.stringify({ error: 'pass_id krävs.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: pass, error: passError } = await supabase
      .from('vikariepass')
      .select('*, personal(namn)')
      .eq('id', pass_id)
      .single();

    if (passError || !pass) {
      return new Response(JSON.stringify({ error: 'Passet hittades inte.' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: admins } = await supabase
      .from('profiler')
      .select('id, namn, epost')
      .eq('roll', 'admin')
      .eq('aktiv', true);

    const tid = `${pass.tid_från.slice(0, 5)}-${pass.tid_till.slice(0, 5)}`;
    const title = 'Avbokningsförfrågan';
    const bodyText = `En vikarie vill avboka pass ${pass.datum} ${tid}.`;

    for (const admin of admins ?? []) {
      await supabase.from('notiser').insert({
        pass_id,
        vikarie_id: pass.vikarie_id ?? null,
        kanal: 'push',
        status: 'skickat',
        mottagare: 'admin',
        ämne: title,
        innehåll: bodyText,
        skickat_kl: new Date().toISOString(),
      });

      await skickaPush(supabase, admin.id, title, bodyText, '/admin/vikariepass');
    }

    return new Response(JSON.stringify({ ok: true, admins: admins?.length ?? 0 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!pass_id || !Array.isArray(vikarie_ids) || vikarie_ids.length === 0) {
    return new Response(JSON.stringify({ error: 'pass_id och vikarie_ids krävs.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: pass, error: passError } = await supabase
    .from('vikariepass')
    .select('*, personal(namn, arbetslag(namn))')
    .eq('id', pass_id)
    .single();

  if (passError || !pass) {
    return new Response(JSON.stringify({ error: 'Passet hittades inte.' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: vikarier } = await supabase
    .from('vikarier')
    .select('id, profil_id, namn, epost')
    .in('id', vikarie_ids)
    .eq('aktiv', true);

  const resultat: { vikarie_id: string; status: string; fel?: string }[] = [];
  let någotSkickades = false;

  for (const vikarie of (vikarier ?? [])) {
    const namn = kortNamn(pass.personal?.namn) ?? 'personal';
    const tid = `${pass.tid_från.slice(0, 5)}-${pass.tid_till.slice(0, 5)}`;
    const årskurs = arskurs(pass.grupp);
    const ämne = `Vikariepass ${pass.datum} ${tid}`;
    const rader = [
      `Hej ${vikarie.namn},`,
      '',
      'Du har en vikariefråga:',
      '',
      `Vikarierar för: ${namn}`,
      `Årskurs: ${årskurs}`,
      `Tid: ${tid}`,
      `Datum: ${pass.datum}`,
      pass.anteckning ? `Kommentar: ${pass.anteckning}` : null,
      '',
      'Logga in i systemet för att svara.',
    ].filter(r => r !== null).join('\n');

    const pushProfilId = await hittaProfilIdForVikarie(supabase, vikarie);
    const pushPrenumerationer = await raknaPushPrenumerationer(supabase, pushProfilId);
    await skickaPush(supabase, pushProfilId, ämne, `${namn} · ${årskurs} · ${tid}`, '/vikarie');

    const { data: notis } = await supabase.from('notiser').insert({
      pass_id, vikarie_id: vikarie.id, kanal: 'epost',
      status: 'väntande', mottagare: vikarie.epost ?? 'push', ämne, innehåll: rader,
    }).select().single();

    let skickadStatus: 'skickat' | 'misslyckat' = 'skickat';
    let felmeddelande: string | null = null;

    if (SKICKA_EPOST && vikarie.epost && RESEND_API_KEY) {
      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: FROM_EMAIL, to: [vikarie.epost], subject: ämne, text: rader }),
        });

        if (!resp.ok) {
          skickadStatus = 'misslyckat';
          const err = await resp.json();
          felmeddelande = err?.message ?? JSON.stringify(err);
        }
      } catch (e) {
        skickadStatus = 'misslyckat';
        felmeddelande = String(e);
      }
    }

    if (notis) {
      await supabase.from('notiser').update({
        status: skickadStatus, skickat_kl: new Date().toISOString(), felmeddelande,
      }).eq('id', notis.id);
    }

    någotSkickades = true;
    resultat.push({
      vikarie_id: vikarie.id,
      status: skickadStatus,
      fel: felmeddelande ?? undefined,
      push_profil_id: pushProfilId ?? undefined,
      push_prenumerationer: pushPrenumerationer,
    });
  }

  if (någotSkickades) {
    await supabase.from('vikariepass').update({ status: 'notifierat' }).eq('id', pass_id);
  }

  return new Response(JSON.stringify({ resultat }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
