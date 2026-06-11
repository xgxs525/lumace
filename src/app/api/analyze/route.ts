import { NextResponse } from "next/server";
import { editPlanJsonSchema } from "@/lib/ai-schema";
import { createHeuristicPlan, normalizePlan } from "@/lib/video-planner";
import type { AnalyzeResponse, EditPlan, VideoMetadata } from "@/lib/video-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cachedClient: unknown = null;

async function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!cachedClient) {
    const { default: OpenAI } = await import("openai");
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient as {
    responses: {
      create: (input: unknown) => Promise<{ output_text?: string }>;
    };
  };
}

export async function POST(request: Request) {
  let metadata: VideoMetadata;
  try {
    metadata = (await request.json()) as VideoMetadata;
    if (!isValidMetadata(metadata)) {
      throw new Error("invalid metadata");
    }
  } catch {
    return NextResponse.json({ error: "请求格式无效。" }, { status: 400 });
  }

  const fallbackPlan = createHeuristicPlan(metadata);
  const client = await getOpenAIClient();
  if (!client) {
    return NextResponse.json<AnalyzeResponse>({
      mode: "local",
      warning: "未检测到 OPENAI_API_KEY，已使用本地规则生成方案。",
      plan: fallbackPlan
    });
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.5";

  try {
    const response = await withTimeout(
      client.responses.create({
        model,
        input: [
          {
            role: "system",
            content:
              "你是资深短视频剪辑导演和后期制片。你根据视频元数据、口播稿、目标平台和风格，输出可执行的剪辑方案。必须严格遵守 JSON schema，不要输出 Markdown。时间轴必须在源视频时长内，片段应紧凑、有理由、适合移动端观看。"
          },
          {
            role: "user",
            content: JSON.stringify({
              metadata,
              localDraft: fallbackPlan,
              constraints: [
                "segments 总时长接近 targetDuration，但不要超过源视频 duration。",
                "第一段必须适合做 3 秒钩子。",
                "如果 transcript 为空，就基于文件名、简介、时长和目标平台给出通用但可执行的剪辑策略。",
                "caption 文案要短，适合手机屏幕，不要编造具体事实。",
                "ffmpegCommand 可留空，服务端会重新生成。"
              ]
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "xgxs_video_edit_plan",
            strict: true,
            schema: editPlanJsonSchema
          }
        }
      }),
      25000
    );

    const raw = response.output_text;
    if (!raw) {
      throw new Error("OpenAI response did not include output_text.");
    }

    const plan = normalizePlan(JSON.parse(raw) as EditPlan, metadata);
    return NextResponse.json<AnalyzeResponse>({ mode: "ai", model, plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 分析失败。";
    return NextResponse.json<AnalyzeResponse>({
      mode: "local",
      warning: `AI 分析暂时不可用，已使用本地规则方案。${message.slice(0, 180)}`,
      plan: fallbackPlan
    });
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AI 分析超时。")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
