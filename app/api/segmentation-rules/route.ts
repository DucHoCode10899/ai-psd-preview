import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Get the absolute path to the segmentation rules file
const dataFilePath = path.join(process.cwd(), 'data', 'segmentationRules.json');

// GET handler to read segmentation rules
export async function GET() {
  try {
    const fileContents = await fs.readFile(dataFilePath, 'utf8');
    const data = JSON.parse(fileContents);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading segmentation rules:', error);
    return NextResponse.json(
      { error: 'Failed to read segmentation rules' },
      { status: 500 }
    );
  }
}

// POST handler to update segmentation rules
export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate the data structure
    if (!data.segmentationTypes || !Array.isArray(data.segmentationTypes)) {
      return NextResponse.json(
        { error: 'Invalid data structure' },
        { status: 400 }
      );
    }

    // Format the JSON with proper indentation for better readability
    const formattedData = JSON.stringify(data, null, 2);
    
    // Write the updated rules to the file
    await fs.writeFile(dataFilePath, formattedData, 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating segmentation rules:', error);
    return NextResponse.json(
      { error: 'Failed to update segmentation rules' },
      { status: 500 }
    );
  }
} 