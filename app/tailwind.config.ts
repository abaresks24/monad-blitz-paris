import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F1017", // deep night paper
        ink2: "#181A26",
        cream: "#F3E9D2", // paper / light ink
        vermilion: "#FF4E3A", // riso red-orange (fine / eliminated)
        blue: "#3B6BFF", // riso blue (line B)
        yellow: "#FFC53D", // riso yellow accent
        green: "#37C871", // survive
      },
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        hard: "5px 5px 0 0 #0F1017",
        hardCream: "5px 5px 0 0 #F3E9D2",
        hardRed: "6px 6px 0 0 #FF4E3A",
        hardBlue: "6px 6px 0 0 #3B6BFF",
      },
      keyframes: {
        wobble: { "0%,100%": { transform: "translateY(0) rotate(-0.4deg)" }, "50%": { transform: "translateY(-3px) rotate(0.4deg)" } },
        shake: { "0%,100%": { transform: "translateX(0)" }, "20%": { transform: "translateX(-6px)" }, "40%": { transform: "translateX(6px)" }, "60%": { transform: "translateX(-4px)" }, "80%": { transform: "translateX(4px)" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
      },
      animation: {
        wobble: "wobble 3s ease-in-out infinite",
        shake: "shake 0.5s ease-in-out",
        marquee: "marquee 24s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
