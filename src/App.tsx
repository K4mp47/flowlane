import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoadingPage } from './pages/LoadingPage'
import { LoginPage } from './pages/LoginPage'
import { PasswordRecoveryPage } from './pages/PasswordRecoveryPage'
import { WorkspaceSetupPage } from './pages/WorkspaceSetupPage'
import { BoardPage } from './pages/BoardPage'

function AppGate() {
  const { user, membership, isLoading, isPasswordRecovery } = useAuth()

  if (isLoading) return <LoadingPage />
  if (isPasswordRecovery && user) return <PasswordRecoveryPage />
  if (!user) return <LoginPage />
  if (!membership) return <WorkspaceSetupPage />

  return <BoardPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  )
}
