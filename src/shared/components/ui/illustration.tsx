export type IllustrationName =
  | "inbox"
  | "search"
  | "calendar"
  | "done"
  | "document"
  | "chart"
  | "board"
  | "seats"
  | "not-found"
  | "forbidden"
  | "error";

const DASHED = { className: "stroke-zinc-300", strokeDasharray: "3 4" } as const;

function Shadow({ width }: { width: number }) {
  return <rect x={120 - width / 2} y="145" width={width} height="6" rx="3" className="fill-zinc-100" stroke="none" data-shadow />;
}

function Line({ x, y, width, tone = "strong" }: { x: number; y: number; width: number; tone?: "strong" | "soft" }) {
  return <path d={`M${x} ${y}h${width}`} className={tone === "strong" ? "stroke-zinc-200" : "stroke-zinc-100"} strokeWidth={tone === "strong" ? 4 : 3} />;
}

const CALENDAR_COLUMNS = [70, 84, 98, 112, 126, 140, 154];
const CALENDAR_ROWS = [66, 80, 94, 108, 122];

const SCENES: Record<IllustrationName, React.ReactNode> = {
  inbox: (
    <>
      <Shadow width={156} />
      <path d="M96 24h34l14 14v62H96z" {...DASHED} />
      <path d="M130 24v14h14" {...DASHED} />
      <path d="M104 50h24M104 60h32M104 70h28" className="stroke-zinc-200" strokeDasharray="2 4" />
      <path d="M66 80h108l16 24H50z" className="fill-zinc-100" stroke="none" />
      <path d="M70 87h100" className="stroke-zinc-200" />
      <path d="M50 104l16-24h108l16 24" />
      <path d="M50 104h38l6 9h52l6-9h38v34a6 6 0 0 1-6 6H56a6 6 0 0 1-6-6z" className="fill-surface" />
      <rect x="104" y="122" width="32" height="12" rx="3" className="fill-primary/10" stroke="none" />
      <path d="M111 128h18" className="stroke-primary" strokeWidth={2} />
      <rect x="62" y="144" width="14" height="4" rx="1" className="fill-zinc-200" stroke="none" />
      <rect x="164" y="144" width="14" height="4" rx="1" className="fill-zinc-200" stroke="none" />
    </>
  ),
  search: (
    <>
      <Shadow width={150} />
      <rect x="44" y="24" width="104" height="124" rx="8" className="fill-surface" stroke="none" />
      <path d="M52 24h88a8 8 0 0 1 8 8v12H44V32a8 8 0 0 1 8-8z" className="fill-zinc-100" stroke="none" />
      <rect x="44" y="24" width="104" height="124" rx="8" />
      <path d="M44 44h104" />
      <path d="M56 34h28" className="stroke-zinc-300" strokeWidth={4} />
      <rect x="110" y="29" width="14" height="10" rx="5" className="fill-surface stroke-zinc-300" />
      <rect x="127" y="29" width="14" height="10" rx="5" className="fill-surface stroke-zinc-300" />
      {[56, 78, 100, 122].map((y) => (
        <g key={y}>
          <circle cx="58" cy={y + 5} r="6" className="fill-zinc-100" stroke="none" />
          <Line x={70} y={y + 2} width={40} />
          <Line x={70} y={y + 9} width={26} tone="soft" />
          <rect x="120" y={y} width="18" height="10" rx="5" className="fill-zinc-100" stroke="none" />
          {y < 122 && <path d={`M52 ${y + 17}h88`} className="stroke-zinc-100" />}
        </g>
      ))}
      <circle cx="156" cy="102" r="26" className="fill-surface" strokeWidth={2.5} />
      <circle cx="156" cy="102" r="20" className="stroke-zinc-200" />
      <path d="M143 93a15 15 0 0 1 9-7" className="stroke-zinc-200" strokeWidth={3} />
      <path d="M148 104h16" className="stroke-zinc-300" strokeWidth={2} />
      <path d="M175 121l5 5" strokeWidth={4} />
      <path d="M183 129l9 9" className="stroke-primary" strokeWidth={9} />
    </>
  ),
  calendar: (
    <>
      <Shadow width={132} />
      <rect x="63" y="30" width="120" height="118" rx="8" className="fill-zinc-100" />
      <rect x="57" y="24" width="120" height="118" rx="8" className="fill-surface" stroke="none" />
      <path d="M65 24h104a8 8 0 0 1 8 8v18H57V32a8 8 0 0 1 8-8z" className="fill-primary/10" stroke="none" />
      <rect x="57" y="24" width="120" height="118" rx="8" />
      <path d="M57 50h120" />
      <path d="M71 38h34" className="stroke-primary/30" strokeWidth={4} />
      <path d="M152 34l-4 4 4 4M160 34l4 4-4 4" />
      {[81, 105, 129, 153].map((x) => (
        <rect key={x} x={x - 2} y="16" width="4" height="16" rx="2" className="fill-surface" />
      ))}
      {CALENDAR_COLUMNS.map((x) => (
        <path key={x} d={`M${x + 2} 58h6`} className="stroke-zinc-300" strokeWidth={2} />
      ))}
      {CALENDAR_ROWS.map((y, row) =>
        CALENDAR_COLUMNS.map((x, column) => {
          const key = `${row}-${column}`;
          if (row === 0 && column < 2) return <rect key={key} x={x} y={y} width="10" height="10" rx="2" className="stroke-zinc-200" />;
          if (row === CALENDAR_ROWS.length - 1 && column > 2) return null;
          if (row === 2 && column === 3) return <rect key={key} x={x} y={y} width="10" height="10" rx="2" className="fill-primary" stroke="none" />;
          return <rect key={key} x={x} y={y} width="10" height="10" rx="2" className={column === 6 ? "fill-zinc-200" : "fill-zinc-100"} stroke="none" />;
        }),
      )}
    </>
  ),
  done: (
    <>
      <Shadow width={112} />
      <rect x="72" y="26" width="96" height="122" rx="8" className="fill-zinc-100" />
      <rect x="80" y="38" width="80" height="102" rx="4" className="fill-surface" />
      <rect x="100" y="22" width="40" height="18" rx="5" className="fill-surface" />
      <rect x="110" y="14" width="20" height="12" rx="6" className="fill-surface" />
      <rect x="115" y="18" width="10" height="4" rx="2" className="fill-zinc-200" stroke="none" />
      {[56, 80, 104].map((y) => (
        <g key={y}>
          <rect x="90" y={y} width="12" height="12" rx="3" className="fill-primary" stroke="none" />
          <path d={`M93 ${y + 6}l2.5 2.5 4.5-5`} className="stroke-surface" strokeWidth={2} />
          <Line x={110} y={y + 3} width={38} />
          <Line x={110} y={y + 10} width={24} tone="soft" />
        </g>
      ))}
      <path d="M128 128h20" className="stroke-zinc-300" />
    </>
  ),
  document: (
    <>
      <Shadow width={140} />
      <path d="M58 34h36l6 8h82a6 6 0 0 1 6 6v94a6 6 0 0 1-6 6H58a6 6 0 0 1-6-6V40a6 6 0 0 1 6-6z" className="fill-zinc-100" />
      <rect x="68" y="24" width="104" height="96" rx="4" className="fill-surface" />
      <Line x={80} y={38} width={40} />
      <rect x="80" y="48" width="80" height="22" rx="2" {...DASHED} />
      <path d="M48 76h144l-4 66a6 6 0 0 1-6 6H58a6 6 0 0 1-6-6z" className="fill-surface" />
      <rect x="100" y="98" width="40" height="18" rx="3" className="fill-primary/10" stroke="none" />
      <path d="M108 107h24" className="stroke-primary" strokeWidth={2} />
    </>
  ),
  chart: (
    <>
      <Shadow width={168} />
      <rect x="36" y="22" width="168" height="126" rx="8" className="fill-surface" />
      <Line x={50} y={38} width={44} />
      <circle cx="160" cy="38" r="3" className="fill-primary" stroke="none" />
      <path d="M168 38h22" className="stroke-zinc-200" strokeWidth={3} />
      {[60, 82, 104].map((y) => (
        <g key={y}>
          <path d={`M50 ${y}h10`} className="stroke-zinc-200" strokeWidth={3} />
          <path d={`M68 ${y}h122`} className="stroke-zinc-100" strokeDasharray="2 4" />
        </g>
      ))}
      <path d="M50 126h10" className="stroke-zinc-200" strokeWidth={3} />
      {[
        [76, 98],
        [94, 74],
        [112, 110],
        [130, 66],
        [148, 88],
        [166, 104],
      ].map(([x, top]) => (
        <g key={x}>
          <rect x={x} y={top} width="12" height={130 - top} rx="2" className={x === 130 ? "stroke-primary" : "stroke-zinc-300"} strokeDasharray="3 4" />
          <path d={`M${x + 2} 138h8`} className="stroke-zinc-200" strokeWidth={3} />
        </g>
      ))}
      <path d="M68 130h122" />
    </>
  ),
  board: (
    <>
      <Shadow width={140} />
      <path d="M120 110l10 38" className="stroke-zinc-300" />
      <path d="M82 110l-14 38M158 110l14 38" />
      <rect x="44" y="16" width="152" height="96" rx="6" className="fill-surface" />
      <rect x="52" y="24" width="136" height="80" rx="3" className="stroke-zinc-200" />
      <path d="M68 52c12-6 24 4 36-2s20-4 28 2" className="stroke-zinc-100" strokeWidth={5} />
      <path d="M76 76c10-4 22 2 32-1" className="stroke-zinc-100" strokeWidth={5} />
      <path d="M58 120h124" strokeWidth={4} />
      <rect x="70" y="111" width="22" height="7" rx="2" className="fill-zinc-200" />
      <rect x="144" y="113" width="22" height="5" rx="2.5" className="fill-primary" stroke="none" />
      <rect x="164" y="113" width="8" height="5" rx="2" className="fill-zinc-300" stroke="none" />
    </>
  ),
  seats: (
    <>
      <Shadow width={148} />
      {[96, 144].map((x) => (
        <g key={x} className="stroke-zinc-300">
          <rect x={x - 8} y="36" width="16" height="20" rx="3" className="fill-surface" />
          <path d={`M${x - 14} 62h28`} strokeWidth={2.5} />
          <rect x={x - 11} y="64" width="22" height="12" className="fill-zinc-100" stroke="none" />
          <path d={`M${x - 11} 64v26M${x + 11} 64v26`} />
        </g>
      ))}
      {[72, 120, 168].map((x) => (
        <g key={x}>
          <rect x={x - 11} y="68" width="22" height="28" rx="4" className={x === 120 ? "fill-primary/10 stroke-primary" : "fill-surface"} />
          <rect x={x - 16} y="106" width="32" height="16" className="fill-zinc-100" stroke="none" />
          <path d={`M${x - 19} 104h38`} strokeWidth={3} />
          <path d={`M${x - 15} 106v42M${x + 15} 106v42`} />
        </g>
      ))}
    </>
  ),
  "not-found": (
    <>
      <Shadow width={176} />
      <rect x="32" y="18" width="176" height="130" rx="8" className="fill-surface" stroke="none" />
      <path d="M40 18h160a8 8 0 0 1 8 8v16H32V26a8 8 0 0 1 8-8z" className="fill-zinc-100" stroke="none" />
      <rect x="32" y="18" width="176" height="130" rx="8" />
      <path d="M32 42h176" />
      {[46, 56, 66].map((x) => (
        <circle key={x} cx={x} cy="30" r="3" className="fill-zinc-300" stroke="none" />
      ))}
      <rect x="80" y="24" width="116" height="12" rx="6" className="fill-surface stroke-zinc-300" />
      <path d="M90 30h36" className="stroke-primary" strokeWidth={2} />
      <path d="M132 30h8M146 30h6" className="stroke-zinc-300" strokeWidth={2} />
      <Line x={46} y={58} width={28} tone="soft" />
      <Line x={46} y={70} width={22} tone="soft" />
      <Line x={46} y={82} width={26} tone="soft" />
      <Line x={46} y={94} width={18} tone="soft" />
      <path d="M86 50v90" className="stroke-zinc-100" />
      <path d="M119 60h40l16 16v58h-56z" {...DASHED} />
      <path d="M159 60v16h16" {...DASHED} />
      <path d="M131 92h32M131 104h24" className="stroke-zinc-200" strokeDasharray="2 4" />
    </>
  ),
  forbidden: (
    <>
      <Shadow width={128} />
      <rect x="72" y="12" width="96" height="136" rx="4" className="fill-zinc-100" />
      <rect x="80" y="20" width="80" height="128" rx="2" className="fill-surface" />
      <rect x="90" y="30" width="60" height="30" rx="2" className="stroke-zinc-200" />
      <rect x="90" y="118" width="60" height="20" rx="2" className="stroke-zinc-200" />
      <rect x="147" y="90" width="8" height="18" rx="4" className="fill-zinc-100" />
      <circle cx="151" cy="99" r="2.5" className="fill-zinc-300" stroke="none" />
      <rect x="110" y="66" width="20" height="10" rx="2" className="fill-zinc-100" />
      <path d="M111 86V76a9 9 0 0 1 18 0v10" strokeWidth={3.5} />
      <rect x="100" y="84" width="40" height="30" rx="6" className="fill-surface" />
      <path d="M100 92h40" className="stroke-zinc-200" />
      <circle cx="120" cy="100" r="3.5" className="fill-primary" stroke="none" />
      <path d="M120 102v6" className="stroke-primary" strokeWidth={3} />
    </>
  ),
  error: (
    <>
      <Shadow width={168} />
      <path d="M36 148C60 148 48 66 68 66" strokeWidth={2.5} />
      <rect x="68" y="60" width="8" height="12" rx="2" className="fill-zinc-100" />
      <rect x="76" y="52" width="26" height="28" rx="5" className="fill-surface" />
      <path d="M83 60v12M89 60v12M95 60v12" className="stroke-zinc-200" strokeWidth={2} />
      <path d="M102 60h12M102 72h12" className="stroke-primary" strokeWidth={3.5} />
      <rect x="126" y="48" width="26" height="36" rx="6" className="fill-zinc-100" />
      <rect x="130" y="54" width="18" height="24" rx="4" className="fill-surface stroke-zinc-300" />
      <rect x="135" y="58" width="8" height="4" rx="2" className="fill-zinc-400" stroke="none" />
      <rect x="135" y="70" width="8" height="4" rx="2" className="fill-zinc-400" stroke="none" />
      <path d="M152 66h20C192 66 180 148 204 148" strokeWidth={2.5} />
    </>
  ),
};

type IllustrationProps = {
  name: IllustrationName;
  className?: string;
};

export function Illustration({ name, className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 168"
      aria-hidden
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`stroke-zinc-400 ${className ?? ""}`}
    >
      {SCENES[name]}
    </svg>
  );
}
