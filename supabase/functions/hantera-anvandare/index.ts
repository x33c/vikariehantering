import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { åtgärd, ...data } = await req.json();

  try {
    if (åtgärd === 'skapa') {
      const { epost, lösenord, namn, vikarie_id } = data;

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: epost,
        password: lösenord,
        email_confirm: true,
        user_metadata: { roll: 'vikarie', namn },
      });
      if (authError) throw authError;

      const userId = authData.user.id;

      const { error: profilError } = await supabaseAdmin.from('profiler').insert({
        id: userId,
        roll: 'vikarie',
        epost,
        namn,
      });
      if (profilError) throw profilError;

      if (vikarie_id) {
        const { error: vikarieError } = await supabaseAdmin
          .from('vikarier')
          .update({ profil_id: userId })
          .eq('id', vikarie_id);
        if (vikarieError) throw vikarieError;
      }

      return json({ ok: true, user_id: userId });
    }

    if (åtgärd === 'återställ_lösenord') {
      const { epost } = data;
      const { error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: epost,
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (åtgärd === 'uppdatera_roll') {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '');
      if (!token) return json({ error: 'Saknar inloggning.' }, 401);

      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !userData.user) return json({ error: 'Ogiltig inloggning.' }, 401);

      const { data: adminProfil, error: adminProfilError } = await supabaseAdmin
        .from('profiler')
        .select('id, roll, epost')
        .eq('id', userData.user.id)
        .single();

      if (adminProfilError || adminProfil?.roll !== 'admin') {
        return json({ error: 'Endast administratörer kan ändra roller.' }, 403);
      }

      const { profil_id, roll, namn, aktiv, admin_losenord } = data;

      if (roll === 'admin') {
        if (!admin_losenord || typeof admin_losenord !== 'string') {
          return json({ error: 'Lösenord krävs för att tilldela adminroll.' }, 400);
        }

        const adminEpost = adminProfil.epost ?? userData.user.email;
        if (!adminEpost) return json({ error: 'Administratörskontot saknar e-post.' }, 400);

        const { error: loginError } = await supabaseAuth.auth.signInWithPassword({
          email: adminEpost,
          password: admin_losenord,
        });

        if (loginError) return json({ error: 'Fel lösenord.' }, 401);
      }

      const { error } = await supabaseAdmin
        .from('profiler')
        .update({ roll, namn, aktiv })
        .eq('id', profil_id);

      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'Okänd åtgärd.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Okänt fel.' }, 500);
  }
});
