import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import { buildFfmpegArgs, buildFfmpegCommand, normalizePlan } from "@/lib/video-planner";
import type { CaptionLine, EditPlan, RenderResponse, VideoMetadata } from "@/lib/video-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_MUSIC_BYTES = 80 * 1024 * 1024;

export async function POST(request: Request) {
  const resolvedFfmpegPath = getFfmpegPath();
  if (!resolvedFfmpegPath) {
    return NextResponse.json<RenderResponse>(
      { ok: false, error: "内置 FFmpeg 不可用，请安装 ffmpeg 后使用命令导出。" },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const video = formData.get("video");
  const music = formData.get("music");
  const planRaw = formData.get("plan");
  const metadataRaw = formData.get("metadata");

  if (!(video instanceof File) || typeof planRaw !== "string" || typeof metadataRaw !== "string") {
    return NextResponse.json<RenderResponse>(
      { ok: false, error: "需要视频文件、剪辑方案和素材元数据。" },
      { status: 400 }
    );
  }

  if (video.size <= 0 || video.size > MAX_VIDEO_BYTES || !video.type.startsWith("video/")) {
    return NextResponse.json<RenderResponse>(
      { ok: false, error: "视频文件无效，或超过 512MB 限制。" },
      { status: video.size > MAX_VIDEO_BYTES ? 413 : 400 }
    );
  }

  if (music instanceof File && (music.size > MAX_MUSIC_BYTES || (music.size > 0 && !music.type.startsWith("audio/")))) {
    return NextResponse.json<RenderResponse>(
      { ok: false, error: "背景音乐文件无效，或超过 80MB 限制。" },
      { status: music.size > MAX_MUSIC_BYTES ? 413 : 400 }
    );
  }

  let metadata: VideoMetadata;
  let plan: EditPlan;
  try {
    metadata = JSON.parse(metadataRaw) as VideoMetadata;
    const parsedPlan = JSON.parse(planRaw) as EditPlan;
    if (!isValidMetadata(metadata) || !Array.isArray(parsedPlan.segments) || !Array.isArray(parsedPlan.captions)) {
      throw new Error("invalid payload");
    }
    plan = normalizePlan(parsedPlan, metadata);
  } catch {
    return NextResponse.json<RenderResponse>(
      { ok: false, error: "剪辑方案或素材元数据不是有效 JSON。" },
      { status: 400 }
    );
  }
  const workDir = path.join(tmpdir(), `xgxs-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(workDir, { recursive: true });

  const inputPath = path.join(workDir, sanitizeFileName(video.name || "input.mp4"));
  const outputPath = path.join(workDir, "xgxs-output.mp4");
  const musicPath =
    music instanceof File && music.size > 0 && metadata.addBackgroundMusic
      ? path.join(workDir, sanitizeFileName(music.name || "background-music.mp3"))
      : undefined;
  const captionsPath = metadata.addCaptions && plan.captions.length ? path.join(workDir, "captions.srt") : undefined;

  let command = "";

  try {
    await writeFile(inputPath, Buffer.from(await video.arrayBuffer()));
    const hasAudio = await hasAudioStream(resolvedFfmpegPath, inputPath);

    if (musicPath && music instanceof File) {
      await writeFile(musicPath, Buffer.from(await music.arrayBuffer()));
    }

    if (captionsPath) {
      await writeFile(captionsPath, captionsToSrt(plan.captions), "utf8");
    }

    const args = buildFfmpegArgs(inputPath, outputPath, plan, metadata, {
      musicPath,
      captionsPath,
      hasAudio
    });
    command = buildFfmpegCommand({
      inputName: video.name || "input.mp4",
      outputName: "xgxs-output.mp4",
      plan,
      metadata,
      options: {
        musicPath,
        captionsPath,
        displayMusicName: musicPath ? (music instanceof File ? music.name || "background-music.mp3" : "background-music.mp3") : undefined,
        displayCaptionName: captionsPath ? "captions.srt" : undefined,
        hasAudio
      }
    });

    await execFileAsync(resolvedFfmpegPath, args, {
      timeout: 1000 * 60 * 10,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8
    });

    const output = await readFile(outputPath);
    await rm(workDir, { recursive: true, force: true });

    return new Response(output, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="xgxs-output.mp4"',
        "X-XGXS-Command": encodeURIComponent(command)
      }
    });
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : "渲染失败。";
    return NextResponse.json<RenderResponse>(
      {
        ok: false,
        error: message.slice(0, 500),
        command
      },
      { status: 500 }
    );
  }
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").slice(0, 120) || "input.mp4";
}

function getFfmpegPath() {
  const candidates = [
    typeof ffmpegPath === "string" ? ffmpegPath : "",
    path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || "";
}

async function hasAudioStream(ffmpegExecutable: string, inputPath: string) {
  try {
    await execFileAsync(ffmpegExecutable, ["-hide_banner", "-i", inputPath], {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
    return false;
  } catch (error) {
    const output = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    return /Stream #\d+:\d+.*Audio:/i.test(output);
  }
}

function isValidMetadata(value: unknown): value is VideoMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<VideoMetadata>;
  return (
    typeof metadata.fileName === "string" &&
    typeof metadata.fileSize === "number" &&
    typeof metadata.duration === "number" &&
    typeof metadata.width === "number" &&
    typeof metadata.height === "number" &&
    typeof metadata.platform === "string" &&
    typeof metadata.aspectRatio === "string" &&
    typeof metadata.style === "string" &&
    typeof metadata.targetDuration === "number" &&
    typeof metadata.intensity === "number" &&
    typeof metadata.addCaptions === "boolean" &&
    typeof metadata.keepOriginalAudio === "boolean" &&
    typeof metadata.addBackgroundMusic === "boolean" &&
    metadata.targetDuration >= 1 &&
    metadata.targetDuration <= 600 &&
    metadata.intensity >= 1 &&
    metadata.intensity <= 100
  );
}

function captionsToSrt(captions: CaptionLine[]) {
  return captions
    .map((caption, index) => {
      return `${index + 1}\n${toSrtTime(caption.start)} --> ${toSrtTime(caption.end)}\n${caption.text}\n`;
    })
    .join("\n");
}

function toSrtTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe % 1) * 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${wholeSeconds
    .toString()
    .padStart(2, "0")},${milliseconds.toString().padStart(3, "0")}`;
}
