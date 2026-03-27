import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import CreateTest from "./pages/teacher/CreateTest";
import CreateCodingTest from "./pages/teacher/CreateCodingTest";
import TestDetail from "./pages/teacher/TestDetail";
import CodingTestDetail from "./pages/teacher/CodingTestDetail";
import EditTest from "./pages/teacher/EditTest";
import StudentDashboard from "./pages/student/StudentDashboard";
import TakeTest from "./pages/student/TakeTest";
import TakeCodingTest from "./pages/student/TakeCodingTest";
import TestResult from "./pages/student/TestResult";
import Leaderboard from "./pages/Leaderboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/teacher/create-test" element={<CreateTest />} />
            <Route path="/teacher/create-coding-test" element={<CreateCodingTest />} />
            <Route path="/teacher/test/:testId" element={<TestDetail />} />
            <Route path="/teacher/test/:testId/edit" element={<EditTest />} />
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/test/:testId" element={<TakeTest />} />
            <Route path="/student/coding-test/:testId" element={<TakeCodingTest />} />
            <Route path="/student/result/:attemptId" element={<TestResult />} />
            <Route path="/leaderboard/:testId" element={<Leaderboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
