import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoadingPage } from './pages/LoadingPage'
import { LoginPage } from './pages/LoginPage'
import { PasswordRecoveryPage } from './pages/PasswordRecoveryPage'
import { WorkspaceSetupPage } from './pages/WorkspaceSetupPage'

function AppGate() {
  const { user, membership, isLoading, isPasswordRecovery } = useAuth()

  if (isLoading) return <LoadingPage />
  if (isPasswordRecovery && user) return <PasswordRecoveryPage />
  if (!user) return <LoginPage />
  if (!membership) return <WorkspaceSetupPage />

  return (
    <main className="centered-page">
      <div className="surface-card">
        <p className="eyebrow">{membership.workspace.name}</p>
        <h1>Authenticated as {membership.role}</h1>
        <p className="muted">The live Kanban board is the next feature branch.</p>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  )
}
