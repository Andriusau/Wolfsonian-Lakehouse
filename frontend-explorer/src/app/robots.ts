import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  // Comprehensive list of AI bots to block based on standard AI-exclusion lists
  const aiUserAgents = [
    'GPTBot',
    'OAI-SearchBot',
    'ClaudeBot',
    'Claude-Web',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
    'Amazonbot',
    'Bytespider',
    'CCBot',
    'FacebookBot',
    'Meta-ExternalAgent',
    'Diffbot'
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      {
        userAgent: ['Baiduspider', 'Sogou web spider'],
        disallow: '/',
      },
      // Block AI scraping / training bots
      {
        userAgent: aiUserAgents,
        disallow: '/',
      },
    ],
    sitemap: 'https://lakehouse.wolfsonian.org/sitemap.xml',
  };
}