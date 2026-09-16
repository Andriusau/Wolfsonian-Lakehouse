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

const ADMIN_PASSKEY = process.env.FEATURE_ADMIN_PASSKEY;

export function isAuthorizedAdmin(req: Request): boolean {
  if (!ADMIN_PASSKEY) return false;
  const headerKey = req.headers.get('x-admin-key');
  if (headerKey && headerKey === ADMIN_PASSKEY) return true;
  try {
    const url = new URL(req.url);
    const queryKey = url.searchParams.get('admin_key');
    return queryKey === ADMIN_PASSKEY;
  } catch {
    return false;
  }
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

export async function GET(req: Request) {
  try {
    const features = readFeatures();
    const isAdmin = isAuthorizedAdmin(req);

    // If admin, include email; otherwise strip for public privacy
    const outputFeatures = isAdmin
      ? features
      : features.map(({ submitter_email, ...rest }) => rest);

    // Compute stats
    const stats = {
      total: outputFeatures.length,
      done: outputFeatures.filter(f => f.status === 'done').length,
      in_progress: outputFeatures.filter(f => f.status === 'in_progress').length,
      planned: outputFeatures.filter(f => f.status === 'planned').length,
      under_review: outputFeatures.filter(f => f.status === 'under_review').length,
    };

    return NextResponse.json({
      features: outputFeatures,
      stats,
      is_admin: isAdmin
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

// Admin update (status, AA dev response, title, etc.)
export async function PATCH(req: Request) {
  try {
    if (!isAuthorizedAdmin(req)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid admin passkey' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, admin_response, title, description, category, system } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing feature ID' }, { status: 400 });
    }

    const features = readFeatures();
    const index = features.findIndex(f => f.id === id);
    if (index === -1) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 });
    }

    const item = features[index];

    if (status !== undefined) {
      const validStatuses = ['done', 'in_progress', 'planned', 'under_review'];
      if (validStatuses.includes(status)) {
        item.status = status;
      }
    }

    if (admin_response !== undefined) {
      item.admin_response = admin_response;
    }

    if (title !== undefined && typeof title === 'string' && title.trim()) {
      item.title = title.trim();
    }

    if (description !== undefined && typeof description === 'string' && description.trim()) {
      item.description = description.trim();
    }

    if (category !== undefined && typeof category === 'string' && category.trim()) {
      item.category = category.trim();
    }

    if (system !== undefined) {
      const validSystems = ['lakehouse', 'metabase', 'pipeline', 'general'];
      if (validSystems.includes(system)) {
        item.system = system;
      }
    }

    features[index] = item;
    writeFeatures(features);

    return NextResponse.json({
      success: true,
      item
    });
  } catch (error: any) {
    console.error('PATCH /api/features error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// Admin delete feature
export async function DELETE(req: Request) {
  try {
    if (!isAuthorizedAdmin(req)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid admin passkey' }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing feature ID' }, { status: 400 });
    }

    const features = readFeatures();
    const filtered = features.filter(f => f.id !== id);

    if (filtered.length === features.length) {
      return NextResponse.json({ error: 'Feature not found' }, { status: 404 });
    }

    writeFeatures(filtered);

    return NextResponse.json({
      success: true,
      id
    });
  } catch (error: any) {
    console.error('DELETE /api/features error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
