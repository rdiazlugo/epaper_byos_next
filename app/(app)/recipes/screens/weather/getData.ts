import { unstable_cache } from "next/cache";

// Export config to mark this component as dynamic
export const dynamic = "force-dynamic";

export type WeatherIcon = "clear" | "cloud" | "rain" | "snow" | "heatwave";

export interface ForecastDay {
	day: string;
	hi: number;
	lo: number;
	icon: WeatherIcon;
}

export interface WeatherData {
	night: boolean;
	dateLabel: string;
	condition: WeatherIcon;
	conditionLabel: string;
	tempC: number;
	feelsLike: number;
	humidity: number;
	precipNote: string;
	sunrise: string;
	sunset: string;
	aqiValue: number;
	aqiLabel: string;
	lowC: number;
	highC: number;
	location: string;
	forecast: ForecastDay[];
	latitude: number;
	longitude: number;
}

type WeatherParams = {
	location?: string;
	latitude?: number;
	longitude?: number;
};

interface GeocodingResponse {
	results: Array<{
		name: string;
		country: string;
		latitude: number;
		longitude: number;
	}>;
}

interface OpenMeteoResponse {
	current: {
		time: string;
		temperature_2m: number;
		apparent_temperature: number;
		relative_humidity_2m: number;
		weather_code: number;
		is_day: number;
	};
	hourly: {
		time: string[];
		precipitation_probability: number[];
		weather_code: number[];
	};
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		sunset: string[];
		sunrise: string[];
	};
}

const HEATWAVE_C = 35; // apparent/actual temp at or above this reads as a heatwave
const PRECIP_THRESHOLD = 50; // % probability that counts as "likely to precipitate"

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
	"JAN",
	"FEB",
	"MAR",
	"APR",
	"MAY",
	"JUN",
	"JUL",
	"AUG",
	"SEP",
	"OCT",
	"NOV",
	"DEC",
];

/** Weekday abbreviation for a local ISO date, tz-safe (reads the wall date). */
function weekday(iso: string): string {
	const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
	return WEEKDAYS[d.getUTCDay()];
}

/** "TUE 09 APR" from a local ISO datetime, tz-safe. */
function formatDateLabel(iso: string): string {
	const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${WEEKDAYS[d.getUTCDay()]} ${day} ${MONTHS[d.getUTCMonth()]}`;
}

/** "HH:MM" straight off the local ISO string — avoids runtime-tz drift. */
function hhmm(iso: string): string {
	return iso.slice(11, 16);
}

/** Map an Open-Meteo weather code to the design's icon vocabulary. */
function codeToIcon(code: number): WeatherIcon {
	if (code <= 1) return "clear";
	if (code === 2 || code === 3 || code === 45 || code === 48) return "cloud";
	if (
		(code >= 71 && code <= 77) ||
		code === 85 ||
		code === 86 ||
		code === 56 ||
		code === 57 ||
		code === 66 ||
		code === 67
	)
		return "snow";
	return "rain"; // drizzle, rain, showers, thunder
}

function getWeatherDescription(code: number): string {
	const weatherCodes: { [key: number]: string } = {
		0: "Clear sky",
		1: "Mainly clear",
		2: "Partly cloudy",
		3: "Overcast",
		45: "Foggy",
		48: "Depositing rime fog",
		51: "Light drizzle",
		53: "Moderate drizzle",
		55: "Dense drizzle",
		56: "Light freezing drizzle",
		57: "Dense freezing drizzle",
		61: "Slight rain",
		63: "Moderate rain",
		65: "Heavy rain",
		66: "Light freezing rain",
		67: "Heavy freezing rain",
		71: "Slight snow",
		73: "Moderate snow",
		75: "Heavy snow",
		77: "Snow grains",
		80: "Slight showers",
		81: "Moderate showers",
		82: "Violent showers",
		85: "Slight snow showers",
		86: "Heavy snow showers",
		95: "Thunderstorm",
		96: "Thunderstorm, hail",
		99: "Thunderstorm, heavy hail",
	};
	return weatherCodes[code] || "Unknown";
}

function aqiLabel(value: number): string {
	if (value < 0) return "";
	if (value <= 50) return "Good";
	if (value <= 100) return "Moderate";
	if (value <= 150) return "Unhealthy (SG)";
	if (value <= 200) return "Unhealthy";
	if (value <= 300) return "Very unhealthy";
	return "Hazardous";
}

/**
 * Scan today's remaining hourly precip probabilities and describe the first
 * contiguous window at or above threshold, e.g. "Rain likely 08:00–14:00 · 80%
 * precip". Returns "" when nothing notable is coming.
 */
function precipWindow(
	hourly: OpenMeteoResponse["hourly"],
	nowIso: string,
): string {
	const { time, precipitation_probability: prob, weather_code: codes } = hourly;
	if (!time?.length) return "";
	const today = nowIso.slice(0, 10);
	const nowHM = hhmm(nowIso);

	let start = -1;
	let end = -1;
	let maxProb = 0;
	let snow = false;
	for (let i = 0; i < time.length; i++) {
		if (time[i].slice(0, 10) !== today) continue; // only today
		if (hhmm(time[i]) < nowHM) continue; // only from now on
		if (prob[i] >= PRECIP_THRESHOLD) {
			if (start === -1) start = i;
			end = i;
			maxProb = Math.max(maxProb, prob[i]);
			if (codeToIcon(codes[i]) === "snow") snow = true;
		} else if (start !== -1) {
			break; // window ended
		}
	}
	if (start === -1) return "";

	const startHM = hhmm(time[start]);
	// window covers the labelled hour; show its end as the next hour boundary
	const endHM = end + 1 < time.length ? hhmm(time[end + 1]) : hhmm(time[end]);
	const kind = snow ? "Snow" : "Rain";
	const verb = maxProb >= 70 ? "likely" : "possible";
	return `${kind} ${verb} ${startHM}–${endHM} · ${maxProb}% precip`;
}

async function geocodeLocation(
	locationName: string,
): Promise<{ latitude: number; longitude: number; name: string } | null> {
	try {
		const response = await fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=en&format=json`,
			{ headers: { Accept: "application/json" }, next: { revalidate: 0 } },
		);
		if (!response.ok) {
			throw new Error(
				`Geocoding API responded with status: ${response.status}`,
			);
		}
		const data: GeocodingResponse = await response.json();
		if (data.results && data.results.length > 0) {
			const result = data.results[0];
			return {
				latitude: result.latitude,
				longitude: result.longitude,
				name: `${result.name}, ${result.country}`,
			};
		}
		return null;
	} catch (error) {
		if (isPrerenderError(error)) return null;
		console.error("Error geocoding location:", error);
		return null;
	}
}

/** US AQI for coordinates; -1 when unavailable (kept non-fatal). */
async function fetchAqi(latitude: number, longitude: number): Promise<number> {
	try {
		const response = await fetch(
			`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi&timezone=auto`,
			{ headers: { Accept: "application/json" }, next: { revalidate: 0 } },
		);
		if (!response.ok) return -1;
		const data = await response.json();
		const v = data?.current?.us_aqi;
		return typeof v === "number" ? Math.round(v) : -1;
	} catch (error) {
		if (isPrerenderError(error)) return -1;
		console.error("Error fetching AQI:", error);
		return -1;
	}
}

function isPrerenderError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return (
		msg.includes("prerender") ||
		msg.includes("HANGING_PROMISE_REJECTION") ||
		msg.includes("prerender is complete")
	);
}

async function getWeatherData(
	latitude?: number,
	longitude?: number,
	locationName?: string,
): Promise<WeatherData | null> {
	try {
		if ((!latitude || !longitude) && !locationName) {
			throw new Error("Latitude, longitude, or location name are required");
		}

		if (locationName && (!latitude || !longitude)) {
			const geocoded = await geocodeLocation(locationName);
			if (geocoded) {
				latitude = geocoded.latitude;
				longitude = geocoded.longitude;
			}
		}

		const response = await fetch(
			`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
				`&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day` +
				`&hourly=precipitation_probability,weather_code` +
				`&daily=weather_code,temperature_2m_max,temperature_2m_min,sunset,sunrise` +
				`&forecast_days=5&timezone=auto`,
			{ headers: { Accept: "application/json" }, next: { revalidate: 0 } },
		);
		if (!response.ok) {
			throw new Error(
				`Open-Meteo API responded with status: ${response.status}`,
			);
		}
		const data: OpenMeteoResponse = await response.json();
		if (!data.current) throw new Error("No current weather data available");

		const current = data.current;
		const daily = data.daily;

		const tempC = Math.round(current.temperature_2m);
		const feelsLike = Math.round(current.apparent_temperature);
		const heatwave = feelsLike >= HEATWAVE_C || tempC >= HEATWAVE_C;
		const baseIcon = codeToIcon(current.weather_code);
		const condition: WeatherIcon = heatwave ? "heatwave" : baseIcon;
		const conditionLabel = heatwave
			? "Heatwave"
			: getWeatherDescription(current.weather_code);

		// Next 4 days (skip today at index 0).
		const forecast: ForecastDay[] = [];
		for (let i = 1; i <= 4 && i < daily.time.length; i++) {
			const hi = Math.round(daily.temperature_2m_max[i]);
			const lo = Math.round(daily.temperature_2m_min[i]);
			const icon: WeatherIcon =
				hi >= HEATWAVE_C ? "heatwave" : codeToIcon(daily.weather_code[i]);
			forecast.push({ day: weekday(daily.time[i]), hi, lo, icon });
		}

		const aqiValue = await fetchAqi(latitude ?? 0, longitude ?? 0);

		return {
			night: current.is_day === 0,
			dateLabel: formatDateLabel(current.time),
			condition,
			conditionLabel,
			tempC,
			feelsLike,
			humidity: Math.round(current.relative_humidity_2m),
			precipNote: precipWindow(data.hourly, current.time),
			sunrise: hhmm(daily.sunrise[0]),
			sunset: hhmm(daily.sunset[0]),
			aqiValue,
			aqiLabel: aqiLabel(aqiValue),
			lowC: Math.round(daily.temperature_2m_min[0]),
			highC: Math.round(daily.temperature_2m_max[0]),
			location: locationName || "San Francisco, CA",
			forecast,
			latitude: latitude || 0,
			longitude: longitude || 0,
		};
	} catch (error) {
		if (isPrerenderError(error)) return null;
		console.error("Error fetching weather data:", error);
		return null;
	}
}

const EMPTY: WeatherData = {
	night: false,
	dateLabel: "",
	condition: "clear",
	conditionLabel: "N/A",
	tempC: 0,
	feelsLike: 0,
	humidity: 0,
	precipNote: "",
	sunrise: "--:--",
	sunset: "--:--",
	aqiValue: -1,
	aqiLabel: "",
	lowC: 0,
	highC: 0,
	location: "N/A",
	forecast: [],
	latitude: 0,
	longitude: 0,
};

async function fetchWeatherDataNoCache(
	params?: WeatherParams,
): Promise<WeatherData> {
	const data = await getWeatherData(
		params?.latitude,
		params?.longitude,
		params?.location,
	);
	return (
		data ?? {
			...EMPTY,
			latitude: params?.latitude ?? 0,
			longitude: params?.longitude ?? 0,
		}
	);
}

const getCachedWeatherData = unstable_cache(
	async (params?: WeatherParams): Promise<WeatherData> => {
		const data = await getWeatherData(
			params?.latitude,
			params?.longitude,
			params?.location,
		);
		if (!data) throw new Error("Empty or invalid data - skip caching");
		return data;
	},
	["weather-data-v2"],
	{ tags: ["weather", "open-meteo"], revalidate: 900 },
);

export default async function getData(
	params?: WeatherParams,
): Promise<WeatherData> {
	const locationName = params?.location || "San Francisco";
	let finalLatitude = params?.latitude;
	let finalLongitude = params?.longitude;
	let finalLocationName = locationName;

	try {
		if (locationName && !finalLatitude && !finalLongitude) {
			const geocoded = await geocodeLocation(locationName);
			if (geocoded) {
				finalLatitude = geocoded.latitude;
				finalLongitude = geocoded.longitude;
				finalLocationName = geocoded.name;
			}
		}
		return await getCachedWeatherData({
			latitude: finalLatitude,
			longitude: finalLongitude,
			location: finalLocationName,
		});
	} catch (error) {
		console.log("Cache skipped or error:", error);
		return fetchWeatherDataNoCache({
			latitude: finalLatitude,
			longitude: finalLongitude,
			location: finalLocationName,
		});
	}
}
