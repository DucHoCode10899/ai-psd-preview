import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface PatternMatch {
  pattern: string;
  confidence: number;
  matches: number; // How many times this pattern has matched
}

interface TrainingExample {
  layerName: string;
  correctLabel: string;
  patterns: PatternMatch[]; // Multiple patterns per example
  lastUpdated: string;
  history?: {
    label: string;
    timestamp: string;
    confidence?: number;
  }[];
}

interface SaveTrainingRequest {
  layerName: string;
  correctLabel: string;
  confidence?: number;
}

function extractPatterns(layerName: string): string[] {
  const patterns: string[] = [];
  const name = layerName.toLowerCase();
  
  // Add full name as a pattern
  patterns.push(name);
  
  // Split by common separators and add each part
  const parts = name.split(/[-_\s]+/);
  parts.forEach(part => {
    if (part.length > 2) { // Only add parts with meaningful length
      patterns.push(part);
    }
  });
  
  // Add combinations of consecutive parts
  for (let i = 0; i < parts.length - 1; i++) {
    patterns.push(`${parts[i]} ${parts[i + 1]}`);
  }
  
  return [...new Set(patterns)]; // Remove duplicates
}

export async function POST(request: Request) {
  try {
    const newExamples = await request.json() as SaveTrainingRequest[];
    
    // Read existing training data
    const dataPath = path.join(process.cwd(), 'data', 'ai-training.json');
    let data: TrainingExample[] = [];
    try {
      data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch {
      // If file doesn't exist or is invalid, start with empty array
      data = [];
    }

    // Process each new example
    const timestamp = new Date().toISOString();
    const updatedData = [...data];

    for (const newExample of newExamples) {
      const existingIndex = data.findIndex(ex => ex.layerName === newExample.layerName);
      const extractedPatterns = extractPatterns(newExample.layerName);
      
      if (existingIndex >= 0) {
        // Update existing example
        const existing = data[existingIndex];
        const history = existing.history || [];
        
        // Update patterns
        const updatedPatterns = [...existing.patterns];
        extractedPatterns.forEach(pattern => {
          const existingPattern = updatedPatterns.find(p => p.pattern === pattern);
          if (existingPattern) {
            // Update existing pattern
            existingPattern.matches++;
            existingPattern.confidence = calculateConfidence(
              existingPattern.confidence,
              newExample.confidence || 0.8,
              existingPattern.matches
            );
          } else {
            // Add new pattern
            updatedPatterns.push({
              pattern,
              confidence: newExample.confidence || 0.8,
              matches: 1
            });
          }
        });

        // Update the example
        updatedData[existingIndex] = {
          ...existing,
          correctLabel: newExample.correctLabel,
          patterns: updatedPatterns,
          lastUpdated: timestamp,
          history: [
            ...history,
            {
              label: newExample.correctLabel,
              timestamp,
              confidence: newExample.confidence
            }
          ]
        };
      } else {
        // Add new example
        updatedData.push({
          layerName: newExample.layerName,
          correctLabel: newExample.correctLabel,
          patterns: extractedPatterns.map(pattern => ({
            pattern,
            confidence: newExample.confidence || 0.8,
            matches: 1
          })),
          lastUpdated: timestamp,
          history: [{
            label: newExample.correctLabel,
            timestamp,
            confidence: newExample.confidence
          }]
        });
      }
    }

    // Save updated data
    fs.writeFileSync(dataPath, JSON.stringify(updatedData, null, 2));
    
    return NextResponse.json({ 
      success: true,
      message: 'Training data saved successfully',
      examples: updatedData.length
    });
  } catch (error) {
    console.error('Error saving training data:', error);
    return NextResponse.json(
      { error: 'Failed to save training data' },
      { status: 500 }
    );
  }
}

function calculateConfidence(
  existingConfidence: number = 0.5,
  newConfidence: number = 0.5,
  matches: number = 1
): number {
  // Weight based on number of matches
  const historyWeight = Math.min(matches * 0.1, 0.8); // Cap history weight at 0.8
  const newWeight = 1 - historyWeight;
  
  // Calculate weighted average
  const weightedConfidence = (existingConfidence * historyWeight) + (newConfidence * newWeight);
  
  // Ensure confidence stays between 0 and 1
  return Math.max(0, Math.min(1, weightedConfidence));
} 