import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, MapPin, MoveUpRight, Compass, CalendarDays, Wallet } from 'lucide-react';
import { DemoButton } from '@/components/auth';
export default function Home() {
  return (
    <main className="landing">
      <header>
        <Link href="/" prefetch={false} className="wordmark">
          <Compass size={27} />
          roamly<span>®</span>
        </Link>
        <nav>
          <Link href="/sign-in" prefetch={false}>
            Sign in
          </Link>
          <Link href="/register" prefetch={false} className="button">
            Start a journey <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">A LITTLE PLANNING. A LOT OF POSSIBILITY.</span>
          <h1>
            Leave room
            <br />
            for <em>wonder.</em>
          </h1>
          <p>
            The places you’ve saved. The days you’re dreaming of. Bring it all together in a journey
            that feels like you.
          </p>
          <DemoButton />
          <small>No signup. Your own travel sandbox.</small>
          <div className="hero-doodle">
            Take the scenic route <MoveUpRight size={35} />
          </div>
        </div>
        <div className="landing-photo">
          <Image
            src="/photos/japan.jpg"
            alt="Historic Kyoto streets leading toward a pagoda"
            fill
            sizes="(max-width:700px) 100vw, 55vw"
            priority
          />
          <div className="photo-note">
            <MapPin size={15} />
            <div>
              <strong>Somewhere in Kyoto</strong>
              <small>Your next chapter is out there.</small>
            </div>
          </div>
          <span className="photo-sticker">
            LESS SCROLLING.
            <br />
            MORE STROLLING.
          </span>
        </div>
      </section>
      <section className="landing-reasons">
        <div>
          <CalendarDays />
          <h2>Every day, thoughtfully.</h2>
          <p>Plan a multi-city itinerary with local times, nearby places and space to slow down.</p>
        </div>
        <div>
          <Wallet />
          <h2>Keep the details light.</h2>
          <p>Bring budgets, expenses, stays and checklists into one calm place.</p>
        </div>
        <div>
          <Compass />
          <h2>Go together.</h2>
          <p>
            Share a journey with view-only or itinerary-editing access. Keep your private details
            private.
          </p>
        </div>
      </section>
      <footer>
        <span className="wordmark">roamly</span>
        <span>FOR THE PLACES YOU HAVEN’T FOUND YET.</span>
        <Link href="/register" prefetch={false}>
          Your next journey <ArrowUpRight size={13} />
        </Link>
      </footer>
    </main>
  );
}
