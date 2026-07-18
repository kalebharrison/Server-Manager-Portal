import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSectionLayout } from '../../lib/config/dashboard-layout.js';

test('dashboard layout adds the week calendar without changing hidden sections', () => {
    const layout = normalizeSectionLayout({
        sections: ['mainGrid', 'watchRow'],
        hiddenSections: ['watchRow'],
    });
    assert.equal(layout.sections.includes('weekCalendar'), true);
    assert.deepEqual(layout.hiddenSections, ['watchRow']);
});
