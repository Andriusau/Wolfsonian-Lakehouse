import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  system: 'lakehouse' | 'metabase' | 'pipeline' | 'general';
  category: string;
  status: 'done' | 'in_progress' | 'planned' | 'under_review';
  submitter_name: string;
  submitter_email?: string;
  admin_response?: string;
  votes: number;
  created_at: string;
}

export function getFeedbackFilePath(): string {
  // Docker mounted volume path
  const dockerPath = '/app/data/feedback/feature_requests.json';
  if (fs.existsSync('/app/data/feedback') || fs.existsSync(dockerPath)) {
    return dockerPath;
  }
  
  // Repo relative path when developing outside Docker
  const repoPath = path.resolve(process.cwd(), '../data/feedback/feature_requests.json');
  if (fs.existsSync(path.dirname(repoPath))) {
    return repoPath;
  }

  // Local fallback
  return path.resolve(process.cwd(), 'data/feedback/feature_requests.json');
}

export function readFeatures(): FeatureItem[] {
  try {
    const filePath = getFeedbackFilePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading feature requests:', err);
    return [];
  }
}

export function writeFeatures(features: FeatureItem[]): void {
  const filePath = getFeedbackFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write via temp file
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(features, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export async function GET() {
  try {
    const features = readFeatures();

    // Strip emails for public privacy
    const sanitized = features.map(({ submitter_email, ...rest }) => rest);

    // Compute stats
    const stats = {
      total: sanitized.length,
      done: sanitized.filter(f => f.status === 'done').length,
      in_progress: sanitized.filter(f => f.status === 'in_progress').length,
      planned: sanitized.filter(f => f.status === 'planned').length,
      under_review: sanitized.filter(f => f.status === 'under_review').length,
    };

    return NextResponse.json({
      features: sanitized,
      stats
    });
  } catch (error: any) {
    console.error('GET /api/features error:', error);
    return NextResponse.json({ error: 'Failed to load feature requests' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, system, category, title, description } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Please provide your name (at least 2 characters).' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 });
    }

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return NextResponse.json({ error: 'Feature title must be at least 3 characters.' }, { status: 400 });
    }

    if (!description || typeof description !== 'string' || description.trim().length < 5) {
      return NextResponse.json({ error: 'Please provide more details in the description (at least 5 characters).' }, { status: 400 });
    }

    const validSystems = ['lakehouse', 'metabase', 'pipeline', 'general'];
    const selectedSystem = validSystems.includes(system) ? system : 'lakehouse';

    const newItem: FeatureItem = {
      id: `feat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim(),
      description: description.trim(),
      system: selectedSystem,
      category: (category && typeof category === 'string' && category.trim()) ? category.trim() : 'General',
      status: 'under_review',
      submitter_name: name.trim(),
      submitter_email: email.trim(),
      votes: 1,
      created_at: new Date().toISOString()
    };

    const features = readFeatures();
    // Put new user submissions at the top
    features.unshift(newItem);
    writeFeatures(features);

    // Return sanitized item without email
    const { submitter_email, ...publicItem } = newItem;
    return NextResponse.json({
      success: true,
      item: publicItem
    }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/features error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
