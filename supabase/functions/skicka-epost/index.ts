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
  const { pass_id, vikarie_ids } = await req.json();

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
    const ämne = `Vikariepass ${pass.datum} - ${pass.tid_från.slice(0, 5)}-${pass.tid_till.slice(0, 5)}`;
    const rader = [
      `Hej ${vikarie.namn},`,
      '',
      'Ett vikariepass är tillgängligt:',
      '',
      `Datum: ${pass.datum}`,
      `Tid: ${pass.tid_från.slice(0, 5)}-${pass.tid_till.slice(0, 5)}`,
      pass.personal ? `Ersätter: ${kortNamn(pass.personal.namn)}` : null,
      pass.personal?.arbetslag ? `Arbetslag: ${pass.personal.arbetslag.namn}` : null,
      pass.grupp ? `Grupp/klass: ${pass.grupp}` : null,
      pass.anteckning ? `Kommentar: ${pass.anteckning}` : null,
      '',
      'Logga in i systemet för att svara.',
    ].filter(r => r !== null).join('\n');

    await skickaPush(supabase, vikarie.profil_id, ämne, `${pass.datum} ${pass.tid_från.slice(0, 5)}-${pass.tid_till.slice(0, 5)}`, '/vikarie');

    const { data: notis } = await supabase.from('notiser').insert({
      pass_id, vikarie_id: vikarie.id, kanal: 'epost',
      status: 'väntande', mottagare: vikarie.epost ?? 'push', ämne, innehåll: rader,
    }).select().single();

    let skickadStatus: 'skickat' | 'misslyckat' = 'skickat';
    let felmeddelande: string | null = null;

    if (vikarie.epost && RESEND_API_KEY) {
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
    resultat.push({ vikarie_id: vikarie.id, status: skickadStatus, fel: felmeddelande ?? undefined });
  }

  if (någotSkickades) {
    await supabase.from('vikariepass').update({ status: 'notifierat' }).eq('id', pass_id);
  }

  return new Response(JSON.stringify({ resultat }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
