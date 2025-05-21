export interface PositioningRule {
  position: string;
  maxWidthPercent: number;
  maxHeightPercent: number;
}

export interface VisibilityRules {
  [labelId: string]: boolean;
}

export interface PositioningRules {
  [labelId: string]: PositioningRule;
}

export interface LayoutRules {
  visibility: Record<string, boolean>;
  positioning: Record<string, PositioningRule>;
}

export interface LayoutOption {
  name: string;
  rules: LayoutRules;
}

export interface Layout {
  aspectRatio: string;
  width: number;
  height: number;
  options: LayoutOption[];
}

export interface LayoutConfig {
  layouts: Layout[];
}

export interface Bounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GeneratedElement {
  id: string;
  name: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  parent?: string;
  originalBounds?: Bounds;
  position?: string;
}

export interface GeneratedLayout {
  name: string;
  width: number;
  height: number;
  aspectRatio: string;
  elements: GeneratedElement[];
  rules?: LayoutRules;
} 