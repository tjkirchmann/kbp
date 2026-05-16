import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import RecordBook from './pages/RecordBook'
import AdminShell from './pages/AdminShell'
import UsersList from './pages/admin/UsersList'
import UserDetail from './pages/admin/UserDetail'
import PoolsList from './pages/admin/PoolsList'
import PoolCreate from './pages/admin/PoolCreate'
import PoolDetail from './pages/admin/PoolDetail'
import TeamsList from './pages/admin/TeamsList'
import GeneralPanel from './pages/admin/GeneralPanel'
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
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<GeneralPanel />} />
        <Route path="users" element={<UsersList />} />
        <Route path="users/:userId" element={<UserDetail />} />
        <Route path="pools" element={<PoolsList />} />
        <Route path="pools/new" element={<PoolCreate />} />
        <Route path="pools/:poolId" element={<PoolDetail />} />
        <Route path="teams" element={<TeamsList />} />
      </Route>
      <Route path="/submission" element={<SubmissionShell />}>
        <Route index element={<PoolSelectStep />} />
        <Route path=":poolId" element={<SubmissionWorkspace />} />
      </Route>
    </Routes>
  )
}
