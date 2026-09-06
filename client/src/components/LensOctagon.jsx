/**
 * The waiting animation: the product mark, drawn live.
 *
 * Eight vertices for the eight lenses and a filled centre where they meet —
 * the same shape as the app icon. A sweep runs the outline the whole time so
 * the screen is visibly alive, and each vertex lights in its own colour when
 * that lens reports. A progress bar can only guess at how far along a stream
 * is; this shows exactly which of the eight are done.
 *
 * Geometry matches icons/mark.svg scaled to a 200 grid: centre 100,100 and a
 * radius of 62.5, vertices every 45° starting at the top.
 */

const R = 62.5;
const C = 100;

/** Vertices every 45° from the top, matching the mark. */
export const VERTICES = Array.from({ length: 8 }, (_, i) => {
  const angle = (-90 + i * 45) * (Math.PI / 180);
  return [C + R * Math.cos(angle), C + R * Math.sin(angle)];
});

const POLYGON = VERTICES.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

export function LensOctagon({ schools = [], done = [], label }) {
  const total = schools.length || 8;
  const finished = done.length;

  return (
    <svg viewBox="0 0 200 200" className="mx-auto block size-44"
         role="img" aria-label={label || `${finished} از ${total} لنز بررسی شد`}>
      {/* The sweep: a short arc orbiting the outline. It is the only part
          that moves unconditionally, so the screen never looks frozen during
          the long gaps between blocks. */}
      <g className="el-sweep">
        <circle cx={C} cy={C} r={R} fill="none"
                stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * R * 0.14} ${2 * Math.PI * R}`}
                opacity="0.9" />
      </g>

      <polygon points={POLYGON} fill="none" strokeLinejoin="round"
               stroke="var(--color-border)" strokeWidth="2.5" />

      {schools.map((s, i) => {
        const [x, y] = VERTICES[i % 8];
        const isDone = done.includes(s.key);
        return (
          <g key={s.key}>
            <circle className="el-vertex" data-done={String(isDone)}
                    cx={x} cy={y} r={isDone ? 8 : 5.5}
                    fill={isDone ? s.color : 'var(--color-muted)'} />
            {isDone && (
              <circle cx={x} cy={y} r="12" fill="none" stroke={s.color}
                      strokeWidth="1.5" opacity="0.3" />
            )}
          </g>
        );
      })}

      {/* The decision the eight converge on — pulsing until they all land. */}
      <circle className={finished < total ? 'el-pulse' : ''} cx={C} cy={C}
              r={16 + (finished / total) * 6}
              fill="var(--color-primary)" opacity={finished < total ? undefined : 1} />
    </svg>
  );
}
