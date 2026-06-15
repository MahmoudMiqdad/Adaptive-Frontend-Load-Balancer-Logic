import { describe, expect, it } from "vitest";
import { MahmoudBalancerCore } from "../core/mahmoudBalancerCore";

describe("MahmoudBalancerCore", () => {
  it("routes only to online nodes", () => {
    const engine = new MahmoudBalancerCore("ROUND_ROBIN");

    engine.setNodeState("edge-a", "OFFLINE");

    for (let i = 0; i < 10; i++) {
      const decision = engine.route({
        clientId: `client-${i}`,
      });

      expect(decision.nodeId).not.toBe("edge-a");
      expect(decision.outcome).toBe("ROUTED");
    }
  });

  it("rotates nodes with round robin", () => {
    const engine = new MahmoudBalancerCore("ROUND_ROBIN");

    const a = engine.route({ clientId: "a" });
    const b = engine.route({ clientId: "b" });
    const c = engine.route({ clientId: "c" });

    expect(a.nodeId).toBe("edge-a");
    expect(b.nodeId).toBe("edge-b");
    expect(c.nodeId).toBe("edge-c");
  });

  it("chooses the node with the lowest active connections", () => {
    const engine = new MahmoudBalancerCore("LEAST_CONNECTIONS");

    engine.tuneNode("edge-a", { activeConnections: 20 });
    engine.tuneNode("edge-b", { activeConnections: 10 });
    engine.tuneNode("edge-c", { activeConnections: 0 });
    engine.tuneNode("edge-d", { activeConnections: 15 });

    const decision = engine.route({
      clientId: "least-client",
    });

    expect(decision.nodeId).toBe("edge-c");
  });

  it("chooses the lowest latency node", () => {
    const engine = new MahmoudBalancerCore("LOWEST_LATENCY");

    engine.tuneNode("edge-a", { latencyMs: 120 });
    engine.tuneNode("edge-b", { latencyMs: 25 });
    engine.tuneNode("edge-c", { latencyMs: 90 });
    engine.tuneNode("edge-d", { latencyMs: 70 });

    const decision = engine.route({
      clientId: "latency-client",
    });

    expect(decision.nodeId).toBe("edge-b");
  });

  it("keeps the same client stable with consistent hashing", () => {
    const engine = new MahmoudBalancerCore("CONSISTENT_HASHING");

    const first = engine.route({
      clientId: "same-client",
    });

    for (let i = 0; i < 8; i++) {
      const next = engine.route({
        clientId: "same-client",
      });

      expect(next.nodeId).toBe(first.nodeId);
    }
  });

  it("fails over when selected node is offline", () => {
    const engine = new MahmoudBalancerCore("ROUND_ROBIN");

    engine.setNodeState("edge-a", "OFFLINE");

    const decision = engine.route({
      clientId: "failover-client",
    });

    expect(decision.outcome).toBe("ROUTED");
    expect(decision.nodeId).not.toBe("edge-a");
  });

  it("updates distribution counters after burst", () => {
    const engine = new MahmoudBalancerCore("ROUND_ROBIN");

    engine.burst(100, {
      clientId: "burst-client",
    });

    const snapshot = engine.getSnapshot();
    const total = Object.values(snapshot.distribution).reduce((sum, value) => sum + value, 0);

    expect(total).toBe(100);
  });

  it("adaptive score prefers healthier node", () => {
    const engine = new MahmoudBalancerCore("ADAPTIVE_SCORE");

    engine.setNodeState("edge-c", "OFFLINE");
    engine.setNodeState("edge-d", "OFFLINE");

    engine.tuneNode("edge-a", {
      latencyMs: 250,
      activeConnections: 50,
      errorRate: 0.8,
      cpuLoad: 0.95,
      weight: 1,
    });

    engine.tuneNode("edge-b", {
      latencyMs: 20,
      activeConnections: 0,
      errorRate: 0,
      cpuLoad: 0.1,
      weight: 3,
    });

    const decision = engine.route({
      clientId: "adaptive-client",
    });

    expect(decision.nodeId).toBe("edge-b");
  });

  it("rejects request when all nodes are offline", () => {
    const engine = new MahmoudBalancerCore("ROUND_ROBIN");

    engine.setNodeState("edge-a", "OFFLINE");
    engine.setNodeState("edge-b", "OFFLINE");
    engine.setNodeState("edge-c", "OFFLINE");
    engine.setNodeState("edge-d", "OFFLINE");

    const decision = engine.route({
      clientId: "blocked-client",
    });

    expect(decision.outcome).toBe("REJECTED");
    expect(decision.reason).toBe("no-online-node");
    expect(decision.nodeId).toBeNull();
  });
});