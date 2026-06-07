import { create } from 'zustand';
import type { AIAnalysis, QuestionnaireQuestion } from '@/types/database.types';
import type { RoomType } from '@/constants/enums';

export interface MaterialOverride {
  quality_tier?: 'budget' | 'mid-range' | 'luxury';
  brand_preference?: string;
  color_finish?: string;
  specific_model?: string;
  contractor_notes?: string;
}

export interface SurfaceSelection {
  surfaceId: string;
  surfaceLabel: string;
  material: string;
  colorName: string;
  colorHex: string;
  answerId?: string;
}

export interface UploadedPhoto {
  id: string;
  uri: string;           // local URI (for display)
  url: string;           // Supabase public URL (set after upload)
  base64?: string;       // base64-encoded image data (no data: prefix)
  fileName?: string;
  extension?: string;
  contentType?: string;
  storagePath?: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
}

export interface WizardCoordinates {
  lat: number;
  lng: number;
}

export interface RoomMeasurements {
  // Room
  lengthFt: string;
  widthFt: string;
  ceilingHeightFt: string;
  // Cabinets
  upperCabHeight: string;
  lowerCabHeight: string;
  cabDepth: string;
  upperLinearFt: string;
  lowerLinearFt: string;
  // Countertops
  countertopLinearFt: string;
  // Doors & Windows
  numDoors: string;
  doorWidth: string;
  doorHeight: string;
  numWindows: string;
  windowWidth: string;
  windowHeight: string;
  // Appliances
  fridgeWidth: string;
  rangeWidth: string;
  hasDishwasher: boolean;
  // Island
  hasIsland: boolean;
  islandLength: string;
  islandWidth: string;
  // Bathroom-specific fields
  hasShowerTub?: boolean;
  showerLength?: string;
  showerWidth?: string;
  vanityWidth?: string;
  numSinks?: string;
  floorTileArea?: string;
  wallTileArea?: string;
}

export interface RoomScanData {
  roomDimensions?: {
    length?: number;
    width?: number;
    height?: number;
    area?: number;
  };
  walls?: unknown[];
  doors?: unknown[];
  windows?: unknown[];
  objects?: unknown[];
  usdzFilePath?: string;
  isMock?: boolean;
  [key: string]: unknown;
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

  // Step 3 – optional manual measurements
  measurements: RoomMeasurements | null;
  roomScanData: RoomScanData | null;

  // Step 6 – material detail overrides keyed by material index
  materialOverrides: Record<number, MaterialOverride>;

  // Step 5 – finish customizer selections keyed by room surface
  surfaceSelections: Record<string, SurfaceSelection>;

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
  setMeasurements: (measurements: RoomMeasurements | null) => void;
  setRoomScanData: (scanData: RoomScanData | null) => void;
  setMaterialOverride: (index: number, override: MaterialOverride) => void;
  setSurfaceSelection: (selection: SurfaceSelection) => void;
  setProjectId: (id: string) => void;
  setStep: (step: ProjectWizardState['step']) => void;
  reset: () => void;
}

const initialState: Omit<ProjectWizardState,
  | 'setAddress' | 'setRoomType' | 'addPhoto' | 'updatePhoto' | 'removePhoto'
  | 'setAnalysisResult' | 'setQuestions' | 'setAnswer' | 'nextQuestion'
  | 'setSelectedRender' | 'setMeasurements' | 'setRoomScanData' | 'setMaterialOverride' | 'setSurfaceSelection' | 'setProjectId' | 'setStep' | 'reset'
> = {
  address: '',
  coordinates: null,
  province: null,
  photos: [],
  roomType: null,
  measurements: null,
  roomScanData: null,
  analysisResult: null,
  questions: [],
  answers: {},
  currentQuestionIndex: 0,
  selectedRenderId: null,
  materialOverrides: {},
  surfaceSelections: {},
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

  setMeasurements: (measurements) => set({ measurements }),

  setRoomScanData: (roomScanData) => set({ roomScanData }),

  setMaterialOverride: (index, override) =>
    set((state) => ({
      materialOverrides: { ...state.materialOverrides, [index]: { ...state.materialOverrides[index], ...override } },
    })),

  setSurfaceSelection: (selection) =>
    set((state) => ({
      surfaceSelections: { ...state.surfaceSelections, [selection.surfaceId]: selection },
    })),

  setProjectId: (projectId) => set({ projectId }),

  setStep: (step) => set({ step }),

  reset: () => set(initialState),
}));
