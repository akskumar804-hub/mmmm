import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";

import AdminRoute from "./routes/AdminRoute.jsx";
import StudentRoute from "./routes/StudentRoute.jsx";

// Public pages
import UnifiedLogin from "./pages/UnifiedLogin.jsx";
import Verify from "./pages/Verify.jsx";

// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import AdminCourses from "./pages/admin/AdminCourses.jsx";
import AdminStudents from "./pages/admin/AdminStudents.jsx";
import AdminEnrollments from "./pages/admin/AdminEnrollments.jsx";
import AdminResults from "./pages/admin/AdminResults.jsx";
import AdminProctoring from "./pages/admin/AdminProctoring.jsx";
import AdminProctorSession from "./pages/admin/AdminProctorSession.jsx";
import AdminCertificates from "./pages/admin/AdminCertificates.jsx";
import AdminCourseBuilder from "./pages/admin/AdminCourseBuilder.jsx";
import AdminExamBuilder from "./pages/admin/AdminExamBuilder.jsx";
import AdminAnalytics from "./pages/admin/AdminAnalytics.jsx";

// Student pages
import StudentDashboard from "./pages/student/StudentDashboard.jsx";
import StudentCourses from "./pages/student/StudentCourses.jsx";
import StudentCourseDetail from "./pages/student/StudentCourseDetail.jsx";
import StudentMyCourses from "./pages/student/StudentMyCourses.jsx";
import StudentLearnCourse from "./pages/student/StudentLearnCourse.jsx";
import StudentExams from "./pages/student/StudentExams.jsx";
import StudentExamAttempt from "./pages/student/StudentExamAttempt.jsx";
import StudentProfile from "./pages/student/StudentProfile.jsx";
import StudentCertificates from "./pages/student/StudentCertificates.jsx";

// Layouts
import AdminLayout from "./components/layouts/AdminLayout.jsx";
import StudentLayout from "./components/layouts/StudentLayout.jsx";

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Default route -> unified login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Public */}
        <Route path="/login" element={<UnifiedLogin />} />
        <Route path="/verify" element={<Verify />} />

        {/* Backwards compatibility */}
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route
          path="/student/login"
          element={<Navigate to="/login" replace />}
        />

        {/* Admin protected routes */}
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="courses" element={<AdminCourses />} />
            <Route
              path="courses/:courseId/builder"
              element={<AdminCourseBuilder />}
            />
            <Route
              path="courses/:courseId/exams"
              element={<AdminExamBuilder />}
            />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="enrollments" element={<AdminEnrollments />} />
            <Route path="results" element={<AdminResults />} />
            <Route path="proctoring" element={<AdminProctoring />} />
            <Route
              path="proctoring/:sessionId"
              element={<AdminProctorSession />}
            />
            <Route path="certificates" element={<AdminCertificates />} />
          </Route>
        </Route>

        {/* Student protected routes */}
        <Route element={<StudentRoute />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="courses" element={<StudentCourses />} />
            <Route path="courses/:id" element={<StudentCourseDetail />} />
            <Route path="my-courses" element={<StudentMyCourses />} />
            <Route path="learn/:courseId" element={<StudentLearnCourse />} />
            <Route path="exams" element={<StudentExams />} />
            <Route path="exams/:subjectId" element={<StudentExamAttempt />} />
            <Route
              path="courses/:courseId/exam/attempt"
              element={<StudentExamAttempt />}
            />
            <Route path="profile" element={<StudentProfile />} />
            <Route path="certificates" element={<StudentCertificates />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
