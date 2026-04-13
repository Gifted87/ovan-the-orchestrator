import { format } from 'date-fns';
import { motion } from 'motion/react';
import { LayoutGrid, Database, PlusCircle, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { JobHistoryItem } from '../types';
import { Link } from 'react-router-dom';

interface JobSidebarProps {
  jobs: JobHistoryItem[];
  activeJobId: string | null;
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
  onNewTask: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function JobSidebar({ 
  jobs, 
  activeJobId, 
  selectedJobId, 
  isOpen 
}: JobSidebarProps) {
  
  const getStatusIcon = (status: string, id: string) => {
    if (id === activeJobId && status === 'running') return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case 'aborted': return <AlertCircle className="w-3.5 h-3.5 text-slate-400" />;
      default: return <Clock className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isOpen ? 280 : 0, opacity: isOpen ? 1 : 0 }}
      className="h-full bg-surface border-r border-border-subtle flex flex-col shrink-0 overflow-hidden z-30"
    >
      {/* Header */}
      <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-background-light/50">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <LayoutGrid className="w-4 h-4 text-primary" />
          </div>
          <span className="text-[14px] font-semibold text-text-main tracking-tight">Ovan Orchestrator</span>
        </div>
      </div>

      {/* New Task Trigger */}
      <div className="p-3">
        <Link 
          to="/"
          className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-primary text-white rounded-md hover:bg-primary/95 transition-all shadow-sm group"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="text-[13px] font-medium">New Orchestration</span>
        </Link>
      </div>

      {/* Navigation History */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between px-2 py-2 mb-1">
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider">Mission History</span>
            <Database className="w-3 h-3 text-muted" />
          </div>

          <div className="space-y-0.5">
            {jobs.length === 0 ? (
              <div className="px-3 py-8 text-center border border-dashed border-border-subtle rounded-md">
                <p className="text-[12px] text-muted">No missions found</p>
              </div>
            ) : (
              jobs.map((job) => {
                const isActive = activeJobId === job.id;
                const isSelected = selectedJobId === job.id;
                
                return (
                  <Link
                    key={job.id}
                    to={`/job/${job.id}`}
                    className={`w-full flex flex-col gap-1 px-3 py-3 rounded-md transition-all group relative ${
                      isSelected 
                        ? 'bg-primary/5 text-primary shadow-sm border border-primary/10' 
                        : 'text-text-main hover:bg-background-light border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[13px] font-semibold truncate ${isSelected ? 'text-primary' : 'text-text-main group-hover:text-primary'}`}>
                        {job.task || 'Untitiled Mission'}
                      </span>
                      {getStatusIcon(job.status, job.id)}
                    </div>
                    
                    <div className="flex items-center justify-between text-[11px] text-muted font-medium">
                      <span>{format(new Date(job.startTime), 'MMM dd, HH:mm')}</span>
                      {isActive && <span className="flex items-center gap-1 text-[10px] text-primary animate-pulse">● LIVE</span>}
                      {!isActive && <span className="uppercase text-[9px] tracking-tighter opacity-70">{job.status}</span>}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <footer className="p-4 border-t border-border-subtle bg-background-light/50">
          <div className="flex items-center gap-2 text-[11px] text-muted">
             <span className="material-symbols-outlined text-[14px]">database</span>
             <span>{jobs.length} archived missions</span>
          </div>
        </footer>
      </div>
    </motion.aside>
  );
}
