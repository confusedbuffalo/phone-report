const MASTER_KEYS = {
    // --- Basic Keys (No Placeholders Required) ---
    'numbersChecked': [],
    'invalidNumbers': [],
    'potentiallyFixable': [],
    'calculating': [],
    'suggestionIssueLink': [],
    'letMeKnowOnGitHub': [],
    'openLocation': [],
    'fixInJOSM': [],
    'website': [],
    'suggestedFix': [],
    'backToCountryPage': [],
    'phoneNumberReport': [],
    'fixableNumbersHeader': [],
    'invalidNumbersHeader': [],
    'invalid': [],
    'osmPhoneNumberValidation': [],
    'reportSubtitle': [],
    'countryReports': [],
    'progressHistory': [],
    'backToAllCountries': [],
    'divisionalReports': [],
    'showEmptyDivisions': [],
    'sortBy': [],
    'invalidPercentage': [],
    'invalidCount': [],
    'name': [],
    'noDivisionsFound': [],
    'noAutoFixable': [],
    'noInvalidNumbers': [],
    'timeAgoJustNow': [],
    'timeAgoError': [],
    'settings': [],
    'disused': [],
    'noSubdivisionsFound': [],
    'fixable': [],
    'iconsSourcedFrom': [],
    'notMobileNumber': [],
    "invalidNumber": [],
    "next": [],
    "previous": [],
    "duplicateNumber": [],
    "login": [],
    "logout": [],
    "discard": [],
    "keep": [],
    "close": [],
    "cancel": [],
    "upload": [],
    "restoreUnsavedEdits": [],
    "applyFix": [],
    "enterComment": [],
    "noChangesSubmitted": [],
    "notLoggedIn": [],

    'fixableNumbersDescription': [],
    'invalidNumbersDescription': [],

    // --- Keys with Required Placeholders ---
    'editIn': ['%e'],

    'invalidPercentageOfTotal': ['%p'],
    'fixablePercentageOfInvalid': ['%p'],

    'invalidNumbersOutOf': ['%i', '%f', '%t'],

    'numberDetailsNamesDataFrom': ['%o'],

    'reportSubtitleForCountry': ['%c'],
    'dataSourcedTemplate': ['%d', '%t', '%z', '%a'],

    "pageOf": ['%n', '%t'],

    "uploadChanges": ['%n'],
    "restoreChanges": ['%n'],
    "changesetCreated": ['%n'],

    // Time Ago (uses %n for number)
    'timeAgoMinute': ['%n'],
    'timeAgoMinutesPlural': ['%n'],
    'timeAgoHour': ['%n'],
    'timeAgoHoursPlural': ['%n'],

    // Page Titles (uses %s for country name)
    'mainIndexTitle': [], // Static title
    'countryReportTitle': ['%c']
};

module.exports = { MASTER_KEYS };