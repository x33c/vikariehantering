import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profil, AuthState } from '../types';

interface AuthContext extends AuthState {
  loggaIn: (epost: string, lösenord: string) => Promise<{ error: Error | null }>;
  loggaUt: () => Promise<void>;
  måsteBytaLösenord: boolean;
  bytaLösenord: (nyttLösenord: string) => Promise<{ error: Error | null }>;
}

const AuthCtx = createContext<AuthContext | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    användare: null,
    profil: null,
    laddar: true,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      if (user) laddaProfil(user);
      else setState({ användare: null, profil: null, laddar: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (user) laddaProfil(user);
      else setState({ användare: null, profil: null, laddar: false });
    });

    return () => subscription.unsubscribe();
  }, []);

  async function laddaProfil(user: User) {
    const { data: profil } = await supabase
      .from('profiler')
      .select('*')
      .eq('id', user.id)
      .single();
    setState({ användare: user, profil: profil as Profil | null, laddar: false });
  }

  async function loggaIn(epost: string, lösenord: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: epost, password: lösenord });
    return { error: error as Error | null };
  }

  async function loggaUt() {
    await supabase.auth.signOut();
  }

  async function bytaLösenord(nyttLösenord: string) {
    const { error } = await supabase.auth.updateUser({
      password: nyttLösenord,
      data: { must_change_password: false },
    });
    if (!error && state.användare) {
      setState(prev => ({
        ...prev,
        användare: prev.användare
          ? { ...prev.användare, user_metadata: { ...prev.användare.user_metadata, must_change_password: false } }
          : null,
      }));
    }
    return { error: error as Error | null };
  }

  const måsteBytaLösenord =
    state.användare?.user_metadata?.must_change_password === true &&
    state.profil?.roll === 'vikarie';

  return (
    <AuthCtx.Provider value={{ ...state, loggaIn, loggaUt, måsteBytaLösenord, bytaLösenord }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth måste användas inom AuthProvider');
  return ctx;
}
