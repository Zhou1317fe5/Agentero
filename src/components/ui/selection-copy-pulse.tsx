import { useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/core/utils";

export type SelectionPulseRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

type SelectionCopyPulseProps = {
	rects: SelectionPulseRect[];
};

/**
 * Transient visual feedback for an auto-copied selection: a short yellow glow
 * over the selected region. Portaled to document.body so page transforms and
 * overflow never clip it.
 */
export function SelectionCopyPulse({ rects }: SelectionCopyPulseProps) {
	const keyRef = useRef(0);
	const keys = useMemo(() => rects.map(() => `${keyRef.current++}`), [rects]);
	if (typeof document === "undefined") return null;
	return createPortal(
		rects.map((r, i) => (
			<div
				key={keys[i]}
				className={cn(
					"pointer-events-none fixed z-40 rounded-sm selection-copy-pulse",
				)}
				style={{
					left: r.x,
					top: r.y,
					width: r.width,
					height: r.height,
				}}
			/>
		)),
		document.body,
	);
}
