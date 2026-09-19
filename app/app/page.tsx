import Link from "next/link";
import { TicketMark } from "@/components/art";

export default function Home() {
  return (
    <main className="paper halftone min-h-[100dvh] flex flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="flex items-center gap-3">
        <TicketMark size={52} />
        <span className="riso text-cream text-xl tracking-widest">LIGNE B</span>
      </div>

      <h1 className="riso riso-offset text-cream text-6xl md:text-8xl max-w-4xl">
        Fraude sur le<br />RER B
      </h1>

      <p className="text-cream/90 text-2xl md:text-3xl font-semibold max-w-2xl">
        Cachez-vous dans le bon wagon.
        <br />
        <span className="text-vermilion">Les contrôleurs rôdent.</span>
      </p>

      <div className="card max-w-xl text-left p-5 space-y-2">
        <p className="text-lg">
          Chacun est <b>fraudeur</b> ou <b>contrôleur</b> — personne ne sait qui.
        </p>
        <p>
          <b className="text-blue">Fraudeurs</b> : montez dans un wagon et priez pour éviter les contrôleurs.
        </p>
        <p>
          <b className="text-vermilion">Contrôleurs</b> : coincez les fraudeurs de votre wagon. Ils sont éliminés.
        </p>
        <p className="text-vermilion font-bold">Les survivants raflent tout le pot à l&apos;arrivée.</p>
      </div>

      <div className="flex flex-wrap gap-4 justify-center">
        <Link href="/play" className="btn bg-vermilion text-cream text-2xl px-10 py-4 rounded-xl">
          Jouer
        </Link>
        <Link href="/screen" className="btn bg-cream text-ink text-2xl px-10 py-4 rounded-xl">
          Grand écran
        </Link>
      </div>
    </main>
  );
}
