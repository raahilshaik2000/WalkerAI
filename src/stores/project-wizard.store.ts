import { create } from 'zustand';
import type { AIAnalysis, QuestionnaireQuestion } from '@/types/database.types';
import type { RoomType } from '@/constants/enums';

export interface UploadedPhoto {
  id: string;
  uri: string;           // local URI (for display)
  url: string;           // Supabase public URL (set after upload)
  storagePath?: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
}

export interface WizardCoordinates {
  lat: number;
  lng: number;
}

interface ProjectWizardState {
  // Step 1
  address: string;
  coordinates: WizardCoordinates | null;
  province: string | null;

  // Step 2
  photos: UploadedPhoto[];
  roomType: RoomType | null;

  // Step 3 (AI analysis result)
  analysisResult: AIAnalysis | null;

  // Step 4
  questions: QuestionnaireQuestion[];
  answers: Record<string, string>;
  currentQuestionIndex: number;

  // Step 5
  selectedRenderId: string | null;

  // DB
  projectId: string | null;

  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

  // Actions
  setAddress: (address: string, coordinates?: WizardCoordinates | null, province?: string) => void;
  setRoomType: (roomType: RoomType) => void;
  addPhoto: (photo: UploadedPhoto) => void;
  updatePhoto: (id: string, updates: Partial<UploadedPhoto>) => void;
  removePhoto: (id: string) => void;
  setAnalysisResult: (result: AIAnalysis) => void;
  setQuestions: (questions: QuestionnaireQuestion[]) => void;
  setAnswer: (questionId: string, answer: string) => void;
  /** Move to next question. Pass nextQuestionId to jump; null advances sequentially */
  nextQuestion: (nextQuestionId?: string | null) => void;
  setSelectedRender: (renderId: string | null) => void;
  setProjectId: (id: string) => void;
  setStep: (step: ProjectWizardState['step']) => void;
  reset: () => void;
}

const initialState: Omit<ProjectWizardState,
  | 'setAddress' | 'setRoomType' | 'addPhoto' | 'updatePhoto' | 'removePhoto'
  | 'setAnalysisResult' | 'setQuestions' | 'setAnswer' | 'nextQuestion'
  | 'setSelectedRender' | 'setProjectId' | 'setStep' | 'reset'
> = {
  address: '',
  coordinates: null,
  province: null,
  photos: [],
  roomType: null,
  analysisResult: null,
  questions: [],
  answers: {},
  currentQuestionIndex: 0,
  selectedRenderId: null,
  projectId: null,
  step: 1,
};

export const useProjectWizardStore = create<ProjectWizardState>()((set, get) => ({
  ...initialState,

  setAddress: (address, coordinates, province) =>
    set({ address, coordinates: coordinates ?? null, province: province ?? null }),

  setRoomType: (roomType) => set({ roomType }),

  addPhoto: (photo) =>
    set((state) => ({ photos: [...state.photos, photo] })),

  updatePhoto: (id, updates) =>
    set((state) => ({
      photos: state.photos.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  removePhoto: (id) =>
    set((state) => ({ photos: state.photos.filter((p) => p.id !== id) })),

  setAnalysisResult: (analysisResult) => set({ analysisResult }),

  setQuestions: (questions) => set({ questions, currentQuestionIndex: 0, answers: {} }),

  setAnswer: (questionId, answer) =>
    set((state) => ({
      answers: { ...state.answers, [questionId]: answer },
    })),

  nextQuestion: (nextQuestionId) => {
    const { questions, currentQuestionIndex } = get();
    if (nextQuestionId) {
      const idx = questions.findIndex((q) => q.id === nextQuestionId);
      if (idx !== -1) {
        set({ currentQuestionIndex: idx });
        return;
      }
    }
    set({ currentQuestionIndex: currentQuestionIndex + 1 });
  },

  setSelectedRender: (selectedRenderId) => set({ selectedRenderId }),

  setProjectId: (projectId) => set({ projectId }),

  setStep: (step) => set({ step }),

  reset: () => set(initialState),
}));
