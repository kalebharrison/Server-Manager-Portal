import React from 'react';

import { CustomSelect } from '../../shared/ui';
import type { MaintenanceSection } from './dashboardModel';

type MaintenanceDashboardNavigationProps = {
    activeSection: string;
    sections: MaintenanceSection[];
    setActiveSection: (sectionId: string) => void;
};

export const MaintenanceMobileSectionSelect: React.FC<MaintenanceDashboardNavigationProps> = ({
    activeSection,
    sections,
    setActiveSection
}) => (
    <div className="md:hidden mb-3">
        <label className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1 block">Module Page</label>
        <CustomSelect
            value={activeSection}
            onChange={(value) => setActiveSection(value)}
            compact
            className="w-full"
            options={sections.map((section) => ({ label: section.label, value: section.id }))}
        />
    </div>
);

export const MaintenanceSectionSidebar: React.FC<MaintenanceDashboardNavigationProps> = ({
    activeSection,
    sections,
    setActiveSection
}) => (
    <aside className="hidden md:block glass-card-sm p-3 h-fit sticky top-20">
        <p className="text-muted text-xs uppercase tracking-wider font-bold mb-2 px-2">Module Pages</p>
        <div className="space-y-1">
            {sections.map((section) => (
                <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${activeSection === section.id ? 'bg-plex text-background' : 'text-muted hover:text-text hover:bg-white/5'}`}
                >
                    {section.label}
                </button>
            ))}
        </div>
    </aside>
);
