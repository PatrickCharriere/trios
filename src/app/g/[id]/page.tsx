import { Suspense } from "react";
import { OnlineGame } from "@/components/OnlineGame";

export default function OnlineGamePage() {
  // The game id is only known per request, so the client part sits in Suspense.
  return (
    <Suspense fallback={<div className="loading" />}>
      <OnlineGame />
    </Suspense>
  );
}
