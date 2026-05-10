// supabase/functions/skicka-epost/index.ts
// Deploy: supabase functions deploy skicka-epost
//
// Required environment variables (set via `supabase secrets set`):
//   RESEND_API_KEY   – API-nyckel från Resend (https://resend.com)
//   FROM_EMAIL       – Avsändaradress, t.ex. "noreply@skola.se"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@example.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const { pass_id, vikarie_ids } = await req.json();

  if (!pass_id || !Array.isArray(vikarie_ids) || vikarie_ids.length === 0) {
    return new Response(JSON.stringify({ error: 'pass_id och vikarie_ids krävs.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Hämta passinfo
  const { data: pass, error: passError } = await supabase
    .from('vikariepass')
    .select('*, personal(namn, arbetslag(namn))')
    .eq('id', pass_id)
    .single();

  if (passError || !pass) {
    return new Response(JSON.stringify({ error: 'Passet hittades inte.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Hämta vikarier
  const { data: vikarier } = await supabase
    .from('vikarier')
    .select('id, namn, epost')
    .in('id', vikarie_ids)
    .eq('aktiv', true);

  const resultat: { vikarie_id: string; status: string; fel?: string }[] = [];

  for (const vikarie of (vikarier ?? [])) {
    if (!vikarie.epost) {
      resultat.push({ vikarie_id: vikarie.id, status: 'skippat – ingen epost' });
      continue;
    }

    const ämne = `Vikariepass ${pass.datum} – ${pass.tid_från.slice(0, 5)}–${pass.tid_till.slice(0, 5)}`;
    const text = [
      `Hej ${vikarie.namn},`,
      '',
      `Ett vikariepass är tillgängligt:`,
      `Datum: ${pass.datum}`,
      `Tid: ${pass.tid_från.slice(0, 5)}–${pass.tid_till.slice(0, 5)}`,
      pass.personal ? `Ersätter: ${pass.personal.namn}` : '',
      pass.personal?.arbetslag ? `Arbetslag: ${pass.personal.arbetslag.namn}` : '',
      pass.ämne ? `Ämne: ${pass.ämne}` : '',
      pass.grupp ? `Grupp: ${pass.grupp}` : '',
      pass.sal ? `Sal: ${pass.sal}` : '',
      '',
      'Logga in i systemet för att boka passet.',
    ].filter(Boolean).join('\n');

    // Skapa notisrad (väntande)
    const { data: notis } = await supabase
      .from('notiser')
      .insert({
        pass_id,
        vikarie_id: vikarie.id,
        kanal: 'epost',
        status: 'väntande',
        mottagare: vikarie.epost,
        ämne,
        innehåll: text,
      })
      .select()
      .single();

    // Skicka via Resend
    let skickadStatus: 'skickat' | 'misslyckat' = 'misslyckat';
    let felmeddelande: string | null = null;

    if (RESEND_API_KEY) {
      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [vikarie.epost],
            subject: ämne,
            text,
          }),
        });

        if (resp.ok) {
          skickadStatus = 'skickat';
        } else {
          const err = await resp.json();
          felmeddelande = JSON.stringify(err);
        }
      } catch (e) {
        felmeddelande = String(e);
      }
    } else {
      // Inget API-nyckel konfigurerat – logga men misslyckas inte i dev
      console.log('[skicka-epost] RESEND_API_KEY saknas. E-post simuleras.');
      skickadStatus = 'skickat';
    }

    // Uppdatera notisrad
    if (notis) {
      await supabase.from('notiser').update({
        status: skickadStatus,
        skickat_kl: new Date().toISOString(),
        felmeddelande,
      }).eq('id', notis.id);
    }

    resultat.push({ vikarie_id: vikarie.id, status: skickadStatus, fel: felmeddelande ?? undefined });
  }

  return new Response(JSON.stringify({ resultat }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
