import { useState, useCallback } from 'react';
import { PsdLayerMetadata } from '@/utils/psd-parser';

// Training data interface
interface TrainingExample {
  layerName: string;
  correctLabel: string;
  patterns: {
    pattern: string;
    confidence: number;
    matches: number;
  }[];
}

// Default patterns for initial AI behavior
const DEFAULT_PATTERNS = {
  'background': { pattern: 'background|bg|backdrop', confidence: 0.8 },
  'logo': { pattern: 'logo|brand|trademark', confidence: 0.9 },
  'main-subject': { pattern: 'hero|main|subject|product(-)?shot', confidence: 0.9 },
  'domain': { pattern: 'domain|url|website|site', confidence: 0.8 },
  'product-name': { pattern: 'product(-)?name|title|heading', confidence: 0.9 },
  'sub-content-1': { pattern: 'sub(-)?content|secondary|supporting', confidence: 0.8 },
  'cta': { pattern: 'cta|button|action|click', confidence: 0.95 },
  'disclaimer': { pattern: 'disclaimer|legal|terms|privacy', confidence: 0.9 },
  'header': { pattern: 'header|top(-)?section', confidence: 0.85 },
  'footer': { pattern: 'footer|bottom(-)?section', confidence: 0.85 },
  'navigation': { pattern: 'nav|menu|navigation', confidence: 0.85 }
};

interface AutoAIResult {
  label: string | null;
  confidence: number;
}

interface AIProcessingOptions {
  labelConfidenceThreshold?: number;
}

export function useAutoAI() {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainingData, setTrainingData] = useState<TrainingExample[]>([]);

  // Load training data
  const loadTrainingData = useCallback(async () => {
    try {
      const response = await fetch('/api/ai-training/load');
      const data = await response.json();
      setTrainingData(data);
    } catch (error) {
      console.error('Error loading training data:', error);
      setError('Failed to load training data');
    }
  }, []);

  // Analyze a single layer name
  const analyzeLayerName = useCallback((layerName: string): AutoAIResult => {
    const name = layerName.toLowerCase();
    let bestMatch: { label: string; confidence: number } | null = null;

    // First check training data patterns
    trainingData.forEach(example => {
      example.patterns.forEach(pattern => {
        if (name.includes(pattern.pattern)) {
          if (!bestMatch || pattern.confidence > bestMatch.confidence) {
            bestMatch = {
              label: example.correctLabel,
              confidence: pattern.confidence
            };
          }
        }
      });
    });

    // Then check default patterns if no good match found
    if (!bestMatch || bestMatch.confidence < 0.7) {
      Object.entries(DEFAULT_PATTERNS).forEach(([label, info]) => {
        try {
          const pattern = new RegExp(info.pattern, 'i');
          if (pattern.test(name)) {
            if (!bestMatch || info.confidence > bestMatch.confidence) {
              bestMatch = {
                label,
                confidence: info.confidence
              };
            }
          }
        } catch (error) {
          console.warn('Invalid pattern:', info.pattern);
        }
      });
    }

    return bestMatch || { label: null, confidence: 0 };
  }, [trainingData]);

  // Process multiple layers
  const processLayers = useCallback((
    layers: PsdLayerMetadata[],
    options: AIProcessingOptions = {}
  ): Record<string, AutoAIResult> => {
    const { labelConfidenceThreshold = 0.5 } = options;
    const results: Record<string, AutoAIResult> = {};

    setProcessing(true);
    setError(null);

    try {
      // Process each layer
      layers.forEach(layer => {
        const result = analyzeLayerName(layer.name);
        
        // Only include results above confidence threshold
        if (result.confidence >= labelConfidenceThreshold) {
          results[layer.id] = result;
        }
      });
    } catch (error) {
      console.error('Error processing layers:', error);
      setError('Failed to process layers');
    } finally {
      setProcessing(false);
    }

    return results;
  }, [analyzeLayerName]);

  // Predict label for a single layer
  const predictLabel = useCallback((layerName: string): { label: string; confidence: number } | null => {
    const result = analyzeLayerName(layerName);
    if (result.label && result.confidence > 0.3) { // Lower threshold for predictions
      return {
        label: result.label,
        confidence: result.confidence
      };
    }
    return null;
  }, [analyzeLayerName]);

  return {
    processing,
    error,
    analyzeLayerName,
    processLayers,
    loadTrainingData,
    predictLabel
  };
} 