import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'Roamly — make room for somewhere new',
  description:
    'Thoughtful multi-city travel planning. Every day, destination and little detail, together.',
};
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
