import type { CSSProperties } from "react";
import { z } from "zod";
import {
	DEFAULT_IMAGE_HEIGHT,
	DEFAULT_IMAGE_WIDTH,
} from "@/lib/recipes/constants";
import type { RecipeDefinition } from "@/lib/recipes/types";
import { PreSatori } from "@/utils/pre-satori";
import getWeatherDataInternal, {
	type ForecastDay,
	type WeatherData,
	type WeatherIcon,
} from "./getData";
import {
	BatteryIcon,
	forecastAccessory,
	forecastIcon,
	HeroIcon,
} from "./icons";

export const paramsSchema = z.object({
	location: z
		.string()
		.default("San Francisco")
		.describe("City or place name to fetch weather for")
		.meta({ title: "Location", placeholder: "San Francisco" }),
	latitude: z
		.number()
		.default(0)
		.describe(
			"Optional exact latitude; when set with longitude, skips geocoding",
		)
		.meta({ title: "Latitude" }),
	longitude: z
		.number()
		.default(0)
		.describe(
			"Optional exact longitude; when set with latitude, skips geocoding",
		)
		.meta({ title: "Longitude" }),
	deviceName: z
		.string()
		.default("")
		.describe("Optional label shown top-right (e.g. the room the device is in)")
		.meta({ title: "Device label", placeholder: "Kitchen" }),
	battery: z
		.number()
		.min(0)
		.max(100)
		.default(100)
		.describe("Battery percentage shown in the status bar")
		.meta({ title: "Battery %" }),
});

const forecastSchema = z.object({
	day: z.string(),
	hi: z.number(),
	lo: z.number(),
	icon: z.enum(["clear", "cloud", "rain", "snow", "heatwave"]),
});

export const dataSchema = z.object({
	night: z.boolean().default(false),
	dateLabel: z.string().default(""),
	condition: z
		.enum(["clear", "cloud", "rain", "snow", "heatwave"])
		.default("clear"),
	conditionLabel: z.string().default("Loading..."),
	tempC: z.number().default(0),
	feelsLike: z.number().default(0),
	humidity: z.number().default(0),
	precipNote: z.string().default(""),
	sunrise: z.string().default("--:--"),
	sunset: z.string().default("--:--"),
	aqiValue: z.number().default(-1),
	aqiLabel: z.string().default(""),
	lowC: z.number().default(0),
	highC: z.number().default(0),
	location: z.string().default("Loading..."),
	forecast: z.array(forecastSchema).default([]),
	latitude: z.number().default(0),
	longitude: z.number().default(0),
});

type WeatherProps = WeatherData & {
	deviceName?: string;
	battery?: number;
	width?: number;
	height?: number;
};

const STAR_SPECS: Array<[number, number, number, number]> = [
	// [topFrac, leftFrac, sizeBase, opacity]
	[0.06, 0.15, 3, 0.8],
	[0.12, 0.25, 2, 0.5],
	[0.08, 0.375, 3, 0.6],
	[0.15, 0.5, 2, 0.4],
	[0.05, 0.65, 3, 0.7],
	[0.14, 0.76, 2, 0.5],
	[0.09, 0.875, 3, 0.6],
];

export default function Weather({
	night = false,
	dateLabel = "",
	condition = "clear",
	conditionLabel = "Loading...",
	tempC = 0,
	feelsLike = 0,
	humidity = 0,
	precipNote = "",
	sunrise = "--:--",
	sunset = "--:--",
	aqiValue = -1,
	aqiLabel = "",
	lowC = 0,
	highC = 0,
	forecast = [],
	deviceName = "",
	battery = 100,
	width = DEFAULT_IMAGE_WIDTH,
	height = DEFAULT_IMAGE_HEIGHT,
}: WeatherProps) {
	const scale = width / 800;
	const r = (n: number) => Math.round(n * scale);

	const bg = night ? "#0a0a0a" : "#ffffff";
	const fg = night ? "#f2f2f2" : "#111111";
	const muted = night ? "#9a9a9a" : "#5c5c5c";
	const divider = night ? "#333333" : "#d6d6d6";

	const hdrFs = r(13);
	const bigFs = r(132);
	const condFs = r(26);
	const secFs = r(15);
	const smallFs = r(13);
	const lblFs = r(11);
	const valFs = r(17);
	const dm = r(18);
	const boxSize = r(38);
	const isHeat = condition === "heatwave";

	const feelsHumidity = `Feels ${feelsLike}° · Humidity ${humidity}%`;
	const aqiLine = aqiValue >= 0 ? `AQI ${aqiValue} · ${aqiLabel}` : "";
	const sunLine = `${sunrise} ▲  ${sunset} ▼`;
	const lowHighLine = `${lowC}° / ${highC}°`;

	const mono: CSSProperties = { fontSize: secFs, color: muted };
	const kicker: CSSProperties = {
		fontSize: lblFs,
		letterSpacing: Math.round(lblFs * 0.08),
		color: muted,
		textTransform: "uppercase",
	};

	return (
		<PreSatori width={width} height={height}>
			<div
				style={{
					position: "relative",
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					padding: r(40),
					boxSizing: "border-box",
					background: bg,
					color: fg,
					overflow: "hidden",
				}}
			>
				{night &&
					STAR_SPECS.map(([t, l, s, o], i) => (
						<div
							key={i}
							style={{
								position: "absolute",
								top: Math.round(t * height),
								left: Math.round(l * width),
								width: r(s),
								height: r(s),
								borderRadius: "50%",
								background: fg,
								opacity: o,
							}}
						/>
					))}

				{/* Status bar */}
				<div
					className="font-inter"
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						fontSize: hdrFs,
						letterSpacing: Math.round(hdrFs * 0.08),
						textTransform: "uppercase",
						color: muted,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: r(10) }}>
						<span className="font-inter">{dateLabel}</span>
						<BatteryIcon battery={battery} fg={fg} hdrFs={hdrFs} />
						<span className="font-inter">{battery}%</span>
					</div>
					{deviceName ? <span className="font-inter">{deviceName}</span> : null}
				</div>

				{/* Hero */}
				<div
					style={{
						display: "flex",
						flex: 1,
						alignItems: "center",
						gap: r(36),
						marginTop: r(10),
					}}
				>
					<HeroIcon
						condition={condition}
						night={night}
						fg={fg}
						bg={bg}
						scale={scale}
					/>
					<div
						className="font-inter"
						style={{
							fontSize: bigFs,
							fontWeight: 700,
							lineHeight: 1,
							letterSpacing: Math.round(bigFs * -0.02),
						}}
					>
						{tempC}°
					</div>
					<div style={{ width: 2, height: r(88), background: divider }} />
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: r(10),
							alignItems: "flex-start",
						}}
					>
						<div
							className="font-inter"
							style={{ fontSize: condFs, fontWeight: 600 }}
						>
							{conditionLabel}
						</div>
						<div className="font-inter" style={mono}>
							{feelsHumidity}
						</div>
						{precipNote ? (
							<div className="font-inter" style={mono}>
								{precipNote}
							</div>
						) : null}
						{isHeat ? (
							<div
								className="font-inter"
								style={{
									fontSize: secFs,
									fontWeight: 600,
									borderWidth: 2,
									borderStyle: "solid",
									borderColor: fg,
									borderRadius: 5,
									padding: `${r(3)}px ${r(9)}px`,
									letterSpacing: Math.round(secFs * 0.04),
								}}
							>
								⚠ HEAT ADVISORY
							</div>
						) : null}
						{aqiLine ? (
							<div
								className="font-inter"
								style={{ fontSize: smallFs, color: muted }}
							>
								{aqiLine}
							</div>
						) : null}
					</div>
				</div>

				{/* Divider */}
				<div style={{ height: 1, background: divider, margin: `${dm}px 0` }} />

				{/* Sun + Low/High */}
				<div
					className="font-inter"
					style={{ display: "flex", justifyContent: "space-between" }}
				>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div className="font-inter" style={kicker}>
							Sunrise / Sunset
						</div>
						<div
							className="font-inter"
							style={{ fontSize: valFs, marginTop: 4 }}
						>
							{sunLine}
						</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div className="font-inter" style={kicker}>
							Today Low / High
						</div>
						<div
							className="font-inter"
							style={{ fontSize: valFs, marginTop: 4 }}
						>
							{lowHighLine}
						</div>
					</div>
				</div>

				<div style={{ height: 1, background: divider, margin: `${dm}px 0` }} />

				{/* Forecast strip */}
				<div style={{ display: "flex", justifyContent: "space-between" }}>
					{forecast.map((d: ForecastDay, i: number) => (
						<div
							key={i}
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 6,
							}}
						>
							<div
								className="font-inter"
								style={{
									fontSize: lblFs,
									letterSpacing: Math.round(lblFs * 0.06),
									color: muted,
								}}
							>
								{d.day}
							</div>
							{forecastIcon(d.icon as WeatherIcon, boxSize, fg)}
							{forecastAccessory(d.icon as WeatherIcon, boxSize, fg)}
							<div
								className="font-inter"
								style={{ fontSize: valFs, color: fg }}
							>
								{`${d.hi}°/${d.lo}°`}
							</div>
						</div>
					))}
				</div>
			</div>
		</PreSatori>
	);
}

export const definition: RecipeDefinition<
	typeof paramsSchema,
	typeof dataSchema
> = {
	meta: {
		slug: "weather",
		title: "Weather Forecast",
		description:
			"Full-screen e-paper weather widget: current conditions, day/night hero, AQI, precip window, and a 4-day forecast from the Open-Meteo API. Configurable by location or coordinates.",
		published: true,
		tags: ["tailwind", "weather", "api", "live-data", "configurable"],
		author: { name: "rbouteiller", github: "" },
		category: "display-components",
		version: "0.2.0",
		createdAt: "2025-03-01T00:00:00Z",
		updatedAt: "2026-07-16T00:00:00Z",
	},
	paramsSchema,
	dataSchema,
	getData: async (params) => {
		const data = await getWeatherDataInternal({
			location: params.location,
			latitude: params.latitude,
			longitude: params.longitude,
		});
		return data as z.infer<typeof dataSchema>;
	},
	Component: ({ width, height, params, data }) => (
		<Weather
			{...data}
			deviceName={params.deviceName}
			battery={params.battery}
			width={width}
			height={height}
		/>
	),
};
