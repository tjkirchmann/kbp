import { SignIn } from '@clerk/react'
import { usePageTitle } from '@/lib/usePageTitle'

const appearance = {
  variables: {
    colorBackground: '#1A1D24',
    colorInputBackground: '#21252E',
    colorInputText: '#E8EAF0',
    colorText: '#E8EAF0',
    colorTextSecondary: '#E8EAF0',
    colorPrimary: '#009CDE',
    colorDanger: '#E5534B',
    colorNeutral: '#E8EAF0',
    borderRadius: '0.5rem',
    fontFamily: 'Geist, system-ui, -apple-system, sans-serif',
    fontSmoothing: 'antialiased',
  },
  elements: {
    card: { backgroundColor: '#1A1D24', border: '1px solid #2A2E38' },
    headerTitle: { color: '#E8EAF0' },
    headerSubtitle: { color: '#E8EAF0' },
    formFieldLabel: { color: '#A0A8C0' },
    formFieldInput: { backgroundColor: '#21252E', borderColor: '#2A2E38', color: '#E8EAF0' },
    formButtonPrimary: { backgroundColor: '#009CDE', color: '#FFFFFF' },
    footerActionLink: { color: '#009CDE' },
    footerActionText: { color: '#E8EAF0' },
    footer: { color: '#E8EAF0' },
    dividerLine: { backgroundColor: '#2A2E38' },
    dividerText: { color: '#A0A8C0' },
    socialButtonsBlockButton: {
      borderColor: '#2A2E38',
      backgroundColor: '#21252E',
      color: '#E8EAF0',
    },
    socialButtonsBlockButtonText: { color: '#E8EAF0' },
    identityPreviewText: { color: '#E8EAF0' },
    identityPreviewEditButton: { color: '#009CDE' },
  },
}

export default function Login() {
  usePageTitle('Sign In')
  return (
    <div className="min-h-screen flex items-center justify-center">
      <SignIn routing="path" path="/login" fallbackRedirectUrl="/" appearance={appearance} />
    </div>
  )
}
