import { NextResponse } from 'next/server';
import { readFeatures, writeFeatures } from '../../route';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing feature ID' }, { status: 400 });
    }

    const features = readFeatures();
    const item = features.find(f => f.id === id);

    if (!item) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 });
    }

    item.votes = (item.votes || 0) + 1;
    writeFeatures(features);

    return NextResponse.json({
      success: true,
      id: item.id,
      votes: item.votes
    });
  } catch (error: any) {
    console.error('POST /api/features/[id]/vote error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
