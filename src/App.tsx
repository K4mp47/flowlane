import { lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoadingPage } from './pages/LoadingPage'
import { LoginPage } from './pages/LoginPage'
import { PasswordRecoveryPage } from './pages/PasswordRecoveryPage'
import { WorkspaceSetupPage } from './pages/WorkspaceSetupPage'
import { ThemeProvider } from './theme'

const BoardPage = lazy(() => import('./pages/BoardPage').then((module) => ({ default: module.BoardPage })))

function AppGate() {
  const { user, membership, isLoading, isPasswordRecovery } = useAuth()

  if (isLoading) return <LoadingPage />
  if (isPasswordRecovery && user) return <PasswordRecoveryPage />
  if (!user) return <LoginPage />
  if (!membership) return <WorkspaceSetupPage />

  return <Suspense fallback={<LoadingPage />}><BoardPage /></Suspense>
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppGate />
      </AuthProvider>
    </ThemeProvider>
  )
}
