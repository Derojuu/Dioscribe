"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type ReportSection = {
  label: string;
  detail: string;
};

type TimelineMoment = {
  start: number;
  end: number;
  heading: string;
  detail: string;
};

type AudioReport = {
  title: string;
  summary: string;
  language: string;
  durationSeconds: number;
  speakers: ReportSection[];
  soundscape: ReportSection[];
  events: TimelineMoment[];
  themes: string[];
  notableQuotes: string[];
  safetyFlags: string[];
  confidenceNotes: string[];
};

type AnalysisResponse = {
  transcript: string;
  report: AudioReport;
};

const allowedTypes = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "audio/mpeg3",
];

const maxFileSize = 20 * 1024 * 1024;
const waveformBars = [44, 64, 28, 76, 40, 84, 34, 58, 24, 70, 46, 62];

function formatSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "Unknown";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-600">
      {children}
    </span>
  );
}

function SectionTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
        {eyebrow}
      </p>
      <h3 className="text-xl font-semibold text-neutral-950">{title}</h3>
    </div>
  );
}

function EmptyStatePanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="border border-black/8 bg-white px-6 py-6 shadow-[0_18px_60px_rgba(29,29,27,0.08)]">
        <SectionTitle
          eyebrow="What you get"
          title="A readable breakdown, not just a wall of text."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            "Who is speaking and how the exchange shifts",
            "Moment-by-moment timeline with scene changes",
            "Background sounds, interruptions, and cues",
            "Key lines, themes, and anything worth flagging",
          ].map((item) => (
            <div
              key={item}
              className="border border-black/8 bg-[#fcfaf5] px-4 py-4 text-sm leading-6 text-neutral-700"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col justify-between border border-black/8 bg-[#1b1b18] px-6 py-6 text-white shadow-[0_18px_60px_rgba(29,29,27,0.14)]">
        <div className="space-y-5">
          <MiniLabel>Listening preview</MiniLabel>
          <div className="grid grid-cols-12 items-end gap-2">
            {waveformBars.map((height, index) => (
              <div
                key={`${height}-${index}`}
                className="rounded-sm bg-[#f6c544]"
                style={{ height: `${height}px` }}
              />
            ))}
          </div>
          <p className="max-w-md text-sm leading-7 text-white/72">
            Drop in a call, interview, memo, lecture, or rough field recording.
            The report is designed to surface what happened, what mattered, and
            what might need another listen.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-3xl font-semibold">1</p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/56">
              Upload
            </p>
          </div>
          <div>
            <p className="text-3xl font-semibold">2</p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/56">
              Transcribe
            </p>
          </div>
          <div>
            <p className="text-3xl font-semibold">3</p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/56">
              Review
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  const fileSummary = useMemo(() => {
    if (!file) {
      return "Drop in one recording and get a full transcript with a structured listening brief.";
    }

    return `${file.name} - ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  }, [file]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setResult(null);
    setError("");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (selectedFile.size > maxFileSize) {
      setFile(null);
      setError("This file is larger than 20 MB. Try a shorter clip or compress it first.");
      return;
    }

    if (selectedFile.type && !allowedTypes.includes(selectedFile.type)) {
      setFile(null);
      setError("Use MP3, MP4, M4A, WAV, MPEG, or WebM for the cleanest handoff.");
      return;
    }

    setFile(selectedFile);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!file) {
      setError("Pick an audio file before running the report.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as
        | AnalysisResponse
        | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload
            ? payload.error ?? "The analysis request failed."
            : "The analysis request failed.";
        throw new Error(message);
      }

      setResult(payload as AnalysisResponse);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something went wrong while analyzing the audio.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f0e4] text-neutral-950">
      <section className="border-b border-black/8 bg-[radial-gradient(circle_at_top_left,#fff7c7_0%,#f6f0e4_48%,#efe6d6_100%)]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-8 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:py-10">
          <div className="space-y-8">
            <div className="flex flex-wrap gap-2">
              <MiniLabel>Sound Brief</MiniLabel>
              <MiniLabel>Audio intelligence</MiniLabel>
            </div>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold leading-[0.96] tracking-tight sm:text-6xl lg:text-7xl">
                Listen once.
                <br />
                Review everything.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-neutral-700 sm:text-lg">
                Upload a recording and get back a transcript, a clean summary,
                speaker notes, ambient cues, and a timeline of what unfolded in
                the room.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="border border-black/8 bg-white/72 px-4 py-5 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  Turnaround
                </p>
                <p className="mt-3 text-3xl font-semibold">Fast</p>
              </div>
              <div className="border border-black/8 bg-white/72 px-4 py-5 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  Deliverable
                </p>
                <p className="mt-3 text-3xl font-semibold">Transcript</p>
              </div>
              <div className="border border-black/8 bg-white/72 px-4 py-5 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  Review
                </p>
                <p className="mt-3 text-3xl font-semibold">Timeline</p>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="border border-black/8 bg-[#1b1b18] px-6 py-6 text-white shadow-[0_20px_70px_rgba(29,29,27,0.18)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/58">
                  Upload audio
                </p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight">
                  Run a fresh listening brief.
                </h2>
              </div>
              <div className="hidden h-14 w-14 items-center justify-center border border-white/12 bg-white/6 text-[#f6c544] sm:flex">
                <span className="text-2xl">A</span>
              </div>
            </div>

            <p className="mt-4 max-w-lg text-sm leading-7 text-white/72">
              {fileSummary}
            </p>

            <label className="mt-8 flex cursor-pointer flex-col gap-4 border border-dashed border-white/18 bg-white/6 px-5 py-6 transition hover:border-[#f6c544] hover:bg-white/9">
              <span className="text-base font-medium">Choose recording</span>
              <span className="max-w-sm text-sm leading-7 text-white/62">
                Supports interviews, calls, lectures, meetings, voice notes, and
                field audio in common formats.
              </span>
              <input
                type="file"
                accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,audio/*,video/mp4"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <div className="mt-6 flex flex-wrap gap-2">
              <MiniLabel>MP3</MiniLabel>
              <MiniLabel>WAV</MiniLabel>
              <MiniLabel>M4A</MiniLabel>
              <MiniLabel>WebM</MiniLabel>
              <MiniLabel>Up to 20 MB</MiniLabel>
            </div>

            {error ? (
              <p className="mt-5 border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!file || isSubmitting}
              className="mt-8 inline-flex min-h-12 items-center justify-center bg-[#f6c544] px-5 text-sm font-semibold text-neutral-950 transition hover:bg-[#ffcf57] disabled:cursor-not-allowed disabled:bg-[#8d8459] disabled:text-white/72"
            >
              {isSubmitting ? "Reviewing audio..." : "Generate brief"}
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
        {result ? (
          <>
            <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="border border-black/8 bg-white px-6 py-6 shadow-[0_18px_60px_rgba(29,29,27,0.08)]">
                <div className="flex flex-wrap gap-2">
                  <MiniLabel>{result.report.language}</MiniLabel>
                  <MiniLabel>{formatSeconds(result.report.durationSeconds)}</MiniLabel>
                </div>
                <h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight">
                  {result.report.title}
                </h2>
                <p className="mt-4 max-w-3xl text-base leading-8 text-neutral-700">
                  {result.report.summary}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                <div className="border border-black/8 bg-[#fff7cf] px-5 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Speakers
                  </p>
                  <p className="mt-3 text-3xl font-semibold">
                    {result.report.speakers.length}
                  </p>
                </div>
                <div className="border border-black/8 bg-white px-5 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Sound cues
                  </p>
                  <p className="mt-3 text-3xl font-semibold">
                    {result.report.soundscape.length}
                  </p>
                </div>
                <div className="border border-black/8 bg-white px-5 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    Timeline entries
                  </p>
                  <p className="mt-3 text-3xl font-semibold">
                    {result.report.events.length}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <article className="border border-black/8 bg-white px-6 py-6">
                <SectionTitle eyebrow="People" title="Speakers" />
                <div className="mt-6 space-y-5">
                  {result.report.speakers.map((speaker) => (
                    <div key={speaker.label} className="border-t border-black/8 pt-5 first:border-t-0 first:pt-0">
                      <p className="font-semibold text-neutral-950">{speaker.label}</p>
                      <p className="mt-2 text-sm leading-7 text-neutral-700">
                        {speaker.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="border border-black/8 bg-white px-6 py-6">
                <SectionTitle eyebrow="Environment" title="Soundscape" />
                <div className="mt-6 space-y-5">
                  {result.report.soundscape.map((item) => (
                    <div key={item.label} className="border-t border-black/8 pt-5 first:border-t-0 first:pt-0">
                      <p className="font-semibold text-neutral-950">{item.label}</p>
                      <p className="mt-2 text-sm leading-7 text-neutral-700">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <article className="border border-black/8 bg-white px-6 py-6">
              <SectionTitle eyebrow="Sequence" title="Event timeline" />
              <div className="mt-8 space-y-5">
                {result.report.events.map((event) => (
                  <div
                    key={`${event.start}-${event.end}-${event.heading}`}
                    className="grid gap-3 border-t border-black/8 pt-5 first:border-t-0 first:pt-0 sm:grid-cols-[110px_1fr]"
                  >
                    <p className="text-sm font-medium text-neutral-500">
                      {formatSeconds(event.start)} - {formatSeconds(event.end)}
                    </p>
                    <div>
                      <p className="font-semibold text-neutral-950">{event.heading}</p>
                      <p className="mt-2 text-sm leading-7 text-neutral-700">
                        {event.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <section className="grid gap-6 lg:grid-cols-3">
              <article className="border border-black/8 bg-white px-6 py-6">
                <SectionTitle eyebrow="Signals" title="Themes" />
                <ul className="mt-6 space-y-3 text-sm leading-7 text-neutral-700">
                  {result.report.themes.map((theme) => (
                    <li key={theme}>{theme}</li>
                  ))}
                </ul>
              </article>

              <article className="border border-black/8 bg-white px-6 py-6">
                <SectionTitle eyebrow="Highlights" title="Notable quotes" />
                <ul className="mt-6 space-y-3 text-sm leading-7 text-neutral-700">
                  {result.report.notableQuotes.map((quote) => (
                    <li key={quote}>&ldquo;{quote}&rdquo;</li>
                  ))}
                </ul>
              </article>

              <article className="border border-black/8 bg-white px-6 py-6">
                <SectionTitle eyebrow="Review" title="Notes" />
                <div className="mt-6 space-y-6 text-sm leading-7 text-neutral-700">
                  <div>
                    <p className="font-semibold text-neutral-950">Safety flags</p>
                    <ul className="mt-2 space-y-2">
                      {result.report.safetyFlags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-neutral-950">Confidence notes</p>
                    <ul className="mt-2 space-y-2">
                      {result.report.confidenceNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            </section>

            <article className="border border-black/8 bg-white px-6 py-6">
              <SectionTitle eyebrow="Full text" title="Transcript" />
              <p className="mt-6 whitespace-pre-wrap text-sm leading-8 text-neutral-700">
                {result.transcript}
              </p>
            </article>
          </>
        ) : (
          <EmptyStatePanel />
        )}
      </section>
    </main>
  );
}
