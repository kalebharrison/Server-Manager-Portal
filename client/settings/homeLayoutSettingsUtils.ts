import type { DashboardSectionId } from '../shared/dashboardLayout';

export const reorderSections = (sections: DashboardSectionId[], from: number, to: number): DashboardSectionId[] => {
    if (from === to || from < 0 || to < 0 || from >= sections.length || to >= sections.length) return sections;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
};
