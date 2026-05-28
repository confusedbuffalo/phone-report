import { splitCompoundName } from '../src/name-utils';

describe(splitCompoundName, () => {
    it.each`
        input                              | output
        ${''}                              | ${[]}
        ${'a'}                             | ${['a']}
        ${'a / b'}                         | ${['a', 'b']}
        ${'a;b'}                           | ${['a', 'b']}
        ${'a (b)'}                         | ${['a', 'b']}
        ${'(a) (b)'}                       | ${['a', 'b']}
        ${'(a) b'}                         | ${['a', 'b']}
        ${'a / b (c) d (e / f;g / h) i;j'} | ${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']}
    `('$input', ({ input, output }) => {
        expect(splitCompoundName(input)).toStrictEqual(output);
    });
});
