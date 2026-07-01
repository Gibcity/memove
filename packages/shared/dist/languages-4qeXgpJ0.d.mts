//#region src/i18n/languages.d.ts
declare const SUPPORTED_LANGUAGES: readonly [{
  readonly value: "de";
  readonly label: "Deutsch";
  readonly locale: "de-DE";
}, {
  readonly value: "en";
  readonly label: "English";
  readonly locale: "en-US";
}, {
  readonly value: "es";
  readonly label: "Español";
  readonly locale: "es-ES";
}, {
  readonly value: "fr";
  readonly label: "Français";
  readonly locale: "fr-FR";
}, {
  readonly value: "hu";
  readonly label: "Magyar";
  readonly locale: "hu-HU";
}, {
  readonly value: "nl";
  readonly label: "Nederlands";
  readonly locale: "nl-NL";
}, {
  readonly value: "br";
  readonly label: "Português (Brasil)";
  readonly locale: "pt-BR";
}, {
  readonly value: "cs";
  readonly label: "Česky";
  readonly locale: "cs-CZ";
}, {
  readonly value: "pl";
  readonly label: "Polski";
  readonly locale: "pl-PL";
}, {
  readonly value: "ru";
  readonly label: "Русский";
  readonly locale: "ru-RU";
}, {
  readonly value: "zh";
  readonly label: "简体中文";
  readonly locale: "zh-CN";
}, {
  readonly value: "zh-TW";
  readonly label: "繁體中文";
  readonly locale: "zh-TW";
}, {
  readonly value: "it";
  readonly label: "Italiano";
  readonly locale: "it-IT";
}, {
  readonly value: "tr";
  readonly label: "Türkçe";
  readonly locale: "tr-TR";
}, {
  readonly value: "ar";
  readonly label: "العربية";
  readonly locale: "ar-SA";
}, {
  readonly value: "id";
  readonly label: "Bahasa Indonesia";
  readonly locale: "id-ID";
}, {
  readonly value: "ja";
  readonly label: "日本語";
  readonly locale: "ja-JP";
}, {
  readonly value: "ko";
  readonly label: "한국어";
  readonly locale: "ko-KR";
}, {
  readonly value: "uk";
  readonly label: "Українська";
  readonly locale: "uk-UA";
}, {
  readonly value: "gr";
  readonly label: "Ελληνικά";
  readonly locale: "el-GR";
}];
type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['value'];
declare const SUPPORTED_LANGUAGE_CODES: string[];
declare function getLocaleForLanguage(language: string): string;
declare function getIntlLanguage(language: string): string;
declare function isRtlLanguage(language: string): boolean;
//#endregion
export { getLocaleForLanguage as a, getIntlLanguage as i, SUPPORTED_LANGUAGE_CODES as n, isRtlLanguage as o, SupportedLanguageCode as r, SUPPORTED_LANGUAGES as t };