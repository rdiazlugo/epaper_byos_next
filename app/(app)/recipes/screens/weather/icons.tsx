import type { CSSProperties, ReactNode } from "react";
import type { WeatherIcon } from "./getData";

// The whole icon language is drawn from primitive divs (discs, rects, ticks)
// rather than SVG paths, matching the Weather Widget design doc. Everything
// scales off a single multiplier so hero and forecast slots read identically.

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function circle(d: number, extra: CSSProperties, fg: string): CSSProperties {
	return {
		position: "absolute",
		width: d,
		height: d,
		borderRadius: "50%",
		background: fg,
		...extra,
	};
}

function sunRays(
	discD: number,
	rayW: number,
	rayLen: number,
	pad: number,
	fg: string,
) {
	const ty = -(discD / 2 + rayLen + pad);
	return RAY_ANGLES.map((a) => (
		<div
			key={a}
			style={{
				position: "absolute",
				top: "50%",
				left: "50%",
				width: rayW,
				height: rayLen,
				background: fg,
				borderRadius: rayW / 2,
				margin: `${-rayLen / 2}px 0 0 ${-rayW / 2}px`,
				transform: `rotate(${a}deg) translate(0px, ${ty}px)`,
			}}
		/>
	));
}

/** Sun disc + 8 rays, centred in a box of side `box`. */
function sun(
	box: number,
	discD: number,
	rayW: number,
	rayLen: number,
	fg: string,
) {
	const off = (box - discD) / 2;
	return (
		<>
			<div
				style={circle(discD, { top: off, left: off, position: "absolute" }, fg)}
			/>
			{sunRays(discD, rayW, rayLen, 4, fg)}
		</>
	);
}

/** Crescent moon: a filled disc with a background-coloured disc biting into it. */
function moon(scale: number, fg: string, bg: string) {
	const r = (n: number) => Math.round(n * scale);
	return (
		<>
			<div style={circle(r(92), { top: r(16), left: r(16) }, fg)} />
			<div style={circle(r(80), { top: r(6), left: r(46) }, bg)} />
		</>
	);
}

/** Cloud silhouette (rounded rect base + three lobes) sized to a hero box. */
function heroCloud(scale: number, fg: string) {
	const r = (n: number) => Math.round(n * scale);
	return (
		<>
			<div
				style={{
					position: "absolute",
					bottom: r(26),
					left: r(12),
					width: r(96),
					height: r(36),
					borderRadius: r(18),
					background: fg,
				}}
			/>
			<div style={circle(r(46), { bottom: r(40), left: 0 }, fg)} />
			<div style={circle(r(60), { bottom: r(52), left: r(32) }, fg)} />
			<div style={circle(r(44), { bottom: r(40), left: r(70) }, fg)} />
		</>
	);
}

function heroRainTicks(scale: number, fg: string) {
	const r = (n: number) => Math.round(n * scale);
	return [22, 50, 78, 100].map((l) => (
		<div
			key={l}
			style={{
				position: "absolute",
				bottom: 0,
				left: r(l),
				width: r(4),
				height: r(16),
				background: fg,
				borderRadius: r(2),
				transform: "rotate(15deg)",
			}}
		/>
	));
}

function heroSnowDots(scale: number, fg: string) {
	const r = (n: number) => Math.round(n * scale);
	// [size, bottom, left]
	const specs = [
		[14, 16, 16],
		[10, 2, 38],
		[16, 14, 60],
		[11, 0, 84],
		[13, 10, 102],
	];
	return specs.map(([s, b, l], i) => (
		<div key={i} style={circle(r(s), { bottom: r(b), left: r(l) }, fg)} />
	));
}

/** The 124px-at-scale-1 hero glyph for the current condition. */
export function HeroIcon({
	condition,
	night,
	fg,
	bg,
	scale,
}: {
	condition: WeatherIcon;
	night: boolean;
	fg: string;
	bg: string;
	scale: number;
}) {
	const r = (n: number) => Math.round(n * scale);
	const box = r(124);
	const heat = condition === "heatwave";
	const clear = condition === "clear" || heat;

	let inner: ReactNode = null;
	if (clear && night) {
		inner = moon(scale, fg, bg);
	} else if (clear) {
		inner = sun(box, r(heat ? 68 : 56), r(heat ? 6 : 5), r(heat ? 22 : 18), fg);
	} else if (condition === "rain") {
		inner = (
			<>
				{heroCloud(scale, fg)}
				{heroRainTicks(scale, fg)}
			</>
		);
	} else if (condition === "snow") {
		inner = (
			<>
				{heroCloud(scale, fg)}
				{heroSnowDots(scale, fg)}
			</>
		);
	} else {
		inner = heroCloud(scale, fg); // cloud
	}

	return (
		<div
			style={{ position: "relative", width: box, height: box, flex: "none" }}
		>
			{inner}
		</div>
	);
}

/** Small S×S forecast glyph (sun or cloud); accessories render separately. */
export function forecastIcon(icon: WeatherIcon, S: number, fg: string) {
	const sunny = icon === "clear" || icon === "heatwave";
	if (sunny) {
		const heat = icon === "heatwave";
		const discD = Math.round(S * (heat ? 0.72 : 0.6));
		const rayLen = Math.round(S * (heat ? 0.26 : 0.22));
		const rayW = Math.max(2, Math.round(S * (heat ? 0.09 : 0.08)));
		return (
			<div style={{ position: "relative", width: S, height: S }}>
				{sun(S, discD, rayW, rayLen, fg)}
			</div>
		);
	}
	// cloud / rain / snow all share the cloud silhouette (ratios of S)
	const cW = Math.round(S * 0.78);
	return (
		<div style={{ position: "relative", width: S, height: S }}>
			<div
				style={{
					position: "absolute",
					bottom: Math.round(S * 0.24),
					left: Math.round(S * 0.11),
					width: cW,
					height: Math.round(S * 0.29),
					borderRadius: Math.round(S * 0.145),
					background: fg,
				}}
			/>
			<div
				style={circle(
					Math.round(S * 0.37),
					{ bottom: Math.round(S * 0.34), left: 0 },
					fg,
				)}
			/>
			<div
				style={circle(
					Math.round(S * 0.48),
					{ bottom: Math.round(S * 0.43), left: Math.round(S * 0.27) },
					fg,
				)}
			/>
			<div
				style={circle(
					Math.round(S * 0.35),
					{ bottom: Math.round(S * 0.34), left: Math.round(S * 0.6) },
					fg,
				)}
			/>
		</div>
	);
}

/** Rain ticks / snow dots row shown under a forecast cloud (fixed height). */
export function forecastAccessory(icon: WeatherIcon, S: number, fg: string) {
	const height = Math.round(S * 0.3);
	const gap = Math.max(2, Math.round(S * 0.09));
	const base: CSSProperties = {
		height,
		display: "flex",
		alignItems: "center",
		gap,
	};
	if (icon === "rain") {
		const tickW = Math.max(2, Math.round(S * 0.055));
		const tickH = Math.round(S * 0.2);
		return (
			<div style={base}>
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						style={{
							width: tickW,
							height: tickH,
							background: fg,
							borderRadius: Math.round(tickW / 2),
							transform: "rotate(15deg)",
						}}
					/>
				))}
			</div>
		);
	}
	if (icon === "snow") {
		const dotD = Math.max(3, Math.round(S * 0.15));
		return (
			<div style={base}>
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						style={{
							width: dotD,
							height: dotD,
							borderRadius: "50%",
							background: fg,
						}}
					/>
				))}
			</div>
		);
	}
	return <div style={base} />; // clear / cloud: reserve the space, draw nothing
}

/** Battery pill with a fill level bucketed by charge, plus the terminal nub. */
export function BatteryIcon({
	battery,
	fg,
	hdrFs,
}: {
	battery: number;
	fg: string;
	hdrFs: number;
}) {
	const sc = hdrFs / 13;
	const iconH = Math.round(14 * sc);
	const iconW = Math.round(24 * sc);
	const nubW = Math.max(2, Math.round(3 * sc));
	const nubH = Math.round(iconH * 0.5);
	const borderW = Math.max(1, Math.round(2 * sc));
	const pad = Math.max(1, Math.round(1.5 * sc));
	const radius = Math.max(2, Math.round(3 * sc));

	const fillPct = battery >= 60 ? 1 : battery >= 20 ? 0.55 : 0.22;
	const innerW = iconW - 2 * borderW - 2 * pad;
	const innerH = iconH - 2 * borderW - 2 * pad;
	const fillW = Math.max(2, Math.round(innerW * fillPct));

	return (
		<div
			style={{
				position: "relative",
				width: iconW + nubW,
				height: iconH,
				flex: "none",
			}}
		>
			<div
				style={{
					position: "absolute",
					left: 0,
					top: 0,
					width: iconW,
					height: iconH,
					borderWidth: borderW,
					borderStyle: "solid",
					borderColor: fg,
					borderRadius: radius,
					boxSizing: "border-box",
				}}
			/>
			<div
				style={{
					position: "absolute",
					left: borderW + pad,
					top: borderW + pad,
					width: fillW,
					height: innerH,
					background: fg,
					borderRadius: Math.max(1, radius - 2),
				}}
			/>
			<div
				style={{
					position: "absolute",
					right: -nubW,
					top: (iconH - nubH) / 2,
					width: nubW,
					height: nubH,
					background: fg,
					borderRadius: `0 ${Math.max(1, radius - 1)}px ${Math.max(1, radius - 1)}px 0`,
				}}
			/>
		</div>
	);
}
