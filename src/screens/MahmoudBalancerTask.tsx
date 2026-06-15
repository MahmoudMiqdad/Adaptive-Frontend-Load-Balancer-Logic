import { useRef, useState } from "react";
import {
  MahmoudBalancerCore,
  type BalanceStrategy,
  type BalancerSnapshot,
  type NodeState,
} from "../core/mahmoudBalancerCore";

const strategies: BalanceStrategy[] = [
  "ROUND_ROBIN",
  "WEIGHTED_ROUND_ROBIN",
  "LEAST_CONNECTIONS",
  "LOWEST_LATENCY",
  "RANDOM",
  "WEIGHTED_RANDOM",
  "POWER_OF_TWO",
  "CONSISTENT_HASHING",
  "ADAPTIVE_SCORE",
];

function statusTone(value: string) {
  if (value === "ROUTED" || value === "ONLINE") return "#047857";
  if (value === "FAILED" || value === "DRAINING") return "#b45309";
  if (value === "REJECTED" || value === "OFFLINE") return "#b91c1c";
  return "#334155";
}

export default function MahmoudBalancerTask() {
  const engineRef = useRef<MahmoudBalancerCore | null>(null);

  if (!engineRef.current) {
    engineRef.current = new MahmoudBalancerCore("ADAPTIVE_SCORE");
  }

  const [snapshot, setSnapshot] = useState<BalancerSnapshot>(() => engineRef.current!.getSnapshot());
  const [strategy, setStrategy] = useState<BalanceStrategy>("ADAPTIVE_SCORE");
  const [clientId, setClientId] = useState("visitor-2048");
  const [preferredRegion, setPreferredRegion] = useState("");
  const [path, setPath] = useState("/frontend/catalog");

  const refresh = () => setSnapshot(engineRef.current!.getSnapshot());

  const syncStrategy = () => {
    engineRef.current!.setStrategy(strategy);
  };

  const sendRequest = () => {
    syncStrategy();
    engineRef.current!.route({
      clientId,
      path,
      preferredRegion: preferredRegion.trim() || undefined,
    });
    refresh();
  };

  const sendBrokenRequest = () => {
    syncStrategy();
    engineRef.current!.route({
      clientId,
      path,
      preferredRegion: preferredRegion.trim() || undefined,
      forceFailure: true,
    });
    refresh();
  };

  const sendTrafficWave = () => {
    syncStrategy();
    engineRef.current!.burst(100, {
      clientId,
      path,
      preferredRegion: preferredRegion.trim() || undefined,
    });
    refresh();
  };

  const changeNodeState = (id: string, state: NodeState) => {
    engineRef.current!.setNodeState(id, state);
    refresh();
  };

  const increasePressure = (id: string) => {
    const node = snapshot.nodes.find((item) => item.id === id);
    if (!node) return;

    engineRef.current!.tuneNode(id, {
      activeConnections: node.activeConnections + 7,
      cpuLoad: Math.min(1, node.cpuLoad + 0.22),
      latencyMs: node.latencyMs + 18,
      errorRate: Math.min(1, node.errorRate + 0.04),
    });

    refresh();
  };

  const resetAll = () => {
    engineRef.current!.reset();
    engineRef.current!.setStrategy(strategy);
    refresh();
  };

  const last = snapshot.recent[0];
  const routedCount = snapshot.recent.filter((item) => item.outcome === "ROUTED").length;
  const failedCount = snapshot.recent.filter((item) => item.outcome === "FAILED").length;
  const rejectedCount = snapshot.recent.filter((item) => item.outcome === "REJECTED").length;

  return (
    <div className="mahmoudShell">
      <style>
        {`
          .mahmoudShell {
            min-height: 100vh;
            background: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 45%, #fef3c7 100%);
            color: #0f172a;
            font-family: Inter, ui-sans-serif, system-ui, Arial;
            padding: 28px;
          }

          .heroPanel {
            background: rgba(255, 255, 255, 0.86);
            border: 1px solid rgba(15, 23, 42, 0.12);
            border-radius: 26px;
            padding: 26px;
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12);
            margin-bottom: 20px;
          }

          .heroTop {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            flex-wrap: wrap;
            align-items: center;
          }

          .titleBlock h1 {
            margin: 0;
            font-size: 34px;
            letter-spacing: -0.04em;
          }

          .titleBlock p {
            margin: 8px 0 0;
            color: #475569;
            max-width: 760px;
            line-height: 1.6;
          }

          .badge {
            background: #0f172a;
            color: white;
            padding: 10px 14px;
            border-radius: 999px;
            font-weight: 800;
            font-size: 13px;
          }

          .workspace {
            display: grid;
            grid-template-columns: 340px 1fr;
            gap: 18px;
          }

          .controlPanel, .dataPanel, .metricCard {
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid rgba(15, 23, 42, 0.12);
            border-radius: 22px;
            box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
          }

          .controlPanel {
            padding: 18px;
            position: sticky;
            top: 18px;
            height: fit-content;
          }

          .field {
            display: grid;
            gap: 7px;
            margin-bottom: 14px;
          }

          .field span {
            font-size: 13px;
            color: #475569;
            font-weight: 800;
          }

          .input, .select {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #cbd5e1;
            border-radius: 14px;
            padding: 11px 12px;
            background: #ffffff;
            color: #0f172a;
            outline: none;
          }

          .buttonStack {
            display: grid;
            gap: 10px;
            margin-top: 16px;
          }

          .primaryBtn, .secondaryBtn, .dangerBtn, .smallBtn {
            border: none;
            border-radius: 14px;
            padding: 11px 13px;
            cursor: pointer;
            font-weight: 900;
          }

          .primaryBtn {
            background: #2563eb;
            color: white;
          }

          .secondaryBtn {
            background: #0f766e;
            color: white;
          }

          .dangerBtn {
            background: #dc2626;
            color: white;
          }

          .smallBtn {
            background: #e2e8f0;
            color: #0f172a;
            padding: 8px 10px;
            font-size: 12px;
          }

          .mainColumn {
            display: grid;
            gap: 18px;
          }

          .metricsGrid {
            display: grid;
            grid-template-columns: repeat(4, minmax(150px, 1fr));
            gap: 12px;
          }

          .metricCard {
            padding: 16px;
          }

          .metricCard span {
            color: #64748b;
            font-size: 13px;
            font-weight: 800;
          }

          .metricCard strong {
            display: block;
            font-size: 26px;
            margin-top: 6px;
          }

          .dataPanel {
            padding: 18px;
            overflow: auto;
          }

          .panelTitle {
            margin: 0 0 14px;
            font-size: 20px;
          }

          .nodeGrid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 12px;
          }

          .nodeBox {
            border: 1px solid #dbe3ef;
            background: #ffffff;
            border-radius: 18px;
            padding: 14px;
          }

          .nodeHead {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
          }

          .nodeName {
            font-weight: 950;
          }

          .pill {
            border-radius: 999px;
            padding: 5px 9px;
            font-size: 12px;
            font-weight: 950;
            background: #f1f5f9;
          }

          .nodeStats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            font-size: 13px;
            color: #334155;
          }

          .nodeActions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 12px;
          }

          .table {
            width: 100%;
            border-collapse: collapse;
            min-width: 720px;
          }

          .table th {
            text-align: left;
            font-size: 13px;
            color: #475569;
            background: #f8fafc;
          }

          .table th, .table td {
            border-bottom: 1px solid #e2e8f0;
            padding: 11px;
          }

          .logStream {
            background: #0f172a;
            color: #dbeafe;
            border-radius: 18px;
            padding: 14px;
            max-height: 260px;
            overflow: auto;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 13px;
          }

          .logLine {
            padding: 7px 0;
            border-bottom: 1px solid rgba(219, 234, 254, 0.12);
          }

          @media (max-width: 980px) {
            .workspace {
              grid-template-columns: 1fr;
            }

            .metricsGrid {
              grid-template-columns: repeat(2, minmax(150px, 1fr));
            }
          }
        `}
      </style>

      <section className="heroPanel">
        <div className="heroTop">
          <div className="titleBlock">
            <h1>Mahmoud Adaptive Edge Balancer</h1>
            <p>
              A standalone distributed-systems simulation for adaptive frontend routing, telemetry-based decisions,
              failover behavior, and consistent client affinity.
            </p>
          </div>
          <div className="badge">Advanced Load Balancing Lab</div>
        </div>
      </section>

      <div className="workspace">
        <aside className="controlPanel">
          <div className="field">
            <span>Routing strategy</span>
            <select className="select" value={strategy} onChange={(event) => setStrategy(event.target.value as BalanceStrategy)}>
              {strategies.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <span>Client identifier</span>
            <input className="input" value={clientId} onChange={(event) => setClientId(event.target.value)} />
          </div>

          <div className="field">
            <span>Request path</span>
            <input className="input" value={path} onChange={(event) => setPath(event.target.value)} />
          </div>

          <div className="field">
            <span>Preferred region</span>
            <input className="input" value={preferredRegion} onChange={(event) => setPreferredRegion(event.target.value)} placeholder="eu-west" />
          </div>

          <div className="buttonStack">
            <button className="primaryBtn" onClick={sendRequest}>Route single request</button>
            <button className="dangerBtn" onClick={sendBrokenRequest}>Simulate upstream failure</button>
            <button className="secondaryBtn" onClick={sendTrafficWave}>Send traffic wave ×100</button>
            <button className="smallBtn" onClick={resetAll}>Reset simulation</button>
          </div>
        </aside>

        <main className="mainColumn">
          <section className="metricsGrid">
            <div className="metricCard">
              <span>Last outcome</span>
              <strong style={{ color: last ? statusTone(last.outcome) : "#334155" }}>{last?.outcome ?? "NONE"}</strong>
            </div>

            <div className="metricCard">
              <span>Selected node</span>
              <strong>{last?.nodeLabel ?? "—"}</strong>
            </div>

            <div className="metricCard">
              <span>Routed</span>
              <strong style={{ color: "#047857" }}>{routedCount}</strong>
            </div>

            <div className="metricCard">
              <span>Failed / Rejected</span>
              <strong style={{ color: "#b91c1c" }}>{failedCount + rejectedCount}</strong>
            </div>
          </section>

          <section className="dataPanel">
            <h2 className="panelTitle">Cluster nodes</h2>
            <div className="nodeGrid">
              {snapshot.nodes.map((node) => (
                <div className="nodeBox" key={node.id}>
                  <div className="nodeHead">
                    <div>
                      <div className="nodeName">{node.label}</div>
                      <div style={{ color: "#64748b", fontSize: 13 }}>{node.region}</div>
                    </div>
                    <span className="pill" style={{ color: statusTone(node.state) }}>{node.state}</span>
                  </div>

                  <div className="nodeStats">
                    <div>Weight: <b>{node.weight}</b></div>
                    <div>Latency: <b>{node.latencyMs}ms</b></div>
                    <div>Active: <b>{node.activeConnections}</b></div>
                    <div>Error: <b>{Math.round(node.errorRate * 100)}%</b></div>
                    <div>CPU: <b>{Math.round(node.cpuLoad * 100)}%</b></div>
                    <div>Handled: <b>{node.handled}</b></div>
                  </div>

                  <div className="nodeActions">
                    <button className="smallBtn" onClick={() => changeNodeState(node.id, "OFFLINE")}>Offline</button>
                    <button className="smallBtn" onClick={() => changeNodeState(node.id, "ONLINE")}>Online</button>
                    <button className="smallBtn" onClick={() => increasePressure(node.id)}>Add pressure</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="dataPanel">
            <h2 className="panelTitle">Recent routing decisions</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Client</th>
                  <th>Strategy</th>
                  <th>Outcome</th>
                  <th>Node</th>
                  <th>Latency</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recent.slice(0, 12).map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.clientId}</td>
                    <td>{item.strategy}</td>
                    <td style={{ color: statusTone(item.outcome), fontWeight: 950 }}>{item.outcome}</td>
                    <td>{item.nodeLabel ?? "—"}</td>
                    <td>{item.observedLatencyMs === null ? "—" : `${item.observedLatencyMs}ms`}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="dataPanel">
            <h2 className="panelTitle">Distribution counters</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Node ID</th>
                  <th>Requests</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(snapshot.distribution).map(([nodeId, count]) => (
                  <tr key={nodeId}>
                    <td>{nodeId}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="dataPanel">
            <h2 className="panelTitle">Event stream</h2>
            <div className="logStream">
              {snapshot.events.map((event, index) => (
                <div className="logLine" key={index}>
                  <span style={{ color: "#93c5fd" }}>{event.t}ms</span>{" "}
                  <span style={{ color: statusTone(event.type), fontWeight: 950 }}>{event.type}</span>{" "}
                  <span>{event.message}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}