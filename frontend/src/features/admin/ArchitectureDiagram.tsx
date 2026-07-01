import { Card, SectionTitle } from "../../components/ui";

/**
 * Inline SVG architecture diagram — closes Todoist Blueprint → Wire diagram.
 *
 * Rendered on the admin Pulse page so it's easy to find but not in a
 * client's face. Values here should track what's actually running in prod
 * so a new engineer picking this up can navigate the system in 30 seconds.
 */
export default function ArchitectureDiagram() {
  return (
    <Card>
      <SectionTitle sub="What talks to what. Update when the topology changes.">
        System architecture
      </SectionTitle>

      <div className="mt-2 -mx-2">
        <svg
          viewBox="0 0 900 380"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-auto"
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-ink-400 dark:text-ink-500"/>
            </marker>
            <style>
              {`
                .node-box { fill: white; stroke-width: 1.5; }
                .dark .node-box { fill: #1e293b; }
                .node-title { font: 600 12px Helvetica, Arial, sans-serif; }
                .node-sub { font: 10px Helvetica, Arial, sans-serif; fill: #64748b; }
                .dark .node-sub { fill: #94a3b8; }
                .edge { stroke-width: 1.4; fill: none; }
                .edge-label { font: 10px Helvetica, Arial, sans-serif; fill: #64748b; }
                .dark .edge-label { fill: #94a3b8; }
                .layer-label { font: 700 9px Helvetica, Arial, sans-serif; letter-spacing: 1.2px; text-transform: uppercase; fill: #94a3b8; }
              `}
            </style>
          </defs>

          {/* Layer strip labels */}
          <text x="20" y="30" className="layer-label">Browser</text>
          <text x="20" y="130" className="layer-label">Edge</text>
          <text x="20" y="215" className="layer-label">Application</text>
          <text x="20" y="315" className="layer-label">External</text>

          {/* Browser */}
          <rect x="330" y="18" width="240" height="52" rx="8" className="node-box" stroke="#0284c7"/>
          <text x="450" y="42" className="node-title" textAnchor="middle" fill="#0284c7">Client browser (React + Vite)</text>
          <text x="450" y="58" className="node-sub" textAnchor="middle">Zustand · Firebase Auth SDK · axios</text>

          {/* nginx */}
          <rect x="330" y="118" width="240" height="52" rx="8" className="node-box" stroke="#475569"/>
          <text x="450" y="142" className="node-title" textAnchor="middle" fill="#475569">Nginx reverse proxy</text>
          <text x="450" y="158" className="node-sub" textAnchor="middle">TLS · HSTS+CSP+X-Frame · rate limit · /api/*</text>

          {/* FastAPI */}
          <rect x="330" y="205" width="240" height="70" rx="8" className="node-box" stroke="#0f766e"/>
          <text x="450" y="228" className="node-title" textAnchor="middle" fill="#0f766e">FastAPI backend</text>
          <text x="450" y="244" className="node-sub" textAnchor="middle">tier gates · impersonate · audit · Sentry</text>
          <text x="450" y="260" className="node-sub" textAnchor="middle">app/api/v1 · services/vam · services/report</text>

          {/* Firebase */}
          <rect x="30" y="305" width="200" height="60" rx="8" className="node-box" stroke="#f59e0b"/>
          <text x="130" y="328" className="node-title" textAnchor="middle" fill="#f59e0b">Firebase Auth</text>
          <text x="130" y="344" className="node-sub" textAnchor="middle">ID tokens · password reset</text>

          {/* Supabase */}
          <rect x="255" y="305" width="200" height="60" rx="8" className="node-box" stroke="#059669"/>
          <text x="355" y="328" className="node-title" textAnchor="middle" fill="#059669">Supabase</text>
          <text x="355" y="344" className="node-sub" textAnchor="middle">Postgres · Storage (bucket)</text>

          {/* VAM */}
          <rect x="480" y="305" width="200" height="60" rx="8" className="node-box" stroke="#7c3aed"/>
          <text x="580" y="328" className="node-title" textAnchor="middle" fill="#7c3aed">VAM engine (Ravi)</text>
          <text x="580" y="344" className="node-sub" textAnchor="middle">backtestravi.insightfusion.*</text>

          {/* SendGrid + Sentry */}
          <rect x="705" y="305" width="175" height="60" rx="8" className="node-box" stroke="#dc2626"/>
          <text x="792" y="328" className="node-title" textAnchor="middle" fill="#dc2626">SendGrid · Sentry</text>
          <text x="792" y="344" className="node-sub" textAnchor="middle">email · errors (DSN-optional)</text>

          {/* Edges */}
          <path d="M 450 70 L 450 118" className="edge" stroke="currentColor" markerEnd="url(#arrow)"/>
          <text x="462" y="97" className="edge-label">HTTPS</text>

          <path d="M 450 170 L 450 205" className="edge" stroke="currentColor" markerEnd="url(#arrow)"/>
          <text x="462" y="192" className="edge-label">proxy_pass</text>

          {/* Backend → each external */}
          <path d="M 380 275 C 380 290, 200 290, 130 305" className="edge" stroke="currentColor" markerEnd="url(#arrow)"/>
          <path d="M 420 275 C 420 290, 380 292, 355 305" className="edge" stroke="currentColor" markerEnd="url(#arrow)"/>
          <path d="M 490 275 C 490 290, 540 292, 580 305" className="edge" stroke="currentColor" markerEnd="url(#arrow)"/>
          <path d="M 530 275 C 530 290, 720 292, 792 305" className="edge" stroke="currentColor" markerEnd="url(#arrow)"/>
        </svg>
      </div>

      <p className="mt-3 text-[11px] text-ink-500 dark:text-ink-400 italic">
        Data flow: browser → nginx (TLS, rate limit, security headers) → FastAPI. Backend delegates auth to Firebase, persists to Supabase Postgres + Storage, proxies VAM engine calls with retries + circuit breaker, and dispatches errors + email through Sentry / SendGrid (both DSN-optional so absence is a no-op). Impersonation, tier gates, and audit trail all sit in the FastAPI layer.
      </p>
    </Card>
  );
}
