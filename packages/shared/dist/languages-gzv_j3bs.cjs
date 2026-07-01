//#region src/i18n/languages.ts
const SUPPORTED_LANGUAGES = [
	{
		value: "de",
		label: "Deutsch",
		locale: "de-DE"
	},
	{
		value: "en",
		label: "English",
		locale: "en-US"
	},
	{
		value: "es",
		label: "Español",
		locale: "es-ES"
	},
	{
		value: "fr",
		label: "Français",
		locale: "fr-FR"
	},
	{
		value: "hu",
		label: "Magyar",
		locale: "hu-HU"
	},
	{
		value: "nl",
		label: "Nederlands",
		locale: "nl-NL"
	},
	{
		value: "br",
		label: "Português (Brasil)",
		locale: "pt-BR"
	},
	{
		value: "cs",
		label: "Česky",
		locale: "cs-CZ"
	},
	{
		value: "pl",
		label: "Polski",
		locale: "pl-PL"
	},
	{
		value: "ru",
		label: "Русский",
		locale: "ru-RU"
	},
	{
		value: "zh",
		label: "简体中文",
		locale: "zh-CN"
	},
	{
		value: "zh-TW",
		label: "繁體中文",
		locale: "zh-TW"
	},
	{
		value: "it",
		label: "Italiano",
		locale: "it-IT"
	},
	{
		value: "tr",
		label: "Türkçe",
		locale: "tr-TR"
	},
	{
		value: "ar",
		label: "العربية",
		locale: "ar-SA"
	},
	{
		value: "id",
		label: "Bahasa Indonesia",
		locale: "id-ID"
	},
	{
		value: "ja",
		label: "日本語",
		locale: "ja-JP"
	},
	{
		value: "ko",
		label: "한국어",
		locale: "ko-KR"
	},
	{
		value: "uk",
		label: "Українська",
		locale: "uk-UA"
	},
	{
		value: "gr",
		label: "Ελληνικά",
		locale: "el-GR"
	}
];
const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.value);
const LOCALES = Object.fromEntries(SUPPORTED_LANGUAGES.map((l) => [l.value, l.locale]));
const RTL_LANGUAGES = /* @__PURE__ */ new Set(["ar"]);
function getLocaleForLanguage(language) {
	return LOCALES[language] ?? LOCALES["en"] ?? "en-US";
}
function getIntlLanguage(language) {
	if (language === "br") return "pt-BR";
	return SUPPORTED_LANGUAGE_CODES.includes(language) ? language : "en";
}
function isRtlLanguage(language) {
	return RTL_LANGUAGES.has(language);
}
//#endregion
Object.defineProperty(exports, "SUPPORTED_LANGUAGES", {
	enumerable: true,
	get: function() {
		return SUPPORTED_LANGUAGES;
	}
});
Object.defineProperty(exports, "SUPPORTED_LANGUAGE_CODES", {
	enumerable: true,
	get: function() {
		return SUPPORTED_LANGUAGE_CODES;
	}
});
Object.defineProperty(exports, "getIntlLanguage", {
	enumerable: true,
	get: function() {
		return getIntlLanguage;
	}
});
Object.defineProperty(exports, "getLocaleForLanguage", {
	enumerable: true,
	get: function() {
		return getLocaleForLanguage;
	}
});
Object.defineProperty(exports, "isRtlLanguage", {
	enumerable: true,
	get: function() {
		return isRtlLanguage;
	}
});
