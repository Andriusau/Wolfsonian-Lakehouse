const UPSTREAM_ROBOTS_URL = 'https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.txt';
const SITEMAP_URL = 'https://lakehouse.wolfsonian.org/sitemap.xml';

const FALLBACK_ROBOTS = `User-agent: *
Allow: /

User-agent: Baiduspider
Disallow: /

User-agent: Sogou web spider
Disallow: /

Sitemap: ${SITEMAP_URL}
`;

export const revalidate = 86400;

export async function GET() {
  try {
    const response = await fetch(UPSTREAM_ROBOTS_URL, {
      next: { revalidate },
    });

    if (!response.ok) {
      throw new Error(`Upstream robots.txt returned ${response.status}`);
    }

    const upstreamRobots = await response.text();
    const robots = `${upstreamRobots.trim()}\n\nSitemap: ${SITEMAP_URL}\n`;

    return new Response(robots, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Unable to fetch upstream robots.txt; using fallback policy.', error);

    return new Response(FALLBACK_ROBOTS, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
}