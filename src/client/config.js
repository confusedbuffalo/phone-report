/**
 * Provides access to the global configuration object injected by the server.
 * This module acts as a bridge between the global scope and the ESM modules.
 */

const config = window.__CONFIG__ || {};

export const reportType = config.reportType;
export const locale = config.locale || document.documentElement.lang || 'en';
export const translations = config.translations || {};
export const subdivisionName = config.subdivisionName;
export const dataFilePath = config.dataFilePath;
export const dataLastUpdated = config.dataLastUpdated;
export const storageKey = config.storageKey || 'osm_report_editors';
export const openingHoursEvaluationToolUrl = config.openingHoursEvaluationToolUrl;
export const changesetTags = config.changesetTags || {};
export const officialLanguages = config.officialLanguages || [];
export const allEditorIds = config.allEditorIds || [];
export const defaultEditorsDesktop = config.defaultEditorsDesktop || [];
export const defaultEditorsMobile = config.defaultEditorsMobile || [];
export const githubLink = config.githubLink;
export const searchIndex = config.searchIndex || [];
export const reportCountryKey = config.reportCountryKey;
export const groupedDivisionStats = config.groupedDivisionStats || {};
export const safeCountryName = config.safeCountryName;

export default config;
