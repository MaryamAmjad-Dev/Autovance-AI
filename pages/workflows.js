import { useState } from "react";

export default function Workflows() {

  const [workflow, setWorkflow] = useState([]);
  const [input, setInput] = useState("");

  const addStep = (type) => {
    setWorkflow([...workflow, type]);
  };

  const generateAI = () => {
    if (!input) return;

    setWorkflow([
      "Trigger: New Email",
      "Condition: Contains 'Invoice'",
      "Action: Send Reply"
    ]);
  };

  return (
    <div className="container">

      {/* TOP BAR */}
      <div className="navbar">
        <h2>Autovance AI</h2>
        <button onClick={() => window.location.href="/dashboard"}>
          Back
        </button>
      </div>

      <div className="main">

        <h1>Workflow Builder</h1>

        {/* AI GENERATOR */}
        <div className="ai-box">
          <input
            placeholder="Describe automation (e.g. send email when form submitted)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button onClick={generateAI}>Generate with AI</button>
        </div>

        {/* ACTION BUTTONS */}
        <div className="actions">

          <button onClick={() => addStep("Trigger")}>+ Trigger</button>
          <button onClick={() => addStep("Condition")}>+ Condition</button>
          <button onClick={() => addStep("Action")}>+ Action</button>

        </div>

        {/* WORKFLOW VISUAL */}
        <div className="workflow">

          {workflow.length === 0 && (
            <p className="empty">
              Start building your automation by adding steps above
            </p>
          )}

          {workflow.map((step, index) => (
            <div key={index} className="step">
              {step}
            </div>
          ))}

        </div>

      </div>

      <style jsx>{`
        .container {
          min-height: 100vh;
          background: radial-gradient(circle at center, #1e1b4b, #020617);
          color: white;
        }

        .navbar {
          height: 70px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 30px;
          background: rgba(0,0,0,0.3);
        }

        .main {
          padding: 40px;
        }

        h1 {
          margin-bottom: 20px;
        }

        /* AI BOX */
        .ai-box {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }

        .ai-box input {
          flex: 1;
          padding: 12px;
          border-radius: 8px;
          border: none;
        }

        .ai-box button {
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          border: none;
          padding: 12px 20px;
          border-radius: 8px;
          color: white;
          cursor: pointer;
        }

        /* ACTION BUTTONS */
        .actions {
          margin-bottom: 30px;
        }

        .actions button {
          margin-right: 10px;
          padding: 10px 15px;
          border-radius: 8px;
          border: none;
          background: rgba(168,85,247,0.2);
          color: white;
          cursor: pointer;
        }

        /* WORKFLOW AREA */
        .workflow {
          background: rgba(255,255,255,0.05);
          padding: 30px;
          border-radius: 12px;
          min-height: 200px;
        }

        .step {
          padding: 15px;
          margin: 10px 0;
          border-radius: 8px;
          background: rgba(168,85,247,0.2);
        }

        .empty {
          color: #aaa;
        }

      `}</style>

    </div>
  );
}