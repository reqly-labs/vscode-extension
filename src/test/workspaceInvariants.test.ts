import * as assert from 'node:assert/strict';
import { createSnapshot } from '../core/types';
import { getRequest, isGroup, type Workspace } from '../core/workspace';
import { normalizeWorkspace } from '../core/workspaceIntegrity';
import { WorkspaceService } from '../services/WorkspaceService';
import { FakePersistence } from './FakePersistence';

function assertInvariants(workspace: Workspace, context: string): void {
    const seen = new Set<string>();
    const walk = (id: string, depth: number, insideGroup: boolean) => {
        assert.ok(depth < 64, `${context}: tree deeper than expected at ${id}`);
        const node = workspace.nodes[id];

        assert.ok(node, `${context}: ${id} is referenced but does not exist`);
        assert.equal(seen.has(id), false, `${context}: ${id} is reachable more than once`);
        seen.add(id);
        if (node.kind === 'collection') {
            assert.equal(insideGroup, false, `${context}: collection ${id} is nested`);
        }

        if (node.kind === 'folder') {
            assert.equal(insideGroup, true, `${context}: folder ${id} sits at the root`);
        }

        if (isGroup(node)) {
            for (const childId of node.childIds) {
                walk(childId, depth + 1, true);
            }
        }
    };

    for (const id of workspace.rootIds) {
        walk(id, 0, false);
    }

    const allIds = Object.keys(workspace.nodes);
    const orphans = allIds.filter((id) => !seen.has(id));

    assert.deepEqual(
        orphans,
        [],
        `${context}: ${orphans.length} node(s) unreachable from the root`
    );
}

function makeRandom(seed: number): () => number {
    let value = seed;

    return () => {
        value = (value * 1103515245 + 12345) % 2147483648;

        return value / 2147483648;
    };
}

suite('workspace invariants under random operation sequences', () => {
    for (const seed of [1, 7, 42, 1337, 99999]) {
        test(`stay intact across 150 mixed operations (seed ${seed})`, async () => {
            const random = makeRandom(seed);
            const files = new FakePersistence();
            const service = await WorkspaceService.open(files);
            const pick = <T>(items: T[]): T | undefined =>
                items.length === 0 ? undefined : items[Math.floor(random() * items.length)];

            for (let step = 0; step < 150; step += 1) {
                const workspace = service.workspace;
                const allIds = Object.keys(workspace.nodes);
                const groupIds = allIds.filter((id) => isGroup(workspace.nodes[id]));
                const action = Math.floor(random() * 7);

                switch (action) {
                    case 0:
                        await service.createCollection(`C${step}`);
                        break;
                    case 1: {
                        const parent = pick(groupIds);

                        if (parent) {
                            await service.createFolder(parent, `F${step}`);
                        }

                        break;
                    }

                    case 2: {
                        const parent = random() < 0.3 ? null : pick(groupIds);

                        await service.createRequest(parent ?? null, `R${step}`, {
                            ...createSnapshot(),
                            url: `https://step-${step}.dev`,
                        });
                        break;
                    }

                    case 3: {
                        const target = pick(allIds);

                        if (target) {
                            await service.rename(target, `N${step}`);
                        }

                        break;
                    }

                    case 4: {
                        const target = pick(allIds);
                        const destination = random() < 0.25 ? null : pick(groupIds);

                        if (target) {
                            await service.move(target, destination ?? null);
                        }

                        break;
                    }

                    case 5: {
                        const target = pick(allIds);

                        if (target) {
                            await service.duplicate(target);
                        }

                        break;
                    }

                    default: {
                        const target = pick(allIds);

                        if (target) {
                            await service.remove(target);
                        }

                        break;
                    }
                }

                assertInvariants(service.workspace, `seed ${seed}, step ${step}`);
            }

            const reloaded = await WorkspaceService.open(files);

            assert.deepEqual(
                reloaded.loadRepairs,
                [],
                `seed ${seed}: a healthy tree should need no repairs`
            );
            assert.deepEqual(reloaded.workspace, service.workspace);
        });
    }

    test('normalizing an already-valid workspace changes nothing', async () => {
        const service = await WorkspaceService.open(new FakePersistence());
        const api = await service.createCollection('API');

        assert.ok(api.ok);
        const folder = await service.createFolder(api.id, 'v1');

        assert.ok(folder.ok);
        await service.createRequest(folder.id, 'Nested');
        await service.createRequest(null, 'Loose');
        const before = service.workspace;
        const after = normalizeWorkspace(JSON.parse(JSON.stringify(before)));

        assert.deepEqual(after.repairs, []);
        assert.deepEqual(after.workspace, before);
    });
});
suite('reference integrity across the panel link', () => {
    test('renaming an open request does not disturb what a later save writes', async () => {
        const service = await WorkspaceService.open(new FakePersistence());
        const collection = await service.createCollection('API');

        assert.ok(collection.ok);
        const created = await service.createRequest(collection.id, 'Original');

        assert.ok(created.ok);
        const openRequestId = created.id;

        await service.rename(openRequestId, 'Renamed in the tree');
        await service.updateSnapshot(openRequestId, {
            ...createSnapshot(),
            url: 'https://saved-after-rename.dev',
        });
        const node = getRequest(service.workspace, openRequestId);

        assert.equal(node?.name, 'Renamed in the tree');
        assert.equal(node?.snapshot.url, 'https://saved-after-rename.dev');
    });
    test('deleting an open request makes the save fail loudly instead of resurrecting it', async () => {
        const service = await WorkspaceService.open(new FakePersistence());
        const created = await service.createRequest(null, 'Doomed');

        assert.ok(created.ok);
        await service.remove(created.id);
        const result = await service.updateSnapshot(created.id, createSnapshot());

        assert.equal(result.ok, false);
        assert.equal(Object.keys(service.workspace.nodes).length, 0);
    });
    test('duplicating an open request leaves the original as the linked one', async () => {
        const service = await WorkspaceService.open(new FakePersistence());
        const created = await service.createRequest(null, 'Source');

        assert.ok(created.ok);
        const copy = await service.duplicate(created.id);

        assert.ok(copy.ok);
        await service.updateSnapshot(created.id, {
            ...createSnapshot(),
            url: 'https://only-the-original.dev',
        });
        assert.equal(
            getRequest(service.workspace, created.id)?.snapshot.url,
            'https://only-the-original.dev'
        );
        assert.equal(getRequest(service.workspace, copy.id)?.snapshot.url, '');
    });
});
