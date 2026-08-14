"use client";

import { useEffect, useRef, useState } from "react";

import { formatMs, type Block, type NodeState } from "@/components/studio/thread";
import type { GraphNodeShape } from "@/lib/agent/events";

/**
 * The template's graph, executing.
 *
 * This is the one thing in the studio that exists because of how the product is
 * built rather than despite it. A template here is not a filter and a font — it
 * is a DAG that casts an actor, generates a master frame, derives every beat's
 * frame from it, drives image-to-video and assembles the cut. Showing that as a
 * progress bar would be throwing away the only genuinely legible thing about it.
 *
 * The picture is derived from the same graph the engine executes: the edges come
 * from the `{{refs}}` in the template, so the diagram cannot drift from the run.
 * A node that fans out over a list carries a second card behind it, because
 * "three clips from three beats" is the fact a reader most wants and the one a
 * flat box hides.
 *
 * Motion here has one job, and it is not decoration: at any moment the diagram
 * must answer "where is it now" before you have read a single label. So exactly
 * one thing moves at a time — the running node breathes, and the edges feeding
 * it show flow — and every other state change is a single short gesture that
 * ends. Everything collapses to a still, legible frame under reduced motion.
 */

const NODE_W = 150;
const NODE_H = 44;
const COL_GAP = 22;
const ROW_GAP = 32;
/** Lanes on both sides for skip edges. An SVG clips anything drawn past its width. */
const GUTTER = 72;

type Placed = GraphNodeShape & { x: number; y: number; level: number };

/**
 * Longest-path levelling.
 *
 * Shortest-path would let a node sit beside its own dependency whenever another
 * route to it was longer, which draws an edge going backwards up the picture.
 */
/**
 * An axis-aligned path with rounded corners, from a list of waypoints.
 *
 * Skip edges are routed as right angles rather than curves because a bezier
 * long enough to clear two rows swings so wide it stops reading as a connection
 * at all. A right angle in a lane is how every wiring diagram has solved this.
 */
const orthogonal = (points: [number, number][], radius = 9) => {
  let d = `M${points[0][0]},${points[0][1]}`;

  for (let index = 1; index < points.length - 1; index++) {
    const [px, py] = points[index - 1];
    const [cx, cy] = points[index];
    const [nx, ny] = points[index + 1];

    const r = Math.min(
      radius,
      Math.hypot(cx - px, cy - py) / 2,
      Math.hypot(nx - cx, ny - cy) / 2
    );

    d += ` L${cx - Math.sign(cx - px) * r},${cy - Math.sign(cy - py) * r}`;
    d += ` Q${cx},${cy} ${cx + Math.sign(nx - cx) * r},${cy + Math.sign(ny - cy) * r}`;
  }

  const [lx, ly] = points[points.length - 1];
  return `${d} L${lx},${ly}`;
};

const layout = (nodes: GraphNodeShape[]) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const levels = new Map<string, number>();

  const levelOf = (id: string, seen = new Set<string>()): number => {
    if (levels.has(id)) return levels.get(id)!;
    if (seen.has(id)) return 0;

    seen.add(id);
    const node = byId.get(id);
    const deps = node?.deps.filter((dep) => byId.has(dep)) ?? [];
    const level = deps.length
      ? 1 + Math.max(...deps.map((dep) => levelOf(dep, seen)))
      : 0;

    levels.set(id, level);
    return level;
  };

  for (const node of nodes) levelOf(node.id);

  const rows = new Map<number, GraphNodeShape[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    rows.set(level, [...(rows.get(level) ?? []), node]);
  }

  const widest = Math.max(...[...rows.values()].map((row) => row.length), 1);
  const columns = widest * NODE_W + (widest - 1) * COL_GAP;
  const width = columns + GUTTER * 2;
  const placed: Placed[] = [];

  for (const [level, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const rowWidth = row.length * NODE_W + (row.length - 1) * COL_GAP;
    const offset = GUTTER + (columns - rowWidth) / 2;

    row.forEach((node, index) => {
      placed.push({
        ...node,
        level,
        x: offset + index * (NODE_W + COL_GAP),
        y: level * (NODE_H + ROW_GAP),
      });
    });
  }

  const height = (rows.size - 1) * (NODE_H + ROW_GAP) + NODE_H;
  return { placed, width, height };
};

const STATUS_RING: Record<NodeState["status"], string> = {
  idle: "border-rule bg-paper-lift text-mute",
  running: "border-ember bg-paper-lift text-graphite",
  ok: "border-graphite/25 bg-paper-lift text-graphite",
  failed: "border-fail bg-fail/5 text-fail",
};

const EMPTY_STATE: NodeState = { status: "idle", runs: 0 };

/**
 * Which nodes have changed state since the last render.
 *
 * One-shot gestures — the settle on completion, the shake on failure — have to
 * fire on the *transition*, not on the state. Keying off the state alone means
 * a graph reopened from storage plays every completion at once, which says
 * "this all just happened" about a run that finished yesterday.
 */
const useTransitions = (
  nodes: GraphNodeShape[],
  state: Record<string, NodeState>
) => {
  const seen = useRef<Record<string, NodeState["status"]>>({});
  const [changed, setChanged] = useState<Record<string, true>>({});

  useEffect(() => {
    const fresh: Record<string, true> = {};

    for (const node of nodes) {
      const status = state[node.id]?.status ?? "idle";
      const previous = seen.current[node.id];

      if (previous !== undefined && previous !== status) fresh[node.id] = true;
      seen.current[node.id] = status;
    }

    if (Object.keys(fresh).length) {
      setChanged((current) => ({ ...current, ...fresh }));
    }
  }, [nodes, state]);

  return changed;
};

/** A clock that only ticks while something is actually waiting on one. */
const useElapsedTick = (active: boolean) => {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => bump((count) => count + 1), 500);
    return () => clearInterval(timer);
  }, [active]);
};

export default function GraphView({
  block,
}: {
  block: Extract<Block, { kind: "graph" }>;
}) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const { placed, width, height } = layout(block.nodes);
  const byId = new Map(placed.map((node) => [node.id, node]));

  const changed = useTransitions(block.nodes, block.state);

  const running = placed.find(
    (node) => block.state[node.id]?.status === "running"
  );
  useElapsedTick(Boolean(running));

  const done = block.nodes.filter(
    (node) => block.state[node.id]?.status === "ok"
  ).length;
  const failed = block.nodes.some(
    (node) => block.state[node.id]?.status === "failed"
  );

  /**
   * Keep the executing node in view.
   *
   * A graph wider than the column scrolls sideways, and the node that matters
   * is whichever one is running — which on a deep template is routinely the one
   * off the right edge. Only the horizontal scroller is touched, never the page:
   * `scrollIntoView` here would drag the whole transcript around mid-run.
   */
  const scroller = useRef<HTMLDivElement>(null);
  const focus = running?.id;

  useEffect(() => {
    const element = scroller.current;
    if (!element || !focus) return;

    const node = placed.find((entry) => entry.id === focus);
    if (!node || element.scrollWidth <= element.clientWidth) return;

    element.scrollTo({
      left: Math.max(0, node.x + NODE_W / 2 - element.clientWidth / 2),
      behavior: "smooth",
    });
    // `placed` is derived fresh every render; the node's position is a function
    // of the graph's shape, which does not change during a run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <div className="stream rounded-2xl border border-rule bg-paper-sunk/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          {block.template.replace(/_/g, " ")} · {done}/{block.nodes.length} nodes
        </p>

        {/* Two views of one truth. The graph is for understanding the shape; the
            list is for reading durations off, which a diagram is bad at. */}
        <div
          role="group"
          aria-label="Graph display"
          className="flex rounded-full border border-rule bg-paper-lift p-0.5"
        >
          {(["graph", "list"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite ${
                view === option
                  ? "bg-graphite text-white"
                  : "text-mute hover:text-graphite"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Completed nodes, not elapsed time: this is the one quantity in the run
          we can actually measure, so it is the only one drawn as a bar. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={block.nodes.length}
        aria-valuenow={done}
        aria-label="Nodes completed"
        className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-rule"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)] ${
            failed ? "bg-fail" : "bg-ember"
          }`}
          style={{
            width: `${(done / Math.max(block.nodes.length, 1)) * 100}%`,
          }}
        />
      </div>

      {view === "graph" ? (
        <div ref={scroller} className="mt-4 overflow-x-auto">
          <div
            className="relative mx-auto"
            style={{ width, height, minWidth: width }}
          >
            <svg
              aria-hidden
              className="absolute inset-0"
              width={width}
              height={height}
            >
              {placed.flatMap((node) =>
                node.deps.map((dep) => {
                  const from = byId.get(dep);
                  if (!from) return null;

                  const x1 = from.x + NODE_W / 2;
                  const y1 = from.y + NODE_H;
                  const x2 = node.x + NODE_W / 2;
                  const y2 = node.y;
                  const span = node.level - from.level;

                  const source = block.state[dep]?.status;
                  const target = block.state[node.id]?.status;

                  // Three readings, in order of how much they matter. An edge
                  // being *used right now* is the run's location and gets the
                  // only moving ink in the picture; an edge already travelled is
                  // history and merely firms up; everything else is structure.
                  const flowing = source === "ok" && target === "running";
                  const carried =
                    source === "ok" && (target === "ok" || target === "failed");

                  const bend = (y2 - y1) / 2;
                  let path = `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`;

                  if (span > 1) {
                    // An edge that skips a level would otherwise be drawn
                    // straight through whatever sits between — `casting` feeds
                    // both `master` and `frames`, and the second crosses the
                    // first. Skip edges leave the column and run down a lane
                    // instead, chosen by how far the edge travels so two from
                    // the same source do not overlap.
                    const side = x1 <= width / 2 ? -1 : 1;
                    const lane = Math.min(GUTTER - 12, 16 + span * 6);
                    const gx = side < 0 ? lane : width - lane;

                    path = orthogonal([
                      [x1, y1],
                      [x1, y1 + 14],
                      [gx, y1 + 14],
                      [gx, y2 - 14],
                      [x2, y2 - 14],
                      [x2, y2],
                    ]);
                  }

                  return (
                    <g key={`${dep}-${node.id}`}>
                      <path
                        className="wire"
                        d={path}
                        // Lets the draw-in animation express its dash as a
                        // fraction of the edge rather than in pixels.
                        pathLength={1}
                        fill="none"
                        stroke={
                          flowing
                            ? "color-mix(in srgb, var(--ember) 32%, transparent)"
                            : carried
                              ? "color-mix(in srgb, var(--graphite) 22%, transparent)"
                              : "var(--rule)"
                        }
                        strokeWidth={flowing ? 1.5 : 1}
                      />

                      {/* The travelling dashes ride on a second path so the
                          edge underneath stays solid — a dashed line on its own
                          reads as "not connected". Ink rather than paper, so it
                          does not depend on what colour the card behind is. */}
                      {flowing ? (
                        <path
                          className="wire-flow"
                          d={path}
                          pathLength={1}
                          fill="none"
                          stroke="var(--ember)"
                          strokeWidth={2}
                        />
                      ) : null}
                    </g>
                  );
                })
              )}
            </svg>

            {placed.map((node) => {
              const state = block.state[node.id] ?? EMPTY_STATE;
              const live = state.status === "running";
              const moved = changed[node.id];

              return (
                <div
                  key={node.id}
                  className="node-in absolute"
                  style={{
                    left: node.x,
                    top: node.y,
                    width: NODE_W,
                    height: NODE_H,
                    // Dealt out in dependency order rather than all at once, so
                    // the picture assembles the way the engine will run it.
                    animationDelay: `${Math.min(node.level, 8) * 55}ms`,
                  }}
                >
                  {/* The fan-out tell: a second card peeking out behind. */}
                  {node.foreach ? (
                    <span
                      aria-hidden
                      className="absolute left-1.5 top-1.5 size-full rounded-lg border border-rule bg-paper-lift"
                    />
                  ) : null}

                  <div
                    className={`relative flex h-full flex-col justify-center rounded-lg border px-3 transition-colors duration-300 ${
                      STATUS_RING[state.status]
                    } ${live ? "node-live" : ""} ${
                      moved && state.status === "ok" ? "node-settle" : ""
                    } ${moved && state.status === "failed" ? "node-shake" : ""}`}
                  >
                    <span className="truncate font-mono text-xs font-medium">
                      {node.id}
                      {node.foreach && state.runs > 1 ? (
                        // Keyed on the count so each new item remounts the
                        // span and the number ticks over rather than swapping.
                        <span key={state.runs} className="tick inline-block text-mute">
                          {" "}
                          ×{state.runs}
                        </span>
                      ) : null}
                    </span>

                    <span className="flex items-baseline gap-1.5 font-mono text-[10px] text-mute">
                      <span className="min-w-0 flex-1 truncate">{node.type}</span>

                      {/* Counting up while it waits, then the real duration the
                          moment the server reports one. */}
                      {live && state.startedAt ? (
                        <span className="shrink-0 tabular-nums text-ember">
                          {Math.floor((Date.now() - state.startedAt) / 1000)}s
                        </span>
                      ) : state.status === "ok" ? (
                        <span className="shrink-0 tabular-nums">
                          {/* "pinned" is not "cached": this node did not run
                              because you supplied its value — the reused actor's
                              own face — which is worth seeing on the diagram. */}
                          {state.pinned
                            ? "pinned"
                            : state.cached
                              ? "cached"
                              : formatMs(state.ms)}
                        </span>
                      ) : null}
                    </span>

                    {live ? (
                      <>
                        <span
                          aria-hidden
                          className="ping absolute -right-1 -top-1 size-2 rounded-full bg-ember text-ember"
                        />
                        <span
                          aria-hidden
                          className="crawl absolute inset-x-2 bottom-[3px] h-[2px] rounded-full"
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <ol className="mt-4 space-y-1">
          {block.nodes.map((node) => {
            const state = block.state[node.id] ?? EMPTY_STATE;

            return (
              <li
                key={node.id}
                className="flex items-baseline gap-3 rounded-md bg-paper-lift px-3 py-1.5 font-mono text-xs"
              >
                <span
                  aria-hidden
                  className={`size-1.5 shrink-0 translate-y-[-1px] rounded-full ${
                    state.status === "ok"
                      ? "bg-graphite"
                      : state.status === "running"
                        ? "ping relative bg-ember text-ember"
                        : state.status === "failed"
                          ? "bg-fail"
                          : "bg-rule"
                  }`}
                />
                <span className="w-24 shrink-0 truncate text-graphite">
                  {node.id}
                </span>
                <span className="min-w-0 flex-1 truncate text-mute">{node.type}</span>
                <span className="shrink-0 tabular-nums text-mute">
                  {state.status === "running" && state.startedAt
                    ? `${Math.floor((Date.now() - state.startedAt) / 1000)}s`
                    : state.pinned
                      ? "pinned"
                      : state.cached
                        ? "cached"
                        : formatMs(state.ms)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
