import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface TrainingExample {
  layerName: string;
  correctLabel: string;
  patterns: {
    pattern: string;
    confidence: number;
    matches: number;
  }[];
}

interface OldTrainingExample {
  layerName: string;
  correctLabel: string;
  pattern?: string;
  confidence?: number;
}

export async function GET() {
  try {
    // Read training data
    const dataPath = path.join(process.cwd(), 'data', 'ai-training.json');
    let data: TrainingExample[] = [];
    
    try {
      const fileContent = fs.readFileSync(dataPath, 'utf8');
      const rawData = JSON.parse(fileContent) as OldTrainingExample[];
      
      // Convert old format to new format if needed
      data = rawData.map((example: OldTrainingExample) => {
        if (!('patterns' in example)) {
          // Convert old format to new format
          return {
            layerName: example.layerName,
            correctLabel: example.correctLabel,
            patterns: [{
              pattern: example.pattern || example.layerName.toLowerCase(),
              confidence: example.confidence || 0.8,
              matches: 1
            }]
          };
        }
        return example as TrainingExample;
      });
    } catch {
      console.warn('No existing training data found or invalid format');
    }

    // Merge with default patterns for initial AI behavior
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

    // Add default patterns if they don't exist in training data
    Object.entries(DEFAULT_PATTERNS).forEach(([label, info]) => {
      const exists = data.some(example => 
        example.correctLabel === label && 
        example.patterns.some(p => p.pattern === info.pattern)
      );
      
      if (!exists) {
        data.push({
          layerName: `default_${label}`,
          correctLabel: label,
          patterns: [{
            pattern: info.pattern,
            confidence: info.confidence,
            matches: 1
          }]
        });
      }
    });
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error loading training data:', error);
    return NextResponse.json(
      { error: 'Failed to load training data' },
      { status: 500 }
    );
  }
} 