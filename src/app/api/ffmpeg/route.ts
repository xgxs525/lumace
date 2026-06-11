import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const resolvedPath = getFfmpegPath();
  return NextResponse.json({
    available: Boolean(resolvedPath),
    pathHint: resolvedPath ? "bundled" : "missing"
  });
}

function getFfmpegPath() {
  const candidates = [
    typeof ffmpegPath === "string" ? ffmpegPath : "",
    path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || "";
}
