import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#0B0F1A",
        night2: "#111827",
        rerb: "#3B82F6", // line B glowing blue
        amber: "#F5A623", // quay display amber
        led: "#FFB000", // dot-matrix amber
        fine: "#EF4444", // hot red
        paid: "#22C55E", // bright green
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        led: ["var(--font-led)", "monospace"],
      },
      boxShadow: {
        neon: "0 0 20px rgba(59,130,246,0.55), 0 0 40px rgba(59,130,246,0.25)",
        neonAmber: "0 0 18px rgba(245,166,35,0.6), 0 0 36px rgba(245,166,35,0.25)",
        fine: "0 0 24px rgba(239,68,68,0.7)",
      },
      keyframes: {
        scanline: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } },
        flicker: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.82" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
      },
      animation: {
        scanline: "scanline 6s linear infinite",
        flicker: "flicker 3s ease-in-out infinite",
        marquee: "marquee 22s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
