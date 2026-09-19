"use client";
import { avatarSvg } from "@/lib/avatar";

export function Avatar({ seed, size = 48, ring }: { seed: string; size?: number; ring?: string }) {
  return (
    <img
      src={avatarSvg(seed, size)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className="rounded-full no-select"
      style={ring ? { boxShadow: `0 0 0 2px ${ring}, 0 0 12px ${ring}` } : undefined}
    />
  );
}
