export interface Pattern {
  pattern: string;
  confidence: number;
  matches: number;
}

export interface TrainingHistory {
  label: string;
  timestamp: string;
  confidence: number;
}

export interface TrainingExample {
  layerName: string;
  correctLabel: string;
  patterns: Pattern[];
  lastUpdated?: string;
  history?: TrainingHistory[];
}

export interface AutoAIResult {
  label: string | null;
  confidence: number;
}

export interface DefaultPattern {
  pattern: string;
  confidence: number;
}

export interface PredictionResult {
  label: string;
  confidence: number;
} 