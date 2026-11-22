import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="error-page">
      <span className="eyebrow">404 / OFF THE MAP</span>
      <h1>A different direction.</h1>
      <p>This page doesn’t exist. Let’s get you back to your workspace.</p>
      <Link className="button primary" href="/">
        Back to Roamly
      </Link>
    </main>
  );
}
