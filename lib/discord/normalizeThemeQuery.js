const THEME_FILLER = /^(?:about|with|on|featuring|involving|including)\s+/i;
const LEADING_ARTICLE = /^(?:the|a|an)\s+/i;

/** Strip filler/media words so a spoken theme maps onto a discover query. */
export const normalizeThemeQuery = (theme = '') => {
    let q = String(theme || '').trim();
    if (!q) return q;
    q = q.replace(LEADING_ARTICLE, '');
    q = q.replace(THEME_FILLER, '');
    q = q.replace(/\s+(?:movie|movies|film|films|show|shows|tv\s+show|tv\s+series|series)\s*$/i, '');
    return q.trim();
};
