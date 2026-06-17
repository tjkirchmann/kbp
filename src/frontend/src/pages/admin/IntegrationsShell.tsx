import { Outlet } from 'react-router-dom'

// Integrations sub-tabs (ESPN, future services) now live in the left sidebar as
// a collapsible group under "Integrations" — see AdminSidebar. This shell just
// renders the active sub-tab.
export default function IntegrationsShell() {
  return <Outlet />
}
