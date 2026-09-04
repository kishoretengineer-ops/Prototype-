import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  FileAudio,
  HardDriveDownload,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  UploadCloud,
  Waves,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiPostForm } from "@/lib/api";

interface AnalysisResult {
  id: string;
  classification: "AI-generated" | "Likely human";
  confidence: number;
  duration_seconds: number;
  truncated: boolean;
  file_name: string;
  model_id: string;
  temporary_file_purged: boolean;
}

type AudioSource = "upload" | "record";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".wav", ".mp3", ".m4a", ".webm"];

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError && typeof error.body === "object" && error.body !== null && "detail" in error.body) {
    return String(error.body.detail);
  }
  if (error instanceof Error) return error.message;
  return "We could not analyze this file. Please try again.";
}

function fileSizeLabel(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function Home() {
  const [source, setSource] = useState<AudioSource>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const analysis = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiPostForm<AnalysisResult>("/analyze", form);
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (mutationError) => {
      setResult(null);
      setError(getErrorMessage(mutationError));
    },
  });

  useEffect(() => {
    if (!isRecording || isPaused) return;
    const timer = window.setInterval(() => {
      setRecordingSeconds((current) => {
        if (current >= 60) {
          recorderRef.current?.stop();
          return 60;
        }
        return current + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPaused, isRecording]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const setFile = (file: File) => {
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError("That format is not supported. Choose WAV, MP3, M4A, or WebM audio.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 25 MB. Choose a smaller audio file.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Microphone recording is not available in this browser. Upload an audio file instead.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setFile(new File([blob], `verity-recording-${Date.now()}.webm`, { type: "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setIsRecording(false);
        setIsPaused(false);
      };
      recorder.start(250);
      setRecordingSeconds(0);
      setError(null);
      setResult(null);
      setIsRecording(true);
      setIsPaused(false);
    } catch {
      setError("Microphone access was not granted. Check your browser permission and try again.");
    }
  };

  const stopRecording = () => recorderRef.current?.stop();

  const clearSelection = () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setRecordingSeconds(0);
    setIsRecording(false);
    setIsPaused(false);
  };

  const confidencePercent = result ? Math.round(result.confidence * 100) : 0;
  const isAi = result?.classification === "AI-generated";

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900" data-testid="verity-voice-app">
      <div className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(circle_at_50%_0%,rgba(2,132,199,0.08),transparent_48%)]" />
      <header className="relative z-10 border-b border-slate-200/80 bg-white/85 backdrop-blur-md" data-testid="app-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3" data-testid="brand-lockup">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-lg shadow-sky-600/20" data-testid="brand-mark">
              <Waves className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-lg font-bold tracking-tight text-slate-950" data-testid="brand-name">Verity Voice</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500" data-testid="brand-tagline">Audio authenticity lab</p>
            </div>
          </div>
          <div className="hidden items-center gap-3 sm:flex" data-testid="header-status-group">
            <Badge variant="outline" className="gap-1.5 border-sky-200 bg-sky-50 text-sky-700" data-testid="model-badge">
              <Activity className="size-3" aria-hidden="true" /> Hugging Face model
            </Badge>
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500" data-testid="service-status">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" aria-hidden="true" /> Ready for a sample
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="mb-10 max-w-3xl" data-testid="hero-section">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700" data-testid="hero-eyebrow">
            <ShieldCheck className="size-4" aria-hidden="true" /> Voice integrity screening
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl" data-testid="hero-heading">
            Is this voice <span className="text-sky-600">really human?</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg" data-testid="hero-description">
            Submit a short recording and get a fast, transparent signal from a research-grade audio classifier. Nothing is saved after your check.
          </p>
        </section>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
          <section className="space-y-6 lg:col-span-7" data-testid="analysis-workspace">
            <Card className="overflow-visible border-slate-200/90 bg-white/90 shadow-[0_20px_55px_rgba(15,23,42,0.07)]" data-testid="audio-input-card">
              <CardHeader className="border-b border-slate-100 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400" data-testid="input-step-label">01 / Input signal</p>
                    <CardTitle className="font-heading text-2xl font-semibold text-slate-950" data-testid="input-card-title">Choose a source</CardTitle>
                  </div>
                  <div className="hidden size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 sm:flex" data-testid="input-card-icon">
                    <FileAudio className="size-5" aria-hidden="true" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Audio source" data-testid="audio-source-tabs">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={source === "upload"}
                    onClick={() => setSource("upload")}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${source === "upload" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                    data-testid="upload-source-tab"
                  >
                    <UploadCloud className="size-4" aria-hidden="true" /> Upload audio
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={source === "record"}
                    onClick={() => setSource("record")}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${source === "record" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                    data-testid="record-source-tab"
                  >
                    <Mic className="size-4" aria-hidden="true" /> Record microphone
                  </button>
                </div>

                {source === "upload" ? (
                  <label
                    htmlFor="audio-file-input"
                    onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(event) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files[0]; if (file) setFile(file); }}
                    className={`group block cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-[border-color,background-color,transform] duration-200 sm:p-10 ${isDragging ? "scale-[1.01] border-sky-500 bg-sky-50" : "border-slate-300 bg-slate-50/75 hover:border-sky-400 hover:bg-sky-50/60"}`}
                    data-testid="audio-upload-dropzone"
                  >
                    <input id="audio-file-input" type="file" accept=".wav,.mp3,.m4a,.webm,audio/wav,audio/mpeg,audio/mp4,audio/webm" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) setFile(file); }} data-testid="audio-file-input" />
                    <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm ring-1 ring-slate-200 transition-transform duration-200 group-hover:-translate-y-1" data-testid="upload-icon">
                      <UploadCloud className="size-6" aria-hidden="true" />
                    </span>
                    <span className="block font-heading text-lg font-semibold text-slate-900" data-testid="upload-prompt">Drop an audio file here</span>
                    <span className="mt-2 block text-sm text-slate-500" data-testid="upload-secondary-prompt">or browse from your device</span>
                    <span className="mt-5 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500" data-testid="upload-file-spec">WAV · MP3 · M4A · WebM · up to 25 MB</span>
                  </label>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8" data-testid="audio-recorder-zone">
                    <div className="flex min-h-32 flex-col items-center justify-center text-center">
                      <div className={`mb-4 flex size-16 items-center justify-center rounded-full ${isRecording ? "bg-rose-100 text-rose-600" : "bg-sky-100 text-sky-700"}`} data-testid="recorder-status-icon">
                        {isRecording ? <Activity className="size-7 animate-pulse" aria-hidden="true" /> : <Mic className="size-7" aria-hidden="true" />}
                      </div>
                      <p className="font-heading text-xl font-semibold text-slate-900" data-testid="recorder-title">{isRecording ? (isPaused ? "Recording paused" : "Recording in progress") : "Record a voice sample"}</p>
                      <p className="mt-2 font-mono text-2xl tracking-tight text-slate-700" data-testid="recorder-timer">{formatDuration(recordingSeconds)} <span className="text-xs text-slate-400">/ 01:00 max</span></p>
                    </div>
                    <div className="mt-5 flex justify-center gap-2">
                      {!isRecording ? (
                        <Button type="button" onClick={startRecording} className="gap-2 bg-sky-600 text-white shadow-lg shadow-sky-600/20 hover:bg-sky-700" data-testid="record-mic-button"><Mic className="size-4" aria-hidden="true" /> Start recording</Button>
                      ) : (
                        <>
                          <Button type="button" variant="outline" onClick={() => { recorderRef.current?.pause(); setIsPaused(true); }} disabled={isPaused} className="gap-2" data-testid="pause-recording-button"><Pause className="size-4" aria-hidden="true" /> Pause</Button>
                          <Button type="button" variant="outline" onClick={() => { recorderRef.current?.resume(); setIsPaused(false); }} disabled={!isPaused} className="gap-2" data-testid="resume-recording-button"><Play className="size-4" aria-hidden="true" /> Resume</Button>
                          <Button type="button" variant="destructive" onClick={stopRecording} className="gap-2" data-testid="stop-recording-button"><Square className="size-4 fill-current" aria-hidden="true" /> Use recording</Button>
                        </>
                      )}
                    </div>
                    <p className="mt-5 text-center text-xs leading-5 text-slate-500" data-testid="recorder-note">Your browser will ask for microphone permission. Audio is converted to mono 16 kHz for analysis.</p>
                  </div>
                )}

                {selectedFile && previewUrl && (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4" data-testid="audio-preview-player">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm" data-testid="preview-file-icon"><FileAudio className="size-4" aria-hidden="true" /></span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800" data-testid="preview-file-name">{selectedFile.name}</p>
                          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500" data-testid="preview-file-meta">{fileSizeLabel(selectedFile.size)} · auto-normalized to mono 16 kHz</p>
                        </div>
                      </div>
                      <button type="button" onClick={clearSelection} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700" aria-label="Remove selected audio" data-testid="remove-audio-button"><X className="size-4" aria-hidden="true" /></button>
                    </div>
                    <audio controls src={previewUrl} className="h-10 w-full" data-testid="audio-player" />
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="analysis-action-row">
                  <div className="flex items-center gap-2 text-xs text-slate-500" data-testid="privacy-badge">
                    <HardDriveDownload className="size-4 text-emerald-600" aria-hidden="true" /> Temporary file purged after check
                  </div>
                  <Button type="button" onClick={() => selectedFile && analysis.mutate(selectedFile)} disabled={!selectedFile || analysis.isPending || isRecording} className="h-11 gap-2 bg-sky-600 px-5 text-white shadow-lg shadow-sky-600/20 hover:bg-sky-700" data-testid="analyze-audio-button">
                    {analysis.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Activity className="size-4" aria-hidden="true" />}
                    {analysis.isPending ? "Analyzing signal…" : "Analyze audio"}
                  </Button>
                </div>
                {analysis.isPending && <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800" data-testid="analysis-loading-state"><div className="flex items-center gap-3"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /><span data-testid="analysis-loading-copy">Preparing the signal. The first run may download the classifier.</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full w-2/5 animate-[loading-bar_1.5s_ease-in-out_infinite] rounded-full bg-sky-500" /></div></div>}
                {error && <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert" data-testid="analysis-error"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div className="flex-1"><p className="font-semibold" data-testid="analysis-error-title">Analysis needs a retry</p><p className="mt-1 leading-5" data-testid="analysis-error-message">{error}</p></div><button type="button" onClick={() => selectedFile && analysis.mutate(selectedFile)} disabled={!selectedFile || analysis.isPending} className="shrink-0 rounded-md p-1.5 text-rose-700 transition-colors hover:bg-rose-100" aria-label="Retry analysis" data-testid="retry-analysis-button"><RotateCcw className="size-4" aria-hidden="true" /></button></div>}
              </CardContent>
            </Card>

            <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-white/75 px-5 py-4 shadow-sm" data-testid="model-status-alert">
              <CircleHelp className="mt-0.5 size-5 shrink-0 text-sky-600" aria-hidden="true" />
              <div><p className="text-sm font-semibold text-slate-800" data-testid="model-status-title">About the first check</p><p className="mt-1 text-sm leading-6 text-slate-600" data-testid="model-status-copy">The classifier loads lazily, so your first analysis may take longer while the public model downloads. If the connection is interrupted, you’ll get a clear retry instead of a guessed result.</p></div>
            </div>
          </section>

          <aside className="space-y-6 lg:col-span-5" data-testid="results-panel">
            <Card className={`border-slate-200/90 bg-white/90 shadow-[0_20px_55px_rgba(15,23,42,0.07)] ${result ? "ring-2 ring-sky-100" : ""}`} data-testid="result-card">
              <CardHeader className="border-b border-slate-100 pb-5">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400" data-testid="result-step-label">02 / Verification readout</p>
                <CardTitle className="font-heading text-2xl font-semibold text-slate-950" data-testid="result-card-title">Your signal report</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {result ? (
                  <div className="space-y-6" data-testid="analysis-result">
                    <div className={`rounded-2xl border p-5 ${isAi ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`} data-testid="classification-result-panel">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500" data-testid="classification-label">Classification</p>
                          <p className={`mt-2 font-heading text-2xl font-bold ${isAi ? "text-rose-700" : "text-emerald-700"}`} data-testid="classification-result-badge">{result.classification}</p>
                        </div>
                        <span className={`flex size-12 items-center justify-center rounded-full ${isAi ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`} data-testid="classification-result-icon">{isAi ? <AlertCircle className="size-6" aria-hidden="true" /> : <CheckCircle2 className="size-6" aria-hidden="true" />}</span>
                      </div>
                    </div>
                    <div data-testid="confidence-score-meter">
                      <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800" data-testid="confidence-label">Confidence signal</p><p className="mt-1 text-xs text-slate-500" data-testid="confidence-description">Model probability for the winning class</p></div><p className="font-mono text-3xl font-semibold tracking-tight text-slate-950" data-testid="confidence-percentage">{confidencePercent}%</p></div>
                      <div className="relative h-4 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner"><div className={`h-full rounded-full transition-[width] duration-700 ${isAi ? "bg-gradient-to-r from-rose-600 to-rose-400" : "bg-gradient-to-r from-emerald-600 to-emerald-400"}`} style={{ width: `${confidencePercent}%` }} data-testid="confidence-meter-fill" /></div>
                      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-slate-400" data-testid="confidence-scale"><span>0% signal</span><span>50% threshold</span><span>100% signal</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3" data-testid="analysis-metadata">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-slate-400" data-testid="duration-label">Duration analyzed</p><p className="mt-2 font-mono text-lg font-semibold text-slate-800" data-testid="duration-value">{formatDuration(result.duration_seconds)}</p></div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-slate-400" data-testid="purge-label">Privacy status</p><p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700" data-testid="purge-value"><CheckCircle2 className="size-4" aria-hidden="true" /> Purged</p></div>
                    </div>
                    {result.truncated && <p className="text-xs leading-5 text-amber-700" data-testid="truncation-note">Only the first 60 seconds were analyzed.</p>}
                  </div>
                ) : (
                  <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center" data-testid="empty-result-state">
                    <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200" data-testid="empty-result-icon"><Waves className="size-6" aria-hidden="true" /></span>
                    <p className="font-heading text-lg font-semibold text-slate-800" data-testid="empty-result-title">No signal checked yet</p>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500" data-testid="empty-result-copy">Add an audio sample on the left, then run a check to see the confidence readout here.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5" data-testid="probabilistic-disclaimer-card">
              <div className="flex gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" /><div><p className="text-sm font-semibold text-amber-900" data-testid="disclaimer-title">Use this as a screening signal</p><p className="mt-1 text-sm leading-6 text-amber-800/85" data-testid="disclaimer-copy">This result is a probabilistic AI estimate, not forensic proof. Audio quality, compression, language, and new generation methods can affect the model’s confidence.</p></div></div>
            </div>
          </aside>
        </div>
        <footer className="mt-10 flex flex-col gap-2 border-t border-slate-200/80 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between" data-testid="app-footer"><span data-testid="footer-copy">Verity Voice · built for responsible audio verification</span><span className="font-mono uppercase tracking-wider" data-testid="footer-limits">25 MB max · 60 sec analyzed · no history</span></footer>
      </div>
    </main>
  );
}