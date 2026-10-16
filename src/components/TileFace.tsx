interface TileFaceProps {
  value: number | null;
  wild?: boolean;
  state?: "pending" | "valid";
}

/** A round wooden token. Wilds show a star, plus their value once one is chosen. */
export function TileFace({ value, wild = false, state }: TileFaceProps) {
  const classes = ["token"];
  if (wild) classes.push("wild");
  if (state) classes.push(state);
  // An unplayed wild is just a big star; once placed it shows its value under a small one.
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
    </span>
  );
}
