import { useState, useEffect } from 'react';
import type { SegmentationRules, SegmentationType, SegmentationValue } from '@/types/segmentation';

export function useSegmentationRules() {
  const [rules, setRules] = useState<SegmentationRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const response = await fetch('/api/segmentation-rules');
        const data = await response.json();
        
        if (data.success) {
          setRules(data.data);
          setError(null);
        } else {
          setError(data.error || 'Failed to fetch segmentation rules');
          setRules(null);
        }
      } catch {
        setError('Failed to fetch segmentation rules');
        setRules(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, []);

  // Helper function to get values for a specific segmentation type
  const getValuesForType = (typeId: string): SegmentationValue[] => {
    if (!rules) return [];
    const segmentationType = rules.segmentationTypes.find(type => type.id === typeId);
    return segmentationType?.values || [];
  };

  // Helper function to get all segmentation types
  const getSegmentationTypes = (): SegmentationType[] => {
    return rules?.segmentationTypes || [];
  };

  // Helper function to get a specific segmentation type
  const getSegmentationType = (typeId: string): SegmentationType | undefined => {
    return rules?.segmentationTypes.find(type => type.id === typeId);
  };

  return {
    rules,
    loading,
    error,
    getValuesForType,
    getSegmentationTypes,
    getSegmentationType
  };
} 