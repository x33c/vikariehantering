import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildPushHTTPRequest } from 'npm:@pushforge/builder';

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


function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const padded = value + '='.repeat((4 - value.length % 4) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from([...binary].map((char) => char.charCodeAt(0)));
}

function vapidPrivateJwk() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null;

  const publicBytes = base64UrlToBytes(VAPID_PUBLIC_KEY);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error('Ogiltig VAPID public key.');
  }

  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicBytes.slice(1, 33)),
    y: base64UrlEncode(publicBytes.slice(33, 65)),
    d: VAPID_PRIVATE_KEY,
  };
}

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

  const privateJWK = vapidPrivateJwk();
  if (!privateJWK) return;

  const { data: subs } = await supabase
    .from('push_prenumerationer')
    .select('*')
    .eq('profil_id', profilId)
    .eq('aktiv', true);

  for (const sub of subs ?? []) {
    try {
      const request = await buildPushHTTPRequest({
        privateJWK,
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        message: {
          payload: {
            title,
            body,
            url,
            icon: '/sundbyberg-halm.png',
            badge: '/sundbyberg-halm.png',
          },
          adminContact: VAPID_SUBJECT,
          options: { urgency: 'high', ttl: 3600 },
        },
      });

      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
      });

      if (!response.ok) {
        const text = await response.text();
        await supabase.from('push_prenumerationer').update({
          senaste_fel: text || `Push service svarade ${response.status}`,
          updated_at: new Date().toISOString(),
          aktiv: response.status === 404 || response.status === 410 ? false : true,
        }).eq('id', sub.id);
      } else {
        await supabase.from('push_prenumerationer').update({
          senaste_fel: null,
          updated_at: new Date().toISOString(),
          aktiv: true,
        }).eq('id', sub.id);
      }
    } catch (error) {
      await supabase.from('push_prenumerationer').update({
        senaste_fel: error instanceof Error ? error.message : String(error),
        updated_at: new Date().toISOString(),
        aktiv: true,
      }).eq('id', sub.id);
    }
  }
}

serve(async (req) => {
  try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const body = await req.json();
  const { pass_id, vikarie_ids, typ, avsandare_roll, meddelande, vikarie_id, svar } = body;




  if (typ === 'koppla_vikarieprofil') {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Du måste vara inloggad.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const email = userData.user.email?.trim();
    let kopplade = [];

    if (email) {
      const { data } = await supabase
        .from('vikarier')
        .update({ profil_id: userData.user.id })
        .ilike('epost', email)
        .eq('aktiv', true)
        .select('id, namn, epost');

      kopplade = data ?? [];
    }

    return new Response(JSON.stringify({ ok: true, kopplade }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typ === 'massmeddelande_vikarier') {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Du måste vara inloggad.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profil } = await supabase
      .from('profiler')
      .select('roll')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profil?.roll !== 'admin') {
      return new Response(JSON.stringify({ error: 'Endast admin kan skicka massmeddelanden.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ids = Array.isArray(body.vikarie_ids)
      ? body.vikarie_ids.filter((id: unknown) => typeof id === 'string')
      : [];
    const title = typeof body.titel === 'string' && body.titel.trim()
      ? body.titel.trim()
      : 'Meddelande från admin';
    const text = typeof body.meddelande === 'string' ? body.meddelande.trim() : '';

    if (ids.length === 0 || !text) {
      return new Response(JSON.stringify({ error: 'Välj mottagare och skriv ett meddelande.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: mottagare, error } = await supabase
      .from('vikarier')
      .select('id, namn, epost, profil_id')
      .in('id', ids)
      .eq('aktiv', true);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let skickade = 0;
    let utanPush = 0;

    for (const vikarie of mottagare ?? []) {
      try {
        const profilId = await hittaProfilIdForVikarie(supabase, vikarie);
        const prenumerationer = await raknaPushPrenumerationer(supabase, profilId);

        if (!profilId || prenumerationer === 0) {
          utanPush += 1;
          continue;
        }

        await skickaPush(supabase, profilId, title, text, '/vikarie');
        skickade += 1;
      } catch (error) {
        utanPush += 1;
        console.error('Kunde inte skicka massmeddelande till vikarie', vikarie.id, error);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      valda: ids.length,
      matchade: mottagare?.length ?? 0,
      skickade,
      utan_push: utanPush,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typ === 'ledigt_pass_publicerat' || typ === 'bokat_pass_andrat') {
    if (!pass_id) {
      return new Response(JSON.stringify({ error: 'pass_id krävs.' }), {
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

    const bodyText = typ === 'bokat_pass_andrat'
      ? 'Ett bokat pass har ändrats. Öppna appen för detaljer.'
      : 'Ett nytt ledigt pass finns att boka. Öppna appen för detaljer.';

    if (typ === 'bokat_pass_andrat') {
      if (!vikarie_id) {
        return new Response(JSON.stringify({ error: 'vikarie_id krävs.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: vikarie } = await supabase
        .from('vikarier')
        .select('id, namn, epost, profil_id')
        .eq('id', vikarie_id)
        .maybeSingle();

      if (!vikarie) {
        return new Response(JSON.stringify({ error: 'Vikarien hittades inte.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const profilId = await hittaProfilIdForVikarie(supabase, vikarie);
      const pushCount = await raknaPushPrenumerationer(supabase, profilId);
      const title = 'Bokat pass ändrat';

      await supabase.from('notiser').insert({
        pass_id,
        vikarie_id: vikarie.id,
        kanal: 'push',
        status: pushCount > 0 ? 'skickat' : 'misslyckat',
        mottagare: vikarie.epost ?? 'push',
        ämne: title,
        innehåll: bodyText,
        skickat_kl: new Date().toISOString(),
        felmeddelande: pushCount > 0 ? null : 'Ingen aktiv push-prenumeration hittades.',
      });

      if (pushCount > 0) {
        await skickaPush(supabase, profilId, title, bodyText, '/vikarie/mina-pass');
      }

      return new Response(JSON.stringify({ ok: true, push_prenumerationer: pushCount }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: vikarier, error } = await supabase
      .from('vikarier')
      .select('id, namn, epost, profil_id')
      .eq('aktiv', true);

    const { data: exkluderingar } = await supabase
      .from('vikariepass_exkluderingar')
      .select('vikarie_id')
      .eq('pass_id', pass_id);

    const exkluderadeVikarieIds = new Set((exkluderingar ?? []).map((rad: { vikarie_id: string }) => rad.vikarie_id));

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let skickadePush = 0;
    let utanPush = 0;
    const title = 'Nytt ledigt pass';

    for (const vikarie of (vikarier ?? []).filter((v: { id: string }) => !exkluderadeVikarieIds.has(v.id))) {
      const profilId = await hittaProfilIdForVikarie(supabase, vikarie);
      const pushCount = await raknaPushPrenumerationer(supabase, profilId);

      await supabase.from('notiser').insert({
        pass_id,
        vikarie_id: vikarie.id,
        kanal: 'push',
        status: pushCount > 0 ? 'skickat' : 'misslyckat',
        mottagare: vikarie.epost ?? 'push',
        ämne: title,
        innehåll: bodyText,
        skickat_kl: new Date().toISOString(),
        felmeddelande: pushCount > 0 ? null : 'Ingen aktiv push-prenumeration hittades.',
      });

      if (pushCount > 0) {
        await skickaPush(supabase, profilId, title, bodyText, '/vikarie');
        skickadePush += 1;
      } else {
        utanPush += 1;
      }
    }

    return new Response(JSON.stringify({ ok: true, skickade_push: skickadePush, utan_push: utanPush, exkluderade: exkluderadeVikarieIds.size }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

    const email = userData.user.email?.trim();
    if (email) {
      await supabase
        .from('vikarier')
        .update({ profil_id: userData.user.id })
        .ilike('epost', email)
        .eq('aktiv', true);
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


  if (typ === 'admin_vikarie_svar') {
    if (!pass_id || !vikarie_id || (svar !== 'ja' && svar !== 'nej')) {
      return new Response(JSON.stringify({ error: 'pass_id, vikarie_id och svar krävs.' }), {
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

    const { data: vikarie } = await supabase
      .from('vikarier')
      .select('id, namn')
      .eq('id', vikarie_id)
      .maybeSingle();

    const { data: admins } = await supabase
      .from('profiler')
      .select('id, namn, epost')
      .eq('roll', 'admin')
      .eq('aktiv', true);

    const title = svar === 'ja' ? 'Vikarie tackade ja' : 'Vikarie tackade nej';
    const bodyText = 'En vikarie har svarat på en förfrågan. Öppna appen för detaljer.';

    for (const admin of admins ?? []) {
      await skickaPush(supabase, admin.id, title, bodyText, '/admin/vikariepass');
    }

    return new Response(JSON.stringify({ ok: true, admins: admins?.length ?? 0 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typ === 'pass_meddelande') {
    if (!pass_id || (avsandare_roll !== 'admin' && avsandare_roll !== 'vikarie')) {
      return new Response(JSON.stringify({ error: 'pass_id och avsandare_roll krävs.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const meddelandeText = typeof meddelande === 'string' && meddelande.trim()
      ? meddelande.trim()
      : 'Nytt meddelande i ett pass.';
    const kortMeddelande = meddelandeText.length > 110 ? `${meddelandeText.slice(0, 107)}...` : meddelandeText;

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

    if (avsandare_roll === 'admin') {
      if (!pass.vikarie_id) {
        return new Response(JSON.stringify({ ok: true, skickat: false, orsak: 'Passet saknar bokad vikarie.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: vikarie } = await supabase
        .from('vikarier')
        .select('id, profil_id, namn, epost')
        .eq('id', pass.vikarie_id)
        .maybeSingle();

      if (vikarie) {
        const profilId = await hittaProfilIdForVikarie(supabase, vikarie);
        const title = 'Nytt meddelande från admin';
        const pushBody = 'Du har fått ett nytt meddelande om ett pass. Öppna appen för detaljer.';

        await supabase.from('notiser').insert({
          pass_id,
          vikarie_id: vikarie.id,
          kanal: 'push',
          status: 'skickat',
          mottagare: vikarie.epost ?? 'vikarie',
          ämne: title,
          innehåll: pushBody,
          skickat_kl: new Date().toISOString(),
        });

        await skickaPush(supabase, profilId, title, pushBody, '/vikarie/mina-pass');
      }

      return new Response(JSON.stringify({ ok: true, mottagare: 'vikarie' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: admins } = await supabase
      .from('profiler')
      .select('id, namn, epost')
      .eq('roll', 'admin')
      .eq('aktiv', true);

    const title = 'Nytt meddelande från vikarie';
    const pushBody = 'En vikarie har skrivit ett nytt meddelande om ett pass. Öppna appen för detaljer.';

    await supabase.from('notiser').insert({
      pass_id,
      vikarie_id: pass.vikarie_id ?? null,
      kanal: 'push',
      status: 'skickat',
      mottagare: 'admin',
      ämne: title,
      innehåll: pushBody,
      skickat_kl: new Date().toISOString(),
    });

    for (const admin of admins ?? []) {
      await skickaPush(supabase, admin.id, title, pushBody, '/admin/vikariepass');
    }

    return new Response(JSON.stringify({ ok: true, admins: admins?.length ?? 0 }), {
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

    const title = 'Avbokningsförfrågan';
    const bodyText = 'En vikarie vill avboka ett pass. Öppna appen för detaljer.';

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

    for (const admin of admins ?? []) {
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
    const ämne = 'Ny vikariefråga';
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
    await skickaPush(supabase, pushProfilId, ämne, 'Du har en ny förfrågan. Öppna appen för detaljer.', '/vikarie');

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
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
