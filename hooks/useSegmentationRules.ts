import { useState, useEffect, useCallback } from 'react';
import { segmentationRulesApi } from '../utils/api';

interface SegmentationType {
  id: string;
  label: string;
  values: Array<{
    id: string;
    label: string;
  }>;
}

interface SegmentationRules {
  segmentationTypes: SegmentationType[];
}

export function useSegmentationRules() {
  const [rules, setRules] = useState<SegmentationRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch segmentation rules from the API
  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const response = await segmentationRulesApi.get();
      if (!response.ok) {
        throw new Error('Failed to fetch segmentation rules');
      }
      const data = await response.json();
      setRules(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching segmentation rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch rules on mount
  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Get all segmentation types
  const getSegmentationTypes = useCallback(() => {
    if (!rules) return [];
    return rules.segmentationTypes.map(type => ({
      id: type.id,
      label: type.label
    }));
  }, [rules]);

  // Get values for a specific segmentation type
  const getValuesForType = useCallback((typeId: string) => {
    if (!rules) return [];
    const type = rules.segmentationTypes.find(t => t.id === typeId);
    return type?.values || [];
  }, [rules]);

  // Update segmentation rules
  const updateRules = useCallback(async (newRules: SegmentationRules) => {
    try {
      const response = await segmentationRulesApi.update(newRules);
      
      if (!response.ok) {
        throw new Error('Failed to update segmentation rules');
      }
      
      await fetchRules(); // Refresh rules after update
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error updating segmentation rules:', err);
      return false;
    }
  }, [fetchRules]);

  return {
    rules,
    loading,
    error,
    getSegmentationTypes,
    getValuesForType,
    updateRules,
    refreshRules: fetchRules
  };
} 