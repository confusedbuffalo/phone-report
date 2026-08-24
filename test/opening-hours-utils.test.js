import { createOpeningHours, hasDaysSpecified, isAmbiguousHours } from '../src/opening-hours-utils';

describe('isAmbiguousHours', () => {
    test('Empty value is not ambiguous', () => {
        const emptyNew = isAmbiguousHours('Mo-Fr 9:00-10:30', '', 'opening_hours', 'gb');
        expect(emptyNew).toBe(false);

        const emptyOld = isAmbiguousHours('', 'Mo-Fr 9:00-10:30', 'opening_hours', 'gb');
        expect(emptyOld).toBe(false);

        const emptyBoth = isAmbiguousHours('', '', 'opening_hours', 'gb');
        expect(emptyBoth).toBe(false);
    });

    test('Single-digit hour to hour less than 12 is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 9:00-10:30', 'Mo-Fr 09:00-10:30', 'opening_hours', 'gb');
        expect(result).toBe(true);
    });

    test('Single-digit hour (other than 0, 1 or 2) to hour greater than 12 is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 9:00-15:00', 'Mo-Fr 09:00-15:00', 'opening_hours', 'gb');
        expect(result).toBe(false);
    });

    test('Single-digit hour 0 to hour greater than 12 is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 0:00-15:00', 'Mo-Fr 00:00-15:00', 'opening_hours', 'gb');
        expect(result).toBe(true);
    });

    test('Single-digit hour 1 to hour greater than 12 is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 1:00-15:00', 'Mo-Fr 01:00-15:00', 'opening_hours', 'gb');
        expect(result).toBe(true);
    });

    test('Single-digit hour 2 to hour greater than 12 is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 2:00-15:00', 'Mo-Fr 02:00-15:00', 'opening_hours', 'gb');
        expect(result).toBe(true);
    });

    test('Single-digit hour at end of range is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 12:00-0:30', 'Mo-Fr 12:00-00:30', 'opening_hours', 'gb');
        expect(result).toBe(true);
    });

    test('Single-digit hour with missing space is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr9:00-10:30', 'Mo-Fr 09:00-10:30', 'opening_hours', 'gb');
        expect(result).toBe(true);
    });

    test('Single-digit hour to with dot is ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 4.00-5.00', 'Mo-Fr 04:00-05:00', 'opening_hours', 'gb');
        expect(result).toBe(true);
    });

    test('Single-digit hour with am is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 3:00am-3:00pm', 'Mo-Fr 03:00-15:00', 'opening_hours', 'gb');
        expect(result).toBe(false);
    });

    test('Single-digit hour with a.m. is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 3:00 a.m.-3:00 p.m.', 'Mo-Fr 03:00-15:00', 'opening_hours', 'gb');
        expect(result).toBe(false);
    });

    test('Single-digit hour with P.M. is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 3:00A.M.-3:00P.M.', 'Mo-Fr 03:00-15:00', 'opening_hours', 'gb');
        expect(result).toBe(false);
    });

    test('Single-digit hour with am and no minutes is not ambiguous', () => {
        const result = isAmbiguousHours('Mo-Fr 3am-4pm', 'Mo-Fr 03:00-16:00', 'opening_hours', 'gb');
        expect(result).toBe(false);
    });

    test('Adding missing zero to minutes is not ambiguous', () => {
        const result = isAmbiguousHours('09:0-17:00', '09:00-17:00', 'opening_hours', 'gb');
        expect(result).toBe(false);
    });

    test('Adding missing zero to month day is not ambiguous', () => {
        const result = isAmbiguousHours('Jan 1 09:00-17:00', 'Jan 01 09:00-17:00', 'opening_hours', 'gb');
        expect(result).toBe(false);
    });

    test('Adding missing zero to month day range is not ambiguous', () => {
        const result = isAmbiguousHours(
            'Jan 1-Apr 1: Mo-Fr 09:00-17:00',
            'Jan 01-Apr 01: Mo-Fr 09:00-17:00',
            'opening_hours',
            'gb'
        );
        expect(result).toBe(false);
    });
});

describe('hasDaysSpecified', () => {
    test.each(['10:00', '9:00', '18:00', '9:00, 18:00', '10:00 "mass", 12:00 "worship"'])(
        'Point in time "%s" has no days specified',
        input => {
            expect(hasDaysSpecified(input)).toBe(false);
        }
    );

    test.each(['10:00-11:00', '9:00-10:00', '18:00-21:00', '10:00-18:30 "mass", 12:00-13:00 "we meet for worship"'])(
        // note lower case 'we' in the last one
        'Time range "%s" has no days specified',
        input => {
            expect(hasDaysSpecified(input)).toBe(false);
        }
    );

    test.each(['Su 10:00', 'Mo 9:00', 'Tu 18:00', 'We,Th 9:00, 18:00', 'Fr-Su 10:00 "mass", 12:00 "worship"'])(
        'Point in time "%s" has day/s specified',
        input => {
            expect(hasDaysSpecified(input)).toBe(true);
        }
    );

    test.each(['Su 10:00-11:00', 'Mo 9:00-14:00', 'Tu 18:00-20:00', 'Fr-Su 10:00-11:00 "mass", 12:00-13:00 "worship"'])(
        'Time range "%s" has day/s specified',
        input => {
            expect(hasDaysSpecified(input)).toBe(true);
        }
    );

    test.each(['closed', 'closed ""permanently closed"'])('Closed "%s" has no days specified', input => {
        expect(hasDaysSpecified(input)).toBe(true);
    });

    test.each(['Jan 01 10:00', 'easter 09:00', 'easter +63 days 10:00', 'easter -2 days 10:00'])(
        'Specific date "%s" has day/s specified',
        input => {
            expect(hasDaysSpecified(input)).toBe(true);
        }
    );
});

describe('createOpeningHours', () => {
    test('SH in a country without SH defined does not throw an error', () => {
        // Obviously this could change and we wouldn't notice, but it works at the moment
        const result = createOpeningHours('Mo-Sa 08:00-22:00; Su,SH off', 'opening_hours', 'bg');
        expect(result.getStructuredWarnings().length).toEqual(0);
    });
});
