"use client";

import {
  BadgeCheck,
  Captions,
  Check,
  Clipboard,
  Clapperboard,
  Download,
  FileAudio,
  FileVideo,
  Gauge,
  Loader2,
  Music2,
  Play,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wand2
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { buildFfmpegCommand, createHeuristicPlan, formatTime } from "@/lib/video-planner";
import type {
  AnalyzeResponse,
  AspectRatio,
  CaptionLine,
  EditPlan,
  EditSegment,
  EditStyle,
  Platform,
  VideoMetadata
} from "@/lib/video-types";

const platforms: Array<{ value: Platform; label: string }> = [
  { value: "douyin", label: "抖音" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "bilibili", label: "Bilibili" },
  { value: "youtube", label: "YouTube" },
  { value: "kuaishou", label: "快手" },
  { value: "generic", label: "通用" }
];

const aspectRatios: Array<{ value: AspectRatio; label: string }> = [
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "original", label: "原比例" }
];

const styles: Array<{ value: EditStyle; label: string }> = [
  { value: "viral", label: "爆款" },
  { value: "clean", label: "专业" },
  { value: "commerce", label: "带货" },
  { value: "course", label: "课程" },
  { value: "documentary", label: "叙事" }
];

const onlineMusicPresets = [
  { id: "bright", name: "轻快律动", description: "短视频开场、产品展示", bpm: 126, tone: "bright" },
  { id: "business", name: "商务电子", description: "工具演示、教程、科技感", bpm: 112, tone: "business" },
  { id: "soft", name: "温柔铺底", description: "口播、课程、叙事", bpm: 86, tone: "soft" }
] as const;

const defaultSettings = {
  platform: "douyin" as Platform,
  aspectRatio: "9:16" as AspectRatio,
  style: "viral" as EditStyle,
  targetDuration: 45,
  language: "zh-CN" as const,
  intensity: 72,
  addCaptions: true,
  keepOriginalAudio: true,
  addBackgroundMusic: false,
  originalVolume: 85,
  musicVolume: 28,
  brief: "",
  transcript: ""
};

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [renderUrl, setRenderUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [settings, setSettings] = useState(defaultSettings);
  const [plan, setPlan] = useState<EditPlan | null>(null);
  const [status, setStatus] = useState<"idle" | "analyzing" | "rendering" | "music">("idle");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"ai" | "local" | null>(null);
  const [selectedOnlineMusic, setSelectedOnlineMusic] = useState("");

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (musicUrl) URL.revokeObjectURL(musicUrl);
      if (renderUrl) URL.revokeObjectURL(renderUrl);
    };
  }, [musicUrl, renderUrl, videoUrl]);

  const metadata = useMemo<VideoMetadata | null>(() => {
    if (!file) return null;
    return {
      fileName: file.name,
      fileSize: file.size,
      duration,
      width: dimensions.width,
      height: dimensions.height,
      ...settings
    };
  }, [dimensions.height, dimensions.width, duration, file, settings]);

  const bars = useMemo(() => buildWaveformBars(file?.name || "xgxs", 88), [file?.name]);
  const sourceDuration = duration || metadata?.duration || 1;
  const selectedDuration = plan?.estimatedDuration || 0;
  const displayedCommand = useMemo(() => {
    if (!metadata || !plan) return "";
    return buildFfmpegCommand({
      inputName: metadata.fileName || "input.mp4",
      outputName: "xgxs-output.mp4",
      plan,
      metadata,
      options: {
        musicPath: settings.addBackgroundMusic && musicFile ? musicFile.name : undefined,
        captionsPath: settings.addCaptions && plan.captions.length ? "captions.srt" : undefined,
        displayMusicName: settings.addBackgroundMusic && musicFile ? musicFile.name : undefined,
        displayCaptionName: settings.addCaptions && plan.captions.length ? "captions.srt" : undefined
      }
    });
  }, [metadata, musicFile, plan, settings.addBackgroundMusic, settings.addCaptions]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (renderUrl) URL.revokeObjectURL(renderUrl);
    setFile(nextFile);
    setPlan(null);
    setMode(null);
    setNotice("");
    setRenderUrl("");
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    setVideoUrl(URL.createObjectURL(nextFile));
  }

  function handleMusic(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    installMusicFile(nextFile, "");
  }

  function installMusicFile(nextFile: File, presetId: string) {
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    setMusicFile(nextFile);
    setMusicUrl(URL.createObjectURL(nextFile));
    setSelectedOnlineMusic(presetId);
    setSettings((current) => ({ ...current, addBackgroundMusic: true }));
  }

  async function handleOnlineMusic(presetId: string) {
    const preset = onlineMusicPresets.find((item) => item.id === presetId);
    if (!preset || status !== "idle") return;
    setStatus("music");
    setNotice("");
    try {
      const fileName = `xgxs-${preset.id}.wav`;
      const music = await createOnlineMusicFile(preset.tone, preset.bpm, fileName);
      installMusicFile(music, preset.id);
      setNotice(`已添加在线音乐：${preset.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "在线音乐生成失败");
    } finally {
      setStatus("idle");
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    setDimensions({
      width: video.videoWidth || 0,
      height: video.videoHeight || 0
    });
  }

  async function analyze() {
    if (!metadata || status !== "idle") return;
    setStatus("analyzing");
    setNotice("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata)
      });
      const data = (await response.json()) as AnalyzeResponse;
      setPlan(data.plan);
      setMode(data.mode);
      setNotice(data.warning || (data.mode === "ai" ? `AI 已生成剪辑方案${data.model ? ` · ${data.model}` : ""}` : "本地方案已生成"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "分析失败");
    } finally {
      setStatus("idle");
    }
  }

  async function render() {
    if (!file || !metadata || !plan || status !== "idle") return;
    setStatus("rendering");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("video", file);
      if (settings.addBackgroundMusic && musicFile) {
        formData.append("music", musicFile);
      }
      formData.append("metadata", JSON.stringify(metadata));
      formData.append("plan", JSON.stringify({ ...plan, ffmpegCommand: displayedCommand }));
      const response = await fetch("/api/render", { method: "POST", body: formData });
      if (!response.ok) {
        const failure = (await response.json()) as { error?: string; command?: string };
        setNotice(failure.error || "渲染失败");
        if (failure.command) {
          setPlan((current) => (current ? { ...current, ffmpegCommand: failure.command || current.ffmpegCommand } : current));
        }
        return;
      }
      const blob = await response.blob();
      if (renderUrl) URL.revokeObjectURL(renderUrl);
      setRenderUrl(URL.createObjectURL(blob));
      setNotice("渲染完成，成片已在输出区生成。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "渲染失败");
    } finally {
      setStatus("idle");
    }
  }

  function ensurePlan() {
    if (!metadata) return null;
    if (plan) return plan;
    const draft = createHeuristicPlan(metadata);
    setPlan(draft);
    setMode("local");
    return draft;
  }

  function addCaption() {
    const base = ensurePlan();
    if (!base) return;
    const lastEnd = base.captions.at(-1)?.end ?? 0;
    const maxEnd = base.estimatedDuration || duration || lastEnd + 3;
    const nextCaption: CaptionLine = {
      start: roundClientTime(Math.min(lastEnd + 0.2, Math.max(0, maxEnd - 1))),
      end: roundClientTime(Math.min(lastEnd + 3.2, maxEnd || lastEnd + 3.2)),
      text: "输入字幕"
    };
    setPlan({ ...base, captions: [...base.captions, nextCaption] });
  }

  function updateCaption(index: number, patch: Partial<CaptionLine>) {
    setPlan((current) => {
      if (!current) return current;
      const captions = current.captions.map((caption, captionIndex) =>
        captionIndex === index
          ? {
              ...caption,
              ...patch,
              start: patch.start !== undefined ? roundClientTime(patch.start) : caption.start,
              end: patch.end !== undefined ? roundClientTime(patch.end) : caption.end
            }
          : caption
      );
      return { ...current, captions };
    });
  }

  function deleteCaption(index: number) {
    setPlan((current) => (current ? { ...current, captions: current.captions.filter((_, itemIndex) => itemIndex !== index) } : current));
  }

  function addSegmentAtPlayhead() {
    const base = ensurePlan();
    if (!base) return;
    const start = roundClientTime(videoRef.current?.currentTime ?? 0);
    const end = roundClientTime(Math.min(sourceDuration, start + 4));
    if (end <= start) return;
    const nextSegment: EditSegment = {
      id: `s${Date.now()}`,
      start,
      end,
      label: "手动片段",
      reason: "用户手动添加",
      energy: 70,
      speed: 1
    };
    setPlan(withSegments(base, [...base.segments, nextSegment].sort((a, b) => a.start - b.start)));
  }

  function splitAtPlayhead() {
    const base = ensurePlan();
    if (!base) return;
    const playhead = roundClientTime(videoRef.current?.currentTime ?? 0);
    const index = base.segments.findIndex((segment) => playhead > segment.start + 0.3 && playhead < segment.end - 0.3);
    if (index < 0) {
      setNotice("当前播放点不在可分割片段中。");
      return;
    }
    const target = base.segments[index];
    const nextSegments = [
      ...base.segments.slice(0, index),
      { ...target, id: `${target.id}a`, end: playhead, label: `${target.label} A` },
      { ...target, id: `${target.id}b`, start: playhead, label: `${target.label} B` },
      ...base.segments.slice(index + 1)
    ];
    setPlan(withSegments(base, nextSegments));
  }

  function updateSegment(index: number, patch: Partial<EditSegment>) {
    setPlan((current) => {
      if (!current) return current;
      const segments = current.segments.map((segment, segmentIndex) =>
        segmentIndex === index
          ? {
              ...segment,
              ...patch,
              start: patch.start !== undefined ? roundClientTime(patch.start) : segment.start,
              end: patch.end !== undefined ? roundClientTime(patch.end) : segment.end,
              speed: patch.speed !== undefined ? roundClientTime(patch.speed) : segment.speed
            }
          : segment
      );
      return withSegments(current, segments);
    });
  }

  function deleteSegment(index: number) {
    setPlan((current) => (current ? withSegments(current, current.segments.filter((_, itemIndex) => itemIndex !== index)) : current));
  }

  function downloadPlan() {
    if (!plan) return;
    const blob = new Blob([JSON.stringify({ metadata, plan: { ...plan, ffmpegCommand: displayedCommand } }, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, "xgxs-edit-plan.json");
  }

  function downloadSrt() {
    if (!plan?.captions.length) return;
    const blob = new Blob([captionsToSrt(plan.captions)], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, "captions.srt");
  }

  async function copyCommand() {
    if (!displayedCommand) return;
    await navigator.clipboard.writeText(displayedCommand);
    setNotice("FFmpeg 命令已复制。");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Clapperboard size={22} />
          </div>
          <div>
            <h1>烁影</h1>
            <p>{file ? file.name : "素材未载入"}</p>
          </div>
        </div>
        <div className="top-actions">
          <StatusPill icon={<Gauge size={15} />} label={duration ? formatTime(duration) : "00:00.00"} />
          <StatusPill icon={<BadgeCheck size={15} />} label={mode === "ai" ? "AI 方案" : mode === "local" ? "本地方案" : "待分析"} />
          <button className="icon-button" type="button" onClick={downloadPlan} disabled={!plan} aria-label="下载剪辑方案">
            <Download size={18} />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel source-panel">
          <div className="panel-title">
            <FileVideo size={18} />
            <span>素材</span>
          </div>

          <label className="dropzone">
            <input type="file" accept="video/*" onChange={handleFile} />
            <Upload size={26} />
            <strong>{file ? "更换视频" : "导入视频"}</strong>
            <span>{file ? readableBytes(file.size) : "MP4 / MOV / WebM"}</span>
          </label>

          <div className="field">
            <label>内容主题</label>
            <input
              value={settings.brief}
              onChange={(event) => setSettings({ ...settings, brief: event.target.value })}
              placeholder="例如：新品测评、课程片段、探店记录"
            />
          </div>

          <div className="field">
            <label>口播稿 / 字幕稿</label>
            <textarea
              value={settings.transcript}
              onChange={(event) => setSettings({ ...settings, transcript: event.target.value })}
              placeholder="粘贴已有文案会提升选段和字幕质量"
            />
          </div>

          <div className="field-grid">
            <Switch checked={settings.addCaptions} label="烧录字幕" onChange={(checked) => setSettings({ ...settings, addCaptions: checked })} />
            <Switch checked={settings.keepOriginalAudio} label="保留原声" onChange={(checked) => setSettings({ ...settings, keepOriginalAudio: checked })} />
          </div>
        </aside>

        <section className="stage">
          <div className="preview-frame">
            {videoUrl ? (
              <video ref={videoRef} src={videoUrl} controls onLoadedMetadata={handleLoadedMetadata} />
            ) : (
              <div className="empty-preview">
                <Scissors size={42} />
                <span>等待素材</span>
              </div>
            )}
          </div>

          <div className="timeline-panel">
            <div className="timeline-head">
              <div>
                <span>时间线</span>
                <strong>{selectedDuration ? `${Math.round(selectedDuration)}s 成片` : "未生成"}</strong>
              </div>
              <div className="timeline-stats">
                <span>{dimensions.width && dimensions.height ? `${dimensions.width} x ${dimensions.height}` : "0 x 0"}</span>
                <span>{plan ? `${plan.segments.length} 段` : "0 段"}</span>
              </div>
            </div>
            <div className="waveform" aria-label="视频波形">
              {bars.map((height, index) => (
                <i
                  key={index}
                  style={{ height: `${height}%` }}
                  className={isBarSelected(index, bars.length, plan, sourceDuration) ? "selected" : ""}
                />
              ))}
              {plan?.segments.map((segment) => (
                <span
                  key={segment.id}
                  className="segment-range"
                  style={{
                    left: `${(segment.start / sourceDuration) * 100}%`,
                    width: `${Math.max(1.5, ((segment.end - segment.start) / sourceDuration) * 100)}%`
                  }}
                />
              ))}
            </div>
            <div className="command-row">
              <button className="primary-button" type="button" onClick={analyze} disabled={!metadata || status !== "idle"}>
                {status === "analyzing" ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
                <span>智能分析</span>
              </button>
              <button className="secondary-button" type="button" onClick={render} disabled={!file || !plan || status !== "idle"}>
                {status === "rendering" ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
                <span>渲染成片</span>
              </button>
              <button className="icon-button" type="button" onClick={copyCommand} disabled={!displayedCommand} aria-label="复制 FFmpeg 命令">
                <Clipboard size={18} />
              </button>
            </div>
            {notice ? <p className="notice">{notice}</p> : null}
          </div>

          <div className="output-panel">
            <div className="panel-title">
              <Download size={18} />
              <span>成片输出</span>
            </div>
            {renderUrl ? (
              <>
                <video src={renderUrl} controls />
                <a href={renderUrl} download="xgxs-output.mp4">
                  <Download size={16} />
                  下载成片
                </a>
              </>
            ) : (
              <div className="output-empty">
                <Play size={34} />
                <strong>这里会生成剪辑后的视频</strong>
                <span>先在“剪辑片段”里分割/增删片段，再点击“渲染成片”。</span>
              </div>
            )}
          </div>
        </section>

        <aside className="panel director-panel">
          <div className="panel-title">
            <Sparkles size={18} />
            <span>导演参数</span>
          </div>

          <Segmented label="平台" value={settings.platform} options={platforms} onChange={(platform) => setSettings({ ...settings, platform })} />
          <Segmented label="比例" value={settings.aspectRatio} options={aspectRatios} onChange={(aspectRatio) => setSettings({ ...settings, aspectRatio })} />
          <Segmented label="风格" value={settings.style} options={styles} onChange={(style) => setSettings({ ...settings, style })} />

          <Slider label="目标时长" suffix="s" min={8} max={180} value={settings.targetDuration} onChange={(targetDuration) => setSettings({ ...settings, targetDuration })} />
          <Slider label="节奏强度" suffix="%" min={1} max={100} value={settings.intensity} onChange={(intensity) => setSettings({ ...settings, intensity })} />

          <div className="music-card">
            <div className="panel-title">
              <FileAudio size={18} />
              <span>背景音乐</span>
            </div>
            <div className="online-music">
              {onlineMusicPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={selectedOnlineMusic === preset.id ? "active" : ""}
                  onClick={() => handleOnlineMusic(preset.id)}
                  disabled={status !== "idle"}
                >
                  <strong>{preset.name}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>
            <label className="audio-drop">
              <input type="file" accept="audio/*" onChange={handleMusic} />
              <Upload size={18} />
              <strong>{musicFile ? "更换本地音乐" : "上传本地音乐"}</strong>
            </label>
            {musicFile ? <p className="music-name">{musicFile.name}</p> : null}
            {musicUrl ? <audio src={musicUrl} controls /> : null}
            <Switch
              checked={settings.addBackgroundMusic}
              label="混入背景音乐"
              onChange={(checked) => setSettings({ ...settings, addBackgroundMusic: checked })}
            />
            <Slider label="原声音量" suffix="%" min={0} max={120} value={settings.originalVolume} onChange={(originalVolume) => setSettings({ ...settings, originalVolume })} />
            <Slider label="音乐音量" suffix="%" min={0} max={120} value={settings.musicVolume} onChange={(musicVolume) => setSettings({ ...settings, musicVolume })} />
          </div>
        </aside>
      </section>

      <section className="editor-grid">
        <section className="panel caption-editor">
          <div className="section-heading with-actions">
            <div>
              <Captions size={18} />
              <h2>字幕编辑</h2>
            </div>
            <div className="section-actions">
              <button className="compact-button" type="button" onClick={addCaption} disabled={!metadata}>
                <Plus size={16} />
                添加字幕
              </button>
              <button className="compact-button" type="button" onClick={downloadSrt} disabled={!plan?.captions.length}>
                <Download size={16} />
                导出 SRT
              </button>
            </div>
          </div>
          <div className="caption-header">
            <span>开始秒</span>
            <span>结束秒</span>
            <span>字幕文字</span>
            <span>操作</span>
          </div>
          <div className="caption-list">
            {(plan?.captions || []).map((caption, index) => (
              <div className="caption-row" key={`caption-${index}`}>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={caption.start}
                  aria-label="字幕开始时间"
                  onChange={(event) => updateCaption(index, { start: Number(event.target.value) })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={caption.end}
                  aria-label="字幕结束时间"
                  onChange={(event) => updateCaption(index, { end: Number(event.target.value) })}
                />
                <input value={caption.text} aria-label="字幕内容" onChange={(event) => updateCaption(index, { text: event.target.value })} />
                <button className="icon-button danger" type="button" onClick={() => deleteCaption(index)} aria-label="删除字幕">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!plan?.captions.length ? <EmptyLine label={metadata ? "点击添加字幕，或先智能分析生成字幕草稿" : "先导入视频，再添加字幕"} /> : null}
          </div>
        </section>

        <section className="panel segment-editor">
          <div className="section-heading with-actions">
            <div>
              <Scissors size={18} />
              <h2>剪辑片段</h2>
            </div>
            <div className="section-actions">
              <button className="compact-button" type="button" onClick={addSegmentAtPlayhead} disabled={!metadata}>
                <Plus size={16} />
                添加片段
              </button>
              <button className="compact-button" type="button" onClick={splitAtPlayhead} disabled={!metadata}>
                <Scissors size={16} />
                按播放点分割
              </button>
            </div>
          </div>
          <div className="segment-header">
            <span>开始秒</span>
            <span>结束秒</span>
            <span>片段名称</span>
            <span>倍速</span>
            <span>操作</span>
          </div>
          <div className="segment-edit-list">
            {(plan?.segments || []).map((segment, index) => (
              <div className="segment-row" key={segment.id}>
                <input type="number" min="0" step="0.1" value={segment.start} aria-label="片段开始时间" onChange={(event) => updateSegment(index, { start: Number(event.target.value) })} />
                <input type="number" min="0" step="0.1" value={segment.end} aria-label="片段结束时间" onChange={(event) => updateSegment(index, { end: Number(event.target.value) })} />
                <input value={segment.label} aria-label="片段名称" onChange={(event) => updateSegment(index, { label: event.target.value })} />
                <input type="number" min="0.5" max="2" step="0.1" value={segment.speed} aria-label="片段倍速" onChange={(event) => updateSegment(index, { speed: Number(event.target.value) })} />
                <button className="icon-button danger" type="button" onClick={() => deleteSegment(index)} aria-label="删除片段">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!plan?.segments.length ? <EmptyLine label={metadata ? "点击添加片段，或先智能分析生成剪辑片段" : "先导入视频，再剪辑片段"} /> : null}
          </div>
        </section>
      </section>

      <section className="results">
        <ResultBlock icon={<Music2 size={17} />} title="声音 / 色彩">
          <p>{plan?.musicDirection || "智能分析后生成音乐建议；也可以直接在右侧选择在线音乐。"}</p>
          <p>{plan?.colorDirection || "智能分析后生成调色建议。"}</p>
        </ResultBlock>
        <ResultBlock icon={<Check size={17} />} title="发布">
          {(plan?.titleOptions || []).slice(0, 3).map((title) => (
            <p key={title}>{title}</p>
          ))}
          {plan?.hashtags?.length ? <p>{plan.hashtags.map((tag) => `#${tag}`).join(" ")}</p> : <p>智能分析后生成标题、简介和标签。</p>}
        </ResultBlock>
        <ResultBlock icon={<Volume2 size={17} />} title="导出命令">
          <p>{displayedCommand || "生成剪辑方案后，可复制完整 FFmpeg 命令。"}</p>
        </ResultBlock>
      </section>
    </main>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-field">
      <label>{label}</label>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({
  label,
  suffix,
  min,
  max,
  value,
  onChange
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider-field">
      <div>
        <label>{label}</label>
        <strong>
          {value}
          {suffix}
        </strong>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span />
      <b>{label}</b>
    </label>
  );
}

function StatusPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="status-pill">
      {icon}
      {label}
    </span>
  );
}

function ResultBlock({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="result-block">
      <div>
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return (
    <div className="empty-line">
      <span>{label}</span>
    </div>
  );
}

function readableBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

function buildWaveformBars(seed: string, count: number) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index * 0.55 + hash * 0.00001) * 0.5 + 0.5;
    const pulse = Math.sin(index * 0.17 + hash * 0.00003) * 0.5 + 0.5;
    return Math.round(18 + wave * 54 + pulse * 22);
  });
}

function isBarSelected(index: number, count: number, plan: EditPlan | null, duration: number) {
  if (!plan || duration <= 0) return false;
  const time = (index / Math.max(1, count - 1)) * duration;
  return plan.segments.some((segment) => time >= segment.start && time <= segment.end);
}

function roundClientTime(value: number) {
  return Math.round(Math.max(0, value) * 10) / 10;
}

function withSegments(plan: EditPlan, segments: EditSegment[]) {
  const safeSegments = segments
    .map((segment) => ({
      ...segment,
      start: roundClientTime(Math.max(0, segment.start)),
      end: roundClientTime(Math.max(segment.start + 0.1, segment.end)),
      speed: Math.min(2, Math.max(0.5, segment.speed || 1))
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  const estimatedDuration = roundClientTime(
    safeSegments.reduce((sum, segment) => sum + (segment.end - segment.start) / Math.max(0.5, segment.speed || 1), 0)
  );
  return { ...plan, segments: safeSegments, estimatedDuration };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
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

async function createOnlineMusicFile(tone: string, bpm: number, fileName: string) {
  const sampleRate = 44100;
  const seconds = 24;
  const context = new OfflineAudioContext(2, sampleRate * seconds, sampleRate);
  const beat = 60 / bpm;
  const root = tone === "soft" ? 220 : tone === "business" ? 164.81 : 261.63;
  const scale = tone === "soft" ? [0, 3, 7, 10] : tone === "business" ? [0, 4, 7, 11] : [0, 4, 7, 12];

  for (let bar = 0; bar < seconds / beat; bar += 1) {
    const time = bar * beat;
    const note = root * 2 ** (scale[bar % scale.length] / 12);
    addTone(context, note, time, tone === "soft" ? 0.08 : 0.11, beat * 0.55, tone === "business" ? "sawtooth" : "triangle");
    if (bar % 2 === 0) addTone(context, root / 2, time, 0.12, beat * 0.35, "sine");
    if (tone !== "soft") addNoiseHat(context, time + beat * 0.5, 0.035, 0.05);
  }

  const buffer = await context.startRendering();
  const wav = audioBufferToWav(buffer);
  return new File([wav], fileName, { type: "audio/wav" });
}

function addTone(
  context: OfflineAudioContext,
  frequency: number,
  start: number,
  volume: number,
  duration: number,
  type: OscillatorType
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function addNoiseHat(context: OfflineAudioContext, start: number, volume: number, duration: number) {
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain).connect(context.destination);
  source.start(start);
}

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length * channels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  let offset = 0;
  writeString(view, offset, "RIFF");
  offset += 4;
  view.setUint32(offset, length - 8, true);
  offset += 4;
  writeString(view, offset, "WAVE");
  offset += 4;
  writeString(view, offset, "fmt ");
  offset += 4;
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channels, true);
  offset += 2;
  view.setUint32(offset, buffer.sampleRate, true);
  offset += 4;
  view.setUint32(offset, buffer.sampleRate * channels * 2, true);
  offset += 4;
  view.setUint16(offset, channels * 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString(view, offset, "data");
  offset += 4;
  view.setUint32(offset, length - offset - 4, true);
  offset += 4;

  for (let index = 0; index < buffer.length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}
