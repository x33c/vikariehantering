import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'onboarding@resend.dev';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
    .select('id, namn, epost')
    .in('id', vikarie_ids)
    .eq('aktiv', true);

  const resultat: { vikarie_id: string; status: string; fel?: string }[] = [];
  let någotSkickades = false;

  for (const vikarie of (vikarier ?? [])) {
    if (!vikarie.epost) {
      resultat.push({ vikarie_id: vikarie.id, status: 'skippat – ingen epost' });
      continue;
    }

    const ämne = `Vikariepass ${pass.datum} – ${pass.tid_från.slice(0, 5)}–${pass.tid_till.slice(0, 5)}`;
    const rader = [
      `Hej ${vikarie.namn},`,
      '',
      'Ett vikariepass är tillgängligt:',
      '',
      `Datum: ${pass.datum}`,
      `Tid: ${pass.tid_från.slice(0, 5)}–${pass.tid_till.slice(0, 5)}`,
      pass.personal ? `Ersätter: ${pass.personal.namn}` : null,
      pass.personal?.arbetslag ? `Arbetslag: ${pass.personal.arbetslag.namn}` : null,
      pass.ämne ? `Ämne: ${pass.ämne}` : null,
      pass.grupp ? `Grupp/klass: ${pass.grupp}` : null,
      pass.sal ? `Sal: ${pass.sal}` : null,
      pass.anteckning ? `Anteckning: ${pass.anteckning}` : null,
      '',
      'Logga in i systemet för att boka passet.',
    ].filter(r => r !== null).join('\n');

    const { data: notis } = await supabase.from('notiser').insert({
      pass_id, vikarie_id: vikarie.id, kanal: 'epost',
      status: 'väntande', mottagare: vikarie.epost, ämne, innehåll: rader,
    }).select().single();

    let skickadStatus: 'skickat' | 'misslyckat' = 'misslyckat';
    let felmeddelande: string | null = null;

    if (!RESEND_API_KEY) {
      felmeddelande = 'RESEND_API_KEY saknas.';
    } else {
      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: FROM_EMAIL, to: [vikarie.epost], subject: ämne, text: rader }),
        });

        if (resp.ok) {
          skickadStatus = 'skickat';
          någotSkickades = true;
        } else {
          const err = await resp.json();
          felmeddelande = err?.message ?? JSON.stringify(err);
        }
      } catch (e) {
        felmeddelande = String(e);
      }
    }

    if (notis) {
      await supabase.from('notiser').update({
        status: skickadStatus, skickat_kl: new Date().toISOString(), felmeddelande,
      }).eq('id', notis.id);
    }

    resultat.push({ vikarie_id: vikarie.id, status: skickadStatus, fel: felmeddelande ?? undefined });
  }

  if (någotSkickades) {
    await supabase.from('vikariepass').update({ status: 'notifierat' }).eq('id', pass_id);
  }

  return new Response(JSON.stringify({ resultat }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
