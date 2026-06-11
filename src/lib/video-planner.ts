import type {
  AspectRatio,
  CaptionLine,
  EditPlan,
  EditSegment,
  Platform,
  VideoMetadata
} from "./video-types";

const PLATFORM_LABELS: Record<Platform, string> = {
  douyin: "抖音",
  kuaishou: "快手",
  xiaohongshu: "小红书",
  bilibili: "Bilibili",
  youtube: "YouTube",
  generic: "通用平台"
};

const STYLE_LABELS: Record<VideoMetadata["style"], string> = {
  viral: "高节奏爆款",
  clean: "干净专业",
  documentary: "纪录片叙事",
  commerce: "带货转化",
  course: "课程讲解"
};

export interface FfmpegBuildOptions {
  musicPath?: string;
  captionsPath?: string;
  displayMusicName?: string;
  displayCaptionName?: string;
  hasAudio?: boolean;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function roundTime(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe % 1) * 100);
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
}

export function getOutputSize(aspectRatio: AspectRatio, width: number, height: number) {
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  if (aspectRatio === "4:5") return { width: 1080, height: 1350 };

  const safeWidth = width > 0 ? width : 1920;
  const safeHeight = height > 0 ? height : 1080;
  const longest = Math.max(safeWidth, safeHeight);
  const scale = longest > 1920 ? 1920 / longest : 1;
  return {
    width: Math.max(2, Math.round((safeWidth * scale) / 2) * 2),
    height: Math.max(2, Math.round((safeHeight * scale) / 2) * 2)
  };
}

export function normalizePlan(plan: EditPlan, metadata: VideoMetadata): EditPlan {
  const duration = Math.max(0, metadata.duration || 0);
  const safeSegments = plan.segments
    .map((segment, index) => {
      const start = clamp(segment.start, 0, duration);
      const end = clamp(segment.end, start + 0.5, duration || start + 0.5);
      return {
        ...segment,
        id: segment.id || `s${index + 1}`,
        start: roundTime(start),
        end: roundTime(end),
        energy: clamp(segment.energy, 1, 100),
        speed: clamp(segment.speed || 1, 0.5, 2)
      };
    })
    .filter((segment) => segment.end - segment.start >= 0.5);

  const segments = safeSegments.length ? safeSegments : createHeuristicSegments(metadata);
  const estimatedDuration = roundTime(
    segments.reduce((sum, segment) => sum + (segment.end - segment.start) / segment.speed, 0)
  );

  return {
    ...plan,
    score: Math.round(clamp(plan.score || 70, 1, 100)),
    estimatedDuration,
    segments,
    captions: normalizeCaptions(plan.captions || [], estimatedDuration, metadata),
    titleOptions: (plan.titleOptions || []).slice(0, 6),
    hashtags: (plan.hashtags || []).slice(0, 12),
    checklist: (plan.checklist || []).slice(0, 8),
    renderNotes: (plan.renderNotes || []).slice(0, 8),
    ffmpegCommand: buildFfmpegCommand({
      inputName: metadata.fileName || "input.mp4",
      outputName: "xgxs-output.mp4",
      plan: { ...plan, segments },
      metadata,
      options: {
        musicPath: metadata.addBackgroundMusic ? "background-music.mp3" : undefined,
        captionsPath: metadata.addCaptions ? "captions.srt" : undefined,
        displayMusicName: metadata.addBackgroundMusic ? "background-music.mp3" : undefined,
        displayCaptionName: metadata.addCaptions ? "captions.srt" : undefined
      }
    })
  };
}

export function createHeuristicPlan(metadata: VideoMetadata): EditPlan {
  const segments = createHeuristicSegments(metadata);
  const estimatedDuration = roundTime(
    segments.reduce((sum, segment) => sum + (segment.end - segment.start) / segment.speed, 0)
  );
  const platform = PLATFORM_LABELS[metadata.platform];
  const style = STYLE_LABELS[metadata.style];
  const subject = metadata.brief.trim() || stripExtension(metadata.fileName) || "这条视频";
  const captions = normalizeCaptions([], estimatedDuration, metadata);

  const plan: EditPlan = {
    summary: `为 ${platform} 生成一版 ${style} 剪辑：保留开场信息密度、中段变化点和结尾行动点，压缩为约 ${Math.round(
      estimatedDuration
    )} 秒。`,
    targetAudience:
      metadata.style === "course"
        ? "想快速掌握重点的学习型观众"
        : metadata.style === "commerce"
          ? "已经有兴趣、需要被快速说服的潜在购买者"
          : "在前 3 秒决定是否继续观看的移动端用户",
    pacing: metadata.intensity >= 70 ? "快切、强钩子、每 4-7 秒一个信息点" : "中速叙事、重点处加密、保留自然停顿",
    score: Math.round(clamp(72 + metadata.intensity * 0.18 + segments.length * 1.5, 1, 92)),
    estimatedDuration,
    segments,
    captions,
    titleOptions: buildTitles(subject, metadata.platform, metadata.style),
    description: buildDescription(subject, metadata),
    hashtags: buildHashtags(metadata.platform, metadata.style),
    coverText: buildCoverText(subject, metadata.style),
    musicDirection:
      metadata.style === "documentary"
        ? "低频铺底，保留现场声；转场处轻微氛围音。"
        : metadata.style === "course"
          ? "低音量节拍，不抢讲解，重点句前后留白。"
          : "中高 BPM 节奏，开场 2 秒进入主鼓点，卡点切换镜头。",
    colorDirection:
      metadata.style === "clean"
        ? "自然肤色、轻微提升对比，避免过度锐化。"
        : metadata.style === "commerce"
          ? "商品和人物局部提亮，饱和度略高，背景压暗。"
          : "整体对比增强，暗部保留细节，高光不过曝。",
    checklist: [
      "开头 3 秒出现明确结果或冲突",
      "删除重复铺垫和弱停顿",
      "每个保留片段有清晰信息价值",
      "字幕不遮挡主体脸部或产品",
      "结尾保留评论、关注或购买动作"
    ],
    ffmpegCommand: "",
    renderNotes: [
      "本地规则方案未读取视频画面语义，适合先出粗剪。",
      "粘贴口播稿或简介后，AI 方案会更贴近内容重点。",
      "上传背景音乐后，渲染会自动按音量设置混合。"
    ]
  };

  return normalizePlan(plan, metadata);
}

export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  plan: EditPlan,
  metadata: VideoMetadata,
  options: FfmpegBuildOptions = {}
) {
  const { width, height } = getOutputSize(metadata.aspectRatio, metadata.width, metadata.height);
  const filters = buildFilterGraph(plan, metadata, width, height, options);
  const args = ["-y", "-i", inputPath];

  if (options.musicPath) {
    args.push("-stream_loop", "-1", "-i", options.musicPath);
  }

  args.push(
    "-filter_complex",
    filters,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "21",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-shortest",
    outputPath
  );

  return args;
}

export function buildFfmpegCommand({
  inputName,
  outputName,
  plan,
  metadata,
  options = {}
}: {
  inputName: string;
  outputName: string;
  plan: Pick<EditPlan, "segments" | "captions" | "estimatedDuration">;
  metadata: VideoMetadata;
  options?: FfmpegBuildOptions;
}) {
  const args = buildFfmpegArgs(
    inputName,
    outputName,
    plan as EditPlan,
    metadata,
    {
      musicPath: options.musicPath,
      captionsPath: options.captionsPath,
      displayMusicName: options.displayMusicName,
      displayCaptionName: options.displayCaptionName,
      hasAudio: options.hasAudio
    }
  );
  return `ffmpeg ${args.map(quoteArg).join(" ")}`;
}

function buildFilterGraph(plan: EditPlan, metadata: VideoMetadata, width: number, height: number, options: FfmpegBuildOptions) {
  const safeSegments = plan.segments.length
    ? plan.segments
    : [{ id: "s1", start: 0, end: 5, label: "保留片段", reason: "默认片段", energy: 60, speed: 1 }];
  const parts: string[] = [];
  const hasSourceAudio = options.hasAudio !== false;

  for (const [index, segment] of safeSegments.entries()) {
    const speed = clamp(segment.speed || 1, 0.5, 2);
    const videoSpeed = `setpts=${roundTime(1 / speed)}*PTS`;
    const audioSpeed = buildAudioTempo(speed);
    parts.push(
      `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS,${videoSpeed},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1[v${index}]`
    );
    if (hasSourceAudio) {
      parts.push(`[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS,${audioSpeed}[a${index}]`);
    } else {
      const segmentDuration = Math.max(0.1, (segment.end - segment.start) / speed);
      parts.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${roundTime(segmentDuration)},asetpts=PTS-STARTPTS[a${index}]`);
    }
  }

  const concatInputs = safeSegments.map((_, index) => `[v${index}][a${index}]`).join("");
  parts.push(`${concatInputs}concat=n=${safeSegments.length}:v=1:a=1[basev][cuta]`);

  if (metadata.addCaptions && options.captionsPath && plan.captions.length) {
    parts.push(
      `[basev]subtitles=${escapeSubtitlePath(options.captionsPath)}:force_style='FontName=Microsoft YaHei,FontSize=18,Outline=2,Shadow=1,MarginV=70'[v]`
    );
  } else {
    parts.push("[basev]null[v]");
  }

  const originalVolume = roundTime(clamp(metadata.originalVolume ?? 85, 0, 120) / 100);
  const musicVolume = roundTime(clamp(metadata.musicVolume ?? 28, 0, 120) / 100);
  const outputDuration = Math.max(0.5, plan.estimatedDuration || safeSegments.reduce((sum, item) => sum + item.end - item.start, 0));

  if (options.musicPath && metadata.addBackgroundMusic) {
    parts.push(`[1:a]atrim=0:${outputDuration},asetpts=PTS-STARTPTS,volume=${musicVolume}[bgm]`);
    if (metadata.keepOriginalAudio) {
      parts.push(`[cuta]volume=${originalVolume}[orig]`, "[orig][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]");
    } else {
      parts.push("[bgm]anull[a]");
    }
  } else if (metadata.keepOriginalAudio) {
    parts.push(`[cuta]volume=${originalVolume}[a]`);
  } else {
    parts.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${outputDuration},asetpts=PTS-STARTPTS[a]`);
  }

  return parts.join(";");
}

function buildAudioTempo(speed: number) {
  if (speed <= 2) return `atempo=${roundTime(speed)}`;
  return `atempo=2,atempo=${roundTime(speed / 2)}`;
}

function createHeuristicSegments(metadata: VideoMetadata): EditSegment[] {
  const duration = Math.max(1, metadata.duration || metadata.targetDuration || 60);
  const target = clamp(metadata.targetDuration || 45, 8, Math.min(duration, 240));
  const intensity = clamp(metadata.intensity || 50, 1, 100);
  const baseLength = intensity > 75 ? 5.5 : intensity > 45 ? 7.5 : 10;
  const count = clamp(Math.ceil(target / baseLength), 1, 12);
  const segmentLength = clamp(target / count, 2.5, 14);
  const anchors = buildAnchors(count, duration);

  return anchors.map((anchor, index) => {
    const start = clamp(anchor - segmentLength * 0.35, 0, Math.max(0, duration - 0.6));
    const end = clamp(start + segmentLength + (index % 2 === 0 ? 0.8 : -0.4), start + 0.8, duration);
    const energy = Math.round(clamp(88 - index * 5 + intensity * 0.12, 45, 96));
    return {
      id: `s${index + 1}`,
      start: roundTime(start),
      end: roundTime(end),
      label: index === 0 ? "强开场" : index === count - 1 ? "行动结尾" : `重点 ${index}`,
      reason:
        index === 0
          ? "优先保留开头钩子和主体建立。"
          : index === count - 1
            ? "保留结尾收束和行动引导。"
            : "抽取中段信息密度较高的位置，形成节奏变化。",
      energy,
      speed: intensity > 80 && index % 3 === 1 ? 1.08 : 1
    };
  });
}

function buildAnchors(count: number, duration: number) {
  if (count === 1) return [Math.min(duration * 0.2, 6)];
  const anchors = [Math.min(duration * 0.08, 4)];
  for (let index = 1; index < count - 1; index += 1) {
    const t = index / (count - 1);
    const curve = 0.18 + t * 0.62 + Math.sin(t * Math.PI * 2) * 0.04;
    anchors.push(duration * curve);
  }
  anchors.push(duration * 0.88);
  return anchors;
}

function normalizeCaptions(captions: CaptionLine[], estimatedDuration: number, metadata: VideoMetadata) {
  const cleaned = captions
    .map((caption) => ({
      start: roundTime(clamp(caption.start, 0, estimatedDuration)),
      end: roundTime(clamp(caption.end, caption.start + 0.5, estimatedDuration || caption.start + 0.5)),
      text: caption.text.trim().slice(0, 42)
    }))
    .filter((caption) => caption.text && caption.end > caption.start);

  if (cleaned.length) return cleaned.slice(0, 80);

  const source = metadata.transcript.trim();
  if (source) {
    const sentences = source
      .split(/[。！？!?；;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 18);
    if (sentences.length) {
      const slot = Math.max(1.6, estimatedDuration / sentences.length);
      return sentences.map((text, index) => ({
        start: roundTime(index * slot),
        end: roundTime(Math.min(estimatedDuration, index * slot + slot * 0.82)),
        text: text.slice(0, 42)
      }));
    }
  }

  return [
    { start: 0, end: Math.min(3, estimatedDuration), text: "开头先给结果" },
    { start: Math.min(3.2, estimatedDuration), end: Math.min(7, estimatedDuration), text: "保留最有信息量的片段" },
    {
      start: Math.max(0, estimatedDuration - 4),
      end: estimatedDuration,
      text: metadata.style === "commerce" ? "最后给出明确行动" : "结尾留下记忆点"
    }
  ].filter((caption) => caption.end > caption.start);
}

function buildTitles(subject: string, platform: Platform, style: VideoMetadata["style"]) {
  if (style === "commerce") {
    return [`${subject}，真正值得看的 3 个点`, `别急着买，先看完这个`, `${PLATFORM_LABELS[platform]} 爆款拆法：${subject}`];
  }
  if (style === "course") {
    return [`${subject}：一次讲清楚`, `新手也能看懂的 ${subject}`, `${subject} 的关键步骤都在这`];
  }
  return [`${subject} 最抓人的一版`, `把 ${subject} 剪成 30 秒重点`, `开头 3 秒就该这样讲`];
}

function buildDescription(subject: string, metadata: VideoMetadata) {
  const platform = PLATFORM_LABELS[metadata.platform];
  return `这版剪辑面向 ${platform} 的观看节奏，围绕「${subject}」压缩重点、强化开头钩子，并在结尾保留行动点。`;
}

function buildHashtags(platform: Platform, style: VideoMetadata["style"]) {
  const tags = ["智能剪辑", "视频剪辑", "短视频", PLATFORM_LABELS[platform]];
  if (style === "commerce") tags.push("带货视频", "转化提升");
  if (style === "course") tags.push("知识分享", "课程剪辑");
  if (style === "documentary") tags.push("纪录片感", "故事剪辑");
  if (style === "viral") tags.push("爆款剪辑", "高能混剪");
  return tags;
}

function buildCoverText(subject: string, style: VideoMetadata["style"]) {
  if (style === "commerce") return "值不值得买？";
  if (style === "course") return "一次讲清";
  if (style === "documentary") return "真实故事";
  return subject.length > 10 ? subject.slice(0, 10) : subject;
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function quoteArg(value: string) {
  if (/^[\w./:=-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function escapeSubtitlePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  return `'${normalized}'`;
}
