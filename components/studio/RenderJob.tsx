"use client";

import { useEffect, useState } from "react";

import ArtifactCard from "@/components/studio/artifacts";
import GraphView from "@/components/studio/GraphView";
import type { Block, NodeState } from "@/components/studio/thread";
import type { Artifact, GraphNodeShape } from "@/lib/agent/events";

/**
 * A render happening somewhere else.
 *
 * On a deployment `make_video` queues the job and the turn ends, because a cut
 * measured 27.6 minutes against a five-minute function ceiling. So the transcript
 * cannot stream this one — it has to go and look.
 *
 * The important part is that it looks *the same*. The worker records node states
 * in the shape the live graph view already consumes, so this hands them straight
 * to `GraphView` and the finished cut to the same `ArtifactCard` an inline render
 * produces. One renderer, two transports: a queued render and a live one are
 * indistinguishable to the person watching, which is the only way the promise
 * that you can watch the machine work survives moving the work off the request.
 */

type JobState = {
  status: "queued" | "running" | "done" | "failed";
  progress?: {
    template?: string;
    nodes?: GraphNodeShape[];
    state?: Record<string, NodeState>;
  };
  result?: { video?: Artifact } | null;
  error?: string | null;
};

/**
 * How often to ask.
 *
 * Slow, because the thing being watched is minutes long and a node can take nine
 * of them — a one-second poll would be several thousand requests for a single
 * render and would tell the viewer nothing a five-second one does not. It backs
 * off once the job is running, since a queued job is the impatient case: it is
 * waiting on a worker to pick it up, and the poll is what pokes one.
 */
const interval = (status: JobState["status"]) => (status === "queued" ? 3000 : 6000);

export default function RenderJob({
  block,
}: {
  block: Extract<Block, { kind: "render" }>;
}) {
  const [job, setJob] = useState<JobState>({ status: "queued" });
  const [lost, setLost] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const response = await fetch(`/api/render/job/${block.jobId}`);
        if (!response.ok) throw new Error(await response.text());

        const next = (await response.json()) as JobState;
        if (!live) return;

        setJob(next);
        setLost(null);

        // Terminal: stop asking. Nothing about a finished job changes again.
        if (next.status === "done" || next.status === "failed") return;

        timer = setTimeout(poll, interval(next.status));
      } catch (error) {
        if (!live) return;
        // Kept polling through a failure rather than giving up: a dropped request
        // mid-render is far more likely than the job having gone, and abandoning
        // the poll would strand a render that is still perfectly alive.
        setLost(error instanceof Error ? error.message : String(error));
        timer = setTimeout(poll, 8000);
      }
    };

    void poll();

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [block.jobId]);

  const video = job.result?.video;

  return (
    <div className="stream space-y-3">
      {job.progress?.nodes?.length ? (
        <GraphView
          block={{
            kind: "graph",
            id: `job-${block.jobId}`,
            template: job.progress.template ?? block.template,
            nodes: job.progress.nodes,
            state: job.progress.state ?? {},
          }}
        />
      ) : (
        // Before the worker has reported anything there is no graph to draw, and
        // an empty diagram would read as a render that produced nothing.
        <div className="flex items-center gap-2.5 rounded-2xl border border-rule bg-paper-lift px-4 py-3">
          <span
            aria-hidden
            className="ping relative size-2 shrink-0 rounded-full bg-ember text-ember"
          />
          <p className="text-sm text-graphite">
            {job.status === "queued" ? "Waiting for a renderer" : "Starting the graph"}
          </p>
          <span className="font-mono text-xs text-mute">{block.concept}</span>
        </div>
      )}

      {video ? <ArtifactCard artifact={video} onRunIdea={() => {}} busy={false} /> : null}

      {job.status === "failed" ? (
        <div className="rounded-2xl border border-fail/30 bg-fail/[0.04] p-4">
          <p className="text-sm font-medium text-fail">
            {job.error ?? "The render failed."}
          </p>
          <p className="pretty mt-1.5 text-sm leading-relaxed text-mute">
            Everything before this is kept, so asking again resumes rather than
            starting over.
          </p>
        </div>
      ) : null}

      {/* Only worth saying once it has happened twice — a single missed poll is
          not news, and the render is unaffected either way. */}
      {lost && job.status !== "done" ? (
        <p className="font-mono text-xs text-mute">
          Not reaching the render just now — still trying.
        </p>
      ) : null}
    </div>
  );
}
