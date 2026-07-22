import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, ListTodo, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Board, Task, TaskAssignee, WorkflowStage } from '../../types/domain'

interface ProjectAnalyticsProps {
  workspaceId: string
  boards: Board[]
}

type TaskWithStage = Task & { stage?: WorkflowStage }

export function ProjectAnalytics({ workspaceId, boards }: ProjectAnalyticsProps) {
  const [tasks, setTasks] = useState<TaskWithStage[]>([])
  const [assignees, setAssignees] = useState<TaskAssignee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [tasksResult, columnsResult] = await Promise.all([
        supabase.from('tasks').select('*').eq('workspace_id', workspaceId),
        supabase.from('board_columns').select('id,workflow_stage,board_id'),
      ])
      if (!active) return
      const rawTasks = (tasksResult.data ?? []) as Task[]
      const columns = columnsResult.data ?? []
      const stageByColumn = new Map(columns.map((column) => [column.id, column.workflow_stage as WorkflowStage]))
      let nextAssignees: TaskAssignee[] = []
      if (rawTasks.length) {
        const assigneesResult = await supabase.from('task_assignees').select('task_id,user_id,assigned_by,assigned_at').in('task_id', rawTasks.map((task) => task.id))
        nextAssignees = (assigneesResult.data ?? []) as TaskAssignee[]
      }
      if (!active) return
      setTasks(rawTasks.map((task) => ({ ...task, stage: stageByColumn.get(task.column_id) })))
      setAssignees(nextAssignees)
      setLoading(false)
    }
    void load()

    const channel = supabase
      .channel(`analytics-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspaceId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => void load())
      .subscribe()

    return () => { active = false; void supabase.removeChannel(channel) }
  }, [workspaceId])

  const analytics = useMemo(() => {
    const now = Date.now()
    const total = tasks.length
    const completed = tasks.filter((task) => task.stage === 'DONE').length
    const inProgress = tasks.filter((task) => task.stage === 'IN_PROGRESS' || task.stage === 'REVIEW').length
    const overdue = tasks.filter((task) => task.due_date && new Date(task.due_date).getTime() < now && task.stage !== 'DONE').length
    const blocked = tasks.filter((task) => task.is_blocked).length
    const assignedTaskIds = new Set(assignees.map((entry) => entry.task_id))
    const unassigned = tasks.filter((task) => !assignedTaskIds.has(task.id)).length
    const completionRate = total ? Math.round((completed / total) * 100) : 0

    const byStage: Array<{ stage: WorkflowStage; label: string; count: number }> = [
      { stage: 'BACKLOG', label: 'Backlog', count: tasks.filter((task) => task.stage === 'BACKLOG').length },
      { stage: 'TODO', label: 'To do', count: tasks.filter((task) => task.stage === 'TODO').length },
      { stage: 'IN_PROGRESS', label: 'In progress', count: tasks.filter((task) => task.stage === 'IN_PROGRESS').length },
      { stage: 'REVIEW', label: 'Review', count: tasks.filter((task) => task.stage === 'REVIEW').length },
      { stage: 'DONE', label: 'Done', count: completed },
    ]

    const byBoard = boards.map((board) => {
      const boardTasks = tasks.filter((task) => task.board_id === board.id)
      const done = boardTasks.filter((task) => task.stage === 'DONE').length
      return { id: board.id, name: board.name, total: boardTasks.length, done, rate: boardTasks.length ? Math.round((done / boardTasks.length) * 100) : 0 }
    }).sort((a, b) => b.total - a.total)

    return { total, completed, inProgress, overdue, blocked, unassigned, completionRate, byStage, byBoard }
  }, [assignees, boards, tasks])

  if (loading) return <div className="analytics-loading">Loading project analytics…</div>

  return (
    <section className="analytics-page">
      <header className="analytics-heading">
        <div><p className="eyebrow">Workspace intelligence</p><h2>Project analytics</h2><p>Live delivery health across every project in this workspace.</p></div>
        <div className="analytics-completion-ring"><strong>{analytics.completionRate}%</strong><span>complete</span></div>
      </header>

      <div className="analytics-kpi-grid">
        <Metric icon={<ListTodo size={18} />} label="Total tasks" value={analytics.total} />
        <Metric icon={<CheckCircle2 size={18} />} label="Completed" value={analytics.completed} />
        <Metric icon={<Activity size={18} />} label="Active work" value={analytics.inProgress} />
        <Metric icon={<AlertTriangle size={18} />} label="Overdue" value={analytics.overdue} emphasis={analytics.overdue > 0} />
        <Metric icon={<Clock3 size={18} />} label="Blocked" value={analytics.blocked} emphasis={analytics.blocked > 0} />
        <Metric icon={<Users size={18} />} label="Unassigned" value={analytics.unassigned} emphasis={analytics.unassigned > 0} />
      </div>

      <div className="analytics-layout">
        <article className="analytics-card">
          <div className="analytics-card-heading"><div><span className="eyebrow">Workflow</span><h3>Tasks by stage</h3></div><span>{analytics.total} tasks</span></div>
          <div className="stage-bars">
            {analytics.byStage.map((entry) => {
              const width = analytics.total ? Math.max((entry.count / analytics.total) * 100, entry.count ? 4 : 0) : 0
              return <div className="stage-bar-row" key={entry.stage}><div><span>{entry.label}</span><strong>{entry.count}</strong></div><div className="stage-bar-track"><span className={`stage-bar-fill stage-${entry.stage.toLowerCase().replace('_', '-')}`} style={{ width: `${width}%` }} /></div></div>
            })}
          </div>
        </article>

        <article className="analytics-card">
          <div className="analytics-card-heading"><div><span className="eyebrow">Projects</span><h3>Delivery progress</h3></div><span>{boards.length} projects</span></div>
          <div className="project-progress-list">
            {analytics.byBoard.map((board) => <div className="project-progress-row" key={board.id}><div className="project-progress-copy"><strong>{board.name}</strong><span>{board.done} of {board.total} completed</span></div><div className="project-progress-meter"><span style={{ width: `${board.rate}%` }} /></div><strong className="project-rate">{board.rate}%</strong></div>)}
            {!analytics.byBoard.length ? <div className="analytics-empty">Create a project to start collecting analytics.</div> : null}
          </div>
        </article>
      </div>
    </section>
  )
}

function Metric({ icon, label, value, emphasis = false }: { icon: React.ReactNode; label: string; value: number; emphasis?: boolean }) {
  return <article className={emphasis ? 'analytics-metric attention' : 'analytics-metric'}><span className="analytics-metric-icon">{icon}</span><div><strong>{value}</strong><span>{label}</span></div></article>
}
