import { a as getLocaleForLanguage, i as getIntlLanguage, n as SUPPORTED_LANGUAGE_CODES, o as isRtlLanguage, r as SupportedLanguageCode, t as SUPPORTED_LANGUAGES } from "../languages-4qeXgpJ0.cjs";

//#region src/i18n/types.d.ts
type TranslationValue = string | {
  name: string;
  category: string;
}[];
type TranslationStrings = Record<string, TranslationValue>;
//#endregion
export { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, SupportedLanguageCode, TranslationStrings, TranslationValue, getIntlLanguage, getLocaleForLanguage, isRtlLanguage };