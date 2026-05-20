import { translate } from './i18n.js';

/**
 * Updates the "time ago" text in the footer.
 * Reads the timestamp from the data-timestamp attribute of the container.
 * @param {string} formattedDate - Pre-formatted date string from the server.
 * @param {string} formattedTime - Pre-formatted time string from the server.
 */
export function updateTimeAgo(formattedDate, formattedTime) {
    const container = document.getElementById('data-timestamp-container');
    if (!container) return;

    const dataTimestampMs = parseInt(container.getAttribute('data-timestamp'), 10);
    const dataDate = new Date(dataTimestampMs);
    const totalMinutes = Math.floor((new Date() - dataDate) / (1000 * 60));

    const timeFormatter = new Intl.RelativeTimeFormat(document.documentElement.lang, { numeric: 'auto' });
    const timeAgoText = totalMinutes < 60
        ? timeFormatter.format(-totalMinutes, 'minute')
        : timeFormatter.format(-Math.floor(totalMinutes / 60), 'hour');

    container.innerHTML = translate('dataSourcedTemplate', {
        date: formattedDate,
        time: formattedTime,
        zone: 'UTC',
        ago: timeAgoText
    });
}
