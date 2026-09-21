import type { ResearchJobUi } from '../../features/chat/protocol';
import { ResearchJobsPanel } from './ResearchJobsPanel';

interface TeamsPanelProps {
	jobs: ResearchJobUi[];
	// Показать секцию даже без jobs (режим multitask/project)
	forceVisible?: boolean;
	// Компактный вид (над composer)
	compact?: boolean;
	titleKey?: string;
}

// Тонкая обёртка над ResearchJobsPanel (без циклического re-export)
export function TeamsPanel({
	jobs,
	forceVisible = false,
	compact = false,
	titleKey,
}: TeamsPanelProps) {
	return (
		<ResearchJobsPanel
			jobs={jobs}
			forceVisible={forceVisible}
			compact={compact}
			titleKey={titleKey}
		/>
	);
}
