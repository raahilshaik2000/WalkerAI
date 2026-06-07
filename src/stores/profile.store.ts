import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ProfileState {
  displayName: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  avatarUri: string | null;

  // Notification prefs
  pushEnabled: boolean;
  emailDigest: boolean;
  smsAlerts: boolean;
  milestoneAlerts: boolean;
  quoteAlerts: boolean;
  messageAlerts: boolean;

  // App prefs
  faceId: boolean;
  locationServices: boolean;
  analyticsEnabled: boolean;
  appearance: 'dark' | 'light' | 'system';

  // Actions
  updateProfile: (fields: Partial<Omit<ProfileState, 'updateProfile' | 'setAvatar' | 'resetProfile'>>) => void;
  setAvatar: (uri: string | null) => void;
  resetProfile: () => void;
}

const DEFAULTS = {
  displayName: '',
  phone: '',
  address: '',
  city: '',
  province: '',
  avatarUri: null,
  pushEnabled: true,
  emailDigest: true,
  smsAlerts: false,
  milestoneAlerts: true,
  quoteAlerts: true,
  messageAlerts: true,
  faceId: false,
  locationServices: true,
  analyticsEnabled: true,
  appearance: 'dark' as const,
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      updateProfile: (fields) => set(fields),

      setAvatar: (uri) => set({ avatarUri: uri }),

      resetProfile: () => set(DEFAULTS),
    }),
    {
      name: 'walker-ai-profile',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        displayName: state.displayName,
        phone: state.phone,
        address: state.address,
        city: state.city,
        province: state.province,
        avatarUri: state.avatarUri,
        pushEnabled: state.pushEnabled,
        emailDigest: state.emailDigest,
        smsAlerts: state.smsAlerts,
        milestoneAlerts: state.milestoneAlerts,
        quoteAlerts: state.quoteAlerts,
        messageAlerts: state.messageAlerts,
        faceId: state.faceId,
        locationServices: state.locationServices,
        analyticsEnabled: state.analyticsEnabled,
        appearance: state.appearance,
      }),
    },
  ),
);
