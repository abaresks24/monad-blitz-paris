"use client";
import { motion } from "framer-motion";

const COLORS = ["#3B82F6", "#F5A623", "#22C55E", "#EF4444", "#A855F7", "#FFB000"];

export function Confetti({ count = 80 }: { count?: number }) {
  const pieces = Array.from({ length: count }, (_, i) => i);
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((i) => {
        const left = (i * 37) % 100;
        const delay = (i % 10) * 0.15;
        const color = COLORS[i % COLORS.length];
        const size = 6 + (i % 4) * 3;
        return (
          <motion.div
            key={i}
            initial={{ y: -40, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: "110vh", rotate: 720, x: (i % 2 ? 1 : -1) * 60 }}
            transition={{ duration: 3 + (i % 5) * 0.5, delay, repeat: Infinity, ease: "linear" }}
            style={{ position: "absolute", left: `${left}%`, width: size, height: size * 1.6, background: color, borderRadius: 2 }}
          />
        );
      })}
    </div>
  );
}
