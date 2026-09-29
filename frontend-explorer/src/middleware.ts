import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BLOCKED_IP_PREFIXES = [
  '220.181.108.', // Baiduspider CIDR 220.181.108.0/24
];

const BLOCKED_USER_AGENTS = [
  'baiduspider',
  'sogou',
  'bytespider',
  'yisouspider',
];

function isIpBlocked(ip: string): boolean {
  if (BLOCKED_IP_PREFIXES.some(prefix => ip.startsWith(prefix))) {
    return true;
  }
  // Check China Unicom scraper farm: 116.179.32.0/20 (116.179.32.0 - 116.179.47.255)
  if (ip.startsWith('116.179.')) {
    const parts = ip.split('.');
    if (parts.length >= 3) {
      const third = parseInt(parts[2], 10);
      if (third >= 32 && third <= 47) {
        return true;
      }
    }
  }
  return false;
}

export function middleware(request: NextRequest) {
  // Extract client IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = (forwardedFor ? forwardedFor.split(',')[0].trim() : realIp || '').split(':')[0];

  // 1. IP CIDR Block
  if (ip && isIpBlocked(ip)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 2. User-Agent Block
  const userAgent = (request.headers.get('user-agent') || '').toLowerCase();
  if (BLOCKED_USER_AGENTS.some(bot => userAgent.includes(bot))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // 3. Exploit / Credential Scanner Probes Block (.env, pods, .git, etc.)
  const pathname = request.nextUrl.pathname.toLowerCase();
  if (
    pathname.includes('.env') ||
    pathname.includes('/pods') ||
    pathname.includes('wp-login') ||
    pathname.includes('/.git') ||
    pathname.includes('status/config')
  ) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
