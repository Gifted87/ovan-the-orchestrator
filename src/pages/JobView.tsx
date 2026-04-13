import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { JobState, Artifact } from '../types';

export function JobViewPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'artifacts'>('feed');
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const fetchJobData = async () => {
    const res = await fetch(`/api/job/${jobId}`);
    const data = await res.json();
    setJobState(data);

    const logsRes = await fetch(`/api/job/${jobId}/logs`);
    const logsData = await logsRes.json();
    setLogs(logsData);
  };

  useEffect(() => {
    fetchJobData();

    const eventSource = new EventSource('/api/stream');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state_update' && data.state.id === jobId) {
          setJobState(data.state);
        } else if (data.log && jobState?.id === jobId) {
          // Note: the backend stream broadcasts all active logs. 
          // We rely on the activeJobId matching the viewingJobId which we'll handle in App.tsx shell too,
          // but for this component, we just check the state.
          setLogs((prev) => [...prev, data.log].slice(-5000));
        }
      } catch (e) {}
    };

    return () => eventSource.close();
  }, [jobId]);

  useEffect(() => {
    if (autoScrollLogs && logsEndRef.current && isLogDrawerOpen) {
      logsEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs, autoScrollLogs, isLogDrawerOpen]);

  useEffect(() => {
    if (activeTab === 'feed' && feedEndRef.current && jobState?.feed) {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [jobState?.feed, activeTab]);

  const handleScrollLogs = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScrollLogs(isAtBottom);
    }
  };

  const [idleTime, setIdleTime] = useState(0);
  useEffect(() => {
    let interval;
    if (jobState?.status === 'running' && jobState?.lastActivityTime) {
      interval = setInterval(() => {
        setIdleTime(Math.floor((Date.now() - jobState.lastActivityTime!) / 1000));
      }, 1000);
    } else {
      setIdleTime(0);
    }
    return () => clearInterval(interval);
  }, [jobState?.status, jobState?.lastActivityTime]);

  if (!jobState) return <div className="p-8 animate-pulse text-muted">Loading mission data...</div>;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden absolute inset-0">
      <header className="h-14 border-b border-border-subtle bg-surface px-6 flex items-center justify-between shrink-0 z-20 shadow-clinical">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${jobState.status === 'running' ? 'bg-primary animate-pulse' : 'bg-slate-400'}`}></div>
            <h1 className="text-[14px] font-semibold tracking-tight text-text-main">
              {jobState.status === 'running' ? 'Active Orchestration' : 'Task Archive'}
            </h1>
          </div>
          
          <div className="flex items-center gap-1 bg-background-light p-1 rounded-md border border-border-subtle">
            <button 
              onClick={() => setActiveTab('feed')} 
              className={`px-3 py-1 text-[13px] font-medium rounded-sm transition-colors ${activeTab === 'feed' ? 'bg-surface shadow-subtle text-text-main' : 'text-muted hover:text-text-main'}`}
            >
              Timeline
            </button>
            <button 
              onClick={() => setActiveTab('artifacts')} 
              className={`px-3 py-1 text-[13px] font-medium rounded-sm transition-colors ${activeTab === 'artifacts' ? 'bg-surface shadow-subtle text-text-main' : 'text-muted hover:text-text-main'}`}
            >
              Artifacts
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-sm bg-background-light border border-border-subtle">
             <span className="material-symbols-outlined text-muted text-[16px]">schedule</span>
             <span className={`text-[13px] font-mono ${idleTime > 300 ? 'text-terminal-error font-semibold' : 'text-text-main'}`}>
                {jobState.status === 'running' ? `Idle: ${formatTime(idleTime)}` : format(jobState.startTime || 0, 'MMM dd, HH:mm')}
             </span>
          </div>
          
          <button 
            onClick={() => setIsLogDrawerOpen(true)}
            className="px-3 py-1.5 text-[13px] font-medium text-text-main bg-surface border border-border-subtle rounded-sm shadow-subtle hover:bg-background-light transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">terminal</span>
            {jobState.status === 'running' ? 'Live Logs' : 'Historical Logs'}
          </button>

          {jobState.status === 'running' && (
            <button 
              onClick={async () => fetch('/api/job/abort', { method: 'POST' })}
              className="px-3 py-1.5 text-[13px] font-medium text-terminal-error hover:bg-red-50 transition-colors flex items-center gap-2 rounded-sm"
            >
              <span className="material-symbols-outlined text-[16px]">stop_circle</span>
              Abort
            </button>
          )}

          <button 
            onClick={() => navigate('/')}
            className="ml-2 px-3 py-1.5 text-[13px] font-medium text-white bg-primary rounded-sm hover:opacity-90 transition-all shadow-subtle"
          >
            New Task
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeTab === 'feed' && (
            <motion.div 
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex"
            >
              <div className="w-[65%] border-r border-border-subtle bg-background-light overflow-y-auto px-10 py-8">
                 <div className="max-w-3xl">
                   <div className="flex items-center justify-between mb-6">
                     <h2 className="text-[14px] font-semibold text-text-main uppercase tracking-wider text-muted">Reporter AI Timeline</h2>
                     {jobState.status === 'running' && jobState.phases[0]?.status === 'running' && (
                        <motion.a 
                          href="http://localhost:5051" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-md text-primary text-[12px] font-semibold hover:bg-primary/20 transition-all shadow-subtle group"
                        >
                          <span className="material-symbols-outlined text-[16px] animate-pulse">monitoring</span>
                          Open Live ACN Dashboard (Port 5051)
                          <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                        </motion.a>
                     )}
                   </div>

                   {jobState.status === 'running' && jobState.phases[0]?.status === 'running' && (
                     <div className="mb-8 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-primary/10 rounded-lg shadow-sm">
                        <div className="flex gap-4">
                           <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-subtle text-primary shrink-0">
                              <span className="material-symbols-outlined text-[24px]">hub</span>
                           </div>
                           <div>
                              <h3 className="text-[15px] font-semibold text-text-main mb-1">ACN Code Generator Active</h3>
                              <p className="text-[13px] text-slate-600 leading-relaxed">
                                The Autonomous Code Network is currently orchestrating your software structure in real-time. 
                                <strong className="ml-1 text-primary">Urgent:</strong> Visit the dashboard at <a href="http://localhost:5051" target="_blank" className="underline font-bold">Port 5051</a> to witness the agent swarm in action.
                              </p>
                           </div>
                        </div>
                     </div>
                   )}

                   {jobState.feed.length === 0 ? (
                     <div className="bg-surface border border-border-subtle rounded-md p-8 shadow-subtle flex flex-col items-center justify-center text-center animate-pulse">
                        <span className="material-symbols-outlined text-[32px] text-muted mb-4 opacity-50">data_exploration</span>
                        <p className="text-[14px] text-muted font-medium">Awaiting reconnaissance...</p>
                     </div>
                   ) : (
                     <div className="space-y-6">
                       {jobState.feed.map((item) => (
                         <div key={item.id} className="bg-surface border border-border-subtle rounded-md p-6 shadow-clinical">
                           <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-subtle">
                             <div className="flex items-center gap-2 text-primary">
                                <span className="material-symbols-outlined text-[18px]">neurology</span>
                                <span className="text-[14px] font-semibold text-text-main">System Event</span>
                             </div>
                             <span className="text-[12px] text-muted font-mono">{format(item.timestamp, 'HH:mm:ss a')}</span>
                           </div>
                           <div className="prose prose-sm max-w-none text-text-main prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-primary">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.message}</ReactMarkdown>
                           </div>
                         </div>
                       ))}
                       <div ref={feedEndRef} />
                     </div>
                   )}
                 </div>
              </div>

              <div className="w-[35%] bg-surface px-8 py-8 overflow-y-auto">
                <h2 className="text-[14px] font-semibold text-text-main mb-8 uppercase tracking-wider text-muted">Execution Pipeline</h2>
                <div className="relative pl-3">
                  {jobState.phases.map((phase, idx) => {
                     const isCompleted = phase.status === 'completed';
                     const isRunning = phase.status === 'running';
                     return (
                       <div key={phase.id} className="mb-8 relative last:mb-0">
                         {idx < jobState.phases.length - 1 && (
                           <div className={`absolute top-6 bottom-[-24px] left-[5px] w-[2px] ${isCompleted ? 'bg-text-main' : 'bg-border-subtle'}`} />
                         )}
                         <div className="flex gap-4">
                           <div className={`mt-0.5 relative z-10 w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center ${
                             isCompleted ? 'bg-text-main ring-4 ring-surface' :
                             isRunning ? 'bg-primary ring-4 ring-blue-50 animate-pulse' :
                             'bg-border-subtle ring-4 ring-surface'
                           }`} />
                           <div>
                             <h3 className={`text-[14px] leading-none mb-1.5 font-medium ${isCompleted || isRunning ? 'text-text-main' : 'text-muted'}`}>
                                {phase.name}
                             </h3>
                             {isRunning && <p className="text-[12px] text-primary font-medium">In Progress...</p>}
                             {isCompleted && <p className="text-[12px] text-muted">Completed</p>}
                           </div>
                         </div>
                       </div>
                     )
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'artifacts' && (
            <motion.div 
              key="artifacts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex bg-background-light"
            >
              {/* Similar Artifacts logic as in App.tsx */}
              <div className="w-[240px] border-r border-border-subtle bg-surface flex flex-col">
                 <div className="p-4 border-b border-border-subtle bg-background-light">
                   <h2 className="text-[12px] font-semibold text-text-main uppercase tracking-wider text-muted">Generated Files</h2>
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {jobState.artifacts.length === 0 ? (
                       <p className="text-[12px] text-muted text-center p-4">Empty</p>
                    ) : (
                      jobState.artifacts.map((art, i) => (
                        <button key={i} onClick={() => setSelectedArtifact(art)} className={`w-full text-left px-3 py-2 text-[13px] font-mono rounded-sm transition-colors ${selectedArtifact?.name === art.name ? 'bg-[#E0E7FF] text-primary' : 'text-text-main hover:bg-background-light'}`}>
                          {art.name}
                        </button>
                      ))
                    )}
                 </div>
              </div>
              <div className="flex-1 bg-surface overflow-y-auto w-full flex justify-center p-12">
                 {selectedArtifact ? (
                    <div className="max-w-[800px] w-full">
                       <h2 className="text-[20px] font-semibold text-text-main mb-8 border-b border-border-subtle pb-4">{selectedArtifact.name}</h2>
                       <div className="prose prose-sm max-w-none text-text-main prose-headings:font-semibold prose-a:text-primary prose-pre:bg-background-light prose-pre:text-text-main prose-pre:border prose-pre:border-border-subtle">
                         <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedArtifact.content}</ReactMarkdown>
                       </div>
                    </div>
                 ) : (
                   <div className="flex flex-col items-center justify-center text-muted h-[50vh]">
                      <span className="material-symbols-outlined text-[48px] mb-4 opacity-50">description</span>
                      <p className="text-[14px]">Select an artifact.</p>
                   </div>
                 )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
         {isLogDrawerOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsLogDrawerOpen(false)} className="absolute inset-0 bg-text-main/20 backdrop-blur-[1px] z-40" />
              <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute right-0 top-0 bottom-0 w-full md:w-[45%] bg-terminal shadow-[-10px_0_30px_rgba(0,0,0,0.1)] flex flex-col border-l border-slate-800 z-50">
                 <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-terminal/95">
                    <h2 className="text-surface font-sans text-[14px] font-semibold">Terminal Log</h2>
                    <button onClick={() => setIsLogDrawerOpen(false)} className="text-slate-400 hover:text-surface transition-colors p-1 rounded hover:bg-slate-800">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                 </header>
                 <div ref={logsContainerRef} onScroll={handleScrollLogs} className="flex-1 overflow-y-auto p-6 font-mono text-[12px] leading-relaxed terminal-scroll bg-terminal">
                    <div className="space-y-1.5 pb-8">
                      {logs.map((log, i) => (
                        <div key={i} className="flex gap-4 items-start group hover:bg-slate-900/50 px-2 py-0.5 rounded break-words">
                          <span className="text-slate-400 block w-full">{log}</span>
                        </div>
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                 </div>
                 <div className="h-8 bg-slate-900 border-t border-slate-800 flex items-center px-4 justify-between shrink-0">
                    <span className="text-slate-500 font-mono text-[10px]">Buffer: {logs.length} lines</span>
                 </div>
              </motion.div>
            </>
         )}
      </AnimatePresence>
    </div>
  );
}
