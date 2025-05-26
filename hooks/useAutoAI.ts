import { useState, useCallback } from 'react';
import { TrainingExample, AutoAIResult, Pattern, DefaultPattern } from '../types/ai';
import { predictLabelWithContext } from '../utils/nlp';

// Default patterns for initial AI behavior
const DEFAULT_PATTERNS: Record<string, DefaultPattern> = {
  'background': { pattern: 'background|bg', confidence: 0.6 },
  'logo': { pattern: 'logo', confidence: 0.6 },
  'main-subject': { pattern: 'product|phone|voucher|main', confidence: 0.6 },
  'domain': { pattern: 'domain|samsung.com', confidence: 0.6 },
  'product-name': { pattern: 'product(-)?name|galaxy|tab', confidence: 0.6 },
  'sub-content-1': { pattern: 'sub(-)?content|battery|processor|design', confidence: 0.6 },
  'disclaimer': { pattern: 'disclaimer', confidence: 0.6 }
};

interface AIProcessingOptions {
  labelConfidenceThreshold?: number;
  useNLP?: boolean;
  contextLayers?: string[];
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
    } catch (err) {
      console.error('Error loading training data:', err);
      setError('Failed to load training data');
    }
  }, []);

  // Pattern-based analysis
  const analyzeWithPatterns = useCallback((layerName: string): AutoAIResult => {
    const name = layerName.toLowerCase();
    type BestMatch = {
      label: string;
      confidence: number;
    };
    
    let bestMatch = null as BestMatch | null;

    // First check training data patterns
    trainingData.forEach(example => {
      example.patterns.forEach((pattern: Pattern) => {
        if (name.includes(pattern.pattern)) {
          const currentMatch: BestMatch = {
            label: example.correctLabel,
            confidence: pattern.confidence
          };
          if (!bestMatch || currentMatch.confidence > bestMatch.confidence) {
            bestMatch = currentMatch;
          }
        }
      });
    });

    // Then check default patterns if no good match found
    if (!bestMatch || bestMatch.confidence < 0.6) {
      Object.entries(DEFAULT_PATTERNS).forEach(([label, info]) => {
        try {
          const pattern = new RegExp(info.pattern, 'i');
          if (pattern.test(name)) {
            const currentMatch: BestMatch = {
              label,
              confidence: info.confidence
            };
            if (!bestMatch || currentMatch.confidence > bestMatch.confidence) {
              bestMatch = currentMatch;
            }
          }
        } catch {
          console.warn('Invalid pattern:', info.pattern);
        }
      });
    }

    const result: AutoAIResult = bestMatch 
      ? { label: bestMatch.label, confidence: bestMatch.confidence }
      : { label: null, confidence: 0 };
    
    return result;
  }, [trainingData]);

  // Combined analysis using both pattern matching and NLP
  const analyzeLayerName = useCallback((
    layerName: string,
    options: { useNLP?: boolean; contextLayers?: string[] } = {}
  ): AutoAIResult => {
    const { useNLP = true, contextLayers = [] } = options;

    // Get pattern-based prediction
    const patternResult = analyzeWithPatterns(layerName);

    // If NLP is disabled or we have a high-confidence pattern match, return pattern result
    if (!useNLP || patternResult.confidence > 0.6) {
      return patternResult;
    }

    // Get NLP-based prediction
    const nlpResult = predictLabelWithContext(layerName, trainingData, contextLayers);

    // If pattern matching found nothing, use NLP result
    if (!patternResult.label) {
      return {
        label: nlpResult.label || null,
        confidence: nlpResult.confidence
      };
    }

    // Combine predictions with weighted average
    const PATTERN_WEIGHT = 0.6;
    const NLP_WEIGHT = 0.4;

    // If both methods predict the same label, boost confidence
    if (patternResult.label === nlpResult.label) {
      return {
        label: patternResult.label,
        confidence: Math.min(1, (patternResult.confidence + nlpResult.confidence) / 2 + 0.1)
      };
    }

    // If different predictions, use weighted average
    const patternScore = patternResult.confidence * PATTERN_WEIGHT;
    const nlpScore = nlpResult.confidence * NLP_WEIGHT;

    return patternScore > nlpScore
      ? patternResult
      : {
          label: nlpResult.label,
          confidence: nlpResult.confidence
        };
  }, [analyzeWithPatterns, trainingData]);

  // Process multiple layers
  const processLayers = useCallback((
    layers: { id: string; name: string }[],
    options: AIProcessingOptions = {}
  ): Record<string, AutoAIResult> => {
    const {
      labelConfidenceThreshold = 0.6,
      useNLP = true,
      contextLayers = []
    } = options;
    
    const results: Record<string, AutoAIResult> = {};

    setProcessing(true);
    setError(null);

    try {
      // Process each layer
      layers.forEach(layer => {
        const result = analyzeLayerName(layer.name, { useNLP, contextLayers });
        
        // Only include results above confidence threshold
        if (result.confidence >= labelConfidenceThreshold) {
          results[layer.id] = result;
        }
      });
    } catch (err) {
      console.error('Error processing layers:', err);
      setError('Failed to process layers');
    } finally {
      setProcessing(false);
    }

    return results;
  }, [analyzeLayerName]);

  // Predict label for a single layer
  const predictLabel = useCallback((
    layerName: string,
    options: { useNLP?: boolean; contextLayers?: string[] } = {}
  ): AutoAIResult | null => {
    const result = analyzeLayerName(layerName, options);
    if (result.label && result.confidence > 0.6) {
      return result;
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