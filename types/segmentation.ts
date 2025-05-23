export type SegmentationValue = {
  id: string;
  label: string;
};

export type SegmentationType = {
  id: string;
  label: string;
  values: SegmentationValue[];
};

export type SegmentationRules = {
  segmentationTypes: SegmentationType[];
};

// Helper type for the API response
export type SegmentationRulesResponse = {
  success: boolean;
  data: SegmentationRules;
  error?: string;
}; 