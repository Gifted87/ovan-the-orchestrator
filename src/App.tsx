import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { JobState, JobHistoryItem } from './types';
import { JobSidebar } from './components/JobSidebar';
import { NewJobPage } from './pages/NewJob';
import { JobViewPage } from './pages/JobView';

function AppShell() {
  const [jobs, setJobs] = useState<JobHistoryItem[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();

  const fetchHistory = () => {
    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => setJobs(data));
  };

  useEffect(() => {
    fetchHistory();
    
    // Check if there's an active job running on the server
    fetch('/api/job')
      .then((res) => res.json())
      .then((data) => {
          if (data && data.status === 'running') {
              setActiveJobId(data.id);
          }
      });

    const eventSource = new EventSource('/api/stream');
    eventSource.onmessage = (event) => {
      try {
          const data = JSON.parse(event.data);
          if (data.type === 'state_update') {
            if (data.state.status === 'running') {
              setActiveJobId(data.state.id);
            } else if (activeJobId === data.state.id) {
              setActiveJobId(null);
            }
            fetchHistory();
          }
      } catch (e) {}
    };
    return () => eventSource.close();
  }, [activeJobId]);

  return (
    <div className="flex h-screen bg-background-light text-text-main font-sans selection:bg-primary/20 overflow-hidden">
      <JobSidebar 
        jobs={jobs}
        activeJobId={activeJobId}
        selectedJobId={location.pathname.startsWith('/job/') ? location.pathname.split('/')[2] : null}
        onSelectJob={() => {}} // Now handled by JobSidebar internal Links
        onNewTask={() => {}} // Now handled by JobSidebar internal Link
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <Routes>
          <Route path="/" element={<NewJobPage />} />
          <Route path="/job/:jobId" element={<JobViewPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
