'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, ShieldCheck, Compass } from 'lucide-react';
export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete the request.');
  return result as T;
}
export function DemoButton({ small = false }: { small?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="demo-cta">
      <button
        className={`button primary ${small ? 'small' : ''}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await request('/api/auth/demo', { method: 'POST', body: '{}' });
            router.push('/app/trips');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not open demo.');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Preparing your workspace…' : small ? 'Explore demo' : 'Explore the live demo'}
        <ArrowUpRight size={17} />
      </button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="auth-page">
      <Link prefetch={false} href="/" className="wordmark">
        <Compass size={27} />
        roamly
      </Link>
      <section className="auth-card">
        <span className="eyebrow">GO A LITTLE FURTHER</span>
        <h1>{register ? 'Your next chapter starts here.' : 'Good to see you.'}</h1>
        <p>
          {register ? 'Create a private travel workspace.' : 'Sign in to your travel workspace.'}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const input = Object.fromEntries(new FormData(e.currentTarget));
              await request(`/api/auth/${register ? 'register' : 'login'}`, {
                method: 'POST',
                body: JSON.stringify(input),
              });
              router.push('/app/trips');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Unable to continue.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <label>
              Your name
              <input name="name" required maxLength={80} autoComplete="name" />
            </label>
          )}
          <label>
            Email address
            <input name="email" type="email" required maxLength={200} autoComplete="email" />
          </label>
          <label>
            Password
            <input
              name="password"
              aria-label="Password"
              aria-describedby="password-hint"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
            />
            <small id="password-hint">At least 12 characters.</small>
          </label>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'One moment…' : register ? 'Create workspace' : 'Sign in'}
            <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? 'Already have an account?' : 'New around here?'}{' '}
          <Link prefetch={false} href={register ? '/sign-in' : '/register'}>
            {register ? 'Sign in' : 'Create a workspace'}
          </Link>
        </p>
        <div className="auth-divider">OR TAKE A LOOK AROUND</div>
        <DemoButton />
        <small className="auth-note">
          <ShieldCheck size={14} /> Demo data is synthetic and isolated for your session.
        </small>
      </section>
    </main>
  );
}
