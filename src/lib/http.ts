import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (
    req.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== new URL(req.url).origin && origin !== process.env.APP_URL)
  )
    throw new HttpError(403, 'This request must come from the application.');
}
export async function body(req: Request) {
  assertOrigin(req);
  if (Number(req.headers.get('content-length') || 0) > 2_000_000)
    throw new HttpError(413, 'Request exceeds 2 MB. Use a smaller payload.');
  const text = await req.text();
  if (text.length > 2_000_000)
    throw new HttpError(413, 'Request exceeds 2 MB. Use a smaller payload.');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'Invalid JSON request.');
  }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json({ error: error.issues[0]?.message || 'Invalid input.' }, 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    return json({ error: 'This record already exists.' }, 409);
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'request_failed',
      type: error instanceof Error ? error.name : 'Unknown',
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    }),
  );
  return json({ error: 'The request could not be completed. Please try again.' }, 500);
}
