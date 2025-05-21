import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Get layout rules
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data/layoutRules.json');
    const fileContents = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(fileContents);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading layout rules:', error);
    return NextResponse.json(
      { error: 'Failed to read layout rules' },
      { status: 500 }
    );
  }
}

// Save layout rules
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const filePath = path.join(process.cwd(), 'data/layoutRules.json');
    
    // Format JSON with indentation for readability
    const formattedData = JSON.stringify({ channels: data.channels }, null, 2);
    
    await fs.writeFile(filePath, formattedData);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving layout rules:', error);
    return NextResponse.json(
      { error: 'Failed to save layout rules' },
      { status: 500 }
    );
  }
} 