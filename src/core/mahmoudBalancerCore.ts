export type NodeState = "ONLINE" | "OFFLINE" | "DRAINING";

export type BalanceStrategy =
  | "ROUND_ROBIN"
  | "WEIGHTED_ROUND_ROBIN"
  | "LEAST_CONNECTIONS"
  | "LOWEST_LATENCY"
  | "RANDOM"
  | "WEIGHTED_RANDOM"
  | "POWER_OF_TWO"
  | "CONSISTENT_HASHING"
  | "ADAPTIVE_SCORE";

export interface BalancerNode {
  id: string;
  label: string;
  region: string;
  state: NodeState;
  weight: number;
  latencyMs: number;
  activeConnections: number;
  errorRate: number;
  cpuLoad: number;
  handled: number;
  failed: number;
}

export interface RouteRequest {
  clientId: string;
  path?: string;
  preferredRegion?: string;
  strategy?: BalanceStrategy;
  forceFailure?: boolean;
}

export interface RouteDecision {
  id: number;
  t: number;
  clientId: string;
  path: string;
  strategy: BalanceStrategy;
  outcome: "ROUTED" | "REJECTED" | "FAILED";
  nodeId: string | null;
  nodeLabel: string | null;
  reason: string;
  observedLatencyMs: number | null;
}

export interface BalancerEvent {
  t: number;
  type: RouteDecision["outcome"] | "NODE" | "RESET" | "CONFIG";
  message: string;
}

export interface BalancerSnapshot {
  nowMs: number;
  activeStrategy: BalanceStrategy;
  nodes: BalancerNode[];
  distribution: Record<string, number>;
  recent: RouteDecision[];
  events: BalancerEvent[];
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hashText(text: string) {
  let h = 2166136261;

  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function defaultNodes(): BalancerNode[] {
  return [
    {
      id: "edge-a",
      label: "Edge Node A",
      region: "eu-west",
      state: "ONLINE",
      weight: 3,
      latencyMs: 38,
      activeConnections: 2,
      errorRate: 0.02,
      cpuLoad: 0.32,
      handled: 0,
      failed: 0,
    },
    {
      id: "edge-b",
      label: "Edge Node B",
      region: "us-east",
      state: "ONLINE",
      weight: 2,
      latencyMs: 55,
      activeConnections: 1,
      errorRate: 0.03,
      cpuLoad: 0.28,
      handled: 0,
      failed: 0,
    },
    {
      id: "edge-c",
      label: "Edge Node C",
      region: "ap-south",
      state: "ONLINE",
      weight: 1,
      latencyMs: 92,
      activeConnections: 0,
      errorRate: 0.05,
      cpuLoad: 0.41,
      handled: 0,
      failed: 0,
    },
    {
      id: "edge-d",
      label: "Edge Node D",
      region: "eu-central",
      state: "ONLINE",
      weight: 2,
      latencyMs: 64,
      activeConnections: 3,
      errorRate: 0.04,
      cpuLoad: 0.37,
      handled: 0,
      failed: 0,
    },
  ];
}

export class MahmoudBalancerCore {
  private nowMs = 0;
  private seq = 0;
  private seed = 987654;
  private roundIndex = 0;
  private weightedIndex = 0;
  private activeStrategy: BalanceStrategy = "ADAPTIVE_SCORE";
  private nodes: BalancerNode[] = defaultNodes();
  private distribution: Record<string, number> = {};
  private recent: RouteDecision[] = [];
  private events: BalancerEvent[] = [];

  constructor(strategy?: BalanceStrategy) {
    if (strategy) this.activeStrategy = strategy;

    for (const node of this.nodes) {
      this.distribution[node.id] = 0;
    }
  }

  getSnapshot(): BalancerSnapshot {
    return {
      nowMs: this.nowMs,
      activeStrategy: this.activeStrategy,
      nodes: this.nodes.map((n) => ({ ...n })),
      distribution: { ...this.distribution },
      recent: [...this.recent],
      events: [...this.events],
    };
  }

  setStrategy(strategy: BalanceStrategy) {
    this.activeStrategy = strategy;
    this.pushEvent("CONFIG", `strategy changed to ${strategy}`);
  }

  setNodeState(id: string, state: NodeState) {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) return;

    node.state = state;
    this.pushEvent("NODE", `${node.label} changed to ${state}`);
  }

  tuneNode(id: string, patch: Partial<Omit<BalancerNode, "id">>) {
    const node = this.nodes.find((n) => n.id === id);
    if (!node) return;

    Object.assign(node, patch);

    node.weight = Math.max(1, Math.floor(node.weight));
    node.latencyMs = Math.max(1, node.latencyMs);
    node.activeConnections = Math.max(0, Math.floor(node.activeConnections));
    node.errorRate = clamp(node.errorRate, 0, 1);
    node.cpuLoad = clamp(node.cpuLoad, 0, 1);

    this.pushEvent("NODE", `${node.label} telemetry updated`);
  }

  reset() {
    this.nowMs = 0;
    this.seq = 0;
    this.seed = 987654;
    this.roundIndex = 0;
    this.weightedIndex = 0;
    this.nodes = defaultNodes();
    this.distribution = {};
    this.recent = [];
    this.events = [];

    for (const node of this.nodes) {
      this.distribution[node.id] = 0;
    }

    this.pushEvent("RESET", "cluster reset");
  }

  route(request: RouteRequest): RouteDecision {
    this.nowMs += 10;

    const strategy = request.strategy ?? this.activeStrategy;
    const path = request.path ?? "/api/search";
    const candidates = this.nodes.filter((n) => n.state === "ONLINE");

    if (candidates.length === 0) {
      return this.recordDecision({
        clientId: request.clientId,
        path,
        strategy,
        outcome: "REJECTED",
        node: null,
        reason: "no-online-node",
        observedLatencyMs: null,
      });
    }

    const selected = this.pickNode(strategy, candidates, request.clientId, request.preferredRegion);
    const failed = request.forceFailure === true;
    const observedLatency = this.calculateObservedLatency(selected);

    selected.activeConnections += 1;
    selected.handled += 1;

    if (failed) {
      selected.failed += 1;
      selected.errorRate = clamp(selected.errorRate * 0.85 + 0.15, 0, 1);
    } else {
      selected.errorRate = clamp(selected.errorRate * 0.92, 0, 1);
    }

    selected.latencyMs = Math.round(selected.latencyMs * 0.82 + observedLatency * 0.18);
    selected.cpuLoad = clamp(selected.cpuLoad * 0.9 + 0.07 + selected.activeConnections * 0.01, 0, 1);
    this.distribution[selected.id] = (this.distribution[selected.id] ?? 0) + 1;

    return this.recordDecision({
      clientId: request.clientId,
      path,
      strategy,
      outcome: failed ? "FAILED" : "ROUTED",
      node: selected,
      reason: failed ? "upstream-error-simulated" : "request-routed",
      observedLatencyMs: observedLatency,
    });
  }

  burst(count: number, request: RouteRequest) {
    const safeCount = Math.max(1, Math.floor(count));
    const results: RouteDecision[] = [];

    for (let i = 0; i < safeCount; i++) {
      results.push(
        this.route({
          ...request,
          clientId: `${request.clientId}-${i}`,
        })
      );
    }

    return results;
  }

  private pickNode(
    strategy: BalanceStrategy,
    candidates: BalancerNode[],
    clientId: string,
    preferredRegion?: string
  ) {
    if (preferredRegion) {
      const regional = candidates.filter((n) => n.region === preferredRegion);

      if (regional.length > 0 && strategy !== "CONSISTENT_HASHING") {
        candidates = regional;
      }
    }

    if (strategy === "ROUND_ROBIN") return this.pickRoundRobin(candidates);
    if (strategy === "WEIGHTED_ROUND_ROBIN") return this.pickWeightedRoundRobin(candidates);
    if (strategy === "LEAST_CONNECTIONS") return this.pickLeastConnections(candidates);
    if (strategy === "LOWEST_LATENCY") return this.pickLowestLatency(candidates);
    if (strategy === "RANDOM") return this.pickRandom(candidates);
    if (strategy === "WEIGHTED_RANDOM") return this.pickWeightedRandom(candidates);
    if (strategy === "POWER_OF_TWO") return this.pickPowerOfTwo(candidates);
    if (strategy === "CONSISTENT_HASHING") return this.pickConsistentHash(candidates, clientId);

    return this.pickAdaptive(candidates);
  }

  private pickRoundRobin(candidates: BalancerNode[]) {
    const node = candidates[this.roundIndex % candidates.length];
    this.roundIndex += 1;
    return node;
  }

  private pickWeightedRoundRobin(candidates: BalancerNode[]) {
    const queue = candidates.flatMap((node) => Array.from({ length: node.weight }, () => node));
    const node = queue[this.weightedIndex % queue.length];
    this.weightedIndex += 1;
    return node;
  }

  private pickLeastConnections(candidates: BalancerNode[]) {
    return [...candidates].sort((a, b) => a.activeConnections - b.activeConnections)[0];
  }

  private pickLowestLatency(candidates: BalancerNode[]) {
    return [...candidates].sort((a, b) => a.latencyMs - b.latencyMs)[0];
  }

  private pickRandom(candidates: BalancerNode[]) {
    return candidates[Math.floor(this.random() * candidates.length)];
  }

  private pickWeightedRandom(candidates: BalancerNode[]) {
    const total = candidates.reduce((sum, node) => sum + node.weight, 0);
    let ticket = this.random() * total;

    for (const node of candidates) {
      ticket -= node.weight;
      if (ticket <= 0) return node;
    }

    return candidates[candidates.length - 1];
  }

  private pickPowerOfTwo(candidates: BalancerNode[]) {
    if (candidates.length === 1) return candidates[0];

    const firstIndex = Math.floor(this.random() * candidates.length);
    let secondIndex = Math.floor(this.random() * candidates.length);

    if (firstIndex === secondIndex) {
      secondIndex = (secondIndex + 1) % candidates.length;
    }

    const a = candidates[firstIndex];
    const b = candidates[secondIndex];

    return this.score(a) <= this.score(b) ? a : b;
  }

  private pickConsistentHash(candidates: BalancerNode[], clientId: string) {
    const ring = candidates
      .flatMap((node) =>
        Array.from({ length: node.weight * 8 }, (_, i) => ({
          point: hashText(`${node.id}:${i}`) % 360,
          node,
        }))
      )
      .sort((a, b) => a.point - b.point);

    const target = hashText(clientId) % 360;

    return ring.find((entry) => entry.point >= target)?.node ?? ring[0].node;
  }

  private pickAdaptive(candidates: BalancerNode[]) {
    return [...candidates].sort((a, b) => this.score(a) - this.score(b))[0];
  }

  private score(node: BalancerNode) {
    return (
      node.latencyMs * 0.45 +
      node.activeConnections * 12 +
      node.errorRate * 140 +
      node.cpuLoad * 70 -
      node.weight * 6
    );
  }

  private calculateObservedLatency(node: BalancerNode) {
    const jitter = Math.round(this.random() * 10);
    return Math.max(1, node.latencyMs + node.activeConnections * 4 + jitter);
  }

  private recordDecision(input: {
    clientId: string;
    path: string;
    strategy: BalanceStrategy;
    outcome: RouteDecision["outcome"];
    node: BalancerNode | null;
    reason: string;
    observedLatencyMs: number | null;
  }) {
    this.seq += 1;

    const decision: RouteDecision = {
      id: this.seq,
      t: this.nowMs,
      clientId: input.clientId,
      path: input.path,
      strategy: input.strategy,
      outcome: input.outcome,
      nodeId: input.node?.id ?? null,
      nodeLabel: input.node?.label ?? null,
      reason: input.reason,
      observedLatencyMs: input.observedLatencyMs,
    };

    this.recent.unshift(decision);

    if (this.recent.length > 60) {
      this.recent.length = 60;
    }

    this.pushEvent(
      input.outcome,
      `${input.outcome} client=${input.clientId} strategy=${input.strategy} node=${input.node?.id ?? "none"}`
    );

    return decision;
  }

  private pushEvent(type: BalancerEvent["type"], message: string) {
    this.events.unshift({
      t: this.nowMs,
      type,
      message,
    });

    if (this.events.length > 60) {
      this.events.length = 60;
    }
  }

  private random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
}