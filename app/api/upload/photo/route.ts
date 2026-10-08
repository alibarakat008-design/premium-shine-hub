/**
 * Upload Photo API - Stub
 * Returns success for compatibility
 */
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  return NextResponse.json({ 
    success: true, 
    message: 'Upload endpoint stub - upload disabled' 
  })
}

export async function GET() {
  return NextResponse.json({ 
    success: true, 
    message: 'Upload endpoint stub - upload disabled' 
  })
}
