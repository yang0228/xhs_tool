import { create } from "zustand";

interface DraftState {
  title: string;
  content: string;
  selectedImageIds: string[];
  isDirty: boolean;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  toggleImage: (imageId: string) => void;
  markClean: () => void;
  reset: () => void;
}

export const useDraftStore = create<DraftState>((set) => ({
  title: "",
  content: "",
  selectedImageIds: [],
  isDirty: false,
  setTitle: (title) => set({ title, isDirty: true }),
  setContent: (content) => set({ content, isDirty: true }),
  toggleImage: (id) =>
    set((s) => ({
      selectedImageIds: s.selectedImageIds.includes(id)
        ? s.selectedImageIds.filter((i) => i !== id)
        : [...s.selectedImageIds, id],
      isDirty: true,
    })),
  markClean: () => set({ isDirty: false }),
  reset: () => set({ title: "", content: "", selectedImageIds: [], isDirty: false }),
}));
