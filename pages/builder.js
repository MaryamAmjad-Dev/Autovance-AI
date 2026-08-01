import ReactFlow, { MiniMap, Controls, Background } from "reactflow";
import "reactflow/dist/style.css";

import { useState } from "react";
import { useRouter } from "next/router";

const initialNodes = [
  {
    id: "1",
    position: { x: 100, y: 100 },
    data: { label: "Trigger" },
    type: "input"
  },
  {
    id: "2",
    position: { x: 300, y: 200 },
    data: { label: "Condition" }
  },
  {
    id: "3",
    position: { x: 500, y: 300 },
    data: { label: "Action" }
  }
];

const initialEdges = [
  { id: "e1-2", source: "1", target: "2" },
  { id: "e2-3", source: "2", target: "3" }
];

export default function Builder() {
  const router = useRouter();

  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  return (
    <div style={{ height: "100vh", background: "#020617", color: "white" }}>

      {/* NAVBAR */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "20px 40px"
      }}>
        <h2>Autovance AI</h2>

        <div>
          <span onClick={() => router.push("/dashboard")} style={{ margin: 10, cursor: "pointer" }}>
            Dashboard
          </span>
          <span style={{ margin: 10 }}>Builder</span>
        </div>
      </div>

      {/* FLOW */}
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>

    </div>
  );
}