/**
 * TRaSH "UnKn0wn (NoRemux)" uses \b(remux)\b which misses underscore titles
 * like `…DV_REMUX_HDR10…-UnKn0wn`. Replace with a remux-anywhere guard.
 */

export const BROKEN_UNKN0WN_NOREMUX = String.raw`(?<!\b(remux).*?)\b(unkn0wn)\b`;
export const FIXED_UNKN0WN_NOREMUX = String.raw`^(?!.*remux).*\b(unkn0wn)\b`;

export const isBrokenUnkn0wnNoRemuxPattern = (value) => {
    const raw = String(value || '');
    if (!/unkn0wn/i.test(raw)) return false;
    // Broken lookbehind that relies on word-boundary remux (misses `_REMUX_`).
    return /\(\?<!\\+b\(remux\)/i.test(raw) || /\(\?<!\\b\(remux\)/i.test(raw);
};

export const needsUnkn0wnRemuxRepair = (format) => {
    const specs = Array.isArray(format?.specifications) ? format.specifications : [];
    return specs.some((spec) => {
        const name = String(spec?.name || '');
        const value = spec?.fields?.value ?? spec?.fields?.find?.((f) => f?.name === 'value')?.value;
        if (/unkn0wn/i.test(name) || /unkn0wn/i.test(String(value || ''))) {
            return isBrokenUnkn0wnNoRemuxPattern(value);
        }
        return false;
    });
};

const fieldValue = (spec) => {
    if (spec?.fields && typeof spec.fields === 'object' && !Array.isArray(spec.fields)) {
        return spec.fields.value;
    }
    if (Array.isArray(spec?.fields)) {
        const row = spec.fields.find((entry) => entry?.name === 'value');
        return row?.value;
    }
    return null;
};

const setFieldValue = (spec, value) => {
    if (spec?.fields && typeof spec.fields === 'object' && !Array.isArray(spec.fields)) {
        return { ...spec, fields: { ...spec.fields, value } };
    }
    if (Array.isArray(spec?.fields)) {
        return {
            ...spec,
            fields: spec.fields.map((entry) => (
                entry?.name === 'value' ? { ...entry, value } : entry
            )),
        };
    }
    return { ...spec, fields: { value } };
};

/** Return a patched format object, or null if nothing to change. */
export const patchUnkn0wnRemuxFormat = (format) => {
    if (!format || !needsUnkn0wnRemuxRepair(format)) return null;
    let changed = false;
    const specifications = (Array.isArray(format.specifications) ? format.specifications : []).map((spec) => {
        const value = fieldValue(spec);
        if (!isBrokenUnkn0wnNoRemuxPattern(value)) return spec;
        changed = true;
        return setFieldValue(spec, FIXED_UNKN0WN_NOREMUX);
    });
    if (!changed) return null;
    return { ...format, specifications };
};

export const repairUnkn0wnRemuxFormats = (formats = []) => {
    const list = Array.isArray(formats) ? formats : [];
    const repaired = [];
    const unchanged = [];
    for (const format of list) {
        const next = patchUnkn0wnRemuxFormat(format);
        if (next) repaired.push(next);
        else unchanged.push(format);
    }
    return { repaired, unchanged, repairedCount: repaired.length };
};
