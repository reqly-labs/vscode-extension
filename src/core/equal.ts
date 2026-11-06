function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sameValue(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) {
        return true;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
    }

    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = Object.keys(a);

        return (
            keys.length === Object.keys(b).length &&
            keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
        );
    }

    return false;
}
