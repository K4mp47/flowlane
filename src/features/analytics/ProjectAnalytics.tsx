import { useMemo, type ReactNode } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, ListTodo, Users } from 'lucide-react'
import { useWorkspaceTasks } from '../tasks/useWorkspaceTasks'

interface ProjectAnalyticsProps { workspaceId: string }

export function ProjectAnalytics({ workspaceId }: ProjectAnalyticsProps) {
  const query = useWorkspaceTasks(workspaceId)
  const analytics = useMemo(() => {
    const data = query.data
    if (!data) return null
    const statusById = new Map(data.statuses.map((status) => [status.id, status]))
    const now = Date.now()
    const total = data.tasks.length
    const completed = data.tasks.filter((task) => statusById.get(task.status_id)?.is_terminal).length
    const active = data.tasks.filter((task) => statusById.get(task.status_id)?.category === 'STARTED').length
    const overdue = data.tasks.filter((task) => task.due_date && new Date(task.due_date).getTime() < now && !statusById.get(task.status_id)?.is_terminal).length
    const blocked = data.tasks.filter((task) => task.is_blocked).length
    const assignedTaskIds = new Set(data.assignees.map((entry) => entry.task_id))
    const unassigned = data.tasks.filter((task) => !assignedTaskIds.has(task.id)).length
    const completionRate = total ? Math.round((completed / total) * 100) : 0
    const byCategory = ['BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED'].map((category) => ({
      category,
      label: category === 'UNSTARTED' ? 'Unstarted' : category.charAt(0) + category.slice(1).toLowerCase(),
      count: data.tasks.filter((task) => statusById.get(task.status_id)?.category === category).length,
    }))
    const byProject = data.projects.map((project) => {
      const tasks = data.tasks.filter((task) => task.project_id === project.id)
      const done = tasks.filter((task) => statusById.get(task.status_id)?.is_terminal).length
      return { id: project.id, name: project.name, total: tasks.length, done, rate: tasks.length ? Math.round((done / tasks.length) * 100) : 0 }
    }).sort((a, b) => b.total - a.total)
    return { total, completed, active, overdue, blocked, unassigned, completionRate, byCategory, byProject }
  }, [query.data])

  if (query.isLoading) return <div className="analytics-loading">Loading project analytics…</div>
  if (!analytics) return <div className="analytics-loading">Unable to load analytics.</div>

  return <section className="analytics-page">
    <header className="analytics-heading"><div><p className="eyebrow">Workspace intelligence</p><h2>Project analytics</h2><p>Delivery health calculated from each project's configurable workflow.</p></div><div className="analytics-completion-ring"><strong>{analytics.completionRate}%</strong><span>complete</span></div></header>
    <div className="analytics-kpi-grid"><Metric icon={<ListTodo size={18} />} label="Total tasks" value={analytics.total} /><Metric icon={<CheckCircle2 size={18} />} label="Completed" value={analytics.completed} /><Metric icon={<Activity size={18} />} label="Active work" value={analytics.active} /><Metric icon={<AlertTriangle size={18} />} label="Overdue" value={analytics.overdue} emphasis={analytics.overdue > 0} /><Metric icon={<Clock3 size={18} />} label="Blocked" value={analytics.blocked} emphasis={analytics.blocked > 0} /><Metric icon={<Users size={18} />} label="Unassigned" value={analytics.unassigned} emphasis={analytics.unassigned > 0} /></div>
    <div className="analytics-layout"><article className="analytics-card"><div className="analytics-card-heading"><div><span className="eyebrow">Workflow</span><h3>Tasks by category</h3></div><span>{analytics.total} tasks</span></div><div className="stage-bars">{analytics.byCategory.map((entry) => { const width = analytics.total ? Math.max((entry.count / analytics.total) * 100, entry.count ? 4 : 0) : 0; return <div className="stage-bar-row" key={entry.category}><div><span>{entry.label}</span><strong>{entry.count}</strong></div><div className="stage-bar-track"><span className={`stage-bar-fill stage-${entry.category.toLowerCase()}`} style={{ width: `${width}%` }} /></div></div> })}</div></article><article className="analytics-card"><div className="analytics-card-heading"><div><span className="eyebrow">Projects</span><h3>Delivery progress</h3></div><span>{analytics.byProject.length} projects</span></div><div className="project-progress-list">{analytics.byProject.map((project) => <div className="project-progress-row" key={project.id}><div className="project-progress-copy"><strong>{project.name}</strong><span>{project.done} of {project.total} completed</span></div><div className="project-progress-meter"><span style={{ width: `${project.rate}%` }} /></div><strong className="project-rate">{project.rate}%</strong></div>)}{!analytics.byProject.length ? <div className="analytics-empty">Create a project to start collecting analytics.</div> : null}</div></article></div>
  </section>
}

function Metric({ icon, label, value, emphasis = false }: { icon: ReactNode; label: string; value: number; emphasis?: boolean }) { return <article className={emphasis ? 'analytics-metric attention' : 'analytics-metric'}><span className="analytics-metric-icon">{icon}</span><div><strong>{value}</strong><span>{label}</span></div></article> }
