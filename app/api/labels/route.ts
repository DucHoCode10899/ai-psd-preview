import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const LABELS_FILE_PATH = path.join(process.cwd(), 'data', 'labels.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Initialize labels file if it doesn't exist
async function initLabelsFile() {
  try {
    await fs.access(LABELS_FILE_PATH);
  } catch {
    await fs.writeFile(LABELS_FILE_PATH, JSON.stringify({
      labels: [
        "background",
        "logo",
        "main-subject",
        "domain",
        "product-name",
        "sub-content-1",
        "sub-content-2",
        "cta",
        "disclaimer"
      ]
    }));
  }
}

// GET /api/labels
export async function GET() {
  try {
    await ensureDataDir();
    await initLabelsFile();
    const data = await fs.readFile(LABELS_FILE_PATH, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch (err) {
    console.error('Error fetching labels:', err);
    return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 });
  }
}

// POST /api/labels
export async function POST(request: Request) {
  try {
    const { label } = await request.json();
    if (!label) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    }

    await ensureDataDir();
    await initLabelsFile();
    
    const data = JSON.parse(await fs.readFile(LABELS_FILE_PATH, 'utf-8'));
    if (data.labels.includes(label)) {
      return NextResponse.json({ error: 'Label already exists' }, { status: 400 });
    }
    
    data.labels.push(label);
    await fs.writeFile(LABELS_FILE_PATH, JSON.stringify(data, null, 2));
    
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error adding label:', err);
    return NextResponse.json({ error: 'Failed to add label' }, { status: 500 });
  }
}

// PUT /api/labels
export async function PUT(request: Request) {
  try {
    const { oldLabel, newLabel } = await request.json();
    if (!oldLabel || !newLabel) {
      return NextResponse.json({ error: 'Both old and new labels are required' }, { status: 400 });
    }

    const data = JSON.parse(await fs.readFile(LABELS_FILE_PATH, 'utf-8'));
    const index = data.labels.indexOf(oldLabel);
    
    if (index === -1) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }
    
    if (data.labels.includes(newLabel) && oldLabel !== newLabel) {
      return NextResponse.json({ error: 'New label already exists' }, { status: 400 });
    }
    
    data.labels[index] = newLabel;
    await fs.writeFile(LABELS_FILE_PATH, JSON.stringify(data, null, 2));
    
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error updating label:', err);
    return NextResponse.json({ error: 'Failed to update label' }, { status: 500 });
  }
}

// DELETE /api/labels
export async function DELETE(request: Request) {
  try {
    const { label } = await request.json();
    if (!label) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    }

    const data = JSON.parse(await fs.readFile(LABELS_FILE_PATH, 'utf-8'));
    const index = data.labels.indexOf(label);
    
    if (index === -1) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }
    
    data.labels.splice(index, 1);
    await fs.writeFile(LABELS_FILE_PATH, JSON.stringify(data, null, 2));
    
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error deleting label:', err);
    return NextResponse.json({ error: 'Failed to delete label' }, { status: 500 });
  }
} 