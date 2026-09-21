import type { ReactNode } from "react";
import type { CaseStudyKind } from "./caseStudies";

/**
 * Hero mini-mockups for the case-study cards. Each `kind` renders a
 * self-contained SVG that echoes what the work does (chart for the engines, table
 * for the scanner, order book for market making, and so on) so the grid does not
 * become a wall of identical gradient blocks. They are illustrations: no real
 * data, and no figures that could be read as results.
 *
 * The first six kinds are the original portfolio thumbnails, moved here unchanged.
 * viewBox is 320x128 so the SVG scales cleanly at any card width. Gradient ids
 * are unique per kind because every card is on the page at once.
 */

/** Shared frame for the newer thumbnails: gradient background at 320x128. */
function Frame({ id, from, to, children }: { id: string; from: string; to: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
      <defs>
        <linearGradient id={`cs-${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="320" height="128" fill={`url(#cs-${id}-bg)`} />
      {children}
    </svg>
  );
}

export default function CaseStudyThumbnail({ kind }: { kind: CaseStudyKind }) {
  switch (kind) {
    case "backtest-engine":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="bt-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7c3aed" />
              <stop offset="1" stopColor="#4c1d95" />
            </linearGradient>
            <linearGradient id="bt-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#bt-bg)" />
          {/* KPI tiles */}
          <g fill="rgba(255,255,255,0.14)">
            <rect x="14" y="14" width="72" height="30" rx="6" />
            <rect x="94" y="14" width="72" height="30" rx="6" />
            <rect x="174" y="14" width="72" height="30" rx="6" />
          </g>
          <g fill="rgba(255,255,255,0.9)" fontFamily="ui-monospace, SFMono-Regular, monospace" fontSize="10" fontWeight="700">
            <text x="20" y="34">+27.4%</text>
            <text x="100" y="34">1.31</text>
            <text x="180" y="34">-14.2%</text>
          </g>
          <g fill="rgba(255,255,255,0.55)" fontFamily="ui-sans-serif, system-ui" fontSize="6">
            <text x="20" y="42">RETURN</text>
            <text x="100" y="42">SHARPE</text>
            <text x="180" y="42">MAX DD</text>
          </g>
          {/* Equity curve */}
          <path
            d="M 14 100 L 40 90 L 62 96 L 88 78 L 114 82 L 140 66 L 170 72 L 200 54 L 232 60 L 260 46 L 290 50 L 306 42"
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 14 100 L 40 90 L 62 96 L 88 78 L 114 82 L 140 66 L 170 72 L 200 54 L 232 60 L 260 46 L 290 50 L 306 42 L 306 116 L 14 116 Z"
            fill="url(#bt-area)"
          />
        </svg>
      );

    case "vam-engine":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="vam-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#10b981" />
              <stop offset="1" stopColor="#0f766e" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#vam-bg)" />
          {/* Candlesticks - 20 of them, mostly green with a couple red */}
          {(() => {
            const candles = [
              { x: 14,  o: 82, c: 74 }, { x: 24, o: 78, c: 68 }, { x: 34, o: 72, c: 78 },
              { x: 44,  o: 76, c: 66 }, { x: 54, o: 68, c: 60 }, { x: 64, o: 62, c: 70 },
              { x: 74,  o: 68, c: 58 }, { x: 84, o: 60, c: 52 }, { x: 94, o: 54, c: 60 },
              { x: 104, o: 58, c: 46 }, { x: 114, o: 48, c: 40 }, { x: 124, o: 42, c: 48 },
              { x: 134, o: 44, c: 34 }, { x: 144, o: 36, c: 28 }, { x: 154, o: 30, c: 38 },
              { x: 164, o: 34, c: 24 }, { x: 174, o: 26, c: 20 }, { x: 184, o: 22, c: 30 },
              { x: 194, o: 28, c: 18 }, { x: 204, o: 20, c: 14 },
            ];
            return candles.map((k) => {
              const green = k.c < k.o;
              const top = Math.min(k.o, k.c);
              const h = Math.max(2, Math.abs(k.o - k.c));
              return (
                <g key={k.x}>
                  <line
                    x1={k.x + 3}
                    y1={top - 4}
                    x2={k.x + 3}
                    y2={top + h + 4}
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth="1"
                  />
                  <rect
                    x={k.x}
                    y={top}
                    width={6}
                    height={h}
                    fill={green ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.6)"}
                    rx="1"
                  />
                </g>
              );
            });
          })()}
          {/* Buy signal marker */}
          <g>
            <circle cx="94" cy="60" r="6" fill="rgba(255,255,255,0.95)" />
            <path d="M 91 60 L 94 63 L 98 57" stroke="#059669" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {/* Live label */}
          <g>
            <rect x="230" y="12" width="76" height="20" rx="10" fill="rgba(0,0,0,0.35)" />
            <circle cx="242" cy="22" r="3" fill="#4ade80">
              <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <text x="250" y="26" fill="rgba(255,255,255,0.95)" fontFamily="ui-sans-serif, system-ui" fontSize="10" fontWeight="700">
              LIVE · VAM
            </text>
          </g>
          {/* Ticker text bottom */}
          <text x="14" y="118" fill="rgba(255,255,255,0.7)" fontFamily="ui-monospace" fontSize="9">
            RELIANCE · +2.4%  ·  INFY · +1.8%
          </text>
        </svg>
      );

    case "strategy-library":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="sl-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0ea5e9" />
              <stop offset="1" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#sl-bg)" />
          {/* Grid lines */}
          <g stroke="rgba(255,255,255,0.08)" strokeWidth="1">
            <line x1="0" y1="40" x2="320" y2="40" />
            <line x1="0" y1="70" x2="320" y2="70" />
            <line x1="0" y1="100" x2="320" y2="100" />
          </g>
          {/* Three different strategy equity curves */}
          <path
            d="M 14 96 L 40 92 L 68 84 L 96 78 L 128 70 L 158 66 L 190 54 L 222 50 L 254 42 L 288 32 L 306 30"
            fill="none"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M 14 100 L 40 96 L 68 92 L 96 88 L 128 82 L 158 82 L 190 74 L 222 70 L 254 68 L 288 60 L 306 56"
            fill="none"
            stroke="rgba(163,230,253,0.9)"
            strokeWidth="1.4"
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
          <path
            d="M 14 104 L 40 100 L 68 102 L 96 96 L 128 94 L 158 88 L 190 90 L 222 84 L 254 76 L 288 74 L 306 68"
            fill="none"
            stroke="rgba(56,189,248,0.9)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          {/* Legend chips */}
          <g fontFamily="ui-sans-serif, system-ui" fontSize="8" fontWeight="600">
            <g transform="translate(14, 14)">
              <rect width="68" height="16" rx="8" fill="rgba(0,0,0,0.28)" />
              <circle cx="8" cy="8" r="3" fill="rgba(255,255,255,0.95)" />
              <text x="16" y="11" fill="rgba(255,255,255,0.95)">Alligator+CPR</text>
            </g>
            <g transform="translate(88, 14)">
              <rect width="80" height="16" rx="8" fill="rgba(0,0,0,0.28)" />
              <circle cx="8" cy="8" r="3" fill="rgba(163,230,253,0.95)" />
              <text x="16" y="11" fill="rgba(255,255,255,0.95)">Supertrend+HA</text>
            </g>
            <g transform="translate(174, 14)">
              <rect width="76" height="16" rx="8" fill="rgba(0,0,0,0.28)" />
              <circle cx="8" cy="8" r="3" fill="rgba(56,189,248,0.95)" />
              <text x="16" y="11" fill="rgba(255,255,255,0.95)">RSI Reversion</text>
            </g>
          </g>
        </svg>
      );

    case "market-pulse":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="mp-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f59e0b" />
              <stop offset="1" stopColor="#c2410c" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#mp-bg)" />
          {/* Sector heatmap grid - 8 columns × 4 rows */}
          {(() => {
            const cells: { r: number; c: number; a: number }[] = [];
            // deterministic pseudo-random alphas so it always looks the same
            const seeds = [
              0.82, 0.35, 0.55, 0.75, 0.9, 0.42, 0.68, 0.28,
              0.6, 0.85, 0.4, 0.5, 0.72, 0.88, 0.34, 0.62,
              0.44, 0.66, 0.78, 0.36, 0.58, 0.8, 0.52, 0.48,
              0.7, 0.38, 0.6, 0.86, 0.46, 0.7, 0.32, 0.55,
            ];
            for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
              cells.push({ r, c, a: seeds[r * 8 + c] });
            }
            return cells.map((cell) => (
              <rect
                key={`${cell.r}-${cell.c}`}
                x={14 + cell.c * 36}
                y={40 + cell.r * 16}
                width="32"
                height="12"
                rx="2"
                fill="rgba(255,255,255,0.95)"
                opacity={cell.a}
              />
            ));
          })()}
          {/* Header labels */}
          <g fontFamily="ui-sans-serif, system-ui" fontSize="7" fill="rgba(255,255,255,0.85)" fontWeight="600">
            <text x="14" y="30">SECTOR HEATMAP · TODAY</text>
          </g>
          {/* Bottom stats row */}
          <g fontFamily="ui-monospace" fontSize="9" fill="rgba(255,255,255,0.95)" fontWeight="700">
            <text x="14" y="120">ADV: 1,842</text>
            <text x="94" y="120">DEC: 984</text>
            <text x="164" y="120">RATIO: 1.87</text>
            <text x="240" y="120">VIX: 12.4</text>
          </g>
        </svg>
      );

    case "universe-scanner":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="us-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d946ef" />
              <stop offset="1" stopColor="#be185d" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#us-bg)" />
          {/* Header */}
          <text x="14" y="20" fill="rgba(255,255,255,0.95)" fontFamily="ui-sans-serif, system-ui" fontSize="9" fontWeight="700">
            RANKED SHORTLIST · ₹1K–20K CR
          </text>
          {/* Table header */}
          <g fill="rgba(255,255,255,0.55)" fontFamily="ui-sans-serif, system-ui" fontSize="7" fontWeight="700">
            <text x="14" y="38">#</text>
            <text x="34" y="38">TICKER</text>
            <text x="122" y="38">SCORE</text>
            <text x="180" y="38">TREND</text>
            <text x="248" y="38">Δ 3M</text>
          </g>
          {/* Divider */}
          <line x1="14" y1="42" x2="306" y2="42" stroke="rgba(255,255,255,0.25)" />
          {/* 5 rows */}
          {[
            { i: "1", t: "POLYCAB", s: "94.6", d: "+22.4%" },
            { i: "2", t: "AUBANK",  s: "91.3", d: "+18.7%" },
            { i: "3", t: "TATAPWR", s: "88.1", d: "+16.2%" },
            { i: "4", t: "COFORGE", s: "85.4", d: "+13.9%" },
            { i: "5", t: "DELHIVR", s: "82.7", d: "+11.5%" },
          ].map((row, idx) => (
            <g key={row.t} fontFamily="ui-monospace" fontSize="8" fill="rgba(255,255,255,0.9)">
              <text x="14" y={56 + idx * 14}>{row.i}</text>
              <text x="34" y={56 + idx * 14} fontWeight="700">{row.t}</text>
              <text x="122" y={56 + idx * 14}>{row.s}</text>
              {/* trend bar */}
              <rect
                x="180"
                y={49 + idx * 14}
                width={parseFloat(row.s) * 0.55}
                height="6"
                rx="1"
                fill="rgba(255,255,255,0.75)"
              />
              <text x="248" y={56 + idx * 14}>{row.d}</text>
            </g>
          ))}
        </svg>
      );

    case "admin-console":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="ac-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#475569" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#ac-bg)" />
          {/* Header row */}
          <g fontFamily="ui-sans-serif, system-ui" fontSize="8" fontWeight="700">
            <text x="14" y="18" fill="rgba(255,255,255,0.95)">AUDIT LOG</text>
            <g transform="translate(266, 8)">
              <rect width="40" height="14" rx="7" fill="rgba(16,185,129,0.28)" />
              <circle cx="8" cy="7" r="2" fill="#34d399" />
              <text x="14" y="10" fill="rgba(255,255,255,0.95)" fontSize="7">SIGNED</text>
            </g>
          </g>
          {/* Log rows */}
          {[
            { t: "14:32", a: "signup.approve",  who: "admin",   ok: true },
            { t: "14:18", a: "backtest.upload", who: "chirag",  ok: true },
            { t: "14:04", a: "terms.accept",    who: "client",  ok: true },
            { t: "13:47", a: "quote.send",      who: "admin",   ok: true },
            { t: "13:22", a: "engagement.edit", who: "admin",   ok: true },
          ].map((row, idx) => (
            <g key={idx} fontFamily="ui-monospace" fontSize="8">
              <rect
                x="14"
                y={30 + idx * 18}
                width="292"
                height="14"
                rx="3"
                fill="rgba(255,255,255,0.05)"
              />
              <text x="22" y={40 + idx * 18} fill="rgba(255,255,255,0.55)">{row.t}</text>
              <text x="58" y={40 + idx * 18} fill="rgba(255,255,255,0.95)" fontWeight="700">{row.a}</text>
              <text x="180" y={40 + idx * 18} fill="rgba(255,255,255,0.7)">{row.who}</text>
              <g transform={`translate(280, ${34 + idx * 18})`}>
                <circle cx="4" cy="4" r="4" fill="#10b981" />
                <path d="M 2 4 L 3.5 5.5 L 6 3" stroke="white" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
          ))}
        </svg>
      );

    case "market-making": {
      const bids = [16, 22, 28, 34, 40, 46];
      const asks = [14, 20, 30, 34, 44, 50];
      return (
        <Frame id="mm" from="#4f46e5" to="#1e1b4b">
          <line x1="160" y1="12" x2="160" y2="94" stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3" />
          {bids.map((w, i) => (
            <rect key={`b${i}`} x={154 - w * 2.2} y={14 + i * 13} width={w * 2.2} height="9" rx="2" fill="rgba(52,211,153,0.75)" />
          ))}
          {asks.map((w, i) => (
            <rect key={`a${i}`} x="166" y={14 + i * 13} width={w * 2.2} height="9" rx="2" fill="rgba(251,113,133,0.75)" />
          ))}
          <g fontFamily="ui-sans-serif, system-ui" fontSize="6" fill="rgba(255,255,255,0.6)" fontWeight="700">
            <text x="14" y="10">BID</text>
            <text x="292" y="10">ASK</text>
          </g>
          <rect x="100" y="104" width="120" height="6" rx="3" fill="rgba(255,255,255,0.16)" />
          <rect x="160" y="104" width="24" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
          <text x="160" y="122" textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize="6" fill="rgba(255,255,255,0.6)" fontWeight="700">INVENTORY</text>
        </Frame>
      );
    }

    case "smart-routing": {
      const venues = [
        { name: "VENUE A", w: 3.4, fill: 60 },
        { name: "VENUE B", w: 2.4, fill: 44 },
        { name: "VENUE C", w: 1.7, fill: 30 },
        { name: "VENUE D", w: 1.1, fill: 18 },
      ];
      return (
        <Frame id="sor" from="#0891b2" to="#164e63">
          <rect x="14" y="46" width="58" height="36" rx="6" fill="rgba(255,255,255,0.18)" />
          <g fontFamily="ui-sans-serif, system-ui" fontSize="7" fontWeight="700" fill="rgba(255,255,255,0.95)" textAnchor="middle">
            <text x="43" y="61">PARENT</text>
            <text x="43" y="72">ORDER</text>
          </g>
          {venues.map((v, i) => {
            const y = 14 + i * 26;
            return (
              <g key={v.name}>
                <path d={`M72 64 C 130 64, 160 ${y + 9}, 222 ${y + 9}`} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={v.w} strokeLinecap="round" />
                <rect x="222" y={y} width="86" height="18" rx="4" fill="rgba(255,255,255,0.14)" />
                <text x="230" y={y + 12} fontFamily="ui-sans-serif, system-ui" fontSize="7" fontWeight="700" fill="rgba(255,255,255,0.9)">{v.name}</text>
                <rect x="270" y={y + 7} width="30" height="4" rx="2" fill="rgba(255,255,255,0.2)" />
                <rect x="270" y={y + 7} width={(30 * v.fill) / 60} height="4" rx="2" fill="rgba(255,255,255,0.85)" />
              </g>
            );
          })}
        </Frame>
      );
    }

    case "stat-arb":
      return (
        <Frame id="sa" from="#0d9488" to="#134e4a">
          <path d="M14 40 L40 34 L66 38 L92 28 L118 32 L144 22 L170 30 L196 20 L222 26 L248 18 L274 24 L306 16" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M14 46 L40 42 L66 40 L92 36 L118 38 L144 30 L170 32 L196 28 L222 30 L248 24 L274 30 L306 22" fill="none" stroke="rgba(253,224,71,0.9)" strokeWidth="1.5" strokeLinejoin="round" />
          <line x1="14" y1="58" x2="306" y2="58" stroke="rgba(255,255,255,0.2)" />
          <line x1="14" y1="76" x2="306" y2="76" stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
          <line x1="14" y1="90" x2="306" y2="90" stroke="rgba(255,255,255,0.5)" />
          <line x1="14" y1="104" x2="306" y2="104" stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
          <path d="M14 90 L40 84 L66 96 L92 100 L118 88 L144 74 L170 92 L196 106 L222 90 L248 78 L274 94 L306 90" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="144" cy="74" r="3" fill="#fb7185" />
          <circle cx="196" cy="106" r="3" fill="#34d399" />
          <circle cx="248" cy="78" r="3" fill="#fb7185" />
        </Frame>
      );

    case "liquidity-provision": {
      const bidGaps = new Set([5, 11]);
      const askGaps = new Set([8]);
      const meters = [
        { label: "PRESENCE", fill: 0.9 },
        { label: "DISPLAYED", fill: 0.62 },
        { label: "SPREAD", fill: 0.48 },
      ];
      return (
        <Frame id="lp" from="#be123c" to="#4c0519">
          <g fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="rgba(255,255,255,0.6)">
            <text x="14" y="16">BID QUOTED</text>
            <text x="14" y="42">ASK QUOTED</text>
          </g>
          {Array.from({ length: 18 }, (_, i) => (
            <g key={i}>
              <rect x={14 + i * 16.2} y="20" width="13" height="10" rx="2" fill={bidGaps.has(i) ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"} />
              <rect x={14 + i * 16.2} y="46" width="13" height="10" rx="2" fill={askGaps.has(i) ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"} />
            </g>
          ))}
          {meters.map((m, i) => (
            <g key={m.label} transform={`translate(0, ${72 + i * 16})`}>
              <text x="14" y="7" fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="rgba(255,255,255,0.7)">{m.label}</text>
              <rect x="70" y="1" width="236" height="7" rx="3.5" fill="rgba(255,255,255,0.14)" />
              <rect x="70" y="1" width={236 * m.fill} height="7" rx="3.5" fill="rgba(255,255,255,0.85)" />
            </g>
          ))}
        </Frame>
      );
    }

    case "cross-exchange":
      return (
        <Frame id="xa" from="#65a30d" to="#365314">
          <path d="M122 52 L158 44 L194 56 L230 62 L230 64 L194 66 L158 66 L122 66 Z" fill="rgba(253,224,71,0.35)" />
          <path d="M14 70 L50 64 L86 68 L122 52 L158 44 L194 56 L230 62 L266 58 L306 60" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14 72 L50 66 L86 72 L122 66 L158 66 L194 66 L230 64 L266 60 L306 61" fill="none" stroke="rgba(190,242,100,0.95)" strokeWidth="1.6" strokeLinejoin="round" />
          <g stroke="#fde047" strokeWidth="1.4" strokeLinecap="round">
            <line x1="158" y1="47" x2="158" y2="63" />
            <path d="M155 50 L158 46 L161 50" fill="none" />
            <path d="M155 60 L158 64 L161 60" fill="none" />
          </g>
          <g fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700">
            <text x="14" y="28" fill="rgba(255,255,255,0.9)">VENUE A</text>
            <text x="14" y="38" fill="rgba(190,242,100,0.95)">VENUE B</text>
            <text x="168" y="34" fill="#fde047">GAP</text>
          </g>
          <g transform="translate(14, 96)" fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="rgba(255,255,255,0.85)">
            <rect width="88" height="16" rx="8" fill="rgba(255,255,255,0.14)" />
            <text x="10" y="10.5">BUY B</text>
            <text x="50" y="10.5">SELL A</text>
          </g>
        </Frame>
      );

    case "mev-defi": {
      const nodes = [
        { id: "a", x: 48, y: 66 },
        { id: "b", x: 124, y: 28 },
        { id: "c", x: 212, y: 34 },
        { id: "d", x: 276, y: 80 },
        { id: "e", x: 168, y: 100 },
      ];
      const at = (id: string) => nodes.find((n) => n.id === id)!;
      const faint: [string, string][] = [["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"], ["e", "a"], ["b", "e"]];
      const hot: [string, string][] = [["a", "b"], ["b", "c"], ["c", "e"], ["e", "a"]];
      return (
        <Frame id="mev" from="#1d4ed8" to="#1e1b4b">
          {faint.map(([p, q]) => (
            <line key={p + q} x1={at(p).x} y1={at(p).y} x2={at(q).x} y2={at(q).y} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
          ))}
          {hot.map(([p, q]) => (
            <line key={"h" + p + q} x1={at(p).x} y1={at(p).y} x2={at(q).x} y2={at(q).y} stroke="#fde047" strokeWidth="2" strokeLinecap="round" />
          ))}
          {nodes.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r="11" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.7)" />
              <circle cx={n.x} cy={n.y} r="4" fill="rgba(255,255,255,0.9)" />
            </g>
          ))}
          <g transform="translate(14, 108)" fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="rgba(255,255,255,0.75)">
            <text y="6">GAS</text>
            <rect x="22" y="0" width="60" height="7" rx="3.5" fill="rgba(255,255,255,0.16)" />
            <rect x="22" y="0" width="22" height="7" rx="3.5" fill="#fde047" />
          </g>
        </Frame>
      );
    }

    case "deep-portfolio": {
      const layers = [
        [28, 52, 76, 100],
        [20, 44, 64, 84, 108],
        [36, 64, 92],
      ];
      const xs = [34, 92, 150];
      const weights = [0.85, 0.6, 0.42, 0.28, 0.16];
      return (
        <Frame id="dp" from="#a21caf" to="#4a044e">
          {layers.slice(0, -1).map((ys, li) =>
            ys.flatMap((y1, i) =>
              layers[li + 1].map((y2, j) => (
                <line key={`${li}-${i}-${j}`} x1={xs[li]} y1={y1} x2={xs[li + 1]} y2={y2} stroke="rgba(255,255,255,0.16)" strokeWidth="0.8" />
              )),
            ),
          )}
          {layers.map((ys, li) =>
            ys.map((y, i) => <circle key={`n${li}-${i}`} cx={xs[li]} cy={y} r="5" fill="rgba(255,255,255,0.9)" />),
          )}
          <text x="206" y="16" fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="rgba(255,255,255,0.65)">LEARNED WEIGHTS</text>
          {weights.map((w, i) => (
            <g key={i}>
              <rect x="206" y={26 + i * 18} width="100" height="10" rx="3" fill="rgba(255,255,255,0.12)" />
              <rect x="206" y={26 + i * 18} width={100 * w} height="10" rx="3" fill="rgba(255,255,255,0.85)" />
            </g>
          ))}
        </Frame>
      );
    }

    case "nautilus-platform": {
      const steps = ["DATA", "ENGINE", "STRATEGY", "OPTIONS", "REPORT"];
      return (
        <Frame id="np" from="#0369a1" to="#082f49">
          <g fontFamily="ui-sans-serif, system-ui" fontSize="6.5" fontWeight="700" textAnchor="middle">
            {steps.map((s, i) => (
              <g key={s}>
                <rect x={12 + i * 60} y="46" width="52" height="30" rx="6" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.4)" />
                <text x={38 + i * 60} y="64" fill="rgba(255,255,255,0.95)">{s}</text>
                {i < steps.length - 1 && <path d={`M${64 + i * 60} 61 L${72 + i * 60} 61`} stroke="rgba(255,255,255,0.8)" strokeWidth="1.4" />}
              </g>
            ))}
          </g>
          <path d="M 278 78 C 278 112, 158 112, 158 80" fill="none" stroke="#fde047" strokeWidth="1.4" strokeDasharray="3 3" />
          <path d="M155 85 L158 79 L161 85" fill="none" stroke="#fde047" strokeWidth="1.4" />
          <text x="218" y="108" textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="#fde047">OPTIMISE</text>
          <g transform="translate(12, 14)" fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="rgba(255,255,255,0.85)">
            <rect width="62" height="16" rx="8" fill="rgba(255,255,255,0.14)" />
            <text x="10" y="10.5">YAML CONFIG</text>
          </g>
        </Frame>
      );
    }

    case "optimisation": {
      const dots = Array.from({ length: 30 }, (_, i) => ({
        x: 20 + ((i * 37) % 210),
        y: 104 - Math.min(44, (i * 53) % 46) - Math.floor(i / 3),
      }));
      return (
        <Frame id="op" from="#b45309" to="#451a03">
          <g fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="rgba(255,255,255,0.9)">
            <rect x="14" y="14" width="64" height="15" rx="3" fill="rgba(255,255,255,0.22)" />
            <text x="20" y="24">TRAIN</text>
            <rect x="82" y="14" width="146" height="15" rx="3" fill="rgba(255,255,255,0.14)" />
            <text x="88" y="24">VALIDATION</text>
            <rect x="232" y="14" width="74" height="15" rx="3" fill="rgba(253,224,71,0.35)" stroke="#fde047" />
            <text x="238" y="24">HOLDOUT</text>
          </g>
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r="2" fill="rgba(255,255,255,0.55)" />
          ))}
          <circle cx="196" cy="58" r="4" fill="#fde047" />
          <circle cx="196" cy="58" r="8" fill="none" stroke="#fde047" strokeOpacity="0.6" />
          <path d="M 196 58 L 262 58 L 262 80" fill="none" stroke="#fde047" strokeWidth="1.2" strokeDasharray="3 3" />
          <path d="M259 76 L262 82 L265 76" fill="none" stroke="#fde047" strokeWidth="1.2" />
          <text x="262" y="96" textAnchor="middle" fontFamily="ui-sans-serif, system-ui" fontSize="6" fontWeight="700" fill="#fde047">ONE SHOT</text>
        </Frame>
      );
    }

    case "strategy-dashboard": {
      const cell = (c: number, r: number) => {
        const v = (c * 7 + r * 13 + c * r) % 9;
        if (v < 2) return "rgba(248,113,113,0.6)";
        if (v < 4) return "rgba(255,255,255,0.08)";
        if (v < 7) return "rgba(74,222,128,0.45)";
        return "rgba(74,222,128,0.9)";
      };
      return (
        <Frame id="sd" from="#111111" to="#000000">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={14 + i * 76} y="8" width="70" height="12" rx="2" fill="rgba(255,255,255,0.07)" />
          ))}
          {Array.from({ length: 15 }, (_, c) =>
            Array.from({ length: 7 }, (_, r) => (
              <rect key={`${c}-${r}`} x={14 + c * 9.6} y={28 + r * 13} width="8" height="10" rx="2" fill={cell(c, r)} />
            )),
          )}
          <line x1="184" y1="94" x2="306" y2="94" stroke="rgba(255,255,255,0.15)" />
          {[214, 254].map((x) => (
            <line key={x} x1={x} y1="30" x2={x} y2="94" stroke="#f59e0b" strokeOpacity="0.55" strokeDasharray="2 3" />
          ))}
          <path d="M184 90 L200 84 L214 86 L230 70 L246 74 L262 56 L278 60 L292 44 L306 38 L306 94 L184 94 Z" fill="rgba(74,222,128,0.16)" />
          <path d="M184 90 L200 84 L214 86 L230 70 L246 74 L262 56 L278 60 L292 44 L306 38" fill="none" stroke="#4ade80" strokeWidth="1.5" strokeLinejoin="round" />
        </Frame>
      );
    }
  }
}
