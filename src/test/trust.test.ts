import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as https from 'node:https';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettings, createSnapshot } from '../core/types';
import { buildRequest } from '../http/buildRequest';
import {
    readCertificateFiles,
    trustedCertificates,
    useAdditionalCertificates,
} from '../http/certificates';
import { executeRequest, TransportError } from '../http/executeRequest';

const CERT = `-----BEGIN CERTIFICATE-----
MIIDKTCCAhGgAwIBAgIUEb6BXa0pR4CCN+TsVgFLiP1qa9EwDQYJKoZIhvcNAQEL
BQAwFTETMBEGA1UEAwwKcmVxbHktdGVzdDAgFw0yNjA4MjcxOTI0MTZaGA8yMTI2
MDgwMzE5MjQxNlowFTETMBEGA1UEAwwKcmVxbHktdGVzdDCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBAP8sHoLXno0yCWKEbY39RNRdfICvwRn0E1EF5e3o
eCvhQDSGJ1zt4kUl6xjRPgoB2elBTUYvsuxcLEGL7p4jwUEuwa6g4MrR28UAvRfA
9wZSdqLJ9Kzf3613+kqTtp6IdE3W1KvAbeyNJJadoOrroMlVkXEmJESOZlQXj+fJ
e7nVQ1vpDdSjGsKnqDBQUhSyzQfJ1NYE6eGPcpr3Kh0kzlxKMOowi0fHSSN3F5dz
68L+40rwZhYBL7HidqKsdbbP/bv/XliukpQfzxAXvpalcxq7UUGYJoi1TuTODCAJ
0NvUTCBzSovDhJ3SqJk1F+Gfh6cX6/UCj7lZvjGwu3O5+EECAwEAAaNvMG0wHQYD
VR0OBBYEFB2EHbAMZo/M8e61NUMAHq+RGO6XMB8GA1UdIwQYMBaAFB2EHbAMZo/M
8e61NUMAHq+RGO6XMA8GA1UdEwEB/wQFMAMBAf8wGgYDVR0RBBMwEYcEfwAAAYIJ
bG9jYWxob3N0MA0GCSqGSIb3DQEBCwUAA4IBAQAwlAi1zCueevxzWiA+GlReVp//
+iUy2MRX71MJrun4Fyz065PxXgLzUhuC8bR7R/NYxXDn80c5g/telj+ntELsLhgK
1SZKIk/B1zCdIhsvM6/4K0qZYXjRnEWh8UK1CcAU9EM5ebvK+tWlNUg4md+JQssG
VRjw6Rus0O83iGmYIPAlDOtGjiKZ9aPAJDtM5Xyr4fMrZbvJXkEEziR77IuIO10g
7tXCqj8GggUqSh5JASjVCG7N/gvP1XGofh0Ch18ZQorQICq2KqMONS1NezwOb0Zi
ULSfpWXwVLZ+j9YjhHd6GpGXxupL5W8buPxonZXvu1IZYOFIAwfHwnfbXZpR
-----END CERTIFICATE-----`;
const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQD/LB6C156NMgli
hG2N/UTUXXyAr8EZ9BNRBeXt6Hgr4UA0hidc7eJFJesY0T4KAdnpQU1GL7LsXCxB
i+6eI8FBLsGuoODK0dvFAL0XwPcGUnaiyfSs39+td/pKk7aeiHRN1tSrwG3sjSSW
naDq66DJVZFxJiREjmZUF4/nyXu51UNb6Q3UoxrCp6gwUFIUss0HydTWBOnhj3Ka
9yodJM5cSjDqMItHx0kjdxeXc+vC/uNK8GYWAS+x4nairHW2z/27/15YrpKUH88Q
F76WpXMau1FBmCaItU7kzgwgCdDb1Ewgc0qLw4Sd0qiZNRfhn4enF+v1Ao+5Wb4x
sLtzufhBAgMBAAECgf9ji56g2eUB8tHecQhxgABoqHUi7sLyO67dc45DcDvml7Uo
cxLKxLKk2dS2lcpnX67XDvafuYlKKUXKkasWXknMrU+PBIvYE7kcnYZ8dyGR1ycY
/UL1E1El/HbUE9QGUfgCoHB5oFRBwr4nU88Bq8fJ7hZogcIG91Z22nT1WOYU6ZTh
lPZ/EurZRBM8aLjnxT1BNUKT85QLfNeRf4QRyHQUFVl0em8OGns+0etn3ObMHTOA
i4HnBSMNSkc+rLwdxfx024zmpH6CdDjXLT7IJZzk8cOR2pD73hwowDP6KHx+PvDX
xoF7WcVRyYUCsu1zAZjIUjVwmd2Cs+F0slJRXAECgYEA/9j+k8EAZrZ2JEMF+FCW
edxicT/2azQBL/VsKTZrYoMSN2zkeBJefcIwfZK7MZR7JlRIP5hDLh/SEncNwPQt
0Ea5T+FKrFiCCoxPmgf2Rf9nv4+nPjsSgNYlIOrIwNHVUOjyasZGxXxCNZ8KbVoY
Yakk/u60q024y0fVX/kVjAECgYEA/1MFk/oKmyWOpRk9zRkUcAyhyYUleLFdeRFE
B10FD6gMCQm/cXkAgwhjbiS7yN7kFKxv0AGybHV0Fs6J+J+iMf7dt2XR8BHNGl2r
3BbN4sH4XX9jHwDkSjeMqU/bhGqlxIFMoi3pJdDe7F+DOE7Zr0WE1OKVr0P5+7Sy
UFIxbEECgYEAxFNNNzBZEHhfPAA6aovcjHJzEBhXDXiAmL6pWw6pZJTTu7hRsVnX
LIWBFDsubiNURNtT/YjntFMyrnyxDynQpgw/U268EHhygYmd48LMVnZgtHyVh4lo
73hkUVgY6O2b1VSMASdZU13AqMj8BWGnZ/mVrBKcjP89GLBsqhLHWAECgYEAhUEz
PBPXzTlAxXHzC0P3orM1DRPshp0rB7C3LJCjv5QZE+5+eB6K4dhS7H1HdIK/zvpg
MNNx56E1QWHyKExIPoeh98GwW/cucIBK3ccZFSvfEA0YEmpIu2NailMfYnC2q2RA
NrR3ZkEo13zR42Vjv1ItDV5keOCla3TXS4xaNwECgYEAuEQubg8wqiRnmmm6wsuk
0hKj6klNKcSILUU+1+XJNwgZxmjcv3Lv+htzyOAQ4e7hQUD1FRbO7YJ/J0vljnSc
okHoL8P3Vq+4sJ8DgfrTbsvL2tugM4DTOYUPWEIf5oSqm1JoLMnDRfROKqAx+GYF
ZxUM3Frr7+Zjwhl0YUYicfU=
-----END PRIVATE KEY-----`;

suite('trust reaches the connection', () => {
    let server: https.Server;
    let port = 0;

    suiteSetup(async () => {
        server = https.createServer({ cert: CERT, key: KEY }, (_request, response) => {
            response.writeHead(200, { 'content-type': 'text/plain' });
            response.end('trusted');
        });

        await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
        port = (server.address() as AddressInfo).port;
    });

    suiteTeardown(async () => {
        useAdditionalCertificates([]);
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    teardown(() => {
        useAdditionalCertificates([]);
    });

    async function get(host: string): Promise<{ status: number; body: string }> {
        const response = await executeRequest(
            await buildRequest({
                ...createSnapshot(),
                url: `https://${host}:${port}/`,
                headers: [{ id: 'h', key: 'Host', value: 'localhost', enabled: true }],
            }),
            createSettings(),
            new AbortController().signal
        );

        return { status: response.status, body: response.body.toString() };
    }

    test('rejects an unknown authority before it is trusted', async () => {
        await assert.rejects(get('127.0.0.2'), (error) => error instanceof TransportError);
    });

    test('honours an added authority for a host the runtime does not call local', async () => {
        useAdditionalCertificates([CERT]);

        const response = await get('127.0.0.2');

        assert.equal(response.status, 200);
        assert.equal(response.body, 'trusted');
    });

    test('honours an added authority on loopback as well', async () => {
        useAdditionalCertificates([CERT]);

        const response = await get('127.0.0.1');

        assert.equal(response.status, 200);
    });

    test('adds the authority on top of the ones already trusted', () => {
        const before = trustedCertificates().length;

        useAdditionalCertificates([CERT]);

        const after = trustedCertificates();

        assert.equal(after.length, before + 1);
        assert.ok(after.includes(CERT.trim()));
    });

    test('drops an authority once it is no longer configured', () => {
        useAdditionalCertificates([CERT]);
        assert.ok(trustedCertificates().includes(CERT.trim()));

        useAdditionalCertificates([]);
        assert.equal(trustedCertificates().includes(CERT.trim()), false);
    });
});

suite('certificate files', () => {
    let dir = '';

    suiteSetup(async () => {
        dir = await mkdtemp(join(tmpdir(), 'reqly-ca-'));
        await writeFile(join(dir, 'root.pem'), CERT, 'utf8');
    });

    suiteTeardown(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    test('reads a configured authority from disk', async () => {
        const { certificates, failures } = await readCertificateFiles([join(dir, 'root.pem')]);

        assert.deepEqual(failures, []);
        assert.deepEqual(certificates, [CERT.trim()]);
    });

    test('reports a path it could not read instead of throwing', async () => {
        const missing = join(dir, 'nope.pem');
        const { certificates, failures } = await readCertificateFiles([
            join(dir, 'root.pem'),
            missing,
        ]);

        assert.deepEqual(failures, [missing]);
        assert.equal(certificates.length, 1);
    });

    test('returns nothing when nothing is configured', async () => {
        const { certificates, failures } = await readCertificateFiles([]);

        assert.deepEqual(certificates, []);
        assert.deepEqual(failures, []);
    });
});
