import nlp from 'compromise';
import stringSimilarity from 'string-similarity';
import { TrainingExample, Pattern } from '../types/ai';

// Common English stopwords
const stopwords = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what'
]);

// Preprocess text: tokenize, lowercase, remove stopwords
function preprocessText(text: string): string[] {
  const doc = nlp(text.toLowerCase());
  const tokens = doc.terms().out('array');
  return tokens.filter((token: string) => !stopwords.has(token));
}

// Calculate semantic similarity between two texts
function calculateSimilarity(text1: string, text2: string): number {
  const tokens1 = preprocessText(text1);
  const tokens2 = preprocessText(text2);
  
  // If either text is empty after preprocessing, return 0
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  // Use string similarity for the tokenized texts
  return stringSimilarity.compareTwoStrings(tokens1.join(' '), tokens2.join(' '));
}

// Extract key terms from text
function extractKeyTerms(text: string): string[] {
  const doc = nlp(text);
  const terms = new Set<string>();
  
  // Get nouns
  doc.nouns().forEach((term: { text: () => string }) => terms.add(term.text().toLowerCase()));
  
  // Get verbs
  doc.verbs().forEach((term: { text: () => string }) => terms.add(term.text().toLowerCase()));
  
  // Get adjectives
  doc.adjectives().forEach((term: { text: () => string }) => terms.add(term.text().toLowerCase()));
  
  return Array.from(terms);
}

// Calculate term frequency in a document
function calculateTermFrequency(terms: string[], doc: string): Record<string, number> {
  const frequencies: Record<string, number> = {};
  const docTerms = preprocessText(doc);
  
  terms.forEach(term => {
    frequencies[term] = docTerms.filter(t => t === term).length;
  });
  
  return frequencies;
}

// Context-aware label prediction
export function predictLabelWithContext(
  layerName: string,
  examples: TrainingExample[],
  contextLayers: string[] = []
): { label: string; confidence: number } {
  // Extract key terms from the layer name
  const queryTerms = extractKeyTerms(layerName);
  
  // Calculate similarity scores
  const scores = examples.map(example => {
    // Direct name similarity
    const nameSimilarity = calculateSimilarity(layerName, example.layerName);
    
    // Pattern similarity
    const patternSimilarities = example.patterns.map((pattern: Pattern) => 
      calculateSimilarity(layerName, pattern.pattern)
    );
    const maxPatternSimilarity = Math.max(...patternSimilarities, 0);
    
    // Term frequency analysis
    const termFreqs = calculateTermFrequency(
      queryTerms,
      `${example.layerName} ${example.patterns.map((p: Pattern) => p.pattern).join(' ')}`
    );
    const termScore = Object.values(termFreqs).reduce((sum, freq) => sum + freq, 0) / queryTerms.length;
    
    // Combine scores
    const combinedScore = (
      nameSimilarity * 0.4 +
      maxPatternSimilarity * 0.4 +
      termScore * 0.2
    );
    
    return {
      label: example.correctLabel,
      score: combinedScore
    };
  });
  
  // Consider context if available
  if (contextLayers.length > 0) {
    const contextScores = new Map<string, number>();
    
    contextLayers.forEach(contextLayer => {
      const contextSimilarities = examples.map(example => ({
        label: example.correctLabel,
        similarity: calculateSimilarity(contextLayer, example.layerName)
      }));
      
      const bestMatch = contextSimilarities.reduce((best, current) => 
        current.similarity > best.similarity ? current : best
      );
      
      if (bestMatch.similarity > 0.3) {
        contextScores.set(
          bestMatch.label,
          (contextScores.get(bestMatch.label) || 0) + bestMatch.similarity
        );
      }
    });
    
    // Adjust scores based on context
    const CONTEXT_WEIGHT = 0.2;
    scores.forEach(score => {
      const contextBoost = (contextScores.get(score.label) || 0) / contextLayers.length;
      score.score = score.score * (1 - CONTEXT_WEIGHT) + contextBoost * CONTEXT_WEIGHT;
    });
  }
  
  // Get the best score
  const bestMatch = scores.reduce((best, current) => 
    current.score > best.score ? current : best,
    { label: '', score: 0 }
  );
  
  // Convert score to confidence (normalize between 0.5 and 1)
  const confidence = 0.5 + (bestMatch.score * 0.5);
  
  return {
    label: bestMatch.label,
    confidence: Math.min(1, confidence)
  };
} 