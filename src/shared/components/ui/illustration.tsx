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

const GROUND = <path d="M24 100h112" className="stroke-zinc-200" />;

const DASHED = { className: "stroke-zinc-300", strokeDasharray: "3 4" } as const;

function SkeletonLine({ x, y, width, light = false }: { x: number; y: number; width: number; light?: boolean }) {
  return <path d={`M${x} ${y}h${width}`} className={light ? "stroke-zinc-100" : "stroke-zinc-200"} strokeWidth={light ? 3 : 4} />;
}

const SCENES: Record<IllustrationName, React.ReactNode> = {
  inbox: (
    <>
      {GROUND}
      <rect x="58" y="26" width="44" height="48" rx="4" {...DASHED} />
      <path d="M44 62h72l8 18H36z" className="fill-zinc-100" stroke="none" />
      <path d="M36 80v14a4 4 0 0 0 4 4h80a4 4 0 0 0 4-4V80" className="fill-surface" />
      <path d="M36 80l8-18h72l8 18" />
      <path d="M36 80h24l4 6h32l4-6h24" />
      <path d="M72 92h16" className="stroke-primary" strokeWidth={3} />
    </>
  ),
  search: (
    <>
      {GROUND}
      <rect x="32" y="18" width="80" height="76" rx="6" className="fill-surface" />
      {[32, 50, 68].map((y) => (
        <g key={y}>
          <rect x="42" y={y} width="10" height="10" rx="2" className="fill-zinc-100" stroke="none" />
          <SkeletonLine x={60} y={y + 3} width={36} />
          <SkeletonLine x={60} y={y + 8} width={20} light />
        </g>
      ))}
      <circle cx="112" cy="70" r="16" className="fill-surface" strokeWidth={2} />
      <path d="M105 70h14" className="stroke-zinc-300" />
      <path d="M123.5 81.5l10 10" className="stroke-primary" strokeWidth={5} />
    </>
  ),
  calendar: (
    <>
      {GROUND}
      <rect x="40" y="24" width="80" height="72" rx="6" className="fill-surface" stroke="none" />
      <path d="M46 24h68a6 6 0 0 1 6 6v10H40V30a6 6 0 0 1 6-6z" className="fill-zinc-100" stroke="none" />
      <rect x="40" y="24" width="80" height="72" rx="6" />
      <path d="M40 40h80" />
      <path d="M60 18v12M100 18v12" strokeWidth={3} />
      {[50, 64, 78].map((y) =>
        [48, 62, 76, 90, 104].map((x) =>
          x === 76 && y === 64 ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx="2" className="stroke-primary" />
          ) : (
            <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx="2" className="fill-zinc-100" stroke="none" />
          ),
        ),
      )}
    </>
  ),
  done: (
    <>
      {GROUND}
      <rect x="48" y="20" width="64" height="76" rx="6" className="fill-surface" />
      <rect x="66" y="14" width="28" height="12" rx="3" className="fill-zinc-100" />
      {[38, 54, 70].map((y) => (
        <g key={y}>
          <rect x="58" y={y} width="10" height="10" rx="2" className="fill-zinc-100" stroke="none" />
          <path d={`M60.5 ${y + 5}l2.5 2.5 4.5-5`} className="stroke-primary" strokeWidth={2} />
          <SkeletonLine x={76} y={y + 5} width={26} />
        </g>
      ))}
    </>
  ),
  document: (
    <>
      {GROUND}
      <rect x="60" y="16" width="56" height="70" rx="4" className="fill-zinc-100" />
      <rect x="52" y="22" width="56" height="72" rx="4" className="fill-surface" />
      <rect x="44" y="28" width="56" height="70" rx="4" className="fill-surface" />
      <SkeletonLine x={54} y={42} width={22} />
      <rect x="54" y="52" width="36" height="34" rx="2" {...DASHED} />
      <path d="M84 28v14l4-3 4 3V28z" className="fill-primary stroke-primary" strokeWidth={1} />
    </>
  ),
  chart: (
    <>
      <path d="M36 46h88M36 72h88" className="stroke-zinc-100" />
      <rect x="48" y="70" width="12" height="28" rx="2" {...DASHED} />
      <rect x="68" y="50" width="12" height="48" rx="2" className="stroke-primary" strokeDasharray="3 4" />
      <rect x="88" y="78" width="12" height="20" rx="2" {...DASHED} />
      <rect x="108" y="62" width="12" height="36" rx="2" {...DASHED} />
      <path d="M36 22v76h88" />
    </>
  ),
  board: (
    <>
      {GROUND}
      <path d="M56 76l-8 24M104 76l8 24" />
      <rect x="32" y="18" width="96" height="58" rx="4" className="fill-surface" />
      <rect x="38" y="24" width="84" height="46" rx="2" className="stroke-zinc-200" />
      <path d="M46 82h68" strokeWidth={3} />
      <rect x="88" y="76" width="16" height="4" rx="2" className="fill-primary" stroke="none" />
    </>
  ),
  seats: (
    <>
      {GROUND}
      {[48, 80, 112].map((x) => (
        <g key={x}>
          <rect x={x - 8} y="48" width="16" height="18" rx="3" className={x === 80 ? "fill-surface stroke-primary" : "fill-surface"} />
          <rect x={x - 10} y="72" width="20" height="12" className="fill-zinc-100" stroke="none" />
          <path d={`M${x - 12} 70h24`} strokeWidth={3} />
          <path d={`M${x - 9} 70v28M${x + 9} 70v28`} />
        </g>
      ))}
    </>
  ),
  "not-found": (
    <>
      {GROUND}
      <rect x="28" y="18" width="104" height="78" rx="6" className="fill-surface" stroke="none" />
      <path d="M34 18h92a6 6 0 0 1 6 6v8H28v-8a6 6 0 0 1 6-6z" className="fill-zinc-100" stroke="none" />
      <rect x="28" y="18" width="104" height="78" rx="6" />
      <path d="M28 32h104" />
      <rect x="40" y="22" width="80" height="6" rx="3" className="fill-surface" stroke="none" />
      <path d="M44 25h28" className="stroke-primary" strokeWidth={2} />
      <path d="M60 44h26l14 14v28H60z" {...DASHED} />
      <path d="M86 44v14h14" {...DASHED} />
    </>
  ),
  forbidden: (
    <>
      {GROUND}
      <rect x="52" y="14" width="56" height="86" rx="3" className="fill-zinc-100" />
      <rect x="58" y="20" width="44" height="74" rx="1" className="stroke-zinc-300" />
      <path d="M70 58V48a10 10 0 0 1 20 0v10" strokeWidth={3} />
      <rect x="62" y="56" width="36" height="30" rx="5" className="fill-surface" />
      <circle cx="80" cy="68" r="3" className="fill-primary" stroke="none" />
      <path d="M80 70v6" className="stroke-primary" strokeWidth={2.5} />
    </>
  ),
  error: (
    <>
      {GROUND}
      <path d="M24 100c20 0 14-38 30-38h4" strokeWidth={2} />
      <rect x="58" y="57" width="6" height="10" rx="2" className="fill-zinc-100" />
      <rect x="64" y="50" width="22" height="24" rx="4" className="fill-surface" />
      <path d="M86 57.5h8M86 66.5h8" className="stroke-primary" strokeWidth={3} />
      <path d="M126 62c8 0 2 38 10 38" strokeWidth={2} />
      <rect x="106" y="48" width="20" height="28" rx="4" className="fill-zinc-100" />
      <path d="M110 57.5h7M110 66.5h7" strokeWidth={3} />
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
      viewBox="0 0 160 112"
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
