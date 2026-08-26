import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
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
    ],
    sitemap: 'https://lakehouse.wolfsonian.org/sitemap.xml',
  };
}
