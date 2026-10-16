import { Suspense } from "react";
import { LocalGame } from "@/components/LocalGame";

export default function LocalGamePage() {
  return (
    <Suspense fallback={<div className="loading" />}>
      <LocalGame />
    </Suspense>
  );
}
