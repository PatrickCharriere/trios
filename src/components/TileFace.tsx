import { DISTRIBUTION } from "@/engine";

interface TileFaceProps {
  value: number | null;
  wild?: boolean;
  state?: "pending" | "valid";
}

/**
 * A square wooden tile. Like the physical ones, a numbered tile shows in its
 * corner how many tiles of that value the box holds. Wilds show a star, plus
 * their value once one is chosen.
 */
export function TileFace({ value, wild = false, state }: TileFaceProps) {
  const classes = ["token"];
  if (wild) classes.push("wild");
  if (state) classes.push(state);
  if (wild && value === null) {
    return (
      <span className={classes.join(" ")}>
        <span className="value blank-star" aria-hidden="true">★</span>
      </span>
    );
  }
  return (
    <span className={classes.join(" ")}>
      {wild && <span className="star" aria-hidden="true">★</span>}
      <span className="value">{value ?? ""}</span>
      {!wild && value !== null && (
        <span className="count" aria-hidden="true">
          {DISTRIBUTION[value]}
        </span>
      )}
    </span>
  );
}
