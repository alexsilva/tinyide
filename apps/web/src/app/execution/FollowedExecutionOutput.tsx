import { useEffect, useRef } from "react";
import { scrollOutputToEnd } from "../output-follow";

export function FollowedExecutionOutput({
  text,
  following,
}: {
  readonly text: string;
  readonly following: boolean;
}) {
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!following) return;
    window.requestAnimationFrame(() => scrollOutputToEnd(outputRef.current));
  }, [text, following]);

  return <pre ref={outputRef} className="execution-panel-output">{text}</pre>;
}

