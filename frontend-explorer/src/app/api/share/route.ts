import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function getSharesDir(): string {
  // Docker mounted volume path
  const dockerPath = '/app/data/shares';
  if (fs.existsSync(dockerPath) || fs.existsSync('/app/data')) {
    if (!fs.existsSync(dockerPath)) {
      try {
        fs.mkdirSync(dockerPath, { recursive: true });
      } catch (e) {
        console.error('Failed to create docker shares dir', e);
      }
    }
    return dockerPath;
  }

  // Outside Docker (relative to frontend-explorer directory)
  const repoPath = path.resolve(process.cwd(), '../data/shares');
  if (fs.existsSync(path.dirname(repoPath))) {
    if (!fs.existsSync(repoPath)) {
      try {
        fs.mkdirSync(repoPath, { recursive: true });
      } catch (e) {
        console.error('Failed to create repo shares dir', e);
      }
    }
    return repoPath;
  }

  // Local fallback
  const localPath = path.resolve(process.cwd(), 'data/shares');
  if (!fs.existsSync(localPath)) {
    try {
      fs.mkdirSync(localPath, { recursive: true });
    } catch (e) {
      console.error('Failed to create local shares dir', e);
    }
  }
  return localPath;
}

function generateShortCode(items: string[]): string {
  // Sort and normalize items to ensure deterministic codes (same items = same short URL)
  const normalized = [...items].map(id => String(id).trim()).filter(Boolean).sort().join('|');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  // 7-character hexadecimal string (~268 million unique combinations)
  return hash.substring(0, 7);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawItems = body?.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { error: 'An array of object identifiers is required.' },
        { status: 400 }
      );
    }

    if (rawItems.length > 2000) {
      return NextResponse.json(
        { error: 'Collections are limited to 2,000 items.' },
        { status: 400 }
      );
    }

    // Clean and deduplicate identifiers
    const items = Array.from(new Set(rawItems.map(id => String(id).trim()).filter(Boolean)));
    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No valid identifiers found in request.' },
        { status: 400 }
      );
    }

    const code = generateShortCode(items);
    const sharesDir = getSharesDir();
    const filePath = path.join(sharesDir, `${code}.json`);

    if (!fs.existsSync(filePath)) {
      const record = {
        code,
        created_at: new Date().toISOString(),
        items,
        count: items.length
      };
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    }

    return NextResponse.json({
      code,
      count: items.length,
      url: `/?c=${code}`
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error generating share link:', error);
    return NextResponse.json(
      { error: 'Failed to generate share link.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('c') || searchParams.get('code');

    if (!code || !/^[a-zA-Z0-9_-]{4,32}$/.test(code)) {
      return NextResponse.json(
        { error: 'Invalid or missing share code parameter.' },
        { status: 400 }
      );
    }

    const sharesDir = getSharesDir();
    const filePath = path.join(sharesDir, `${code}.json`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Shared collection not found.' },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
      }
    });

  } catch (error: any) {
    console.error('Error retrieving shared collection:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve shared collection.' },
      { status: 500 }
    );
  }
}
