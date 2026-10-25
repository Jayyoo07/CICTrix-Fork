import { CalendarClock, Network, UserCog } from 'lucide-react';
import { Modal } from './modal';

interface RaterManagementNavigationGuideProps {
  open: boolean;
  onClose: () => void;
}

const steps = [
  {
    title: 'Step 1: Understand Hierarchies',
    description: 'Review immediate supervisor, department head, optional additional rater, and PMD final reviewer levels.',
    icon: Network,
  },
  {
    title: 'Step 2: Assign Raters',
    description: 'Assign raters individually or in bulk per department and employee grouping.',
    icon: UserCog,
  },
  {
    title: 'Step 3: Configure Evaluation Period',
    description: 'Set active cycle dates and rater submission deadlines for consistent review windows.',
    icon: CalendarClock,
  },
  {
    title: 'Step 4: Track Completion',
    description: 'Monitor pending and completed rating submissions and follow up with reminders as needed.',
    icon: CalendarClock,
  },
];

export const RaterManagementNavigationGuide = ({ open, onClose }: RaterManagementNavigationGuideProps) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rater Management Guide"
      subtitle="Configure rater assignments and monitor evaluation workflows."
      size="lg"
      footer={<button type="button" className="btn btn-secondary btn-md" onClick={onClose}>Close</button>}
    >
          <div className="space-y-4">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-[var(--color-primary-50)] p-2 text-[var(--color-primary)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{step.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
    </Modal>
  );
};
