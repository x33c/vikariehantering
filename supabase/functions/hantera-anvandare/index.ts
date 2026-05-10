import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { åtgärd, ...data } = await req.json();

  try {
    if (åtgärd === 'skapa') {
      const { epost, lösenord, namn, vikarie_id } = data;

      // Skapa auth-användare
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: epost,
        password: lösenord,
        email_confirm: true,
        user_metadata: { roll: 'vikarie', namn },
      });
      if (authError) throw authError;

      const userId = authData.user.id;

      // Skapa profil
      const { error: profilError } = await supabase.from('profiler').insert({
        id: userId,
        roll: 'vikarie',
        epost,
        namn,
      });
      if (profilError) throw profilError;

      // Koppla till vikarie om vikarie_id skickades
      if (vikarie_id) {
        const { error: vikarieError } = await supabase
          .from('vikarier')
          .update({ profil_id: userId })
          .eq('id', vikarie_id);
        if (vikarieError) throw vikarieError;
      }

      return new Response(JSON.stringify({ ok: true, user_id: userId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (åtgärd === 'återställ_lösenord') {
      const { epost } = data;
      const { error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: epost,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (åtgärd === 'uppdatera_roll') {
      const { profil_id, roll, namn, aktiv } = data;
      const { error } = await supabase
        .from('profiler')
        .update({ roll, namn, aktiv })
        .eq('id', profil_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Okänd åtgärd.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});