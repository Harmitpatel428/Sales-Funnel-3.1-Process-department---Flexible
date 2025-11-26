'use client';

import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useLeads } from '../context/LeadContext';
import { getEmployeeName, calculateWorkStats, getWorkSessions } from '../utils/employeeStorage';
import LoadingSpinner from '../components/LoadingSpinner';
import * as XLSX from 'xlsx';
const LeadDetailModal = lazy(() => import('../components/LeadDetailModal'));
const PasswordModal = lazy(() => import('../components/PasswordModal'));
import type { WorkStats, WorkSession, Lead } from '../types/shared';

export default function WorkTrackerPage() {
  const { leads } = useLeads();
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  const [isExporting, setIsExporting] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showExportPasswordModal, setShowExportPasswordModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const employeeName = getEmployeeName() || 'Unknown';

  // Show toast notification
  const showToastNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    let start: Date, end: Date;

    switch (dateRange) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = now;
        break;
      case 'week':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
        start = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
        end = now;
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = now;
    }

    return { start, end };
  };

  // Calculate work statistics
  const workStats = useMemo(() => {
    const { start, end } = getDateRange();
    return calculateWorkStats(start, end, leads);
  }, [leads, dateRange]);

  // Get work sessions
  const workSessions = useMemo(() => {
    const sessions = getWorkSessions();
    const { start, end } = getDateRange();
    
    return sessions.filter(session => {
      const sessionDate = new Date(session.startTime);
      return sessionDate >= start && sessionDate <= end && session.employeeName === employeeName;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [employeeName, dateRange]);

  // Get filtered activities
  const filteredActivities = useMemo(() => {
    const { start, end } = getDateRange();
    
    const allActivities = leads.flatMap(lead => 
      (lead.activities || []).map(activity => ({
        ...activity,
        leadName: lead.clientName || lead.company
      }))
    );

    return allActivities
      .filter(activity => {
        const activityDate = new Date(activity.timestamp);
        return activityDate >= start && 
               activityDate <= end && 
               (activity.employeeName ? activity.employeeName === employeeName : true);
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [leads, employeeName, dateRange]);

  // Format duration
  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  // Handle lead click to open modal
  const handleLeadClick = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      setSelectedLead(lead);
      setShowLeadModal(true);
    } else {
      console.warn('Lead not found:', leadId);
    }
  };

  // Handle modal close
  const handleCloseLeadModal = () => {
    setShowLeadModal(false);
    setTimeout(() => setSelectedLead(null), 300);
  };

  // Show export password modal
  const handleExportClick = () => {
    setShowExportPasswordModal(true);
  };

  // Handle password verification for export
  const handleExportPasswordSuccess = () => {
    setShowExportPasswordModal(false);
    performExport();
  };

  // Actual export function with Excel generation
  const performExport = async () => {
    setIsExporting(true);
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Summary Sheet
      const summaryData = [
        ['Work Report Summary'],
        ['Employee Name', employeeName],
        ['Date Range', dateRange],
        ['Generated On', new Date().toLocaleString()],
        [''],
        ['Statistics'],
        ['Total Activities', workStats.totalActivities],
        ['Leads Worked On', workStats.totalLeadsTouched],
        ['Total Time Spent (minutes)', workStats.totalTimeSpent],
        ['Total Time Spent (formatted)', formatDuration(workStats.totalTimeSpent)],
        [''],
        ['Activity Breakdown'],
        ...Object.entries(workStats.activitiesByType).map(([type, count]) => [
          type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          count
        ])
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

      // Activities Sheet
      const activitiesData = [
        ['Activity Type', 'Description', 'Lead Name', 'Timestamp', 'Duration (min)', 'Employee Name']
      ];
      filteredActivities.forEach(activity => {
        activitiesData.push([
          activity.activityType,
          activity.description,
          activity.leadName,
          new Date(activity.timestamp).toLocaleString(),
          String(activity.duration || ''),
          activity.employeeName || ''
        ]);
      });
      const activitiesSheet = XLSX.utils.aoa_to_sheet(activitiesData);
      XLSX.utils.book_append_sheet(wb, activitiesSheet, 'Activities');

      // Work Sessions Sheet
      const sessionsData = [
        ['Lead Name', 'Start Time', 'End Time', 'Duration (min)', 'Duration (formatted)', 'Status', 'Employee Name']
      ];
      workSessions.forEach(session => {
        sessionsData.push([
          session.leadName,
          new Date(session.startTime).toLocaleString(),
          session.endTime ? new Date(session.endTime).toLocaleString() : '',
          String(session.duration || ''),
          session.duration ? formatDuration(session.duration) : 'In Progress',
          session.endTime ? 'Completed' : 'Active',
          session.employeeName || ''
        ]);
      });
      const sessionsSheet = XLSX.utils.aoa_to_sheet(sessionsData);
      XLSX.utils.book_append_sheet(wb, sessionsSheet, 'Work Sessions');

      // Generate filename and download
      const filename = `WorkReport_${employeeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      showToastNotification(`Successfully exported work report to ${filename}`, 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToastNotification('Failed to export work report. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Work Tracker</h1>
          <p className="text-gray-600">Tracking work for: <span className="font-semibold">{employeeName}</span></p>
        </div>

        {/* Date Range Selector */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Date Range</h2>
            <button
              onClick={handleExportClick}
              disabled={isExporting}
              className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : 'Export My Work Report'}
            </button>
          </div>
          
          <div className="flex gap-4 items-center">
            <div className="flex gap-2">
              {(['today', 'week', 'month'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    dateRange === range
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'
                  }`}
                >
                  {range === 'today' ? 'Today' : 
                   range === 'week' ? 'This Week' : 
                   range === 'month' ? 'This Month' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-2xl">📊</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Activities</p>
                <p className="text-2xl font-bold text-gray-900">{workStats.totalActivities}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-2xl">👥</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Leads Worked On</p>
                <p className="text-2xl font-bold text-gray-900">{workStats.totalLeadsTouched}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <span className="text-2xl">⏱️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Time Tracked</p>
                <p className="text-2xl font-bold text-gray-900">{formatDuration(workStats.totalTimeSpent)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <span className="text-2xl">🔄</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Sessions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {workSessions.filter(s => !s.endTime).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Breakdown Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(workStats.activitiesByType).map(([type, count]) => (
              <div key={type} className="flex items-center">
                <div className="w-24 text-sm font-medium text-gray-700 capitalize">
                  {type.replace('_', ' ')}
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${Math.max(5, (count / Math.max(...Object.values(workStats.activitiesByType))) * 100)}%` 
                      } as React.CSSProperties}
                    ></div>
                  </div>
                </div>
                <div className="w-12 text-sm font-medium text-gray-900 text-right">
                  {count}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Work Sessions */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Work Sessions</h2>
          {workSessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lead Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Start Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workSessions.slice(0, 10).map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleLeadClick(session.leadId)}
                          className="text-purple-600 hover:text-purple-800 hover:underline cursor-pointer transition-colors"
                          title="Click to view lead details"
                        >
                        {session.leadName}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(session.startTime).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {session.duration ? formatDuration(session.duration) : 'In Progress'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          session.endTime 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {session.endTime ? 'Completed' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No work sessions tracked yet. Use the timer in lead details to track your time.</p>
          )}
        </div>

        {/* Activity Timeline */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h2>
          {filteredActivities.length > 0 ? (
            <div className="space-y-4">
              {filteredActivities.slice(0, 20).map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0">
                    <span className="text-lg">
                      {activity.activityType === 'call' ? '📞' :
                       activity.activityType === 'email' ? '📧' :
                       activity.activityType === 'meeting' ? '📅' :
                       activity.activityType === 'follow_up' ? '🔔' :
                       activity.activityType === 'status_change' ? '🔄' :
                       activity.activityType === 'edit' ? '✏️' :
                       activity.activityType === 'created' ? '✨' :
                       activity.activityType === 'note' ? '📝' : '📊'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                    <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                      <button
                        onClick={() => handleLeadClick(activity.leadId)}
                        className="text-purple-600 hover:text-purple-800 hover:underline cursor-pointer font-medium transition-colors"
                        title="Click to view lead details"
                      >
                        {activity.leadName}
                      </button>
                      <span>{new Date(activity.timestamp).toLocaleString()}</span>
                      {activity.duration && <span>{activity.duration} min</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No activities logged yet. Start working on leads to see your statistics here.</p>
          )}
        </div>
      </div>
      
      {/* Lead Detail Modal */}
      {showLeadModal && selectedLead && (
        <Suspense fallback={<LoadingSpinner />}>
          <LeadDetailModal
            isOpen={showLeadModal}
            onClose={handleCloseLeadModal}
            lead={selectedLead}
            onEdit={() => {}}
          />
        </Suspense>
      )}

      {/* Export Password Modal */}
      {showExportPasswordModal && (
        <Suspense fallback={<LoadingSpinner />}>
          <PasswordModal
            isOpen={showExportPasswordModal}
            onClose={() => setShowExportPasswordModal(false)}
            operation="export"
            onSuccess={handleExportPasswordSuccess}
          />
        </Suspense>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`px-6 py-3 rounded-lg shadow-lg text-white ${
            toastType === 'success' ? 'bg-green-500' :
            toastType === 'error' ? 'bg-red-500' : 'bg-blue-500'
          }`}>
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}

