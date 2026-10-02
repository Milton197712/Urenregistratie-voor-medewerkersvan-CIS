import { useUser } from "@clerk/react";
import { useGetCurrentUser, type AuthSession } from "@workspace/api-client-react";
import { useLocation, Link, Redirect } from "wouter";
import { ArrowRight, CircleAlert, Clock3, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function PageLoading({ message = "Laden…" }: { message?: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-5">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(168_31%_43%/0.12)] text-[hsl(168_31%_33%)]">
          <Clock3 className="h-6 w-6" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function PublicLanding() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[radial-gradient(ellipse_at_top_left,hsl(168_31%_43%/0.12),transparent_42%),linear-gradient(135deg,hsl(42_35%_95%),hsl(42_40%_98%))] px-5 py-12">
      <section className="w-full max-w-2xl text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[hsl(218_31%_18%)] text-[hsl(38_86%_65%)] shadow-lg">
          <Clock3 className="h-8 w-8" />
        </div>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-[hsl(168_31%_43%)]">Werkdagregistratie</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">Tijdvast</h1>
        <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
          Houd je werkdag overzichtelijk bij. Je uren, pauzes en aanvragen staan veilig bij elkaar, op elk apparaat.
        </p>
        <Link href="/sign-in" className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(218_31%_18%)] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[hsl(218_31%_24%)]">
          Inloggen <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-5 text-xs text-muted-foreground">Nieuwe medewerker? Vraag je beheerder om een uitnodiging.</p>
      </section>
    </main>
  );
}

export function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-10">
      <Link href="/" className="mb-5 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(218_31%_18%)] text-[hsl(38_86%_65%)]"><Clock3 className="h-4 w-4" /></span>
        Tijdvast
      </Link>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

export function SignUpPage() {
  const params = new URLSearchParams(window.location.search);
  const hasInvitation = ["__clerk_ticket", "ticket", "__clerk_invitation_id"].some((key) => params.has(key));
  if (!hasInvitation) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background px-5 py-12">
        <section className="w-full max-w-md rounded-2xl border border-card-border bg-card p-7 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-secondary text-[hsl(168_31%_43%)]"><ShieldCheck className="h-6 w-6" /></div>
          <h1 className="mt-5 text-xl font-semibold">Registratie op uitnodiging</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Open de persoonlijke uitnodigingslink die je van je beheerder hebt ontvangen om je account aan te maken.
          </p>
          <Link href="/sign-in" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Terug naar inloggen</Link>
        </section>
      </main>
    );
  }
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function AccessDenied() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-card-border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-secondary text-[hsl(168_31%_43%)]"><ShieldCheck className="h-6 w-6" /></div>
        <h1 className="mt-5 text-xl font-semibold">Account nog niet uitgenodigd</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Tijdvast is alleen toegankelijk voor medewerkers met een uitnodiging. Vraag je beheerder om toegang.
        </p>
        <Link href="/sign-in" className="mt-6 inline-flex rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary">Terug naar inloggen</Link>
      </section>
    </main>
  );
}

export function AuthGate({ children }: { children: (session: AuthSession) => ReactNode }) {
  const [location] = useLocation();
  const { isLoaded, isSignedIn } = useUser();
  const profile = useGetCurrentUser({
    query: { enabled: Boolean(isLoaded && isSignedIn), retry: false },
  });

  if (!isLoaded) return <PageLoading />;
  if (!isSignedIn) return location === "/" ? <PublicLanding /> : <Redirect to="/" />;
  if (profile.isLoading) return <PageLoading message="Je Tijdvast-profiel laden…" />;
  if (profile.isError) {
    if ((profile.error as { status?: number }).status === 403) return <AccessDenied />;
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background px-5 py-12">
        <div className="text-center">
          <CircleAlert className="mx-auto h-8 w-8 text-[hsl(2_61%_49%)]" />
          <h1 className="mt-4 text-lg font-semibold">Je account kon niet worden geladen</h1>
          <p className="mt-2 text-sm text-muted-foreground">Controleer je verbinding en probeer het opnieuw.</p>
          <button onClick={() => void profile.refetch()} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Opnieuw proberen</button>
        </div>
      </main>
    );
  }
  if (!profile.data) return <PageLoading message="Je Tijdvast-profiel laden…" />;
  return children(profile.data);
}