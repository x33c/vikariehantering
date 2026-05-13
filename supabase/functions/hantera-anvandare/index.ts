import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
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

function normaliseraEpost(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { åtgärd, ...data } = await req.json();

    if (åtgärd === 'skapa') {
      const epost = normaliseraEpost(data.epost);
      const namn = typeof data.namn === 'string' ? data.namn : '';
      const vikarieId = typeof data.vikarie_id === 'string' ? data.vikarie_id : '';

      if (!epost || !namn || !vikarieId) {
        return json({ error: 'E-post, namn och vikarie saknas.' }, 400);
      }

      const defaultPassword = Deno.env.get('DEFAULT_VIKARIE_PASSWORD') ?? 'Vikarie2026!';
      const tillfalligtLosenord =
        typeof data.tillfalligt_losenord === 'string' && data.tillfalligt_losenord.length >= 8
          ? data.tillfalligt_losenord
          : defaultPassword;

      let userId: string | null = null;

      const created = await supabaseAdmin.auth.admin.createUser({
        email: epost,
        password: tillfalligtLosenord,
        email_confirm: true,
        user_metadata: { namn, must_change_password: true },
      });

      if (created.error) {
        const users = await supabaseAdmin.auth.admin.listUsers();
        const existing = users.data.users.find((u) => u.email?.toLowerCase() === epost);

        if (!existing) {
          return json({ error: created.error.message }, 400);
        }

        userId = existing.id;

        const updated = await supabaseAdmin.auth.admin.updateUserById(userId, {
          email: epost,
          password: tillfalligtLosenord,
          email_confirm: true,
          user_metadata: { namn, must_change_password: true },
        });

        if (updated.error) {
          return json({ error: updated.error.message }, 400);
        }
      } else {
        userId = created.data.user.id;
      }

      const { error: profilError } = await supabaseAdmin.from('profiler').upsert({
        id: userId,
        epost,
        namn,
        roll: 'vikarie',
        aktiv: true,
        maste_byta_losenord: true,
      });

      if (profilError) return json({ error: profilError.message }, 400);

      const { error: vikarieError } = await supabaseAdmin
        .from('vikarier')
        .update({ profil_id: userId, epost })
        .eq('id', vikarieId);

      if (vikarieError) return json({ error: vikarieError.message }, 400);

      return json({ ok: true, user_id: userId });
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

      if (error) return json({ error: error.message }, 400);

      return json({ ok: true });
    }

    return json({ error: 'Okänd åtgärd.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Okänt fel.' }, 500);
  }
});
