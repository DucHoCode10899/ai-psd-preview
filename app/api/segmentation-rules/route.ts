import { NextResponse } from 'next/server';
import segmentationRules from '@/data/segmentationRules.json';
import type { SegmentationRulesResponse } from '@/types/segmentation';

export async function GET() {
  try {
    const response: SegmentationRulesResponse = {
      success: true,
      data: segmentationRules
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching segmentation rules:', error);
    
    const errorResponse: SegmentationRulesResponse = {
      success: false,
      data: { segmentationTypes: [] },
      error: 'Failed to fetch segmentation rules'
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
} 