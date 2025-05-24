import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TRAINING_DATA_PATH = path.join(process.cwd(), 'data', 'ai-training.json');

export async function GET() {
  try {
    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    // Create or load training data file
    if (!fs.existsSync(TRAINING_DATA_PATH)) {
      fs.writeFileSync(TRAINING_DATA_PATH, JSON.stringify([], null, 2));
      return NextResponse.json([]);
    }

    const data = fs.readFileSync(TRAINING_DATA_PATH, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading training data:', error);
    return NextResponse.json(
      { message: 'Error reading training data' },
      { status: 500 }
    );
  }
} 