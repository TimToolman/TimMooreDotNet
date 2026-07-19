export interface Photo {
  id: string;
  /** Local file URI inside the app's document directory (persists across launches). */
  uri: string;
  caption: string;
}

export interface Box {
  id: string;
  number: number;
  label: string;
  note: string;
  items: string[];
  photos: Photo[];
}

export interface InventorySnapshot {
  updated: string;
  boxes: Box[];
}

export type RootStackParamList = {
  Boxes: undefined;
  BoxDetail: { boxId: string };
  PhotoViewer: { boxId: string; index: number; autoAnalyze?: boolean };
  Settings: undefined;
};
