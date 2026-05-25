import { translate } from './i18n.js';

/**
 * Definitions for OpenStreetMap editors supported by the application.
 * Each editor provides a way to generate an edit link for a given OSM item.
 */
export const OSM_EDITORS = {
    JOSM: {
        getEditLink: function (item) {
            const baseUrl = 'http://127.0.0.1:8111/load_object';
            return `${baseUrl}?objects=${encodeURIComponent(item.type[0])}${encodeURIComponent(item.id)}&relation_members=true`;
        },
        get editInString() {
            return translate('editIn', { editor: 'JOSM' });
        },
    },
    iD: {
        getEditLink: function (item) {
            const baseUrl = 'https://www.openstreetmap.org/edit?editor=id';
            return `${baseUrl}&${encodeURIComponent(item.type)}=${encodeURIComponent(item.id)}#map=19/${encodeURIComponent(item.lat)}/${encodeURIComponent(item.lon)}`;
        },
        get editInString() {
            return translate('editIn', { editor: 'iD' });
        },
    },
    Rapid: {
        getEditLink: function (item) {
            const baseUrl = 'https://rapideditor.org/edit#map=19';
            return `${baseUrl}/${encodeURIComponent(item.lat)}/${encodeURIComponent(item.lon)}&id=${encodeURIComponent(item.type[0])}${encodeURIComponent(item.id)}`;
        },
        get editInString() {
            return translate('editIn', { editor: 'Rapid' });
        },
    },
    Level0: {
        getEditLink: function (item) {
            const baseUrl = 'https://level0.osmz.ru/?url=';
            return `${baseUrl}${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}`;
        },
        get editInString() {
            return translate('editIn', { editor: 'Level0' });
        },
    },
    Geo: {
        getEditLink: function (item) {
            const baseUrl = 'geo:';
            return `${baseUrl}${encodeURIComponent(item.lat)},${encodeURIComponent(item.lon)}`;
        },
        get editInString() {
            return translate('openLocation');
        },
    },
};

export const ALL_EDITOR_IDS = Object.keys(OSM_EDITORS);
