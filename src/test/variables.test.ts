import * as assert from 'node:assert/strict';
import { createSnapshot, type RequestSnapshot } from '../core/types';
import {
    completeVariableToken,
    createEnvironment,
    findActiveVariableToken,
    findVariableTokens,
    interpolate,
    interpolateSnapshot,
    matchVariables,
    unresolvedInSnapshot,
    unresolvedVariables,
    variableValues,
    type Variable,
} from '../core/variables';

function variable(key: string, value: string, extra: Partial<Variable> = {}): Variable {
    return { id: key, key, value, enabled: true, secret: false, ...extra };
}

suite('variable tokens', () => {
    test('finds every token with its position and name', () => {
        const tokens = findVariableTokens('{{host}}/users/{{ id }}');

        assert.deepEqual(
            tokens.map((token) => [token.start, token.end, token.name]),
            [
                [0, 8, 'host'],
                [15, 23, 'id'],
            ]
        );
    });

    test('ignores text that only looks like a token', () => {
        assert.deepEqual(findVariableTokens('{ not }} a {{ token'), []);
        assert.deepEqual(findVariableTokens('{{outer{{inner}}'), [
            { start: 7, end: 16, text: '{{inner}}', name: 'inner' },
        ]);
    });

    test('accepts an empty token without crashing', () => {
        assert.deepEqual(
            findVariableTokens('{{}}').map((token) => token.name),
            ['']
        );
    });
});

suite('typing a variable', () => {
    test('opens as soon as the braces are typed', () => {
        assert.deepEqual(findActiveVariableToken('https://{{', 10), { start: 8, query: '' });
    });

    test('carries what has been typed so far as the query', () => {
        assert.deepEqual(findActiveVariableToken('https://{{bas', 13), { start: 8, query: 'bas' });
    });

    test('closes once the token is finished', () => {
        assert.equal(findActiveVariableToken('https://{{base}}/x', 18), null);
    });

    test('stays closed when there are no braces before the caret', () => {
        assert.equal(findActiveVariableToken('https://api.test', 16), null);
    });

    test('does not reach across a line break', () => {
        assert.equal(findActiveVariableToken('{{\nbase', 7), null);
    });

    test('follows the caret rather than the end of the text', () => {
        assert.deepEqual(findActiveVariableToken('{{ba}}/tail', 4), { start: 0, query: 'ba' });
    });

    test('completes the token and reports where the caret lands', () => {
        const text = 'https://{{bas';
        const token = findActiveVariableToken(text, 13);

        assert.ok(token);
        assert.deepEqual(completeVariableToken(text, token, 'baseUrl'), {
            text: 'https://{{baseUrl}}',
            caret: 19,
        });
    });

    test('does not double the closing braces when they are already there', () => {
        const text = 'https://{{bas}}/users';
        const token = findActiveVariableToken(text, 13);

        assert.ok(token);
        assert.deepEqual(completeVariableToken(text, token, 'baseUrl'), {
            text: 'https://{{baseUrl}}/users',
            caret: 19,
        });
    });
});

suite('choosing a variable', () => {
    const variables = [
        variable('baseUrl', 'https://api.test'),
        variable('basePath', '/v1'),
        variable('token', 'abc'),
        variable('disabled', 'x', { enabled: false }),
        variable('', 'nameless'),
    ];

    test('offers only usable variables', () => {
        assert.deepEqual(
            matchVariables(variables, '').map((match) => match.key),
            ['basePath', 'baseUrl', 'token']
        );
    });

    test('puts a prefix match before a mere substring match', () => {
        assert.deepEqual(
            matchVariables([variable('myBase', '1'), variable('baseUrl', '2')], 'base').map(
                (match) => match.key
            ),
            ['baseUrl', 'myBase']
        );
    });

    test('matches without regard to case', () => {
        assert.deepEqual(
            matchVariables(variables, 'BASEU').map((match) => match.key),
            ['baseUrl']
        );
    });
});

suite('interpolation', () => {
    const values = { baseUrl: 'https://api.test', id: '42', empty: '' };

    test('replaces a token with its value', () => {
        assert.equal(interpolate('{{baseUrl}}/users/{{id}}', values), 'https://api.test/users/42');
    });

    test('tolerates spaces inside the braces', () => {
        assert.equal(interpolate('{{ baseUrl }}/x', values), 'https://api.test/x');
    });

    test('leaves an unknown variable exactly as it was typed', () => {
        assert.equal(interpolate('{{nope}}/x', values), '{{nope}}/x');
    });

    test('honours a variable whose value is empty', () => {
        assert.equal(interpolate('a{{empty}}b', values), 'ab');
    });

    test('resolves a variable that refers to another', () => {
        assert.equal(
            interpolate('{{url}}', { url: '{{host}}/v1', host: 'https://api.test' }),
            'https://api.test/v1'
        );
    });

    test('gives up on a cycle instead of hanging', () => {
        assert.equal(interpolate('{{a}}', { a: '{{b}}', b: '{{a}}' }), '{{a}}');
    });

    test('leaves text without tokens untouched', () => {
        assert.equal(interpolate('https://api.test/users', values), 'https://api.test/users');
    });

    test('reports what could not be resolved', () => {
        assert.deepEqual(unresolvedVariables('{{baseUrl}}/{{nope}}', values), ['nope']);
        assert.deepEqual(unresolvedVariables('{{baseUrl}}', values), []);
    });
});

suite('environment values', () => {
    test('takes only enabled, named variables', () => {
        const environment = createEnvironment('Dev');

        environment.variables = [
            variable('baseUrl', 'https://dev.test'),
            variable('off', 'x', { enabled: false }),
            variable('  ', 'blank'),
        ];

        assert.deepEqual(variableValues(environment), { baseUrl: 'https://dev.test' });
    });

    test('is empty when no environment is chosen', () => {
        assert.deepEqual(variableValues(undefined), {});
    });

    test('lets a later variable win a duplicated name', () => {
        const environment = createEnvironment('Dev');

        environment.variables = [variable('a', 'first'), variable('a', 'second')];
        assert.deepEqual(variableValues(environment), { a: 'second' });
    });
});

suite('interpolating a request', () => {
    const values = { host: 'https://api.test', token: 'abc123', page: '2', file: '/tmp/a.bin' };

    function snapshot(): RequestSnapshot {
        return {
            ...createSnapshot(),
            url: '{{host}}/users',
            body: '{"token":"{{token}}"}',
            binaryPath: '{{file}}',
            params: [{ id: 'p', key: 'page', value: '{{page}}', enabled: true }],
            headers: [{ id: 'h', key: 'X-{{page}}', value: '{{token}}', enabled: true }],
            formBody: [{ id: 'f', key: 'k', value: '{{token}}', enabled: true }],
            multipartBody: [
                {
                    id: 'm',
                    key: '{{page}}',
                    value: '{{token}}',
                    enabled: true,
                    type: 'file' as const,
                    filePath: '{{file}}',
                },
            ],
            auth: { type: 'bearer' as const, token: '{{token}}', prefix: 'Bearer' },
        };
    }

    test('reaches every place a variable can be written', () => {
        const result = interpolateSnapshot(snapshot(), values);

        assert.equal(result.url, 'https://api.test/users');
        assert.equal(result.body, '{"token":"abc123"}');
        assert.equal(result.binaryPath, '/tmp/a.bin');
        assert.equal(result.params[0].value, '2');
        assert.equal(result.headers[0].key, 'X-2');
        assert.equal(result.headers[0].value, 'abc123');
        assert.equal(result.formBody[0].value, 'abc123');
        assert.equal(result.multipartBody[0].key, '2');
        assert.equal(result.multipartBody[0].filePath, '/tmp/a.bin');
        assert.equal(result.auth.type === 'bearer' && result.auth.token, 'abc123');
    });

    test('leaves the value of a file field alone', () => {
        const result = interpolateSnapshot(snapshot(), values);

        assert.equal(result.multipartBody[0].value, '{{token}}');
    });

    test('does not touch the stored request', () => {
        const original = snapshot();

        interpolateSnapshot(original, values);
        assert.equal(original.url, '{{host}}/users');
    });

    test('lists what the request still needs', () => {
        const missing = unresolvedInSnapshot(snapshot(), { host: 'https://api.test' });

        assert.deepEqual(missing, ['file', 'page', 'token']);
    });

    test('ignores a disabled row when reporting what is missing', () => {
        const request = snapshot();

        request.params = [{ id: 'p', key: 'k', value: '{{nope}}', enabled: false }];
        request.headers = [];
        request.formBody = [];
        request.multipartBody = [];
        request.body = '';
        request.binaryPath = '';
        request.auth = { type: 'none' };

        assert.deepEqual(unresolvedInSnapshot(request, { host: 'x' }), []);
    });
});
