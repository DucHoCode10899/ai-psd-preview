import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface TrainingExample {
  layerName: string;
  correctLabel: string;
  pattern: string;
  confidence?: number;
  lastUpdated: string;
  history?: {
    label: string;
    timestamp: string;
    confidence?: number;
  }[];
}

export async function POST(request: Request) {
  try {
    const { layerName, shouldRemove } = await request.json();
    
    // Read existing training data
    const dataPath = path.join(process.cwd(), 'data', 'ai-training.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as TrainingExample[];
    
    if (!shouldRemove) {
      // If not explicitly removing, keep the data
      return NextResponse.json({ success: true, message: 'No data removed' });
    }
    
    // Only remove if explicitly requested
    const filteredData = data.filter(example => example.layerName !== layerName);
    fs.writeFileSync(dataPath, JSON.stringify(filteredData, null, 2));
    
    return NextResponse.json({ 
      success: true,
      message: 'Training data removed successfully'
    });
  } catch (error) {
    console.error('Error handling training data:', error);
    return NextResponse.json(
      { error: 'Failed to handle training data operation' },
      { status: 500 }
    );
  }
} 