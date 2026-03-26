import { create } from 'zustand';
import type { UploadedPhoto } from './project-wizard.store';

export type DIYCategory =
  | 'plumbing'
  | 'electrical'
  | 'carpentry'
  | 'painting'
  | 'flooring'
  | 'hvac'
  | 'landscaping'
  | 'general';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface DIYMaterial {
  name: string;
  quantity: string;
  estimated_cost: string;
  where_to_buy: string;
  is_tool: boolean;
}

export interface DIYStep {
  step_number: number;
  title: string;
  description: string;
  tip: string | null;
  warning: string | null;
}

export interface DIYGuide {
  title: string;
  overview: string;
  estimated_time: string;
  difficulty: string;
  safety_warnings: string[];
  steps: DIYStep[];
  materials: DIYMaterial[];
  when_to_call_pro: string;
  total_estimated_cost: string;
}

interface DIYWizardState {
  // Step 1
  description: string;
  category: DIYCategory | null;

  // Step 2
  photos: UploadedPhoto[];
  photoBase64s: Record<string, string>; // id -> base64 string

  // Step 3
  budgetMin: number;
  budgetMax: number;
  skillLevel: SkillLevel;
  toolsAvailable: string;
  timeline: string;

  // Result
  guide: DIYGuide | null;
  projectId: string | null;

  // Actions
  setDescription: (description: string) => void;
  setCategory: (category: DIYCategory) => void;
  addPhoto: (photo: UploadedPhoto, base64?: string) => void;
  updatePhoto: (id: string, updates: Partial<UploadedPhoto>) => void;
  removePhoto: (id: string) => void;
  setBudget: (min: number, max: number) => void;
  setSkillLevel: (level: SkillLevel) => void;
  setToolsAvailable: (tools: string) => void;
  setTimeline: (timeline: string) => void;
  setGuide: (guide: DIYGuide) => void;
  setProjectId: (id: string) => void;
  reset: () => void;
}

const initialState: Omit<DIYWizardState,
  | 'setDescription' | 'setCategory' | 'addPhoto' | 'updatePhoto' | 'removePhoto'
  | 'setBudget' | 'setSkillLevel' | 'setToolsAvailable' | 'setTimeline'
  | 'setGuide' | 'setProjectId' | 'reset'
> = {
  description: '',
  category: null,
  photos: [],
  photoBase64s: {},
  budgetMin: 0,
  budgetMax: 500,
  skillLevel: 'beginner',
  toolsAvailable: '',
  timeline: 'this weekend',
  guide: null,
  projectId: null,
};

export const useDIYWizardStore = create<DIYWizardState>()((set) => ({
  ...initialState,
  setDescription: (description) => set({ description }),
  setCategory: (category) => set({ category }),
  addPhoto: (photo, base64) => set((s) => ({
    photos: [...s.photos, photo],
    photoBase64s: base64 ? { ...s.photoBase64s, [photo.id]: base64 } : s.photoBase64s,
  })),
  updatePhoto: (id, updates) =>
    set((s) => ({ photos: s.photos.map((p) => (p.id === id ? { ...p, ...updates } : p)) })),
  removePhoto: (id) => set((s) => ({ photos: s.photos.filter((p) => p.id !== id) })),
  setBudget: (budgetMin, budgetMax) => set({ budgetMin, budgetMax }),
  setSkillLevel: (skillLevel) => set({ skillLevel }),
  setToolsAvailable: (toolsAvailable) => set({ toolsAvailable }),
  setTimeline: (timeline) => set({ timeline }),
  setGuide: (guide) => set({ guide }),
  setProjectId: (projectId) => set({ projectId }),
  reset: () => set(initialState),
}));
