import { notFound } from 'next/navigation';
import { sharedData } from '@/lib/service';
import { SharedJourney } from '@/components/shared-journey';
export const dynamic = 'force-dynamic';
export default async function Share({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await sharedData(token).catch(() => null);
  if (!data) notFound();
  return <SharedJourney initial={data} token={token} />;
}
