'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useCard3D } from './hooks/useCard3D';
import { getEmployeeName, calculateWorkStats, getWorkSessions } from './utils/employeeStorage';
import { useLeads } from './context/LeadContext';

export default function HomePage() {
  const router = useRouter();
  const { cursorBlobRef } = useCard3D();
  const { leads } = useLeads();

  // Get employee name and calculate today's work stats
  const employeeName = getEmployeeName();

  // Memoize date calculations to prevent recalculation on every render
  const { startOfDay, endOfDay } = useMemo(() => {
    const today = new Date();
    return {
      startOfDay: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      endOfDay: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    };
  }, []);

  const workStats = useMemo(() => {
    return calculateWorkStats(startOfDay, endOfDay, leads);
  }, [leads, startOfDay, endOfDay]);

  const activeSessions = useMemo(() => {
    if (!employeeName) return 0;
    const sessions = getWorkSessions();
    return sessions.filter(session =>
      session.employeeName === employeeName && !session.endTime
    ).length;
  }, [employeeName]);

  // Helper function to format duration
  const formatDuration = useCallback((minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }, []);

  const handleGetStarted = useCallback(() => {
    router.push('/add-lead?from=home');
  }, [router]);

  const handleViewDashboard = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen w-full bg-black py-8">
      {/* Cursor Blob */}
      <div ref={cursorBlobRef} className="cursor-blob hidden"></div>

      <div className="max-w-7xl mx-auto px-8">
        {/* Hero Section */}
        <div className="text-center mb-16 w-full">
          {/* Animated Main Heading */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative inline-block"
          >
            {/* Subtle glow effect behind text */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              transition={{ duration: 2, delay: 0.5 }}
              className="absolute inset-0 blur-3xl bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-400"
            />

            <h1 className="relative text-5xl md:text-7xl font-extrabold mb-6 leading-tight">
              {/* Smooth letter by letter animation with color transition */}
              {"V4U Biz Solutions".split("").map((letter, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    color: "#ffffff"
                  }}
                  transition={{
                    opacity: { duration: 0.5, delay: 0.3 + index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] },
                    y: { duration: 0.5, delay: 0.3 + index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] },
                    color: { duration: 0.8, delay: 1.8 + index * 0.03, ease: "easeInOut" }
                  }}
                  className="inline-block text-pink-400"
                >
                  {letter === " " ? "\u00A0" : letter}
                </motion.span>
              ))}
            </h1>

            {/* Smooth animated underline */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent rounded-full mx-auto w-3/4"
            />
          </motion.div>

          {/* Animated Subtitle - smooth fade in */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.0, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-xl md:text-2xl text-gray-300 mb-8 leading-relaxed w-full mt-6"
          >
            Professional CRM Solution By HPX Eigen
          </motion.p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleGetStarted}
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Add New Lead
            </button>
            <button
              onClick={handleViewDashboard}
              className="bg-white hover:bg-gray-50 text-purple-600 border-2 border-purple-600 px-8 py-4 text-lg font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              View Dashboard
            </button>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16 w-full">
          <button
            onClick={() => router.push('/dashboard')}
            className="card-3d bg-gray-900 rounded-xl shadow-md p-8 text-center border border-gray-700 hover:border-purple-500 hover:shadow-xl transition-all duration-200"
          >
            <div className="card-3d-content">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-white mb-3">Lead Management</h3>
              <p className="text-gray-300">
                Easily add, track, and manage all your leads in one centralized location with comprehensive contact information.
              </p>
            </div>
          </button>


          <button
            onClick={() => router.push('/work-tracker')}
            className="card-3d bg-gray-900 rounded-xl shadow-md p-8 text-center border border-gray-700 hover:border-teal-500 hover:shadow-xl transition-all duration-200"
          >
            <div className="card-3d-content">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Work Tracker</h3>
              <p className="text-gray-300">
                Track your activities, monitor time spent on leads, and generate work reports to share with management.
              </p>
            </div>
          </button>

          <button
            onClick={() => router.push('/follow-up-mandate')}
            className="card-3d bg-gray-900 rounded-xl shadow-md p-8 text-center border border-gray-700 hover:border-green-500 hover:shadow-xl transition-all duration-200"
          >
            <div className="card-3d-content">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Mandate & Documentation</h3>
              <p className="text-gray-300">
                Track mandate status and document submission progress for all your leads with organized workflow management.
              </p>
            </div>
          </button>

          <button
            onClick={() => router.push('/add-lead?from=home')}
            className="card-3d bg-gray-900 rounded-xl shadow-md p-8 text-center border border-gray-700 hover:border-yellow-500 hover:shadow-xl transition-all duration-200"
          >
            <div className="card-3d-content">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Quick Actions</h3>
              <p className="text-gray-300">
                Access all your CRM functions quickly with intuitive navigation and streamlined workflows.
              </p>
            </div>
          </button>

          <button
            onClick={() => router.push('/dashboard')}
            className="card-3d bg-gray-900 rounded-xl shadow-md p-8 text-center border border-gray-700 hover:border-indigo-500 hover:shadow-xl transition-all duration-200"
          >
            <div className="card-3d-content">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Team Collaboration</h3>
              <p className="text-gray-300">
                Work together with your team to manage leads, share insights, and coordinate follow-up activities.
              </p>
            </div>
          </button>

          <button
            onClick={() => router.push('/work-tracker')}
            className="card-3d bg-gray-900 rounded-xl shadow-md p-8 text-center border border-gray-700 hover:border-teal-500 hover:shadow-xl transition-all duration-200"
          >
            <div className="card-3d-content">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">My Work Today</h3>
              {employeeName && (
                <p className="text-sm text-teal-400 mb-4">{employeeName}</p>
              )}

              {/* Work Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Activities</div>
                  <div className="text-lg font-bold text-teal-400">{workStats.totalActivities}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Leads</div>
                  <div className="text-lg font-bold text-teal-400">{workStats.totalLeadsTouched}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Time</div>
                  <div className="text-lg font-bold text-teal-400">{formatDuration(workStats.totalTimeSpent)}</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Active</div>
                  <div className="text-lg font-bold text-teal-400">{activeSessions}</div>
                </div>
              </div>

              <div className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
                View Full Report →
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push('/upcoming')}
            className="card-3d bg-gray-900 rounded-xl shadow-md p-8 text-center border border-gray-700 hover:border-cyan-500 hover:shadow-xl transition-all duration-200"
          >
            <div className="card-3d-content">
              <div className="w-16 h-16 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-3">Follow-up Management</h3>
              <p className="text-gray-300">
                Never miss a follow-up with automated reminders and scheduled tasks for all your leads.
              </p>
            </div>
          </button>
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-900 rounded-lg shadow-lg p-8 border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/add-lead?from=home')}
              className="p-4 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors duration-200"
            >
              <div className="text-purple-600 font-semibold">Add Lead</div>
              <div className="text-sm text-gray-600 mt-1">Create new lead entry</div>
            </button>

            <button
              onClick={() => router.push('/dashboard')}
              className="p-4 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors duration-200"
            >
              <div className="text-blue-600 font-semibold">Dashboard</div>
              <div className="text-sm text-gray-600 mt-1">View all leads</div>
            </button>

            <button
              onClick={() => router.push('/due-today')}
              className="p-4 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-colors duration-200"
            >
              <div className="text-orange-600 font-semibold">Due Today</div>
              <div className="text-sm text-gray-600 mt-1">Check urgent tasks</div>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}