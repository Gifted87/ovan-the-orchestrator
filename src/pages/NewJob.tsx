import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function NewJobPage() {
  const [taskInput, setTaskInput] = useState('');
  const [pathOverride, setPathOverride] = useState('');
  const navigate = useNavigate();

  const startJob = async () => {
    const res = await fetch('/api/job/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: taskInput, pathOverride }),
    });
    const data = await res.json();
    if (data.success) {
        navigate(`/job/${data.state.id}`);
    } else {
        alert(data.error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 h-full overflow-y-auto w-full">
      <main className="w-full max-w-[600px] bg-surface border border-border-subtle rounded-sm shadow-clinical p-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-primary">
              <span className="material-symbols-outlined text-[24px]">rocket</span>
            </div>
            <h1 className="text-[24px] font-semibold text-text-main tracking-tight leading-none">New Orchestration</h1>
          </div>
          <p className="text-[14px] text-muted mt-2">Define task parameters and target environment to initialize autonomous agents.</p>
        </div>
        
        <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); startJob(); }}>
          <div className="space-y-2">
            <label className="block text-[14px] font-medium text-text-main" htmlFor="task-params">Task Parameters</label>
            <textarea 
              id="task-params"
              value={taskInput}
              onChange={e => setTaskInput(e.target.value)}
              className="w-full min-h-[120px] rounded-sm border border-border-subtle bg-surface px-4 py-3 text-[14px] text-text-main placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-colors resize-y"
              placeholder="Describe the task objective, constraints, and expected output format..."
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-[14px] font-medium text-text-main" htmlFor="local-path">Local Path Override (Optional)</label>
            <div className="flex items-center rounded-sm border border-border-subtle bg-surface focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-colors overflow-hidden">
              <span className="px-3 py-2 text-[13px] font-mono text-muted bg-background-light border-r border-border-subtle select-none">Directory:</span>
              <input 
                id="local-path"
                type="text"
                value={pathOverride}
                onChange={e => setPathOverride(e.target.value)}
                className="flex-1 w-full border-0 bg-transparent px-3 py-2 text-[13px] font-mono text-text-main placeholder:text-muted focus:ring-0 outline-none"
                placeholder="/home/gifted/my-project"
              />
            </div>
            <p className="text-[12px] text-muted mt-1">Specify the absolute path where the agents will execute operations.</p>
          </div>
          
          <div className="pt-4 border-t border-border-subtle">
            <button 
              type="submit"
              disabled={!taskInput.trim() && !pathOverride.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-[14px] font-medium text-white hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:bg-border-subtle disabled:text-muted transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
              Initialize Agents
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
