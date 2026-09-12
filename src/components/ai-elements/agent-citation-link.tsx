"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useCallback } from "react";
import { cn } from "@/lib/core/utils";

type AgentCitationLinkProps = ComponentPropsWithoutRef<"a"> & {
	node?: unknown;
	children?: ReactNode;
	onOpenSource?: (source: string) => void;
};

function isHttpUrl(href: string): boolean {
	return /^https?:\/\//i.test(href);
}

function looksLikeVaultPath(href: string): boolean {
	const t = href.trim();
	if (!t || t.startsWith("#")) return false;
	if (isHttpUrl(t)) return false;
	// Vault-relative paths contain a slash or have a known file extension.
	const lower = t.toLowerCase();
	if (
		lower.endsWith(".md") ||
		lower.endsWith(".tex") ||
		lower.endsWith(".pdf") ||
		lower.endsWith(".png") ||
		lower.endsWith(".jpg") ||
		lower.endsWith(".jpeg") ||
		lower.endsWith(".webp") ||
		lower.endsWith(".gif") ||
		lower.endsWith(".svg") ||
		lower.endsWith(".json") ||
		lower.endsWith(".bib") ||
		lower.endsWith(".csv")
	) {
		return t.includes("/") || !/\s/.test(t);
	}
	return t.includes("/");
}

export function AgentCitationLink({
	href,
	children,
	onOpenSource,
	className,
	node: _node,
	target: _target,
	rel: _rel,
	...props
}: AgentCitationLinkProps) {
	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLAnchorElement>) => {
			event.preventDefault();
			if (!href) return;
			if (isHttpUrl(href)) {
				void import("@tauri-apps/plugin-opener")
					.then(({ openUrl }) => openUrl(href))
					.catch(() => {
						window.open(href, "_blank", "noopener,noreferrer");
					});
				return;
			}
			onOpenSource?.(href);
		},
		[href, onOpenSource],
	);

	const label =
		typeof children === "string" || typeof children === "number"
			? String(children).trim()
			: "";

	// Only render the pill style for vault paths or http(s) URLs.
	// Other Streamdown links (e.g. incomplete-link) fall back to a subtle inline anchor.
	const isPill = href && (isHttpUrl(href) || looksLikeVaultPath(href));

	if (!isPill) {
		return (
			<a
				href={href}
				className={cn(
					"wrap-anywhere font-medium text-primary underline",
					className,
				)}
				{...props}
				onClick={handleClick}
			>
				{children}
			</a>
		);
	}

	return (
		<a
			href={href}
			className={cn(
				"inline-flex max-w-[12rem] shrink-0 cursor-pointer items-center gap-1 rounded-full",
				"border border-border/60 bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground",
				"transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				className,
			)}
			title={href}
			{...props}
			onClick={handleClick}
		>
			<span className="block min-w-0 truncate">{label || children}</span>
		</a>
	);
}
