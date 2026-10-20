import { useState } from "react";
import dynamic from "next/dynamic";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import {
  PROTOTYPE_SCORESHEET,
  SCORE_STATUS,
  SCORESHEET_CITATION,
  SCORESHEET_META,
  summariseScoresheet,
} from "../lib/explainabilityScoresheet";
import "reactflow/dist/style.css";

// React Flow is browser-only; load it without SSR so `next build` prerendering
// of this page stays safe.
const ReactFlowCanvas = dynamic(() => import("reactflow"), { ssr: false });

const sheetSummary = summariseScoresheet(PROTOTYPE_SCORESHEET);

export default function Workflows() {

  const [workflow, setWorkflow] = useState([]);
  const [input, setInput] = useState("");

  // Explainable proposal state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  // Optional user-specified foil: the alternative to contrast against
  const [foil, setFoil] = useState("");

  const addStep = (type) => {
    setWorkflow([...workflow, type]);
  };

  const generateAI = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: input.trim(),
          ...(foil.trim() ? { foil: foil.trim() } : {})
        })
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || !data || data.ok !== true) {
        setError(
          (data && (data.message || data.error)) ||
          `Request failed with status ${res.status}.`
        );
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error while generating the proposal.");
    } finally {
      setLoading(false);
    }
  };

  // Deterministic read-only visualization of the generated plan
  const flowNodes = result
    ? result.proposal.plan.map((step, i) => ({
        id: step.id,
        position: { x: 0, y: i * 110 },
        data: {
          label: `${i + 1}. ${step.label || "(unnamed)"}\n(${step.type})`
        },
        className: `wf-node wf-${step.type}`
      }))
    : [];

  const flowEdges = flowNodes.slice(0, -1).map((node, i) => ({
    id: `e-${node.id}-${flowNodes[i + 1].id}`,
    source: node.id,
    target: flowNodes[i + 1].id
  }));

  return (
    <div className="container">

      {/* SITE-WIDE NAVBAR. This page is a secondary tool: it is not in the
          main navigation, and is reachable from the Dashboard tools area and
          the Footer. */}
      <Navbar />

      <div className="main">

        <h1>Workflow Builder</h1>
        <p className="subtitle">
          Explainable proposals: goal, steps with rationale, assumptions, risks,
          one alternative (optionally one you specify), validated and dry-run on
          the server. The scoresheet at the bottom records which explainability
          requirements this prototype addresses.
        </p>

        {/* AI GENERATOR */}
        <div className="ai-box">
          <input
            placeholder="Describe automation (e.g. When a new invoice email arrives, check its details and prepare a reply for human review)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generateAI(); }}
            disabled={loading}
          />
          <button onClick={generateAI} disabled={loading}>
            {loading ? "Generating…" : "Generate with AI"}
          </button>
        </div>

        {/* OPTIONAL USER-SPECIFIED FOIL: the "why this instead of that?" question */}
        <div className="ai-box foilBox">
          <span className="foilLabel">Contrastive question (optional):</span>
          <input
            placeholder="e.g. why this instead of a scheduled daily digest?"
            value={foil}
            onChange={(e) => setFoil(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generateAI(); }}
            disabled={loading}
          />
        </div>

        {error && (
          <div className="errorBox">
            <strong>Could not generate a proposal.</strong> {error}
          </div>
        )}

        {result && (
          <div className="proposal">
            {/* Section heading so the outline stays h1 → h2 → h3 → h4. */}
            <h2 className="srOnly">Proposal result</h2>

            {/* VERACITY KEY: what is model text vs computed result */}
            <div className="legend">
              <p>
                <span className="srcTag model">model-generated · unverified</span>
                Text written by the AI (goal, beliefs, rationales, assumptions,
                the alternative). Plausible-sounding, but not verified and not a
                faithful account of any computation.
              </p>
              <p>
                <span className="srcTag calc">computed deterministically</span>
                Results computed on the server from the proposal data (validation
                badge, plan differences, dry run). No AI is involved in these.
              </p>
            </div>

            {/* VALIDATION BADGE */}
            <div className={result.validation.valid ? "validBanner ok" : "validBanner bad"}>
              {result.validation.valid
                ? "✔ Structurally valid proposal (checked deterministically on the server)"
                : "✘ Proposal failed structural validation"}
            </div>
            {result.validation.errors.length > 0 && (
              <ul className="issues bad">
                {result.validation.errors.map((msg, i) => (
                  <li key={`err-${i}`}>{msg}</li>
                ))}
              </ul>
            )}
            {result.validation.warnings.length > 0 && (
              <ul className="issues warn">
                {result.validation.warnings.map((msg, i) => (
                  <li key={`warn-${i}`}>{msg}</li>
                ))}
              </ul>
            )}

            {/* GOAL + OUTCOME (BDI-inspired: desire & intended outcome) */}
            <div className="grid2">
              <div className="propCard">
                <h3>🎯 Goal <span className="srcTag model">model-generated</span></h3>
                <p>{result.proposal.goal || "(missing)"}</p>
              </div>
              <div className="propCard">
                <h3>🏁 Intended outcome <span className="srcTag model">model-generated</span></h3>
                <p>{result.proposal.outcome || "(missing)"}</p>
              </div>
            </div>

            {/* BELIEFS / CONTEXT */}
            <div className="propCard">
              <h3>🧠 Context &amp; beliefs <span className="srcTag model">model-generated · unverified</span></h3>
              <p className="hint">
                “user” = taken from your request · “assumed” = inferred by the AI ·
                both are extracted by the model and not independently verified
              </p>
              <div className="chips">
                {result.proposal.beliefs.map((b, i) => (
                  <span key={`belief-${i}`} className={`chip ${b.source}`}>
                    {b.fact}
                    <em>{b.source}</em>
                  </span>
                ))}
                {result.proposal.beliefs.length === 0 && <span className="hint">(none extracted)</span>}
              </div>
            </div>

            {/* PLAN + RATIONALE + VISUALIZATION */}
            <div className="propCard">
              <h3>🧭 Proposed plan <span className="srcTag model">steps + rationales: model-generated · unverified</span></h3>
              <div className="steps">
                {result.proposal.plan.map((step, i) => (
                  <div key={`plan-${step.id}-${i}`} className="pstep">
                    <span className={`badge ${step.type}`}>{step.type}</span>
                    <div>
                      <strong>{i + 1}. {step.label || "(unnamed step)"}</strong>
                      {step.rationale && <p className="rationale">{step.rationale}</p>}
                    </div>
                  </div>
                ))}
              </div>

              {flowNodes.length > 0 && (
                <div className="flowBox">
                  <ReactFlowCanvas
                    nodes={flowNodes}
                    edges={flowEdges}
                    fitView
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                  />
                </div>
              )}
            </div>

            {/* CONTRASTIVE ALTERNATIVE */}
            <div className="propCard">
              <h3>⚖️ Alternative plan{result.proposal.alternative ? `: ${result.proposal.alternative.label}` : ""} <span className="srcTag model">model-generated</span></h3>
              {result.meta && result.meta.foil && (
                <p className="hint foilNote">
                  <span className="srcTag user">your foil</span>
                  Contrasting against the alternative you asked for: “{result.meta.foil}”
                  {result.meta.foil_source === "user" ? "" : " (reported as model-chosen)"}
                </p>
              )}
              {result.proposal.alternative ? (
                <>
                  <div className="steps">
                    {result.proposal.alternative.plan.map((step, i) => (
                      <div key={`alt-${step.id}-${i}`} className="pstep alt">
                        <span className={`badge ${step.type}`}>{step.type}</span>
                        <div>
                          <strong>{i + 1}. {step.label || "(unnamed step)"}</strong>
                          {step.rationale && <p className="rationale">{step.rationale}</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <h4>Why the proposed plan differs <span className="srcTag calc">computed deterministically</span></h4>
                  <ul className="diffList">
                    {result.contrastive.only_in_primary.map((label, i) => (
                      <li key={`dp-${i}`}><span className="tag primary">only in proposed</span> {label}</li>
                    ))}
                    {result.contrastive.only_in_alternative.map((label, i) => (
                      <li key={`da-${i}`}><span className="tag alt">only in alternative</span> {label}</li>
                    ))}
                    {result.contrastive.only_in_primary.length === 0 &&
                      result.contrastive.only_in_alternative.length === 0 && (
                        <li>No structural differences detected between the two plans.</li>
                      )}
                  </ul>

                  {result.proposal.alternative.tradeoffs && (
                    <p className="rationale"><strong>Trade-offs:</strong> {result.proposal.alternative.tradeoffs}</p>
                  )}
                </>
              ) : (
                <p className="hint">The model did not provide an alternative plan.</p>
              )}
            </div>

            {/* ASSUMPTIONS / RISKS / MISSING INFO */}
            <p className="sectionNote">
              <span className="srcTag model">model-generated · unverified</span>
              The model’s own account of what it assumed, what could go wrong, and
              what your request left out. Review it before relying on it.
            </p>
            <div className="grid3">
              <div className="listCard">
                <h4>Assumptions</h4>
                <ul>
                  {result.proposal.assumptions.map((a, i) => <li key={`as-${i}`}>{a}</li>)}
                  {result.proposal.assumptions.length === 0 && <li className="hint">(none declared)</li>}
                </ul>
              </div>
              <div className="listCard">
                <h4>Risks</h4>
                <ul>
                  {result.proposal.risks.map((r, i) => <li key={`rk-${i}`}>{r}</li>)}
                  {result.proposal.risks.length === 0 && <li className="hint">(none identified)</li>}
                </ul>
              </div>
              <div className="listCard">
                <h4>Missing information</h4>
                <ul>
                  {result.proposal.missing_information.map((m, i) => <li key={`mi-${i}`}>{m}</li>)}
                  {result.proposal.missing_information.length === 0 && <li className="hint">(nothing flagged)</li>}
                </ul>
              </div>
            </div>

            {/* DRY RUN */}
            <div className="propCard dry">
              <h4>🔬 Dry-run preview: {result.dry_run.external_actions} external actions <span className="srcTag calc">computed deterministically</span></h4>
              <ul className="dryList">
                {result.dry_run.steps.map((s, i) => (
                  <li key={`dry-${i}`}><span className={`badge ${s.type}`}>{s.type}</span> {s.would}</li>
                ))}
              </ul>
              <p className="hint">{result.dry_run.note}</p>
            </div>

            {/* LIMITATIONS (collapsed by default: clear, not overwhelming) */}
            {Array.isArray(result.meta.limitations) && result.meta.limitations.length > 0 && (
              <details className="limits">
                <summary>About these explanations and limitations</summary>
                <ul>
                  {result.meta.limitations.map((l, i) => (
                    <li key={`lim-${i}`}>{l}</li>
                  ))}
                </ul>
              </details>
            )}

            <p className="grounding">
              {result.meta.grounding} · model: {result.meta.model} · {result.meta.generated_at}
            </p>

          </div>
        )}

        {/* EXPLAINABILITY SCORESHEET (research requirement mapping) */}
        <details className="scoresheet">
          <summary>
            Explainability scoresheet: {sheetSummary.supported} addressed, {sheetSummary.partial} partly addressed,{" "}
            {sheetSummary.unsupported} not addressed, {sheetSummary.not_applicable} not applicable
          </summary>

          {/* Keeps the page heading outline valid (h1 → h2) without adding
              visible chrome to the collapsed details control. */}
          <h2 className="srOnly">Explainability scoresheet detail</h2>

          <p className="sheetIntro">
            Assessed with the structure of the XAI scoresheet from{" "}
            <a
              href={SCORESHEET_CITATION.scoresheet_paper}
              target="_blank"
              rel="noopener noreferrer"
            >
              A Scoresheet for Explainable AI
            </a>{" "}
            (Winikoff, Thangarajah and Rodriguez, AAMAS 2025). {SCORESHEET_META.caveat}{" "}
            Related research:{" "}
            <a
              href={SCORESHEET_CITATION.contrastive_paper}
              target="_blank"
              rel="noopener noreferrer"
            >
              Contrastive explanations of BDI agents
            </a>{" "}
            and{" "}
            <a
              href={SCORESHEET_CITATION.publications}
              target="_blank"
              rel="noopener noreferrer"
            >
              the author's publications page
            </a>
            .
          </p>

          {PROTOTYPE_SCORESHEET.map((section) => (
            <div key={section.id} className="sheetSection">
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item.id} className="sheetItem">
                    <span className={`score s-${item.status}`}>
                      {SCORE_STATUS[item.status].label}
                    </span>
                    <div className="sheetText">
                      <strong>
                        {item.label}
                        {item.answer ? `: ${item.answer}` : ""}
                      </strong>
                      <p>{item.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="sheetFoot">
            {sheetSummary.total} assessment rows in total. The sheet covers this
            workflow proposal prototype; the four automation features perform no
            explanation generation and are therefore outside its scope.
          </p>
        </details>

        {/* ACTION BUTTONS (manual building, preserved) */}
        <div className="actions">

          <button onClick={() => addStep("Trigger")}>+ Trigger</button>
          <button onClick={() => addStep("Condition")}>+ Condition</button>
          <button onClick={() => addStep("Action")}>+ Action</button>

        </div>

        {/* WORKFLOW VISUAL (manual steps, preserved) */}
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

      <Footer />

      <style jsx>{`
        .container {
          min-height: 100vh;
          background: var(--page-bg);
          color: var(--page-text);
          display: flex;
          flex-direction: column;
        }

        .main {
          padding: 40px;
          max-width: 1100px;
          margin: 0 auto;
          width: 100%;
          flex: 1;
          position: relative;
          z-index: 2;
        }

        h1 {
          margin-bottom: 8px;
        }

        .subtitle {
          color: var(--page-muted);
          margin-bottom: 20px;
          font-size: 14px;
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
          border: 1px solid var(--input-border);
          background: var(--input-bg);
          color: var(--page-text);
        }

        .ai-box button {
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          border: none;
          padding: 12px 20px;
          border-radius: 8px;
          color: white;
          cursor: pointer;
        }

        .ai-box button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* OPTIONAL FOIL INPUT */
        .ai-box.foilBox {
          margin-top: -8px;
          align-items: center;
        }

        .ai-box.foilBox input {
          flex: 1;
          padding: 9px 12px;
          border-radius: 8px;
          border: 1px solid var(--input-border);
          background: var(--input-bg);
          color: var(--page-text);
          font-size: 13px;
        }

        .foilLabel {
          font-size: 12px;
          color: var(--page-muted);
          white-space: nowrap;
        }

        /* ERROR / VALIDATION */
        .errorBox {
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.5);
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .validBanner {
          padding: 12px 15px;
          border-radius: 8px;
          font-weight: bold;
          margin-bottom: 8px;
        }

        .validBanner.ok {
          background: rgba(34,197,94,0.15);
          border: 1px solid rgba(34,197,94,0.5);
          color: var(--success);
        }

        .validBanner.bad {
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.5);
          color: var(--danger);
        }

        .issues {
          margin: 0 0 15px 20px;
          font-size: 13px;
        }

        .issues.bad { color: var(--danger); }
        .issues.warn { color: var(--warning); }

        /* VERACITY KEY + SOURCE TAGS */
        .legend {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 12px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .legend p { margin: 4px 0; }

        .srcTag {
          display: inline-block;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 2px 7px;
          border-radius: 6px;
          margin-right: 6px;
          vertical-align: middle;
        }

        .srcTag.model {
          background: rgba(252,211,77,0.35);
          color: var(--tag-model-text);
          border: 1px solid rgba(252,211,77,0.5);
        }

        .srcTag.calc {
          background: rgba(34,197,94,0.25);
          color: var(--tag-calc-text);
          border: 1px solid rgba(34,197,94,0.45);
        }

        .srcTag.user {
          background: rgba(59,130,246,0.25);
          color: var(--tag-user-text);
          border: 1px solid rgba(59,130,246,0.45);
        }

        .sectionNote {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0 0 8px 0;
        }

        .foilNote { margin-bottom: 8px; }

        /* PROPOSAL CARDS */
        .proposal { margin-bottom: 30px; }

        .propCard {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          padding: 20px;
          border-radius: 12px;
          margin-bottom: 15px;
        }

        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        .grid3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 15px;
          margin-bottom: 15px;
        }

        .listCard {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          padding: 15px;
          border-radius: 12px;
        }

        .listCard ul {
          margin-left: 18px;
          font-size: 13px;
        }

        .listCard li { margin: 4px 0; }

        .hint {
          color: var(--page-hint);
          font-size: 12px;
        }

        /* BELIEF CHIPS */
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 20px;
          font-size: 12px;
          background: rgba(168,85,247,0.2);
        }

        .chip em {
          font-style: normal;
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 10px;
          background: var(--subtle-bg);
        }

        .chip.user em { background: rgba(34,197,94,0.35); }
        .chip.assumed em { background: rgba(252,211,77,0.3); }

        /* STEPS */
        .steps { margin-top: 10px; }

        .pstep {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 12px;
          border-radius: 8px;
          background: rgba(168,85,247,0.15);
          margin: 8px 0;
        }

        .pstep.alt {
          background: rgba(99,102,241,0.15);
        }

        .rationale {
          color: var(--page-muted);
          font-size: 13px;
          margin: 4px 0 0 0;
        }

        .badge {
          flex-shrink: 0;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 4px 8px;
          border-radius: 6px;
          background: var(--subtle-bg);
        }

        .badge.trigger { background: rgba(34,197,94,0.35); }
        .badge.condition { background: rgba(252,211,77,0.3); color: var(--page-text); }
        .badge.action { background: rgba(168,85,247,0.45); }
        .badge.review { background: rgba(59,130,246,0.4); }

        /* REACT FLOW PREVIEW */
        .flowBox {
          height: 300px;
          border-radius: 8px;
          overflow: hidden;
          margin-top: 15px;
          background: var(--canvas-bg);
        }

        /* CONTRASTIVE DIFF */
        .diffList {
          margin: 8px 0 8px 18px;
          font-size: 13px;
        }

        .diffList li { margin: 4px 0; }

        .tag {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 6px;
          margin-right: 6px;
        }

        .tag.primary { background: rgba(168,85,247,0.45); }
        .tag.alt { background: rgba(99,102,241,0.45); }

        /* DRY RUN */
        .propCard.dry {
          border: 1px dashed rgba(34,197,94,0.5);
        }

        .dryList {
          margin: 8px 0 8px 18px;
          font-size: 13px;
        }

        .dryList li { margin: 5px 0; }

        /* LIMITATIONS (collapsed details) */
        .limits {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 15px;
          font-size: 13px;
        }

        .limits summary {
          cursor: pointer;
          color: var(--page-muted);
          font-weight: 600;
        }

        .limits ul {
          margin: 8px 0 4px 18px;
        }

        .limits li {
          margin: 5px 0;
          color: var(--text-secondary);
          font-size: 12px;
        }

        /* EXPLAINABILITY SCORESHEET */
        .scoresheet {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 25px;
          font-size: 13px;
        }

        .scoresheet summary {
          cursor: pointer;
          color: var(--page-muted);
          font-weight: 600;
        }

        .sheetIntro {
          margin: 10px 0 14px;
          color: var(--text-secondary);
          font-size: 12.5px;
          line-height: 1.6;
        }

        .sheetIntro a {
          color: var(--accent);
          text-decoration: underline;
        }

        .sheetSection h3 {
          margin: 12px 0 6px;
          color: var(--page-muted);
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Visually hidden but exposed to assistive technology; keeps heading
           levels correct without changing the design. */
        .srOnly {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .sheetSection ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .sheetItem {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 7px 0;
          border-top: 1px solid var(--card-border);
        }

        .score {
          flex-shrink: 0;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          padding: 3px 8px;
          border-radius: 6px;
          margin-top: 2px;
          white-space: nowrap;
        }

        .score.s-supported { background: rgba(34,197,94,0.25); color: var(--tag-calc-text); }
        .score.s-partial { background: rgba(252,211,77,0.3); color: var(--tag-model-text); }
        .score.s-unsupported { background: rgba(239,68,68,0.22); color: var(--danger); }
        .score.s-not_applicable { background: var(--subtle-bg); color: var(--page-hint); }

        .sheetText strong { font-size: 12.5px; }

        .sheetText p {
          margin: 3px 0 0;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.55;
        }

        .sheetFoot {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--card-border);
          color: var(--page-hint);
          font-size: 11.5px;
        }

        .grounding {
          color: var(--page-hint);
          font-size: 11px;
          margin-top: 10px;
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
          background: linear-gradient(135deg, #8b5cf6, #6366f1);
          color: white;
          cursor: pointer;
        }

        /* WORKFLOW AREA */
        .workflow {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
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
          color: var(--page-hint);
        }

        @media (max-width: 768px) {
          .main { padding: 15px; }

          .grid2, .grid3 { grid-template-columns: 1fr; }

          .ai-box { flex-direction: column; }

          .ai-box.foilBox { align-items: stretch; }

          .flowBox { height: 220px; }

          .actions button { margin-bottom: 8px; }
        }
      `}</style>

      <style jsx global>{`
        .wf-node {
          width: 220px;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid rgba(168,85,247,0.5);
          background: var(--card-bg);
          color: var(--page-text);
          font-size: 12px;
          white-space: pre-line;
          text-align: center;
        }
        .wf-node.wf-trigger { border-color: rgba(34,197,94,0.7); }
        .wf-node.wf-condition { border-color: rgba(252,211,77,0.7); }
        .wf-node.wf-action { border-color: rgba(168,85,247,0.9); }
        .wf-node.wf-review { border-color: rgba(59,130,246,0.7); }
      `}</style>

    </div>
  );
}
