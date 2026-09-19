import Link from "next/link";

export default function Home() {
  return (
    <main className="scanlines grain min-h-[100dvh] flex flex-col items-center justify-center gap-8 p-6 text-center">
      <div className="space-y-2">
        <div className="led text-2xl">◉ LIGNE B ◉</div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
          Fraude sur le <span className="text-rerb drop-shadow-[0_0_18px_rgba(59,130,246,0.7)]">RER B</span>
        </h1>
        <p className="max-w-xl text-gray-300 mt-4 text-lg">
          Payez votre ticket ou fraudez. Des contrôleurs se cachent parmi vous.
          <br /> Fraudeur contrôlé = <span className="text-fine font-bold">20 points d&apos;amende</span>.
        </p>
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        <Link href="/play" className="glass neon-blue rounded-2xl px-8 py-4 text-xl font-bold hover:scale-105 transition">
          📱 Jouer (/play)
        </Link>
        <Link href="/screen" className="glass rounded-2xl px-8 py-4 text-xl font-bold hover:scale-105 transition">
          🖥️ Grand écran (/screen)
        </Link>
        <Link href="/admin" className="glass rounded-2xl px-8 py-4 text-xl font-bold hover:scale-105 transition">
          🎛️ Admin
        </Link>
      </div>
      <p className="text-xs text-gray-500 mt-8">
        Jeu on-chain sur Monad Testnet • points de jeu uniquement, aucun argent réel • parodie, sans lien avec la RATP/SNCF/IDFM
      </p>
    </main>
  );
}
