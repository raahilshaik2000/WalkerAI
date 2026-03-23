import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import type { UserRole } from '@/constants/enums';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  hydrated: boolean;

  setSession: (session: Session | null) => void;
  setRole: (role: UserRole | null) => void;
  setHydrated: (hydrated: boolean) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      user: null,
      role: null,
      hydrated: false,

      setSession: (session) =>
        set({
          session,
          user: session?.user ?? null,
          role: (session?.user?.user_metadata?.role as UserRole) ?? null,
        }),

      setRole: (role) => set({ role }),

      setHydrated: (hydrated) => set({ hydrated }),

      clearSession: () =>
        set({ session: null, user: null, role: null }),
    }),
    {
      name: 'walker-ai-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        session: state.session,
        role: state.role,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
