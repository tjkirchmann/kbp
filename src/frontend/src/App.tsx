import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import RecordBook from './pages/RecordBook'
import AdminShell from './pages/AdminShell'
import UsersList from './pages/admin/UsersList'
import UserDetail from './pages/admin/UserDetail'
import PoolsList from './pages/admin/PoolsList'
import PoolCreate from './pages/admin/PoolCreate'
import PoolDetail from './pages/admin/PoolDetail'
import CommsPanel from './pages/admin/CommsPanel'
import IntegrationsShell from './pages/admin/IntegrationsShell'
import EspnPanel from './pages/admin/EspnPanel'
import LibraryPanel from './pages/admin/LibraryPanel'
import PipelinesList from './pages/admin/pipelines/PipelinesList'
import PipelineEditor from './pages/admin/pipelines/PipelineEditor'
import ProjectsList from './pages/admin/projects/ProjectsList'
import ProjectDetail from './pages/admin/projects/ProjectDetail'
import AiStructsList from './pages/admin/AiStructsList'
import AiStructDetail from './pages/admin/AiStructDetail'
import CfbdWorkspace from './pages/admin/cfbd/CfbdWorkspace'
import CoverageDashboard from './pages/admin/cfbd/CoverageDashboard'
import SubmissionShell from './pages/submission/SubmissionShell'
import PoolSelectStep from './pages/submission/PoolSelectStep'
import SubmissionWorkspace from './pages/submission/SubmissionWorkspace'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login/*" element={<Login />} />
      <Route path="/record-book" element={<RecordBook />} />
      <Route path="/admin" element={<AdminShell />}>
        <Route index element={<Navigate to="comms" replace />} />
        <Route path="general" element={<Navigate to="/admin/comms" replace />} />
        <Route path="comms" element={<CommsPanel />} />
        <Route path="integrations" element={<IntegrationsShell />}>
          <Route index element={<Navigate to="espn" replace />} />
          <Route path="espn" element={<EspnPanel />} />
        </Route>
        {/* Back-compat: the old top-level ESPN route now lives under Integrations. */}
        <Route path="espn" element={<Navigate to="/admin/integrations/espn" replace />} />
        <Route path="library" element={<LibraryPanel />} />
        <Route path="pipelines" element={<PipelinesList />} />
        <Route path="pipelines/:pipelineId" element={<PipelineEditor />} />
        <Route path="projects" element={<ProjectsList />} />
        <Route path="projects/:projectId" element={<ProjectDetail />} />
        <Route path="cfbd" element={<Outlet />}>
          <Route index element={<Navigate to="coverage" replace />} />
          <Route path="coverage" element={<CoverageDashboard />} />
          <Route path=":tableSlug" element={<CfbdWorkspace />} />
        </Route>
        <Route path="ai-structs" element={<AiStructsList />} />
        <Route path="ai-structs/:name" element={<AiStructDetail />} />
        <Route path="users" element={<UsersList />} />
        <Route path="users/:userId" element={<UserDetail />} />
        <Route path="pools" element={<PoolsList />} />
        <Route path="pools/new" element={<PoolCreate />} />
        <Route path="pools/:poolId" element={<PoolDetail />} />
      </Route>
      <Route path="/submission" element={<SubmissionShell />}>
        <Route index element={<PoolSelectStep />} />
        <Route path=":poolId" element={<SubmissionWorkspace />} />
      </Route>
    </Routes>
  )
}
