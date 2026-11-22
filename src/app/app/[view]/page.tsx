import { redirect, notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { dataFor } from '@/lib/service';
import { Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ trip?: string }>;
}) {
  const { view } = await params;
  if (
    ![
      'trips',
      'itinerary',
      'map',
      'explore',
      'budget',
      'reservations',
      'checklist',
      'summary',
      'settings',
    ].includes(view)
  )
    notFound();
  const s = await requireSession().catch(() => null);
  if (!s) redirect('/sign-in');
  return (
    <Workspace initial={await dataFor(s.workspaceId, (await searchParams).trip)} view={view} />
  );
}
