export type Platform =
  | "douyin"
  | "kuaishou"
  | "xiaohongshu"
  | "bilibili"
  | "youtube"
  | "generic";

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "original";

export type EditStyle =
  | "viral"
  | "clean"
  | "documentary"
  | "commerce"
  | "course";

export interface VideoMetadata {
  fileName: string;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  platform: Platform;
  aspectRatio: AspectRatio;
  style: EditStyle;
  targetDuration: number;
  language: "zh-CN" | "en-US";
  intensity: number;
  addCaptions: boolean;
  keepOriginalAudio: boolean;
  addBackgroundMusic: boolean;
  originalVolume: number;
  musicVolume: number;
  brief: string;
  transcript: string;
}

export interface EditSegment {
  id: string;
  start: number;
  end: number;
  label: string;
  reason: string;
  energy: number;
  speed: number;
}

export interface CaptionLine {
  start: number;
  end: number;
  text: string;
}

export interface EditPlan {
  summary: string;
  targetAudience: string;
  pacing: string;
  score: number;
  estimatedDuration: number;
  segments: EditSegment[];
  captions: CaptionLine[];
  titleOptions: string[];
  description: string;
  hashtags: string[];
  coverText: string;
  musicDirection: string;
  colorDirection: string;
  checklist: string[];
  ffmpegCommand: string;
  renderNotes: string[];
}

export interface AnalyzeResponse {
  mode: "ai" | "local";
  model?: string;
  warning?: string;
  plan: EditPlan;
}

export interface RenderResponse {
  ok: boolean;
  error?: string;
  command?: string;
}
