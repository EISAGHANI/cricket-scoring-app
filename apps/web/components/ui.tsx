"use client";

import Link from "next/link";
import {
	type ButtonHTMLAttributes,
	type ComponentProps,
	type ReactNode,
	useEffect,
	useRef,
} from "react";
import { X } from "lucide-react";

export function cx(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(" ");
}

/* ------------------------------ Button ------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
	primary: "bg-brand text-on-brand hover:bg-brand-strong shadow-card",
	secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
	ghost: "text-ink hover:bg-surface-2",
	danger: "bg-wicket text-white hover:opacity-90",
	/** White button for use on the dark pitch backgrounds. */
	light: "bg-white text-[#0b5c37] hover:bg-white/90 shadow-card",
};
const SIZE: Record<Size, string> = {
	sm: "h-9 px-3 text-sm gap-1.5 rounded-xl",
	md: "h-11 px-4 text-[15px] gap-2 rounded-xl",
	lg: "h-14 px-6 text-base gap-2.5 rounded-2xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
	return cx(
		"inline-flex select-none items-center justify-center font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
		VARIANT[variant],
		SIZE[size],
		extra,
	);
}

export function Button({
	variant = "primary",
	size = "md",
	className,
	type = "button",
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
	return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
	variant = "primary",
	size = "md",
	className,
	...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
	return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ------------------------------- Card ------------------------------- */

export function Card({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cx("rounded-3xl border border-line bg-surface shadow-card", className)}
			{...props}
		/>
	);
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return (
		<div className="mb-3 flex items-end justify-between gap-3">
			<h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
				{children}
			</h2>
			{action}
		</div>
	);
}

/* ------------------------------ Sheet ------------------------------- */

/** Native modal <dialog>: focus trap, Escape and backdrop click for free. */
export function Sheet({
	open,
	onClose,
	title,
	children,
	footer,
}: {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
}) {
	const ref = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const d = ref.current;
		if (!d) return;
		if (open && !d.open) d.showModal();
		if (!open && d.open) d.close();
	}, [open]);

	return (
		<dialog
			ref={ref}
			className="sheet"
			onClose={onClose}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			{open && (
				<div className="flex max-h-[88dvh] flex-col">
					<div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
						<h2 className="font-display text-2xl font-bold uppercase tracking-wide">{title}</h2>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close"
							className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2"
						>
							<X className="size-5" />
						</button>
					</div>
					<div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
					{footer && (
						<div className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
							{footer}
						</div>
					)}
				</div>
			)}
		</dialog>
	);
}

/* ------------------------------ Inputs ------------------------------ */

export function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<label className="block">
			<span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
			{children}
			{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
		</label>
	);
}

export const inputClass =
	"h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-[15px] text-ink placeholder:text-muted/70 outline-none transition focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/15";

/** Large tappable choice used for teams, players and options. */
export function Choice({
	selected,
	disabled,
	onClick,
	children,
	className,
}: {
	selected?: boolean;
	disabled?: boolean;
	onClick?: () => void;
	children: ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			disabled={disabled}
			onClick={onClick}
			className={cx(
				"flex min-h-12 items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-[15px] font-medium transition active:scale-[0.98] disabled:opacity-40",
				selected
					? "border-brand bg-brand-soft text-ink ring-2 ring-brand/40"
					: "border-line bg-surface hover:border-brand/50 hover:bg-surface-2",
				className,
			)}
		>
			{children}
		</button>
	);
}

export function Segmented<T extends string>({
	value,
	onChange,
	options,
	label,
}: {
	value: T;
	onChange: (v: T) => void;
	options: Array<{ value: T; label: ReactNode }>;
	label: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-surface-2 p-1">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					role="radio"
					aria-checked={value === o.value}
					onClick={() => onChange(o.value)}
					className={cx(
						"flex-1 whitespace-nowrap rounded-xl px-2 py-2 text-sm font-semibold transition sm:px-3",
						value === o.value
							? "bg-surface text-ink shadow-card ring-1 ring-brand/45"
							: "text-muted hover:text-ink",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

/* ---------------------------- Feedback ------------------------------ */

export function EmptyState({
	icon,
	title,
	children,
	action,
}: {
	icon: ReactNode;
	title: string;
	children?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<Card className="flex flex-col items-center px-6 py-10 text-center">
			<div className="mb-4 grid size-16 place-items-center rounded-3xl bg-brand-soft text-brand">
				{icon}
			</div>
			<h3 className="font-display text-2xl font-bold uppercase tracking-wide">{title}</h3>
			{children && <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
			{action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
		</Card>
	);
}

export function Skeleton({ className }: { className?: string }) {
	return <div className={cx("animate-pulse rounded-3xl bg-surface-2", className)} />;
}

export function PageSkeleton() {
	return (
		<div className="space-y-4" aria-busy="true" aria-label="Loading">
			<Skeleton className="h-40" />
			<Skeleton className="h-24" />
			<Skeleton className="h-24" />
		</div>
	);
}

export function PageHeader({
	title,
	subtitle,
	action,
}: {
	title: string;
	subtitle?: string;
	action?: ReactNode;
}) {
	return (
		<div className="mb-6 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h1 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">
					{title}
				</h1>
				{subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
			</div>
			{action}
		</div>
	);
}
