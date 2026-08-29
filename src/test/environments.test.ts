import * as assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Environment } from '../core/variables';
import {
    ACTIVE_ENVIRONMENT_KEY,
    EnvironmentService,
    collectEnvironmentSecrets,
    redactEnvironments,
    restoreEnvironments,
    type EnvironmentPersistence,
} from '../services/EnvironmentService';
import { parseEnvironmentDocument } from '../core/environmentFile';
import { EnvironmentStore, environmentFileName } from '../services/EnvironmentStore';
import { SecretStore } from '../services/SecretStore';
import { FakeMemento } from './FakeMemento';
import { FakeSecretStorage } from './FakeSecretStorage';

class FakeEnvironments implements EnvironmentPersistence {
    saved: Environment[] = [];

    constructor(seed: Environment[] = []) {
        this.saved = seed;
    }

    async load(): Promise<{ environments: Environment[]; unreadable: string[] }> {
        return { environments: this.saved, unreadable: [] };
    }

    async save(environments: readonly Environment[]): Promise<void> {
        this.saved = environments.map((environment) => ({
            ...environment,
            variables: environment.variables.map((variable) => ({ ...variable })),
        }));
    }

    get text(): string {
        return JSON.stringify(this.saved);
    }
}

async function service(secrets?: SecretStore): Promise<{
    files: FakeEnvironments;
    memento: FakeMemento;
    environments: EnvironmentService;
}> {
    const files = new FakeEnvironments();
    const memento = new FakeMemento();
    const environments = await EnvironmentService.open(files, memento, secrets);

    return { files, memento, environments };
}

suite('environment service', () => {
    test('starts with nothing chosen', async () => {
        const { environments } = await service();

        assert.deepEqual(environments.environments, []);
        assert.equal(environments.activeId, null);
        assert.deepEqual(environments.values, {});
    });

    test('makes a new environment the active one', async () => {
        const { environments } = await service();
        const created = await environments.create('Dev');

        assert.equal(environments.activeId, created.id);
        assert.equal(environments.active?.name, 'Dev');
    });

    test('serves the values of the active environment only', async () => {
        const { environments } = await service();
        const dev = await environments.create('Dev');
        const prod = await environments.create('Prod');

        await environments.replaceVariables(dev.id, [
            { id: 'a', key: 'baseUrl', value: 'https://dev.test', enabled: true, secret: false },
        ]);
        await environments.replaceVariables(prod.id, [
            { id: 'b', key: 'baseUrl', value: 'https://prod.test', enabled: true, secret: false },
        ]);

        assert.deepEqual(environments.values, { baseUrl: 'https://prod.test' });
        await environments.setActive(dev.id);
        assert.deepEqual(environments.values, { baseUrl: 'https://dev.test' });
    });

    test('forgets a choice that no longer exists', async () => {
        const { environments } = await service();
        const dev = await environments.create('Dev');

        await environments.remove(dev.id);
        assert.equal(environments.activeId, null);
        assert.deepEqual(environments.values, {});
    });

    test('renames without disturbing the variables', async () => {
        const { environments } = await service();
        const dev = await environments.create('Dev');

        await environments.replaceVariables(dev.id, [
            { id: 'a', key: 'k', value: 'v', enabled: true, secret: false },
        ]);
        await environments.rename(dev.id, 'Staging');

        assert.equal(environments.active?.name, 'Staging');
        assert.deepEqual(environments.values, { k: 'v' });
    });

    test('duplicates with fresh variable ids', async () => {
        const { environments } = await service();
        const dev = await environments.create('Dev');

        await environments.replaceVariables(dev.id, [
            { id: 'a', key: 'k', value: 'v', enabled: true, secret: false },
        ]);

        const copy = await environments.duplicate(dev.id);

        assert.ok(copy);
        assert.equal(copy.name, 'Dev copy');
        assert.notEqual(copy.variables[0].id, 'a');
        assert.equal(copy.variables[0].value, 'v');
        assert.equal(
            environments.environments[1].id,
            copy.id,
            'the copy sits next to the original'
        );
    });

    test('remembers the choice in the memento', async () => {
        const { environments, memento } = await service();
        const dev = await environments.create('Dev');

        assert.equal(memento.get(ACTIVE_ENVIRONMENT_KEY), dev.id);
    });
});

suite('environment secrets', () => {
    const secretVariable = {
        id: 'v1',
        key: 'apiKey',
        value: 'super-secret',
        enabled: true,
        secret: true,
    };

    test('splits secret values out of what gets written', () => {
        const environment: Environment = {
            id: 'e1',
            name: 'Dev',
            createdAt: 0,
            updatedAt: 0,
            variables: [
                secretVariable,
                { id: 'v2', key: 'baseUrl', value: 'https://x', enabled: true, secret: false },
            ],
        };

        assert.deepEqual(collectEnvironmentSecrets([environment]), { 'e1:v1': 'super-secret' });

        const redacted = redactEnvironments([environment]);

        assert.equal(redacted[0].variables[0].value, '');
        assert.equal(redacted[0].variables[1].value, 'https://x');

        const restored = restoreEnvironments(redacted, { 'e1:v1': 'super-secret' });

        assert.equal(restored[0].variables[0].value, 'super-secret');
    });

    test('keeps a secret out of the environment file', async () => {
        const storage = new FakeSecretStorage();
        const { files, environments } = await service(new SecretStore(storage));
        const dev = await environments.create('Dev');

        await environments.replaceVariables(dev.id, [secretVariable]);

        assert.equal(files.text.includes('super-secret'), false, 'the secret reached the file');
        assert.deepEqual(JSON.parse((await storage.get('reqly.environmentSecrets')) as string), {
            [`${dev.id}:v1`]: 'super-secret',
        });
    });

    test('still serves the secret to the running session', async () => {
        const { environments } = await service(new SecretStore(new FakeSecretStorage()));
        const dev = await environments.create('Dev');

        await environments.replaceVariables(dev.id, [secretVariable]);
        assert.deepEqual(environments.values, { apiKey: 'super-secret' });
    });

    test('brings the secret back on the next session', async () => {
        const storage = new FakeSecretStorage();
        const files = new FakeEnvironments();
        const memento = new FakeMemento();
        const first = await EnvironmentService.open(files, memento, new SecretStore(storage));
        const dev = await first.create('Dev');

        await first.replaceVariables(dev.id, [secretVariable]);

        const second = await EnvironmentService.open(files, memento, new SecretStore(storage));

        assert.deepEqual(second.values, { apiKey: 'super-secret' });
    });

    test('sweeps a secret left in a file into the vault', async () => {
        const storage = new FakeSecretStorage();
        const files = new FakeEnvironments([
            {
                id: 'e1',
                name: 'Dev',
                createdAt: 0,
                updatedAt: 0,
                variables: [secretVariable],
            },
        ]);
        const opened = await EnvironmentService.open(
            files,
            new FakeMemento(),
            new SecretStore(storage)
        );

        assert.equal(files.text.includes('super-secret'), false, 'the file copy must be erased');
        assert.deepEqual(opened.environments[0].variables[0].value, 'super-secret');
    });

    test('never writes the secret when the keychain refuses', async () => {
        const storage = new FakeSecretStorage();

        storage.failing = true;

        const { files, environments } = await service(new SecretStore(storage));
        const dev = await environments.create('Dev');

        let warned = false;

        environments.onSecretsUnavailable(() => (warned = true));
        await environments.replaceVariables(dev.id, [secretVariable]);

        assert.equal(files.text.includes('super-secret'), false);
        assert.equal(warned, true);
    });
});

suite('environment files', () => {
    let dir = '';
    let store: EnvironmentStore;

    setup(async () => {
        dir = await mkdtemp(join(tmpdir(), 'reqly-env-'));
        store = new EnvironmentStore(vscode.Uri.file(dir));
    });

    teardown(async () => {
        store.dispose();
        await rm(dir, { recursive: true, force: true });
    });

    function environment(name: string, id: string): Environment {
        return {
            id,
            name,
            createdAt: 0,
            updatedAt: 0,
            variables: [
                {
                    id: 'v1',
                    key: 'baseUrl',
                    value: 'https://dev.test',
                    enabled: true,
                    secret: false,
                },
            ],
        };
    }

    test('names the file after the environment', () => {
        assert.equal(
            environmentFileName(environment('My Dev Env', 'abcdef1234')),
            'environment_my-dev-env_abcdef12.json'
        );
    });

    test('writes and reads an environment back', async () => {
        await store.save([environment('Dev', 'e1')]);

        const files = await readdir(dir);

        assert.deepEqual(files, ['environment_dev_e1.json']);
        assert.match(await readFile(join(dir, files[0]), 'utf8'), /"key": "baseUrl"/);

        const loaded = await store.load();

        assert.equal(loaded.environments.length, 1);
        assert.equal(loaded.environments[0].variables[0].value, 'https://dev.test');
    });

    test('keeps the order the environments were saved in', async () => {
        await store.save([environment('Beta', 'e2'), environment('Alpha', 'e1')]);

        const loaded = await store.load();

        assert.deepEqual(
            loaded.environments.map((entry) => entry.name),
            ['Beta', 'Alpha']
        );
    });

    test('removes the file of a deleted environment', async () => {
        await store.save([environment('Dev', 'e1')]);
        await store.save([]);

        assert.deepEqual(await readdir(dir), []);
    });

    test('reports a file it cannot read and keeps the rest', async () => {
        await store.save([environment('Dev', 'e1')]);
        await writeFile(join(dir, 'environment_broken_zz.json'), '{ nope', 'utf8');

        const loaded = await store.load();

        assert.deepEqual(loaded.unreadable, ['environment_broken_zz.json']);
        assert.equal(loaded.environments.length, 1);
    });

    test('leaves collection files alone', async () => {
        await writeFile(join(dir, 'collection_api_abcd1234.json'), '{}', 'utf8');
        await store.save([environment('Dev', 'e1')]);

        assert.ok((await readdir(dir)).includes('collection_api_abcd1234.json'));
    });

    test('fills in what a hand-edited file left out', () => {
        const parsed = parseEnvironmentDocument({
            environment: { id: 'e1', variables: [{ key: 'a' }, 'nonsense'] },
        });

        assert.ok(parsed);
        assert.equal(parsed.environment.name, 'Environment');
        assert.equal(parsed.environment.variables.length, 1);
        assert.deepEqual(parsed.environment.variables[0], {
            id: 'v0',
            key: 'a',
            value: '',
            enabled: true,
            secret: false,
        });
    });

    test('refuses a payload that is not an environment', () => {
        for (const raw of [null, 3, {}, { environment: {} }, { environment: { id: '' } }]) {
            assert.equal(parseEnvironmentDocument(raw), null, `accepted ${JSON.stringify(raw)}`);
        }
    });
});
