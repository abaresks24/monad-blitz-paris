"use client";
import { useEffect, useState } from "react";
import QR from "qrcode";

export function QRCode({ text, size = 320 }: { text: string; size?: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QR.toDataURL(text, { width: size, margin: 1, color: { dark: "#0B0F1A", light: "#FFFFFF" } }).then(setUrl);
  }, [text, size]);
  if (!url) return <div style={{ width: size, height: size }} className="bg-white/10 rounded-2xl animate-pulse" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} width={size} height={size} alt="QR" className="rounded-2xl shadow-neon" />;
}
